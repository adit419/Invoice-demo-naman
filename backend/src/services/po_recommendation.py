"""
AI PO recommendation — suggests a Purchase Order for invoices extracted
without a po_number.

Candidate retrieval follows the repo's live-or-demo convention (see
zoho_bill._is_demo_mode): when erp-integration-service is configured the
candidates come from its `GET /api/v1/purchase-orders/search` endpoint (which
fronts the Zoho and QuickBooks Desktop connectors and resolves the tenant's
configured ERP via X-Tenant-ID); otherwise candidates are assembled from the
fixture PO sidecars, exactly like the rest of the demo pipeline.

Scoring is a modular weighted composite — each scorer handles one criterion
and reports None when its inputs are unavailable, in which case its weight is
redistributed across the applicable scorers. Add a `(name, weight, fn)` tuple
to SCORERS to incorporate a new criterion.
"""
import base64
import json
import logging
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Callable, Optional

import httpx

from ..config import settings
from .fixtures import get_loader

logger = logging.getLogger(__name__)

# Minimum composite score for a candidate to be surfaced to the user.
MIN_RECOMMENDATION_SCORE = 0.5

_CORP_STOPWORDS = {
    "pte", "ltd", "llc", "inc", "corp", "co", "company", "limited", "pvt",
    "private", "plc", "gmbh", "sdn", "bhd", "the", "and", "of", "services",
}


# ── Invoice field extraction ──────────────────────────────────────────────────

def extract_invoice_fields(invoice_schema: dict) -> dict:
    """Pull the recommendation-relevant fields out of the extraction metadata."""
    meta = {
        m["field"]: m.get("value")
        for m in invoice_schema.get("metadata", [])
        if m.get("field")
    }
    return {
        "po_number": _clean_str(meta.get("po_number")),
        "vendor_name": _clean_str(meta.get("vendor_name")),
        "total_amount": _to_float(meta.get("total_amount")),
        "currency": _clean_str(meta.get("currency")),
        "invoice_date": _to_date(meta.get("invoice_date")),
        "due_date": _to_date(meta.get("due_date")),
    }


def _clean_str(v) -> Optional[str]:
    s = str(v).strip() if v is not None else ""
    return s or None


def _to_float(v) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _to_date(v) -> Optional[datetime]:
    if not v:
        return None
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s[:19] if "T" in s else s, fmt)
        except ValueError:
            continue
    return None


# ── Candidate retrieval ───────────────────────────────────────────────────────

def _erp_configured() -> bool:
    return bool(settings.erp_integration_base_url and settings.erp_integration_secret)


async def fetch_candidate_pos(vendor_name: Optional[str]) -> list[dict]:
    """Return normalized candidate POs from the configured ERP (or fixtures)."""
    fixture_pool = _fixture_candidates()
    if not _erp_configured():
        return fixture_pool

    # Hint numbers let the QBD connector hydrate candidates via the bridge,
    # which can only query POs by document number.
    hints = ",".join(c["po_number"] for c in fixture_pool if c.get("po_number"))
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{settings.erp_integration_base_url.rstrip('/')}/api/v1/purchase-orders/search",
                params={
                    k: v for k, v in
                    {"vendor_name": vendor_name, "po_numbers": hints or None}.items()
                    if v
                },
                headers={
                    "X-Tenant-ID": settings.erp_integration_tenant_id,
                    "Authorization": "Basic " + base64.b64encode(
                        f"invoice-demo:{settings.erp_integration_secret}".encode()
                    ).decode(),
                },
            )
        resp.raise_for_status()
        return [_normalize_erp_po(po) for po in resp.json()]
    except Exception:
        logger.warning("ERP PO search failed — falling back to fixture candidates", exc_info=True)
        return fixture_pool


def _normalize_erp_po(po: dict) -> dict:
    """erp-integration-service PurchaseOrder → candidate dict."""
    return {
        "po_number": po.get("po_number"),
        "vendor_name": po.get("vendor_name"),
        "total_amount": _to_float(po.get("total_amount")),
        "currency": _clean_str(po.get("currency")),
        "order_date": _to_date(po.get("order_date")),
        "status": po.get("status"),
        "source": "erp",
    }


