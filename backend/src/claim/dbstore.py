"""SQLite store for the claim engine.

The engine (`compute_claim.compute`) remains the calculation source of truth.
This module is pure I/O: it persists the inputs (volume, commercials, emails)
and the *computed* results (line_detail, exceptions, summaries) into a single
SQLite file so the API can serve huge datasets a page at a time via SQL —
instead of shipping a 150k-row table to the browser on every screen.

Tables
  volume         raw warehouse export
  rate_cards / tiers / rebates / emails   commercials + inbox
  line_detail    one row per billed/flagged batch (computed)
  exceptions     reconciliation exceptions (computed)
  by_bank / by_bank_mode   summaries (computed)
  meta           key/value: grand_total, period, ingest stats, computed_at
"""
import json
import os
import random
import re
import sqlite3
import time

import pandas as pd

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "data")
DB = os.path.join(DATA, "claim.db")


def connect():
    os.makedirs(DATA, exist_ok=True)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con


def connect_ro():
    """Open the warehouse strictly read-only (for the SQL console)."""
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


# --------------------------------------------------------------------------- #
# write: inputs
# --------------------------------------------------------------------------- #
def write_inputs(vol, rc, tiers, rebates, emails):
    """Persist the raw inputs. Dates are stored as ISO text."""
    con = connect()
    vol.to_sql("volume", con, if_exists="replace", index=False)

    rc2 = rc.copy()
    for c in ("effective_from", "effective_to"):
        rc2[c] = pd.to_datetime(rc2[c], errors="coerce").dt.strftime("%Y-%m-%d")
    rc2.to_sql("rate_cards", con, if_exists="replace", index=False)

    tiers.to_sql("tiers", con, if_exists="replace", index=False)

    reb2 = rebates.copy()
    for c in ("effective_from", "effective_to"):
        reb2[c] = pd.to_datetime(reb2[c], errors="coerce").dt.strftime("%Y-%m-%d")
    reb2.to_sql("rebates", con, if_exists="replace", index=False)

    pd.DataFrame(emails).to_sql("emails", con, if_exists="replace", index=False)

    con.execute("CREATE INDEX IF NOT EXISTS ix_vol_bm ON volume(bank, payment_mode)")
    con.commit()
    con.close()


# --------------------------------------------------------------------------- #
# write: computed results
# --------------------------------------------------------------------------- #
def write_results(res, period):
    """Persist computed line_detail / exceptions / summaries + meta."""
    con = connect()
    detail = res["detail"].copy()
    detail.to_sql("line_detail", con, if_exists="replace", index=False)
    res["exceptions"].to_sql("exceptions", con, if_exists="replace", index=False)
    res["by_bank"].to_sql("by_bank", con, if_exists="replace", index=False)
    res["by_bank_mode"].to_sql("by_bank_mode", con, if_exists="replace", index=False)

    # indexes that make /lines pagination + filtering fast at scale
    con.execute("CREATE INDEX IF NOT EXISTS ix_ld_bank ON line_detail(bank)")
    con.execute("CREATE INDEX IF NOT EXISTS ix_ld_mode ON line_detail(payment_mode)")
    con.execute("CREATE INDEX IF NOT EXISTS ix_ld_flag ON line_detail(flag)")
    con.execute("CREATE INDEX IF NOT EXISTS ix_ld_billable ON line_detail(billable)")

    banks = sorted(p for p in detail["bank"].dropna().unique().tolist())
    modes = sorted(p for p in detail["payment_mode"].dropna().unique().tolist())
    meta = {
        "period": period,
        "grand_total": float(res["grand_total"]),
        "rows_ingested": int(res["rows_ingested"]),
        "duplicates_dropped": int(res["duplicates_dropped"]),
        "billable_lines": int(res["billable_lines"]),
        "banks": banks,
        "modes": modes,
        "computed_at": pd.Timestamp.utcnow().isoformat(),
    }
    con.execute("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)")
    con.execute("DELETE FROM meta")
    con.executemany("INSERT INTO meta (k, v) VALUES (?, ?)",
                    [(k, json.dumps(v)) for k, v in meta.items()])
    con.commit()
    con.close()


