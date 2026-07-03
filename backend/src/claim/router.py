"""Pricing & Claims engine — FastAPI router.

Merged into the main backend. Routes are exposed under the /claim-api/* prefix.

This does NOT re-implement any calculation. The reference engine
(`compute_claim.compute`) is the source of truth. Inputs and computed results
live in a SQLite store (`dbstore`) so the UI can page through the 68k+ row
line-detail table via SQL instead of receiving it all in one JSON payload.

The engine modules (`compute_claim`, `dbstore`, `email_scan`) are vendored into
this package unchanged and imported by adding this directory to sys.path — so
their internal top-level cross-imports keep working without edits.
"""
import io
import os
import sys
import threading

import pandas as pd
from fastapi import APIRouter, Body, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

# --- make the vendored engine modules importable by their top-level names ---
_CLAIM_DIR = os.path.dirname(__file__)
if _CLAIM_DIR not in sys.path:
    sys.path.insert(0, _CLAIM_DIR)

import compute_claim as engine  # noqa: E402
import dbstore as store  # noqa: E402
import email_scan as inbox  # noqa: E402
import pricing as pricing_mod  # noqa: E402

from ..config import settings  # noqa: E402

DATA = os.path.join(_CLAIM_DIR, "data")

# The inbox scanner reads ANTHROPIC_API_KEY from the environment; surface the
# backend's configured key so the LLM extraction can run in the merged backend.
if getattr(settings, "anthropic_api_key", None) and not os.environ.get("ANTHROPIC_API_KEY"):
    os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key

router = APIRouter()


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _prep_commercials(xls: dict):
    rc = xls["rate_cards"].copy()
    tiers = xls["tiers"].copy()
    rebates = xls["rebates"].copy()
    for df in (rc, rebates):
        for c in ("effective_from", "effective_to"):
            df[c] = pd.to_datetime(df[c], errors="coerce")
    return rc, tiers, rebates


def _load_seed_emails():
    """Read the bundled commercials inbox (data/emails.json). Falls back to any
    emails already in the store, then to an empty list."""
    path = os.path.join(DATA, "emails.json")
    if os.path.exists(path):
        import json
        with open(path) as f:
            payload = json.load(f)
        return payload.get("emails", payload if isinstance(payload, list) else [])
    try:
        return store.load_emails()
    except Exception:  # noqa: BLE001
        return []


def _compute_and_store(vol, rc, tiers, rebates):
    """Run the engine and persist results to SQLite; return the light summary."""
    res = engine.compute(vol, rc, tiers, rebates)
    try:
        emails = store.load_emails()
        if not emails:
            emails = _load_seed_emails()
    except Exception:  # noqa: BLE001
        emails = _load_seed_emails()
    store.write_inputs(vol, rc, tiers, rebates, emails)
    store.write_results(res, engine.PERIOD)
    return store.summary_payload()


def _ensure_built():
    """Make sure the SQLite store has computed results, building from the
    bundled input files on a fresh checkout that hasn't seeded the DB yet."""
    if store.has_results():
        return
    vol = pd.read_csv(os.path.join(DATA, "volume_2026_05.csv"))
    xls = pd.read_excel(os.path.join(DATA, "commercials.xlsx"), sheet_name=None)
    rc, tiers, rebates = _prep_commercials(xls)
    _compute_and_store(vol, rc, tiers, rebates)


def _warm_inbox_scan():
    """Run the LLM inbox scan once so the disk cache is warm off the request path."""
    try:
        _ensure_built()
        emails = store.load_emails()
        vol, rc, _t, _r = store.load_inputs()
        inbox.scan(emails, rc, vol, force=False)
        print("[claim] commercials inbox scan warmed (cache ready)")
    except inbox.NoAPIKey as e:  # noqa: BLE001
        print(f"[claim] inbox scan not warmed (no key / quota): {e}")
    except Exception as e:  # noqa: BLE001
        print(f"[claim] inbox warm-up failed: {e}")


def startup():
    """Called once from the app lifespan: build the DB and warm the LLM cache."""
    threading.Thread(target=_warm_inbox_scan, daemon=True).start()


# --------------------------------------------------------------------------- #
# routes
# --------------------------------------------------------------------------- #
@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/compute")
async def compute(
    volume: UploadFile | None = File(default=None),
    commercials: UploadFile | None = File(default=None),
):
    """Compute the claim. Uploaded files are computed live and stored; otherwise
    the pre-computed default results are returned from SQLite."""
    try:
        if volume is not None and commercials is not None:
            vol = pd.read_csv(io.BytesIO(await volume.read()))
            xls = pd.read_excel(io.BytesIO(await commercials.read()), sheet_name=None)
            rc, tiers, rebates = _prep_commercials(xls)
            return _compute_and_store(vol, rc, tiers, rebates)
        _ensure_built()
        return store.summary_payload()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Compute failed: {e}")