def _fixture_candidates() -> list[dict]:
    """Assemble a candidate pool from every fixture bundle's PO data.

    Prefers the `*_PO.json` sidecar; falls back to the per-field `values.po`
    entries in metadata_validation.json so every scenario contributes a
    candidate. Deduped by po_number.
    """
    candidates: dict[str, dict] = {}
    for bundle in get_loader().discover().values():
        bundle_vendor = _clean_str(
            _extraction_field(bundle.extraction, "vendor_name")
        )
        for cand in (
            _candidate_from_po_sidecar(bundle.po_data),
            _candidate_from_metadata_validation(bundle.metadata_validation),
        ):
            if not cand or not cand.get("po_number"):
                continue
            if not cand.get("vendor_name"):
                # metadata_validation fixtures carry no vendor field — the PO
                # belongs to the scenario's vendor, so borrow it from extraction.
                cand["vendor_name"] = bundle_vendor
            candidates.setdefault(cand["po_number"], cand)
    return list(candidates.values())


def _extraction_field(extraction: dict, field: str):
    schema = (extraction or {}).get("invoice_schema", {})
    for m in schema.get("metadata", []):
        if m.get("field") == field:
            return m.get("value")
    return None


def _candidate_from_po_sidecar(po: dict) -> Optional[dict]:
    if not po:
        return None
    total = _to_float(po.get("total_amount") or po.get("total"))
    if total is None:
        total = sum(
            _to_float(i.get("total_amount")) or 0.0
            for i in po.get("items", [])
        ) or None
    return {
        "po_number": _clean_str(po.get("po_number")),
        "vendor_name": _clean_str(po.get("vendor_name")),
        "total_amount": total,
        "currency": _clean_str(po.get("currency") or po.get("currency_code")),
        "order_date": _to_date(po.get("order_date") or po.get("date")),
        "status": po.get("status"),
        "source": "fixture_po",
    }


def _candidate_from_metadata_validation(mv) -> Optional[dict]:
    if isinstance(mv, list):  # n8n-wrapped fixture
        mv = mv[0] if mv else {}
    if not isinstance(mv, dict) or mv.get("_placeholder"):
        return None
    fields = mv.get("fields") or []

    def po_value(name: str):
        for f in fields:
            if f.get("field_name") == name:
                vals = (f.get("values") or {}).get("po")
                if isinstance(vals, list) and vals:
                    return vals[0].get("value") if isinstance(vals[0], dict) else vals[0]
                return vals
        return None

    number = po_value("po_number")
    if isinstance(number, list):
        number = number[0] if number else None
    if not number:
        return None
    return {
        "po_number": _clean_str(number),
        "vendor_name": _clean_str(po_value("vendor_name")),
        "total_amount": _to_float(po_value("total_amount")),
        "currency": _clean_str(po_value("currency")),
        "order_date": _to_date(po_value("invoice_date") or po_value("po_date")),
        "status": None,
        "source": "fixture_metadata_validation",
    }


# ── Scoring ───────────────────────────────────────────────────────────────────

def _norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def _score_vendor(inv: dict, po: dict):
    a, b = inv.get("vendor_name"), po.get("vendor_name")
    if not a or not b:
        return None
    na, nb = _norm_name(a), _norm_name(b)
    ratio = SequenceMatcher(None, na, nb).ratio()
    ta = {t for t in na.split() if t not in _CORP_STOPWORDS}
    tb = {t for t in nb.split() if t not in _CORP_STOPWORDS}
    overlap = len(ta & tb) / max(len(ta | tb), 1) if (ta or tb) else 0.0
    score = max(ratio, overlap)
    if na in nb or nb in na:
        score = max(score, 0.95)
    return score, f"vendor \"{b}\" vs \"{a}\""


def _score_amount(inv: dict, po: dict):
    a, b = inv.get("total_amount"), po.get("total_amount")
    if a is None or b is None or a <= 0:
        return None
    rel_diff = abs(a - b) / max(abs(a), abs(b))
    # 1.0 at exact match, 0 once the difference reaches 50%.
    score = max(0.0, 1.0 - rel_diff * 2)
    return score, f"amount {b:,.2f} vs invoice {a:,.2f}"


def _score_currency(inv: dict, po: dict):
    a, b = inv.get("currency"), po.get("currency")
    if not a or not b:
        return None
    match = a.strip().upper() == b.strip().upper()
    return (1.0 if match else 0.0), f"currency {b} vs {a}"


