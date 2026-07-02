"""Email-driven pricing master + maker-checker approval queue.

The business problem: BD/commercial teams don't keep the rate-card Excel current
in real time — editing the workbook is an overhead, so agreed pricing lives in
email and the master drifts stale. This module closes that loop:

  1. INTAKE.  A pricing change arrives either as a real email to a dedicated
     mailbox (finance-pricing@neoflo.ai — polled by `pricing_poller`) or via the
     in-app composer fallback. Either way we get free-text subject + body.

  2. EXTRACTION (LLM).  A real Claude call reads the message and pulls out the
     structured signal — bank, payment rail, basis, rate value, effective date —
     reusing the exact schema and canonical vocabulary the commercials-inbox
     scanner uses (`email_scan.EmailSignal`). No regex.

  3. QUEUE (maker-checker).  The extracted change lands as a PENDING row in a
     SEPARATE approval queue. It never touches the live rate card on its own.

  4. REVIEW.  A checker sees the before -> after diff and Approves or Rejects.
     Approval applies the change to the rate-card master using its native
     versioning + effective-dating (expire the old ACTIVE row, insert a new
     ACTIVE version), and writes an audit record. Rejection records the reason.

Scope (v1): rate value / basis / effective-date for existing bank x mode terms,
plus brand-new terms. Rebates and volume tiers are out of scope.
"""
import datetime as _dt
import os
import uuid

import dbstore as store  # vendored sibling module (see router.py sys.path shim)

# reuse the extractor's schema + canonical vocabulary + system prompt so the
# structured output is identical to the commercials-inbox scanner
import email_scan as _scan

CANON_BANKS = _scan.CANON_BANKS
CANON_MODES = _scan.CANON_MODES
MODEL = _scan.MODEL
MERCHANT_SCOPE = "ALL"  # v1 operates on the portfolio-wide term


# --------------------------------------------------------------------------- #
# schema
# --------------------------------------------------------------------------- #
def _ensure_tables(con):
    con.execute(
        """CREATE TABLE IF NOT EXISTS pricing_updates (
            id              TEXT PRIMARY KEY,
            created_at      TEXT,
            source          TEXT,           -- 'email' | 'composer'
            source_email_id TEXT,
            sender          TEXT,
            subject         TEXT,
            raw_body        TEXT,
            bank            TEXT,
            payment_mode    TEXT,
            kind            TEXT,           -- 'RATE_CHANGE' | 'NEW_TERM'
            proposed_basis  TEXT,           -- 'PCT_GMV' | 'PER_TXN'
            proposed_value  REAL,
            effective_date  TEXT,
            current_term_id TEXT,
            current_basis   TEXT,
            current_value   REAL,
            status          TEXT,           -- 'PENDING' | 'APPROVED' | 'REJECTED'
            confidence      TEXT,
            quote           TEXT,
            reasoning       TEXT,
            decided_by      TEXT,
            decided_at      TEXT,
            reject_reason   TEXT,
            applied_term_id TEXT
        )"""
    )
    con.execute(
        """CREATE TABLE IF NOT EXISTS pricing_audit (
            id           TEXT PRIMARY KEY,
            at           TEXT,
            update_id    TEXT,
            action       TEXT,              -- 'APPROVED' | 'REJECTED'
            actor        TEXT,
            bank         TEXT,
            payment_mode TEXT,
            detail       TEXT
        )"""
    )
    con.commit()


def _now():
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# rate-card master
# --------------------------------------------------------------------------- #
def _term_value(row):
    """The single numeric rate for a term, whatever its basis."""
    if row["basis"] == "PCT_GMV":
        return row["rate_pct"]
    if row["basis"] == "PER_TXN":
        return row["fee_per_txn"]
    return None


def _current_active_term(con, bank, mode):
    """The live ACTIVE portfolio-wide term for a bank x mode, or None."""
    cur = con.execute(
        "SELECT * FROM rate_cards WHERE bank=? AND payment_mode=? AND "
        "merchant_scope=? AND status='ACTIVE' ORDER BY version DESC LIMIT 1",
        (bank, mode, MERCHANT_SCOPE),
    )
    return cur.fetchone()