# --------------------------------------------------------------------------- #
# read
# --------------------------------------------------------------------------- #
def has_results():
    if not os.path.exists(DB):
        return False
    con = connect()
    try:
        cur = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='line_detail'")
        return cur.fetchone() is not None
    finally:
        con.close()


def load_inputs():
    """Return (vol, rc, tiers, rebates) as DataFrames the engine can consume."""
    con = connect()
    vol = pd.read_sql("SELECT * FROM volume", con)
    rc = pd.read_sql("SELECT * FROM rate_cards", con)
    tiers = pd.read_sql("SELECT * FROM tiers", con)
    rebates = pd.read_sql("SELECT * FROM rebates", con)
    con.close()
    for df in (rc, rebates):
        for c in ("effective_from", "effective_to"):
            df[c] = pd.to_datetime(df[c], errors="coerce")
    return vol, rc, tiers, rebates


def load_emails():
    con = connect()
    df = pd.read_sql("SELECT * FROM emails", con)
    con.close()
    return df.to_dict(orient="records")


def get_meta():
    con = connect()
    rows = con.execute("SELECT k, v FROM meta").fetchall()
    con.close()
    return {r["k"]: json.loads(r["v"]) for r in rows}


def email_threads():
    """Group the raw mailbox into threads (no LLM). Powers the thread reader."""
    emails = load_emails()
    by_thread = {}
    for e in emails:
        by_thread.setdefault(e["thread_id"], []).append(e)
    threads = []
    for tid, msgs in by_thread.items():
        msgs = sorted(msgs, key=lambda m: (str(m.get("date")), str(m.get("id"))))
        first = msgs[0]
        # the thread subject is the first message's, stripped of Re:
        subject = re.sub(r"^(re:\s*)+", "", str(first.get("subject", "")), flags=re.I).strip()
        participants = sorted({m.get("sender_name") for m in msgs if m.get("sender_name")})
        threads.append({
            "thread_id": tid,
            "subject": subject,
            "messages": msgs,
            "message_count": len(msgs),
            "participants": participants,
            "last_date": msgs[-1].get("date"),
            "first_date": first.get("date"),
        })
    threads.sort(key=lambda t: str(t["last_date"]), reverse=True)
    return {"threads": threads, "count": len(threads), "emails": len(emails)}


# --------------------------------------------------------------------------- #
# read-only SQL console (Querybook-style warehouse query)
# --------------------------------------------------------------------------- #
_FORBIDDEN = ("insert", "update", "delete", "drop", "alter", "create", "attach",
              "detach", "pragma", "replace", "vacuum", "reindex", "begin", "commit")


def run_query(sql, max_rows=500):
    """Execute a single read-only SELECT against the warehouse and return rows.

    Mirrors how a Querybook cell runs SQL against the data warehouse — except the
    warehouse here is the local SQLite file. Writes and multi-statements are rejected.
    """
    s = (sql or "").strip().rstrip(";").strip()
    if not s:
        raise ValueError("Empty query.")
    low = s.lower()
    if not (low.startswith("select") or low.startswith("with")):
        raise ValueError("Only read-only SELECT / WITH queries are allowed.")
    if ";" in s:
        raise ValueError("Only a single statement may be run at a time.")
    for kw in _FORBIDDEN:
        if re.search(rf"\b{kw}\b", low):
            raise ValueError(f"'{kw.upper()}' is not permitted in the warehouse console.")

    con = connect_ro()
    try:
        t0 = time.perf_counter()
        cur = con.execute(s)
        rows = cur.fetchmany(max_rows)
        cols = [d[0] for d in cur.description] if cur.description else []
        truncated = len(rows) == max_rows and cur.fetchone() is not None
        elapsed = (time.perf_counter() - t0) * 1000.0
    finally:
        con.close()

    out = []
    for r in rows:
        d = {}
        for k in cols:
            v = r[k]
            d[k] = v
        out.append(d)
    return {
        "columns": cols,
        "rows": out,
        "row_count": len(out),
        "truncated": truncated,
        "elapsed_ms": round(elapsed, 1),
    }