@router.get("/lines")
def lines(
    bank: str | None = None,
    mode: str | None = None,
    flag: str | None = None,
    billable: bool | None = None,
    search: str | None = None,
    exceptions_only: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
):
    """One page of line_detail with SQL-side filter, pagination and totals."""
    try:
        _ensure_built()
        return store.query_lines(
            bank=bank, mode=mode, flag=flag, billable=billable, search=search,
            exceptions_only=exceptions_only, offset=offset, limit=limit,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Line query failed: {e}")


@router.get("/emails/scan")
def emails_scan(force: bool = False):
    """Scan the commercials inbox with the LLM extractor and reconcile detected
    rate changes against the current rate card."""
    try:
        _ensure_built()
        emails = store.load_emails()
        vol, rc, _tiers, _rebates = store.load_inputs()
        result = inbox.scan(emails, rc, vol, force=force)
        meta = store.get_meta()
        result["mailbox"] = "ar-team@neoflo.example"
        result["period"] = meta.get("period", engine.PERIOD)
        return result
    except inbox.NoAPIKey as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Inbox scan failed: {e}")


@router.get("/emails")
def emails():
    """Raw mailbox grouped into threads — no LLM. Powers the thread reader."""
    try:
        _ensure_built()
        return store.email_threads()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Mailbox read failed: {e}")


@router.get("/anomalies")
def anomalies():
    """Month-over-month anomaly scan: compares the current settlement month
    against the prior-month baseline and flags bank x mode segments whose
    volume, transaction mix or effective rate shifted materially."""
    try:
        _ensure_built()
        return store.detect_anomalies()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Anomaly scan failed: {e}")


# --------------------------------------------------------------------------- #
# Pricing master + maker-checker approval queue
# --------------------------------------------------------------------------- #
@router.get("/pricing/master")
def pricing_master():
    """The current rate-card master (ACTIVE terms) + recent applied history."""
    try:
        _ensure_built()
        return pricing_mod.pricing_master()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Pricing master read failed: {e}")


@router.get("/pricing/updates")
def pricing_updates(status: str | None = None):
    """The approval queue — pending changes + decided history, each with a diff."""
    try:
        _ensure_built()
        return pricing_mod.list_updates(status=status)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Pricing queue read failed: {e}")


@router.post("/pricing/submit")
def pricing_submit(
    subject: str = Body(..., embed=True),
    body: str = Body(..., embed=True),
    sender: str | None = Body(default=None, embed=True),
):
    """In-app composer fallback: extract the pricing change from a free-text
    email (live LLM) and drop it into the PENDING approval queue."""
    try:
        _ensure_built()
        return pricing_mod.extract_and_queue(subject, body, sender=sender, source="composer")
    except inbox.NoAPIKey as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Pricing submit failed: {e}")


@router.get("/pricing/updates/{update_id}")
def pricing_update(update_id: str):
    _ensure_built()
    rec = pricing_mod.get_update(update_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Update {update_id} not found.")
    return rec


@router.post("/pricing/updates/{update_id}/approve")
def pricing_approve(update_id: str, approver: str = Body("Checker", embed=True)):
    """Checker approves: apply to the rate-card master (versioned) + audit."""
    try:
        _ensure_built()
        return pricing_mod.approve(update_id, approver=approver)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Approve failed: {e}")


@router.post("/pricing/updates/{update_id}/reject")
def pricing_reject(
    update_id: str,
    checker: str = Body("Checker", embed=True),
    reason: str = Body("", embed=True),
):
    """Checker rejects with a reason; the master is untouched."""
    try:
        _ensure_built()
        return pricing_mod.reject(update_id, checker=checker, reason=reason)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Reject failed: {e}")


@router.post("/query")
def query(sql: str = Body(..., embed=True)):
    """Run a single read-only SELECT against the warehouse (Querybook-style)."""
    try:
        _ensure_built()
        return store.run_query(sql)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Query failed: {e}")


def _csv_response(df: pd.DataFrame, filename: str):
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/{kind}")
def export(kind: str):
    _ensure_built()
    con = store.connect()
    try:
        if kind == "line_detail":
            df = pd.read_sql("SELECT * FROM line_detail", con)
            return _csv_response(df, "line_detail.csv")
        if kind == "claim_summary":
            df = pd.read_sql("SELECT * FROM by_bank_mode", con)
            return _csv_response(df, "claim_summary.csv")
        if kind == "exceptions":
            df = pd.read_sql("SELECT * FROM exceptions", con)
            return _csv_response(df, "exceptions.csv")
    finally:
        con.close()
    raise HTTPException(status_code=404, detail=f"Unknown export '{kind}'.")


@router.get("/export/bank/{bank}")
def export_bank(bank: str):
    """Per-bank claim artifact (one file per bank) — the file sent for validation."""
    _ensure_built()
    con = store.connect()
    try:
        billed = pd.read_sql(
            "SELECT merchant_id, merchant_name, bank, payment_mode, gmv, txn_count, "
            "term_id, basis, rate, base_commission, rebate_commission, total_commission "
            "FROM line_detail WHERE bank = ? AND billable = 1",
            con, params=[bank])
    finally:
        con.close()
    if billed.empty:
        raise HTTPException(status_code=404, detail=f"No billable lines for {bank}.")
    out = billed.rename(columns={
        "base_commission": "base_fee",
        "rebate_commission": "rebate",
        "total_commission": "total_fee",
    })
    return _csv_response(out, f"claim_{bank}.csv")