def _next_term_id(con):
    rows = con.execute("SELECT term_id FROM rate_cards").fetchall()
    nums = [int(r["term_id"][1:]) for r in rows
            if isinstance(r["term_id"], str) and r["term_id"].startswith("T")
            and r["term_id"][1:].isdigit()]
    return f"T{(max(nums) + 1) if nums else 1:03d}"


def pricing_master():
    """The current rate-card master (ACTIVE terms) + recent applied history."""
    con = store.connect()
    _ensure_tables(con)
    rows = con.execute(
        "SELECT * FROM rate_cards ORDER BY bank, payment_mode, version DESC"
    ).fetchall()
    audit = con.execute(
        "SELECT * FROM pricing_audit ORDER BY at DESC LIMIT 25"
    ).fetchall()
    pending_n = con.execute(
        "SELECT COUNT(*) n FROM pricing_updates WHERE status='PENDING'"
    ).fetchone()["n"]
    con.close()

    terms = []
    for r in rows:
        d = dict(r)
        d["value"] = _term_value(r)
        d["value_display"] = _fmt_value(r["basis"], d["value"])
        terms.append(d)
    active = [t for t in terms if t["status"] == "ACTIVE"]
    return {
        "period": store.get_meta().get("period", ""),
        "count_active": len(active),
        "count_total": len(terms),
        "pending_updates": pending_n,
        "terms": terms,
        "audit": [dict(a) for a in audit],
    }


def _fmt_value(basis, value):
    if value is None:
        return "—"
    if basis == "PCT_GMV":
        return f"{value:g}%"
    if basis == "PER_TXN":
        return f"₹{value:g}/txn"
    return f"{value:g}"


