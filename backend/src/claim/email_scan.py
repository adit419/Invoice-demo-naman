"""Commercials inbox scanner — LLM extraction + deterministic reconciliation.

Two stages, by design:

  1. EXTRACTION (LLM).  A real Claude call reads each free-text email and pulls
     out the commercial signal — which bank, which payment rail, the proposed
     rate, its basis and effective date — and decides whether the email is an
     actual pricing change or just noise. Messy human prose ("Treasury finalised
     RuPay Debit at 0.50%, not 0.48%") is exactly what a model is good at and
     regex is bad at.

  2. RECONCILIATION (code).  Deterministic maths compares each extracted signal
     against the *current* rate card (reusing the engine's effective-date logic),
     classifies drift / renewal / new-term / aligned, and scores the rupee impact.

The model decides *what was said*; code decides *what it costs*. Extraction is
cached to disk so a given mailbox is only sent to Claude once.
"""
import hashlib
import json
import os
from typing import List, Optional

import pandas as pd

import compute_claim as engine

CR = 1e7
PERIOD_START = engine.PERIOD_START
HERE = os.path.dirname(__file__)
CACHE_PATH = os.path.join(HERE, "data", "emails_extracted.json")
MODEL = "claude-opus-4-7"

# canonical vocab the model must map free text onto
CANON_BANKS = ["HDFC", "ICICI", "Axis", "SBI", "Kotak", "YesBank",
               "PNB", "BoB", "IndusInd", "IDFC First", "Federal", "RBL"]
CANON_MODES = ["RuPay Debit", "Credit Card", "Net Banking", "UPI", "Wallet"]


class NoAPIKey(RuntimeError):
    """Raised when no ANTHROPIC_API_KEY is available and no cached extraction exists."""


# --------------------------------------------------------------------------- #
# extraction schema (what the LLM returns per email)
# --------------------------------------------------------------------------- #
try:
    from pydantic import BaseModel, Field

    class EmailSignal(BaseModel):
        email_id: str = Field(description="The id of the email, e.g. EM-001")
        is_commercial_change: bool = Field(
            description="True only if the email states a NEW or CONFIRMED commercial "
                        "rate/pricing for a bank payment rail. False for greetings, "
                        "downtime notices, KYC, cashback promos, MIS chatter, etc.")
        bank: Optional[str] = Field(default=None, description="One of the canonical banks, or null")
        payment_mode: Optional[str] = Field(default=None, description="One of the canonical modes, or null")
        basis: Optional[str] = Field(default=None, description="'PCT_GMV' for a % MDR, 'PER_TXN' for a per-transaction fee, else null")
        value: Optional[float] = Field(default=None, description="The numeric rate: the percentage (e.g. 0.5) for PCT_GMV, or the rupee fee (e.g. 0.30) for PER_TXN")
        effective_date: Optional[str] = Field(default=None, description="ISO date YYYY-MM-DD the rate takes effect, or null")
        quote: Optional[str] = Field(default=None, description="The exact sentence from the body that states the rate")
        reasoning: str = Field(description="One short sentence: why this is/ isn't a commercial change")

    class Extraction(BaseModel):
        signals: List[EmailSignal]
except Exception:  # pydantic unavailable at import time
    BaseModel = None


