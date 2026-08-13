"""
AI contract recommendation — suggests which saved contract an extracted
DirectPay invoice should be matched against, mirroring
`services/po_recommendation.py`'s scoring shape (weighted composite,
graceful degradation when a criterion's inputs are missing).

Candidates are the tenant's own `saved` contract runs — there is no
external ERP lookup here, DirectPay has no such integration.
"""
import re
from difflib import SequenceMatcher
from typing import Callable, Optional

# Minimum composite score for a candidate to be surfaced/auto-applied.
MIN_RECOMMENDATION_SCORE = 0.5

_CORP_STOPWORDS = {
    "pte", "ltd", "llc", "inc", "corp", "co", "company", "limited", "pvt",
    "private", "plc", "gmbh", "sdn", "bhd", "the", "and", "of", "services",
}


def _norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def _to_float(v) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _name_similarity(a: Optional[str], b: Optional[str]):
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
    return score


def _score_vendor(inv: dict, contract: dict):
    a, b = inv.get("vendor_name"), contract.get("vendor_name")
    score = _name_similarity(a, b)
    if score is None:
        return None
    return score, f"vendor \"{b}\" vs \"{a}\""


def _score_customer(inv: dict, contract: dict):
    a, b = inv.get("customer_name"), contract.get("customer_name")
    score = _name_similarity(a, b)
    if score is None:
        return None
    return score, f"customer \"{b}\" vs \"{a}\""


def _score_amount(inv: dict, contract: dict):
    a, b = inv.get("grand_total"), contract.get("base_fee")
    if a is None or b is None or a <= 0 or b <= 0:
        return None
    rel_diff = abs(a - b) / max(abs(a), abs(b))
    # 1.0 at exact match, 0 once the difference reaches 100% — contract base
    # fees are often lump-sum/annualized while invoice totals are per-period,
    # so this criterion is intentionally more forgiving than PO's amount check.
    score = max(0.0, 1.0 - rel_diff)
    return score, f"contract base fee {b:,.2f} vs invoice total {a:,.2f}"


def _score_currency(inv: dict, contract: dict):
    a, b = inv.get("currency"), contract.get("currency")
    if not a or not b:
        return None
    match = a.strip().upper() == b.strip().upper()
    return (1.0 if match else 0.0), f"currency {b} vs {a}"


def _score_date(inv: dict, contract: dict):
    start = contract.get("actual_start")
    anchor = inv.get("billing_period_start")
    if not start or not anchor:
        return None
    try:
        from datetime import date
        s = date.fromisoformat(str(start)[:10])
        a = date.fromisoformat(str(anchor)[:10])
    except ValueError:
        return None
    days = abs((a - s).days)
    # 1.0 at exact match, 0 once the gap reaches a year.
    score = max(0.0, 1.0 - days / 365.0)
    return score, f"contract start {s.isoformat()} vs invoice billing start {a.isoformat()} ({days}d apart)"


# (name, weight, scorer) — weights renormalize over applicable scorers, so a
# candidate missing one signal is never penalized directly for it.
SCORERS: list[tuple[str, float, Callable]] = [
    ("vendor_name", 0.35, _score_vendor),
    ("customer_name", 0.15, _score_customer),
    ("amount", 0.25, _score_amount),
    ("currency", 0.10, _score_currency),
    ("billing_date", 0.15, _score_date),
]


def _invoice_fields(extracted: dict) -> dict:
    return {
        "vendor_name": extracted.get("vendor_name"),
        "customer_name": extracted.get("customer_name"),
        "grand_total": _to_float(extracted.get("grand_total")),
        "currency": extracted.get("currency"),
        "billing_period_start": extracted.get("billing_period_start"),
    }


def _contract_fields(fields: dict) -> dict:
    return {
        "vendor_name": fields.get("vendor_name"),
        "customer_name": fields.get("customer_name"),
        "base_fee": _to_float(fields.get("base_fee")),
        "currency": fields.get("currency"),
        "actual_start": fields.get("actual_start"),
    }


def score_candidate(invoice_extracted: dict, contract_fields: dict) -> dict:
    inv = _invoice_fields(invoice_extracted)
    contract = _contract_fields(contract_fields)
    breakdown = []
    weighted, total_weight = 0.0, 0.0
    for name, weight, fn in SCORERS:
        result = fn(inv, contract)
        if result is None:
            continue
        score, detail = result
        weighted += weight * score
        total_weight += weight
        breakdown.append({"criterion": name, "score": round(score, 3), "detail": detail})
    composite = weighted / total_weight if total_weight else 0.0
    return {"score": round(composite, 3), "breakdown": breakdown}


def rank_candidates(invoice_extracted: dict, contracts: list[dict]) -> list[dict]:
    """`contracts` = list of {id, file_name, fields} (only status="saved" runs)."""
    scored = []
    for c in contracts:
        s = score_candidate(invoice_extracted, c.get("fields") or {})
        scored.append({
            "contract_id": c["id"],
            "file_name": c.get("file_name"),
            "vendor_name": (c.get("fields") or {}).get("vendor_name"),
            "customer_name": (c.get("fields") or {}).get("customer_name"),
            "base_fee": (c.get("fields") or {}).get("base_fee"),
            "currency": (c.get("fields") or {}).get("currency"),
            "actual_start": (c.get("fields") or {}).get("actual_start"),
            "contract_type": (c.get("fields") or {}).get("contract_type"),
            **s,
        })
    scored.sort(key=lambda c: c["score"], reverse=True)
    return scored


def build_recommendation(invoice_extracted: dict, contracts: list[dict]) -> dict:
    """Score every saved contract against the invoice; `recommended` is None
    when nothing clears MIN_RECOMMENDATION_SCORE."""
    ranked = rank_candidates(invoice_extracted, contracts)
    top = ranked[0] if ranked and ranked[0]["score"] >= MIN_RECOMMENDATION_SCORE else None
    return {
        "recommended": top,
        "candidates": ranked[:5],
        "candidates_considered": len(contracts),
    }