# --------------------------------------------------------------------------- #
# extraction (real-time LLM, single message — no shared cache)
# --------------------------------------------------------------------------- #
def extract_one(subject, body, sender=None):
    """Extract one pricing signal from a free-text email via a live Claude call.

    Mirrors email_scan's extraction (same schema, vocab, system prompt) but for a
    single ad-hoc message and WITHOUT touching the inbox extraction cache.
    Raises email_scan.NoAPIKey when no key is configured.
    """
    _scan._load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise _scan.NoAPIKey(
            "ANTHROPIC_API_KEY not set — cannot extract the pricing change from the email."
        )
    if _scan.BaseModel is None:  # pydantic unavailable
        raise RuntimeError("pydantic is required for pricing extraction.")

    import anthropic

    client = anthropic.Anthropic()
    email_id = "COMPOSE-1"
    user_content = (
        "Extract one EmailSignal for the following email.\n\n"
        f"--- EMAIL {email_id} ---\n"
        f"From: {sender or 'unknown'}\n"
        f"Subject: {subject}\n"
        f"{body}"
    )
    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=4000,
            thinking={"type": "adaptive"},
            system=[{
                "type": "text",
                "text": _scan.SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": user_content}],
            output_format=_scan.Extraction,
        )
    except anthropic.APIStatusError as e:
        msg = getattr(e, "message", str(e))
        raise _scan.NoAPIKey(f"Claude API unavailable: {msg}") from e

    parsed = response.parsed_output
    if not parsed.signals:
        raise ValueError("The model returned no signal for this email.")
    return parsed.signals[0].model_dump()


# --------------------------------------------------------------------------- #
# queue: create a pending update from an extracted signal
# --------------------------------------------------------------------------- #
def create_update_from_signal(signal, *, source, sender=None, subject=None,
                              raw_body=None, source_email_id=None):
    """Turn an extracted EmailSignal dict into a PENDING queue row.

    Returns the created record. Raises ValueError if the signal is not a usable
    commercial change (so the caller can surface a friendly message)."""
    bank = signal.get("bank") if signal.get("bank") in CANON_BANKS else None
    mode = signal.get("payment_mode") if signal.get("payment_mode") in CANON_MODES else None
    basis = signal.get("basis") if signal.get("basis") in ("PCT_GMV", "PER_TXN") else None
    value = signal.get("value")

    if not (signal.get("is_commercial_change") and bank and mode and basis and value is not None):
        reason = signal.get("reasoning") or "No commercial rate change detected."
        raise ValueError(
            f"This email does not contain a usable pricing change. {reason}"
        )

    con = store.connect()
    _ensure_tables(con)
    current = _current_active_term(con, bank, mode)
    if current is not None:
        kind = "RATE_CHANGE"
        current_term_id = current["term_id"]
        current_basis = current["basis"]
        current_value = _term_value(current)
    else:
        kind = "NEW_TERM"
        current_term_id = current_basis = current_value = None

    rec = {
        "id": f"PU-{uuid.uuid4().hex[:8].upper()}",
        "created_at": _now(),
        "source": source,
        "source_email_id": source_email_id,
        "sender": sender,
        "subject": subject,
        "raw_body": raw_body,
        "bank": bank,
        "payment_mode": mode,
        "kind": kind,
        "proposed_basis": basis,
        "proposed_value": float(value),
        "effective_date": signal.get("effective_date"),
        "current_term_id": current_term_id,
        "current_basis": current_basis,
        "current_value": current_value,
        "status": "PENDING",
        "confidence": None,
        "quote": signal.get("quote"),
        "reasoning": signal.get("reasoning"),
        "decided_by": None,
        "decided_at": None,
        "reject_reason": None,
        "applied_term_id": None,
    }
    cols = ",".join(rec.keys())
    ph = ",".join("?" * len(rec))
    con.execute(f"INSERT INTO pricing_updates ({cols}) VALUES ({ph})", list(rec.values()))
    con.commit()
    con.close()
    return _augment(rec)


def extract_and_queue(subject, body, *, sender=None, source="composer",
                      source_email_id=None):
    """Full intake path: live extract, then queue. Returns the pending record."""
    signal = extract_one(subject, body, sender=sender)
    return create_update_from_signal(
        signal, source=source, sender=sender, subject=subject,
        raw_body=body, source_email_id=source_email_id,
    )


# --------------------------------------------------------------------------- #
# queue: read
# --------------------------------------------------------------------------- #
def _augment(rec):
    """Attach display helpers + a before/after diff to a queue record."""
    rec = dict(rec)
    proposed_display = _fmt_value(rec.get("proposed_basis"), rec.get("proposed_value"))
    current_display = _fmt_value(rec.get("current_basis"), rec.get("current_value"))
    delta = None
    if (rec.get("current_value") is not None
            and rec.get("current_basis") == rec.get("proposed_basis")):
        delta = float(rec["proposed_value"]) - float(rec["current_value"])
    rec["diff"] = {
        "kind": rec.get("kind"),
        "bank": rec.get("bank"),
        "payment_mode": rec.get("payment_mode"),
        "before": {
            "term_id": rec.get("current_term_id"),
            "basis": rec.get("current_basis"),
            "value": rec.get("current_value"),
            "display": current_display if rec.get("current_value") is not None else "— (no active term)",
        },
        "after": {
            "basis": rec.get("proposed_basis"),
            "value": rec.get("proposed_value"),
            "display": proposed_display,
            "effective_date": rec.get("effective_date"),
        },
        "delta": delta,
        "delta_display": (f"{delta:+g}" if delta is not None else None),
        "direction": (None if delta is None else ("up" if delta > 0 else ("down" if delta < 0 else "flat"))),
    }
    return rec


def list_updates(status=None):
    con = store.connect()
    _ensure_tables(con)
    if status:
        rows = con.execute(
            "SELECT * FROM pricing_updates WHERE status=? ORDER BY created_at DESC",
            (status,),
        ).fetchall()
    else:
        rows = con.execute(
            "SELECT * FROM pricing_updates ORDER BY created_at DESC"
        ).fetchall()
    con.close()
    items = [_augment(dict(r)) for r in rows]
    pending = [i for i in items if i["status"] == "PENDING"]
    return {
        "count": len(items),
        "pending": len(pending),
        "approved": sum(1 for i in items if i["status"] == "APPROVED"),
        "rejected": sum(1 for i in items if i["status"] == "REJECTED"),
        "updates": items,
    }


def get_update(update_id):
    con = store.connect()
    _ensure_tables(con)
    row = con.execute("SELECT * FROM pricing_updates WHERE id=?", (update_id,)).fetchone()
    con.close()
    if row is None:
        return None
    return _augment(dict(row))


# --------------------------------------------------------------------------- #
# queue: decide (maker-checker)
# --------------------------------------------------------------------------- #
def _fetch_pending(con, update_id):
    row = con.execute(
        "SELECT * FROM pricing_updates WHERE id=?", (update_id,)
    ).fetchone()
    if row is None:
        raise ValueError(f"Pricing update {update_id} not found.")
    if row["status"] != "PENDING":
        raise ValueError(f"Update {update_id} is already {row['status']}.")
    return row


def _audit(con, update_id, action, actor, bank, mode, detail):
    con.execute(
        "INSERT INTO pricing_audit (id, at, update_id, action, actor, bank, "
        "payment_mode, detail) VALUES (?,?,?,?,?,?,?,?)",
        (f"AU-{uuid.uuid4().hex[:8].upper()}", _now(), update_id, action,
         actor, bank, mode, detail),
    )


def approve(update_id, approver="Checker"):
    """Apply the pending change to the rate-card master using native versioning.

    - RATE_CHANGE: expire the current ACTIVE term (status=EXPIRED, effective_to =
      day before the new effective date) and insert a new ACTIVE version.
    - NEW_TERM: insert a fresh ACTIVE version 1 row.
    Records the applied term_id, marks the update APPROVED, writes an audit row.
    """
    con = store.connect()
    _ensure_tables(con)
    try:
        u = _fetch_pending(con, update_id)
        bank, mode = u["bank"], u["payment_mode"]
        basis, value = u["proposed_basis"], u["proposed_value"]
        eff = u["effective_date"] or _dt.date.today().isoformat()
        new_term_id = _next_term_id(con)

        # Expire every currently-ACTIVE version for this bank x mode x scope the
        # day before the new rate takes effect. This leaves a single ACTIVE term
        # afterwards (and resolves any pre-existing overlapping-terms exception).
        actives = con.execute(
            "SELECT term_id, version FROM rate_cards WHERE bank=? AND payment_mode=? "
            "AND merchant_scope=? AND status='ACTIVE'",
            (bank, mode, MERCHANT_SCOPE),
        ).fetchall()
        if actives:
            try:
                d = _dt.date.fromisoformat(eff)
                expire_to = (d - _dt.timedelta(days=1)).isoformat()
            except ValueError:
                expire_to = eff
            for a in actives:
                con.execute(
                    "UPDATE rate_cards SET status='EXPIRED', effective_to=? WHERE term_id=?",
                    (expire_to, a["term_id"]),
                )
            new_version = max(int(a["version"] or 1) for a in actives) + 1
        else:
            new_version = 1

        rate_pct = value if basis == "PCT_GMV" else None
        fee_per_txn = value if basis == "PER_TXN" else None
        note = f"Applied from pricing update {update_id} (source={u['source']}, by={approver})"
        con.execute(
            "INSERT INTO rate_cards (term_id, bank, payment_mode, merchant_scope, "
            "basis, rate_pct, fee_per_txn, effective_from, effective_to, version, "
            "status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (new_term_id, bank, mode, MERCHANT_SCOPE, basis, rate_pct, fee_per_txn,
             eff, None, new_version, "ACTIVE", note),
        )

        con.execute(
            "UPDATE pricing_updates SET status='APPROVED', decided_by=?, "
            "decided_at=?, applied_term_id=? WHERE id=?",
            (approver, _now(), new_term_id, update_id),
        )
        detail = (f"{u['kind']} {bank} {mode}: "
                  f"{_fmt_value(u['current_basis'], u['current_value'])} → "
                  f"{_fmt_value(basis, value)} (w.e.f {eff}); new term {new_term_id}")
        _audit(con, update_id, "APPROVED", approver, bank, mode, detail)
        con.commit()
    finally:
        con.close()
    return get_update(update_id)


def reject(update_id, checker="Checker", reason=""):
    con = store.connect()
    _ensure_tables(con)
    try:
        u = _fetch_pending(con, update_id)
        con.execute(
            "UPDATE pricing_updates SET status='REJECTED', decided_by=?, "
            "decided_at=?, reject_reason=? WHERE id=?",
            (checker, _now(), reason, update_id),
        )
        detail = (f"Rejected {u['kind']} {u['bank']} {u['payment_mode']} → "
                  f"{_fmt_value(u['proposed_basis'], u['proposed_value'])}"
                  + (f"; reason: {reason}" if reason else ""))
        _audit(con, update_id, "REJECTED", checker, u["bank"], u["payment_mode"], detail)
        con.commit()
    finally:
        con.close()
    return get_update(update_id)