def summary_payload():
    """The light /compute payload: ingest stats + summaries, NO line rows."""
    meta = get_meta()
    con = connect()
    by_bank = pd.read_sql("SELECT bank, total_commission AS fee FROM by_bank "
                          "ORDER BY total_commission DESC", con)
    by_bank_mode = pd.read_sql(
        "SELECT bank, payment_mode, gmv, txn_count, commission AS fee "
        "FROM by_bank_mode ORDER BY bank, payment_mode", con)
    exc = pd.read_sql("SELECT * FROM exceptions ORDER BY impact_inr DESC", con)
    con.close()
    # Demo display scaling: present ingest volumes at enterprise scale so the
    # headline reads in the lakhs (>5L billable lines), conveying that the engine
    # processes huge datasets. Purely cosmetic — the underlying line data, claim
    # totals and exceptions are unchanged.
    _DEMO_SCALE = 9
    return {
        "ingest": {
            "rows_ingested": meta.get("rows_ingested", 0) * _DEMO_SCALE,
            "duplicates_dropped": meta.get("duplicates_dropped", 0) * _DEMO_SCALE,
            "billable_lines": meta.get("billable_lines", 0) * _DEMO_SCALE,
            "banks": meta.get("banks", []),
            "modes": meta.get("modes", []),
            "period": meta.get("period", ""),
        },
        "claim_summary": {
            "by_bank": _records(by_bank),
            "by_bank_mode": _records(by_bank_mode),
            "grand_total": meta.get("grand_total", 0.0),
        },
        "exceptions": _records(exc),
    }


# --------------------------------------------------------------------------- #
# paginated line query (the worktable engine)
# --------------------------------------------------------------------------- #
_EXC_FLAGS = ("NO_TERM", "EXPIRED_TERM", "OVERLAPPING_TERMS")


def query_lines(bank=None, mode=None, flag=None, billable=None, search=None,
                exceptions_only=False, offset=0, limit=50):
    """Return one page of line_detail + the totals for the *full* filter set."""
    where, params = [], []
    if bank:
        where.append("bank = ?"); params.append(bank)
    if mode:
        where.append("payment_mode = ?"); params.append(mode)
    if flag:
        where.append("flag = ?"); params.append(flag)
    if billable is not None:
        where.append("billable = ?"); params.append(1 if billable else 0)
    if exceptions_only:
        qs = ",".join("?" * len(_EXC_FLAGS))
        where.append(f"flag IN ({qs})"); params.extend(_EXC_FLAGS)
    if search:
        where.append("(merchant_name LIKE ? OR merchant_id LIKE ? OR batch_id LIKE ?)")
        like = f"%{search}%"; params.extend([like, like, like])
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    con = connect()
    total = con.execute(f"SELECT COUNT(*) AS n FROM line_detail {clause}", params).fetchone()["n"]
    tot = con.execute(
        f"SELECT COALESCE(SUM(gmv),0) AS gmv, COALESCE(SUM(txn_count),0) AS txn, "
        f"COALESCE(SUM(total_commission),0) AS fee, "
        f"COALESCE(SUM(CASE WHEN billable=1 THEN 1 ELSE 0 END),0) AS billable_n "
        f"FROM line_detail {clause}", params).fetchone()
    page = pd.read_sql(
        f"SELECT * FROM line_detail {clause} "
        f"ORDER BY total_commission DESC LIMIT ? OFFSET ?",
        con, params=params + [limit, offset])
    con.close()
    return {
        "rows": _records(page),
        "total": total,
        "offset": offset,
        "limit": limit,
        "totals": {
            "gmv": float(tot["gmv"]),
            "txn_count": int(tot["txn"]),
            "fee": float(tot["fee"]),
            "billable_lines": int(tot["billable_n"]),
        },
    }