def _score_dates(inv: dict, po: dict):
    po_date = po.get("order_date")
    anchors = [d for d in (inv.get("invoice_date"), inv.get("due_date")) if d]
    if not po_date or not anchors:
        return None
    # A matching PO is normally raised before the invoice; score by proximity
    # with a one-year horizon, taking the closest of the available dates.
    best_days = min(abs((anchor - po_date).days) for anchor in anchors)
    score = max(0.0, 1.0 - best_days / 365.0)
    return score, f"PO date {po_date.date()} vs invoice dates ({best_days}d apart)"


# (name, weight, scorer) — weights are renormalized over applicable scorers,
# so missing invoice/PO fields never penalize a candidate directly.
SCORERS: list[tuple[str, float, Callable]] = [
    ("vendor_name", 0.40, _score_vendor),
    ("total_amount", 0.30, _score_amount),
    ("currency", 0.15, _score_currency),
    ("dates", 0.15, _score_dates),
]


def score_candidate(invoice_fields: dict, candidate: dict) -> dict:
    breakdown = []
    weighted, total_weight = 0.0, 0.0
    for name, weight, fn in SCORERS:
        result = fn(invoice_fields, candidate)
        if result is None:
            continue
        score, detail = result
        weighted += weight * score
        total_weight += weight
        breakdown.append({"criterion": name, "score": round(score, 3), "detail": detail})
    composite = weighted / total_weight if total_weight else 0.0
    return {"score": round(composite, 3), "breakdown": breakdown}


def rank_candidates(invoice_fields: dict, candidates: list[dict]) -> list[dict]:
    scored = []
    for cand in candidates:
        s = score_candidate(invoice_fields, cand)
        scored.append({**_serializable(cand), **s})
    scored.sort(key=lambda c: c["score"], reverse=True)
    return scored


def _serializable(cand: dict) -> dict:
    out = dict(cand)
    if isinstance(out.get("order_date"), datetime):
        out["order_date"] = out["order_date"].date().isoformat()
    return out


# ── Fixture persistence ───────────────────────────────────────────────────────
# The in-memory DB is wiped on every restart, so the computed recommendation is
# persisted as a fixture sidecar (fixtures/<KEY>/po_recommendation.json) —
# the same durable layer the rest of the demo treats as source of truth. New
# runs of a scenario reuse the saved value instead of recomputing.

def _fixture_rec_path(fixture_key: str) -> Path:
    return Path(get_loader()._root) / fixture_key / "po_recommendation.json"


def load_saved_recommendation(fixture_key: str) -> Optional[dict]:
    path = _fixture_rec_path(fixture_key)
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            saved = json.load(fh)
    except (OSError, ValueError):
        logger.warning("Unreadable po_recommendation.json for %s — recomputing", fixture_key)
        return None
    if not isinstance(saved, dict) or "recommended" not in saved:
        return None
    return saved


def save_recommendation_to_fixture(fixture_key: str, result: dict) -> None:
    path = _fixture_rec_path(fixture_key)
    if not path.parent.is_dir():
        # Unknown/foreign fixture key — nothing durable to write into.
        return
    payload = {
        **result,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, default=str)
    except OSError:
        logger.warning("Could not write po_recommendation.json for %s", fixture_key, exc_info=True)


# ── Recommendation entrypoint ─────────────────────────────────────────────────

async def build_recommendation(invoice_schema: dict) -> dict:
    """Compute the AI PO recommendation for an extracted invoice.

    Returns {recommended, score, breakdown, candidates, invoice_fields} where
    `recommended` is None when nothing clears MIN_RECOMMENDATION_SCORE.
    """
    fields = extract_invoice_fields(invoice_schema)
    candidates = await fetch_candidate_pos(fields.get("vendor_name"))
    ranked = rank_candidates(fields, candidates)
    top = ranked[0] if ranked and ranked[0]["score"] >= MIN_RECOMMENDATION_SCORE else None
    return {
        "recommended": top,
        "candidates": ranked[:5],
        "candidates_considered": len(candidates),
        "invoice_fields": {
            k: (v.date().isoformat() if isinstance(v, datetime) else v)
            for k, v in fields.items()
        },
    }