SYSTEM = (
    "You are a commercials analyst for a payments company. You read emails between "
    "the finance team and partner banks and extract pricing signals.\n\n"
    f"Canonical banks: {', '.join(CANON_BANKS)}.\n"
    f"Canonical payment modes: {', '.join(CANON_MODES)}.\n\n"
    "For every email, return one EmailSignal. Rules:\n"
    "- Map bank/mode aliases to the canonical spellings exactly (e.g. 'state bank' -> 'SBI', "
    "'rupay' -> 'RuPay Debit', 'net banking'/'netbanking' -> 'Net Banking').\n"
    "- A percentage MDR (e.g. '0.50%', 'MDR of 0.42 percent') has basis 'PCT_GMV' and value = the number (0.50, 0.42).\n"
    "- A per-transaction fee (e.g. 'Rs 0.30 per txn', '₹9 per transaction') has basis 'PER_TXN' and value = the rupee amount.\n"
    "- is_commercial_change is TRUE only when the email sets or confirms a rate for a bank+mode. "
    "It is FALSE for festive cashback offers, downtime notices, KYC requests, holiday calendars, "
    "contact updates, webinar invites, surveys, settlement-variance notes and general chatter — "
    "even if they mention numbers (transaction counts, variances, growth %).\n"
    "- If a thread corrects an earlier number, extract what each individual email says; "
    "do not try to resolve which wins (downstream code handles supersession by date).\n"
    "- If the email is not a commercial change, set is_commercial_change=false and leave bank/mode/basis/value null.\n"
    "- effective_date: resolve phrases like 'w.e.f 1 May 2026', 'effective this month', "
    "'from 1st May' to an ISO date in 2026; null if none stated."
)


def _cache_key(emails):
    payload = [{"id": e.get("id"), "subject": e.get("subject"), "body": e.get("body")} for e in emails]
    raw = json.dumps(payload, sort_keys=True).encode()
    return hashlib.sha256(raw).hexdigest()


def _load_cache(key):
    if not os.path.exists(CACHE_PATH):
        return None
    try:
        with open(CACHE_PATH) as f:
            blob = json.load(f)
        if blob.get("key") == key:
            return blob.get("signals")
    except Exception:  # noqa: BLE001
        return None
    return None


def _save_cache(key, signals):
    with open(CACHE_PATH, "w") as f:
        json.dump({"key": key, "model": MODEL, "signals": signals}, f, indent=2)