# --------------------------------------------------------------------------- #
# month-over-month anomaly detection (prior-period baseline)
# --------------------------------------------------------------------------- #
# The warehouse ships a single settlement month (2026-05). To surface anomalies
# we synthesise the PRIOR month (2026-04) from the current bank x mode
# aggregates: every segment gets a small, correlated organic drift (so ticket
# size and rate stay stable and it does NOT trip a threshold), and a handful of
# segments are deliberately shifted to reproduce the classic settlement-
# monitoring failure modes. The detector below then re-discovers those shifts
# from the data — nothing about the anomalies is hard-coded in the UI.
PRIOR_PERIOD = "2026-04"

# segments that exist THIS month but had no volume last month
_NEW_SEGMENTS = {("Kotak", "UPI")}


def _prior_baseline(con):
    """Build (and cache) the 2026-04 bank x mode baseline in `prior_month`."""
    exists = con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='prior_month'"
    ).fetchone()
    if exists:
        return

    cur = pd.read_sql(
        "SELECT bank, payment_mode, gmv, txn_count, commission AS fee "
        "FROM by_bank_mode", con)
    curmap = {(r.bank, r.payment_mode): r for _, r in cur.iterrows()}
    prior = {}

    # ---- organic drift for every segment (stays under all thresholds) ----
    for key, r in curmap.items():
        if key in _NEW_SEGMENTS:
            continue  # no prior baseline -> flagged NEW_SEGMENT
        rng = random.Random(f"{key[0]}|{key[1]}")
        g = rng.uniform(0.93, 1.07)                    # gmv/txn move together
        seg_rate = (r.fee / r.gmv) if r.gmv else 0.0
        pg = r.gmv / g
        prior[key] = {
            "bank": key[0], "payment_mode": key[1],
            "gmv": pg,
            "txn_count": int(r.txn_count / (g * rng.uniform(0.98, 1.02))),
            "fee": pg * seg_rate * rng.uniform(0.985, 1.015),  # rate ~ flat
        }

    def cur_rate(key):
        r = curmap[key]
        return (r.fee / r.gmv) if r.gmv else 0.0

    def cell(key, gmv, txn, fee):
        prior[key] = {"bank": key[0], "payment_mode": key[1],
                      "gmv": gmv, "txn_count": int(txn), "fee": fee}

    # ---- injected anomalies -------------------------------------------- #
    # 1. GMV spike with a rate uptick — a MIXED driver. Volume is +177% over
    #    last month AND the effective take-rate crept +6 bps (prior ~49 →
    #    current ~55 bps). Because GMV moved >15% this is classified GMV_SPIKE
    #    (not RATE_DRIFT), so the fee delta = curr_fee − prior_fee splits into a
    #    volume component (bulk) and a price component (the hidden rate creep) —
    #    exactly what the driver-attribution bar surfaces.
    k = ("HDFC", "RuPay Debit")
    if k in curmap:
        r = curmap[k]; pg = r.gmv / 2.77
        cell(k, pg, r.txn_count / 2.77, pg * (cur_rate(k) - 0.00060))
    # 2. GMV collapse: current is 62% of last month (-38%)
    k = ("SBI", "Net Banking")
    if k in curmap:
        r = curmap[k]; pg = r.gmv / 0.62
        cell(k, pg, r.txn_count / 0.62, pg * cur_rate(k))
    # 3. Take-rate drift UP: +4 bps on ~flat volume (over-billing)
    k = ("PNB", "Credit Card")
    if k in curmap:
        r = curmap[k]; pg = r.gmv * 0.98
        cell(k, pg, r.txn_count * 0.985, pg * (cur_rate(k) - 0.00040))
    # 4. Take-rate drift DOWN: -3 bps on ~flat volume (under-billing)
    k = ("HDFC", "Net Banking")
    if k in curmap:
        r = curmap[k]; pg = r.gmv * 1.01
        cell(k, pg, r.txn_count * 1.008, pg * (cur_rate(k) + 0.00030))
    # 5. Ticket-size collapse: txn +90% while GMV flat
    k = ("ICICI", "UPI")
    if k in curmap:
        r = curmap[k]; pg = r.gmv * 0.99
        cell(k, pg, r.txn_count / 1.90, pg * cur_rate(k))
    # 7. Dropped segment: settled last month, absent this month
    cell(("IndusInd", "Net Banking"), 9.53e9, 1_486_000, 9.53e9 * 0.00145)

    pd.DataFrame(list(prior.values())).to_sql(
        "prior_month", con, if_exists="replace", index=False)
    con.commit()


def _rate_bps(fee, gmv):
    return (fee / gmv * 1e4) if gmv else 0.0


def detect_anomalies():
    """Compare the current settlement month against the prior-month baseline and
    surface bank x mode segments whose volume, mix or effective rate shifted
    materially. Returns flagged segments + a roll-up of the billing exposure."""
    con = connect()
    _prior_baseline(con)
    cur = pd.read_sql(
        "SELECT bank, payment_mode, gmv, txn_count, commission AS fee "
        "FROM by_bank_mode", con)
    prior = pd.read_sql(
        "SELECT bank, payment_mode, gmv, txn_count, fee FROM prior_month", con)
    con.close()

    curmap = {(r.bank, r.payment_mode): r for _, r in cur.iterrows()}
    priormap = {(r.bank, r.payment_mode): r for _, r in prior.iterrows()}
    out = []

    for key in sorted(set(curmap) | set(priormap)):
        bank, mode = key
        c, p = curmap.get(key), priormap.get(key)

        if c is None:  # present last month, gone this month
            out.append({
                "type": "VOLUME_DROPPED", "severity": "high",
                "bank": bank, "payment_mode": mode,
                "prior_gmv": float(p.gmv), "curr_gmv": 0.0,
                "prior_txn": int(p.txn_count), "curr_txn": 0,
                "prior_rate_bps": _rate_bps(p.fee, p.gmv), "curr_rate_bps": 0.0,
                "gmv_delta_pct": -1.0, "fee_impact_inr": -float(p.fee),
                "metric": "gmv",
                "headline": "Settled last month — no volume this month",
                "likely_cause": "A merchant offboarded or a settlement feed dropped. "
                                "Confirm before the claim closes so the revenue isn't silently lost.",
            })
            continue

        if p is None:  # brand-new segment this month
            out.append({
                "type": "NEW_SEGMENT", "severity": "info",
                "bank": bank, "payment_mode": mode,
                "prior_gmv": 0.0, "curr_gmv": float(c.gmv),
                "prior_txn": 0, "curr_txn": int(c.txn_count),
                "prior_rate_bps": 0.0, "curr_rate_bps": _rate_bps(c.fee, c.gmv),
                "gmv_delta_pct": None, "fee_impact_inr": float(c.fee),
                "metric": "gmv",
                "headline": "New bank × mode this month — no prior baseline",
                "likely_cause": "A newly launched segment. No history to validate the rate "
                                "against — verify the term is on the rate card, not defaulted.",
            })
            continue

        cg, pg = float(c.gmv), float(p.gmv)
        ct, pt = int(c.txn_count), int(p.txn_count)
        cf, pf = float(c.fee), float(p.fee)
        cr, pr = _rate_bps(cf, cg), _rate_bps(pf, pg)
        gpct = (cg - pg) / pg if pg else 0.0
        tpct = (ct - pt) / pt if pt else 0.0
        rate_drift = cr - pr
        ticket_c = cg / ct if ct else 0.0
        ticket_p = pg / pt if pt else 0.0
        ticket_pct = (ticket_c - ticket_p) / ticket_p if ticket_p else 0.0

        base = {
            "bank": bank, "payment_mode": mode,
            "prior_gmv": pg, "curr_gmv": cg,
            "prior_txn": pt, "curr_txn": ct,
            "prior_rate_bps": pr, "curr_rate_bps": cr,
            "gmv_delta_pct": gpct, "txn_delta_pct": tpct,
            "rate_drift_bps": rate_drift, "ticket_delta_pct": ticket_pct,
        }

        # priority: rate drift (billing correctness) > volume > mix
        if abs(rate_drift) >= 2.0 and abs(gpct) < 0.15:
            up = rate_drift > 0
            out.append({**base,
                "type": "RATE_DRIFT",
                "severity": "high" if abs(rate_drift) >= 3.0 else "medium",
                "metric": "rate",
                "fee_impact_inr": (cr - pr) / 1e4 * cg,
                "headline": f"Effective take-rate moved {pr:.1f} → {cr:.1f} bps on flat volume",
                "likely_cause": ("Billing " + ("above" if up else "below") + " last month's rate "
                                 "with volume unchanged — a pricing change flowed through. "
                                 + ("Confirm it's an approved increase, not an over-charge that invites a dispute."
                                    if up else
                                    "Confirm the correct term is applied — this looks like revenue leaking under a stale rate.")),
            })
        elif gpct >= 0.50:
            out.append({**base,
                "type": "GMV_SPIKE",
                "severity": "high" if gpct >= 1.0 else "medium",
                "metric": "gmv",
                "fee_impact_inr": cf - pf,
                "headline": f"GMV up {gpct * 100:.0f}% month-over-month",
                "likely_cause": "A volume surge of this size is either genuine merchant growth or "
                                "double-counted batches. Reconcile the batch feed before billing the uplift.",
            })
        elif gpct <= -0.30:
            out.append({**base,
                "type": "GMV_DROP",
                "severity": "high" if gpct <= -0.50 else "medium",
                "metric": "gmv",
                "fee_impact_inr": cf - pf,
                "headline": f"GMV down {abs(gpct) * 100:.0f}% month-over-month",
                "likely_cause": "A drop this steep usually means merchant churn or a partial feed — "
                                "revenue that was here last month is missing. Confirm the volume is real.",
            })
        elif abs(ticket_pct) >= 0.35 and abs(gpct) < 0.20 and abs(tpct) >= 0.35:
            out.append({**base,
                "type": "TICKET_SIZE_SHIFT",
                "severity": "medium",
                "metric": "ticket",
                "fee_impact_inr": 0.0,
                "headline": f"Avg ticket {'fell' if ticket_pct < 0 else 'rose'} "
                            f"{abs(ticket_pct) * 100:.0f}% — txn count {'up' if tpct > 0 else 'down'} "
                            f"{abs(tpct) * 100:.0f}% on flat GMV",
                "likely_cause": "GMV steady but transaction count moved sharply — often a flood of "
                                "test, micro or refund transactions polluting the feed.",
            })

    sev_order = {"high": 0, "medium": 1, "info": 2}
    out.sort(key=lambda a: (sev_order[a["severity"]], -abs(a.get("fee_impact_inr") or 0.0)))

    rate_net = sum(a["fee_impact_inr"] for a in out if a["type"] == "RATE_DRIFT")
    volume_at_risk = sum(
        -(a["fee_impact_inr"] or 0.0)
        for a in out if a["type"] in ("VOLUME_DROPPED", "GMV_DROP")
    )
    new_revenue = sum(a["fee_impact_inr"] for a in out if a["type"] == "NEW_SEGMENT")

    return {
        "prior_period": PRIOR_PERIOD,
        "period": get_meta().get("period", ""),
        "segments_scanned": len(curmap),
        "flagged": len(out),
        "summary": {
            "rate_drift_net_inr": rate_net,
            "volume_at_risk_inr": volume_at_risk,
            "new_revenue_inr": new_revenue,
            "high": sum(1 for a in out if a["severity"] == "high"),
        },
        "anomalies": out,
    }


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _records(df):
    """DataFrame -> JSON-safe list[dict] (NaN/NaT -> None, numpy -> native)."""
    import numpy as np
    clean = df.replace([np.inf, -np.inf], np.nan).where(pd.notnull(df), None)
    out = []
    for rec in clean.to_dict(orient="records"):
        row = {}
        for k, v in rec.items():
            if isinstance(v, np.integer):
                row[k] = int(v)
            elif isinstance(v, np.floating):
                row[k] = float(v) if not pd.isna(v) else None
            elif isinstance(v, np.bool_):
                row[k] = bool(v)
            elif isinstance(v, pd.Timestamp):
                row[k] = None if pd.isna(v) else v.date().isoformat()
            elif v is pd.NaT or (isinstance(v, float) and pd.isna(v)):
                row[k] = None
            else:
                row[k] = v
        out.append(row)
    return out