def _load_env():
    """Load ANTHROPIC_API_KEY from a project-root .env if present."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(HERE, ".env"), override=True)
    except Exception:  # noqa: BLE001
        pass


def extract_signals(emails, force=False):
    """Return {email_id: signal_dict} using the LLM (cached to disk).

    Raises NoAPIKey if extraction is required but no key/cache is available.
    """
    key = _cache_key(emails)
    if not force:
        cached = _load_cache(key)
        if cached is not None:
            return {s["email_id"]: s for s in cached}

    _load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        # fall back to any stale cache rather than failing the demo outright
        if os.path.exists(CACHE_PATH):
            with open(CACHE_PATH) as f:
                return {s["email_id"]: s for s in json.load(f).get("signals", [])}
        raise NoAPIKey(
            "ANTHROPIC_API_KEY not set. Add it to a .env file at the project root "
            "to run the LLM inbox scanner."
        )

    import anthropic

    client = anthropic.Anthropic()
    lines = [
        f"--- EMAIL {e['id']} ---\n"
        f"From: {e.get('sender_name')} <{e.get('sender_email')}>\n"
        f"Date: {e.get('date')}\n"
        f"Subject: {e.get('subject')}\n"
        f"{e.get('body')}"
        for e in emails
    ]
    user_content = (
        "Extract one EmailSignal for each of the following emails. "
        "Return them in the same order.\n\n" + "\n\n".join(lines)
    )

    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=8000,
            thinking={"type": "adaptive"},
            system=[{
                "type": "text",
                "text": SYSTEM,
                "cache_control": {"type": "ephemeral"},  # stable prefix -> cache it
            }],
            messages=[{"role": "user", "content": user_content}],
            output_format=Extraction,
        )
    except anthropic.APIStatusError as e:
        # surface quota / rate-limit / auth issues with the provider's own message
        msg = getattr(e, "message", str(e))
        raise NoAPIKey(f"Claude API unavailable: {msg}") from e
    parsed = response.parsed_output
    signals = [s.model_dump() for s in parsed.signals]
    _save_cache(key, signals)
    return {s["email_id"]: s for s in signals}


# --------------------------------------------------------------------------- #
# reconciliation (deterministic) — reuses the engine's effective-date logic
# --------------------------------------------------------------------------- #
def _current_term(bank, mode, rc):
    pool = rc[(rc.bank == bank) & (rc.payment_mode == mode) & (rc.merchant_scope == "ALL")]
    if pool.empty:
        return None, pool
    valid = pool[pool.apply(lambda r: engine.covers(r, PERIOD_START), axis=1)]
    if valid.empty:
        return None, pool
    chosen = valid.sort_values(["version", "effective_from"]).iloc[-1]
    return chosen, pool


def _gmv_txn(vol, bank, mode):
    g = vol[(vol.bank == bank) & (vol.payment_mode == mode)]
    return float(g.gmv.sum()), float(g.txn_count.sum())


def scan(emails, rc, vol, force=False):
    """Scan the mailbox: LLM extraction + deterministic reconciliation vs rate card."""
    extracted = extract_signals(emails, force=force)

    scanned = []     # one record per email (signal or noise)
    signals = []     # emails carrying a usable commercial rate

    for e in emails:
        sig = extracted.get(e["id"], {})
        bank = sig.get("bank") if sig.get("bank") in CANON_BANKS else None
        mode = sig.get("payment_mode") if sig.get("payment_mode") in CANON_MODES else None
        basis = sig.get("basis") if sig.get("basis") in ("PCT_GMV", "PER_TXN") else None
        value = sig.get("value")
        has_signal = bool(
            sig.get("is_commercial_change") and bank and mode and basis and value is not None
        )

        rec = {
            **{k: e.get(k) for k in
               ("id", "thread_id", "subject", "sender_name", "sender_email",
                "direction", "date", "body")},
            "bank": bank, "payment_mode": mode,
            "detected_basis": basis, "detected_value": value,
            "has_signal": has_signal,
        }
        scanned.append(rec)
        if has_signal:
            eff = sig.get("effective_date")
            signals.append({
                **rec,
                "effective_date": pd.Timestamp(eff) if eff else None,
                "snippet": sig.get("quote") or e.get("body", "").strip(),
            })

    # ---- supersede within a thread: latest email date wins per (bank, mode) ----
    by_key = {}
    for s in signals:
        k = (s["bank"], s["payment_mode"])
        cur = by_key.get(k)
        if cur is None or s["date"] > cur["date"]:
            by_key[k] = s

    changes = []
    for (bank, mode), s in by_key.items():
        chosen, pool = _current_term(bank, mode, rc)
        gmv, txn = _gmv_txn(vol, bank, mode)
        proposed_basis, proposed = s["detected_basis"], s["detected_value"]

        in_rc = chosen is not None
        current_basis = chosen.basis if in_rc else None
        if in_rc and current_basis == "PCT_GMV":
            current_val = float(chosen.rate_pct)
        elif in_rc and current_basis == "PER_TXN":
            current_val = float(chosen.fee_per_txn)
        else:
            current_val = None

        has_expired = (not pool.empty) and (pool["status"] == "EXPIRED").any()

        # ---- classify ----
        if not in_rc:
            status = "RENEWAL" if has_expired else "NEW_TERM"
        elif current_basis != proposed_basis or current_val is None:
            status = "DRIFT_UP"
        elif abs(proposed - current_val) < 1e-9:
            status = "ALIGNED"
        elif proposed > current_val:
            status = "DRIFT_UP"
        else:
            status = "DRIFT_DOWN"

        # ---- monthly rupee impact (signed: + = under-billing we'd recover) ----
        if status in ("NEW_TERM", "RENEWAL"):
            impact = (gmv * proposed / 100.0 if proposed_basis == "PCT_GMV" else txn * proposed)
        elif status == "ALIGNED":
            impact = 0.0
        elif proposed_basis == "PCT_GMV":
            impact = gmv * (proposed - (current_val or 0.0)) / 100.0
        else:
            impact = txn * (proposed - (current_val or 0.0))

        # ---- recommended action ----
        next_id = _next_term_id(rc)
        if proposed_basis == "PCT_GMV":
            pretty = f"{proposed:g}%"
        else:
            pretty = f"Rs {proposed:g}/txn"
        if status == "NEW_TERM":
            action = f"Add rate-card row {next_id}: {bank} {mode} @ {pretty}."
            resolves = "NO_TERM"
        elif status == "RENEWAL":
            action = f"Renew {bank} {mode}: add {next_id} @ {pretty}, retire expired term."
            resolves = "EXPIRED_TERM"
        elif status == "ALIGNED":
            action = "No change needed — email confirms the current rate."
            resolves = None
        elif status == "DRIFT_DOWN":
            action = f"Lower {bank} {mode} to {pretty} (add {next_id}); flag for clawback risk."
            resolves = None
        else:
            action = f"Raise {bank} {mode} to {pretty} (add {next_id}); current card under-bills."
            resolves = None

        changes.append({
            "bank": bank, "payment_mode": mode,
            "status": status, "in_rate_card": in_rc,
            "current_basis": current_basis, "current_value": current_val,
            "current_term_id": (chosen.term_id if in_rc else None),
            "proposed_basis": proposed_basis, "proposed_value": proposed,
            "effective_date": (s["effective_date"].date().isoformat()
                               if s.get("effective_date") is not None else None),
            "impact_inr": impact,
            "severity": _severity(status, impact),
            "recommended_action": action,
            "resolves_exception": resolves,
            "source_email_id": s["id"],
            "source_thread_id": s["thread_id"],
            "source_sender": s["sender_name"],
            "source_snippet": s["snippet"],
            "thread_size": sum(1 for x in signals if x["thread_id"] == s["thread_id"]),
        })

    changes.sort(key=lambda c: abs(c["impact_inr"]), reverse=True)

    net_impact = sum(c["impact_inr"] for c in changes)
    actionable = [c for c in changes if c["status"] != "ALIGNED"]
    threads = {e["thread_id"] for e in emails}

    return {
        "summary": {
            "emails_scanned": len(emails),
            "threads": len(threads),
            "signals_found": len(signals),
            "changes_detected": len(actionable),
            "aligned": sum(1 for c in changes if c["status"] == "ALIGNED"),
            "net_impact_inr": net_impact,
            "underbilling_inr": sum(c["impact_inr"] for c in changes if c["impact_inr"] > 0),
            "overbilling_inr": sum(c["impact_inr"] for c in changes if c["impact_inr"] < 0),
        },
        "changes": changes,
        "emails": scanned,
    }


def _severity(status, impact):
    if status == "ALIGNED":
        return "info"
    a = abs(impact)
    if status in ("NEW_TERM", "RENEWAL") or a >= 5e5:
        return "high"
    if a >= 1e5:
        return "medium"
    return "low"


def _next_term_id(rc):
    nums = [int(t[1:]) for t in rc.term_id if isinstance(t, str) and t.startswith("T")]
    return f"T{(max(nums) + 1) if nums else 1:03d}"


# ---- CLI for quick verification ----
if __name__ == "__main__":
    import dbstore as store
    emails = store.load_emails()
    vol, rc, _, _ = store.load_inputs()
    res = scan(emails, rc, vol)
    s = res["summary"]
    print("=" * 74)
    print(f"COMMERCIALS INBOX SCAN  |  {s['emails_scanned']} emails, {s['threads']} threads")
    print("=" * 74)
    print(f"Signals found     : {s['signals_found']}")
    print(f"Changes detected  : {s['changes_detected']}  (aligned/confirmed: {s['aligned']})")
    print(f"Net impact        : Rs {s['net_impact_inr']/1e5:,.1f} L  "
          f"(under Rs {s['underbilling_inr']/1e5:,.1f} L / over Rs {s['overbilling_inr']/1e5:,.1f} L)")
    print("-" * 74)
    for c in res["changes"]:
        amt = f"Rs {c['impact_inr']/1e5:+,.1f} L"
        cur = (f"{c['current_value']:g}" if c["current_value"] is not None else "none")
        print(f"[{c['severity']:^6}] {c['status']:<10} {c['bank']:<10} {c['payment_mode']:<12} "
              f"{cur:>6} -> {c['proposed_value']:g}  {amt:>13}  ({c['source_email_id']})")
    print("=" * 74)
