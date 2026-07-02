"""Commission-claim compute engine (reference implementation).

Automates the manual AR loop:
  pull volume (Looker/Querybook export)  ->  look up commercials (Excel)  ->  compute & sum the claim

Reads:  data/volume_2026_05.csv, data/commercials.xlsx
Writes: out/line_detail.csv, out/claim_summary.csv, out/exceptions.csv
Prints: a console summary.

This encodes the *hard parts* precisely so the app build doesn't have to guess:
term resolution (effective dates + versions + scope), four rate bases incl.
progressive tiered slabs, additive rebates, and five exception types with rupee impact.
"""
import os
import pandas as pd

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

PERIOD = "2026-05"
PERIOD_START = pd.Timestamp("2026-05-01")
CR = 1e7  # rupees per crore


def load():
    vol = pd.read_csv(os.path.join(DATA, "volume_2026_05.csv"))
    xls = pd.read_excel(os.path.join(DATA, "commercials.xlsx"), sheet_name=None)
    rc = xls["rate_cards"].copy()
    tiers = xls["tiers"].copy()
    rebates = xls["rebates"].copy()
    for df in (rc, rebates):
        for c in ("effective_from", "effective_to"):
            df[c] = pd.to_datetime(df[c], errors="coerce")
    return vol, rc, tiers, rebates


def covers(row, period_start):
    ef, et = row["effective_from"], row["effective_to"]
    if pd.isna(ef) or ef > period_start:
        return False
    if pd.isna(et):
        return True
    return et >= period_start


def resolve_term(bank, mode, merchant_id, rc, period_start):
    """Return (chosen_row, all_matching_rows). chosen may be None if nothing valid."""
    m = rc[(rc.bank == bank) & (rc.payment_mode == mode)]
    if m.empty:
        return None, m
    # scope precedence: specific merchant beats ALL
    specific = m[m.merchant_scope == merchant_id]
    pool = specific if not specific.empty else m[m.merchant_scope == "ALL"]
    valid = pool[pool.apply(lambda r: covers(r, period_start), axis=1)]
    if valid.empty:
        return None, pool
    chosen = valid.sort_values(["version", "effective_from"]).iloc[-1]
    return chosen, pool


def compute(vol, rc, tiers, rebates):
    """Run the full claim computation. Logic is byte-identical to the original
    main() body; only the I/O (load / CSV write / console print) lives outside.
    Returns a dict of DataFrames + ingest stats so callers (CLI, API) can reuse it.
    """
    exceptions = []

    # ---- dedup exact duplicate batches ----
    dup_mask = vol.duplicated(subset=["batch_id"], keep="first")
    dups = vol[dup_mask]
    vol_clean = vol[~dup_mask].copy()

    # ---- memoize term resolution + overlap detection (result-preserving) ----
    # resolve_term/covers are O(rows x terms) when called per row; cache by the
    # only keys that affect the outcome so big volume files compute in well under
    # a second instead of many seconds.
    _rt_cache = {}
    _va_cache = {}

    def _resolve(bank, mode, mid):
        k = (bank, mode, mid)
        if k not in _rt_cache:
            _rt_cache[k] = resolve_term(bank, mode, mid, rc, PERIOD_START)
        return _rt_cache[k]

    def _valid_active(bank, mode):
        k = (bank, mode)
        if k not in _va_cache:
            pool = rc[(rc.bank == bank) & (rc.payment_mode == mode)]
            _va_cache[k] = pool[(pool.status == "ACTIVE") &
                                pool.apply(lambda r: covers(r, PERIOD_START), axis=1)]
        return _va_cache[k]

    rows = []
    for _, v in vol_clean.iterrows():
        chosen, pool = _resolve(v.bank, v.payment_mode, v.merchant_id)
        rec = {
            "batch_id": v.batch_id, "settlement_month": v.settlement_month,
            "merchant_id": v.merchant_id, "merchant_name": v.merchant_name,
            "bank": v.bank, "payment_mode": v.payment_mode,
            "gmv": v.gmv, "txn_count": v.txn_count,
            "term_id": None, "basis": None, "rate": None,
            "base_commission": 0.0, "rebate_commission": 0.0, "total_commission": 0.0,
            "billable": False, "flag": "",
        }
        if chosen is None:
            if pool is not None and len(pool) and (pool["status"] == "EXPIRED").any():
                rec["flag"] = "EXPIRED_TERM"
            else:
                rec["flag"] = "NO_TERM"
            rows.append(rec)
            continue

        rec["term_id"] = chosen.term_id
        rec["basis"] = chosen.basis
        rec["billable"] = True

        if chosen.basis == "PCT_GMV":
            rec["rate"] = chosen.rate_pct
            rec["base_commission"] = v.gmv * chosen.rate_pct / 100.0
        elif chosen.basis == "PER_TXN":
            rec["rate"] = chosen.fee_per_txn
            rec["base_commission"] = v.txn_count * chosen.fee_per_txn
        elif chosen.basis == "TIERED_GMV":
            rec["rate"] = "tiered"  # filled at aggregate stage
        # overlap detection: >1 ACTIVE term valid for this period in the pool
        valid_active = _valid_active(v.bank, v.payment_mode)
        if len(valid_active) > 1:
            rec["flag"] = "OVERLAPPING_TERMS"
        rows.append(rec)

    detail = pd.DataFrame(rows)

    # ---- tiered (progressive slabs) at bank+mode level, attributed pro-rata ----
    def tier_commission(total_gmv, term_id):
        ts = tiers[tiers.term_id == term_id].sort_values("tier_no")
        comm, remaining, prev = 0.0, total_gmv, 0
        for _, t in ts.iterrows():
            hi = t.max_gmv if pd.notna(t.max_gmv) and t.max_gmv != "" else float("inf")
            slab = max(0.0, min(remaining, float(hi) - float(t.min_gmv)))
            comm += slab * t.rate_pct / 100.0
            remaining -= slab
            if remaining <= 0:
                break
        return comm

    for term_id in detail.loc[detail.basis == "TIERED_GMV", "term_id"].unique():
        grp = detail[(detail.term_id == term_id) & detail.billable]
        tot = grp.gmv.sum()
        tot_comm = tier_commission(tot, term_id)
        for idx in grp.index:
            share = detail.at[idx, "gmv"] / tot if tot else 0
            detail.at[idx, "base_commission"] = tot_comm * share
        eff = (tot_comm / tot * 100) if tot else 0
        exceptions.append({
            "type": "TIER_APPLIED", "severity": "info", "bank": grp.bank.iloc[0],
            "payment_mode": grp.payment_mode.iloc[0], "term_id": term_id,
            "detail": f"Progressive slabs on Rs {tot/CR:,.1f} Cr GMV; blended rate {eff:.3f}%",
            "impact_inr": 0.0,
        })

    # ---- rebates (additive) ----
    for _, rb in rebates.iterrows():
        if not covers(rb, PERIOD_START):
            continue
        mask = (detail.bank == rb.bank) & (detail.payment_mode == rb.payment_mode) & detail.billable
        if rb.merchant_scope != "ALL":
            mask &= (detail.merchant_id == rb.merchant_scope)
        detail.loc[mask, "rebate_commission"] += detail.loc[mask, "gmv"] * rb.rebate_pct / 100.0

    detail["total_commission"] = detail["base_commission"] + detail["rebate_commission"]

    # ================= exceptions with rupee impact =================
    # OVERLAPPING: under-claim avoided vs the stale lower version
    ov = detail[detail.flag == "OVERLAPPING_TERMS"]
    for (bank, mode), g in ov.groupby(["bank", "payment_mode"]):
        pool = rc[(rc.bank == bank) & (rc.payment_mode == mode) &
                  rc.apply(lambda r: covers(r, PERIOD_START), axis=1)]
        if len(pool) >= 2:
            hi = pool.sort_values(["version", "effective_from"]).iloc[-1]
            lo = pool.sort_values(["version", "effective_from"]).iloc[0]
            if hi.basis == "PCT_GMV" and lo.basis == "PCT_GMV":
                impact = g.gmv.sum() * (hi.rate_pct - lo.rate_pct) / 100.0
                exceptions.append({
                    "type": "OVERLAPPING_TERMS", "severity": "high", "bank": bank,
                    "payment_mode": mode, "term_id": f"{lo.term_id}|{hi.term_id}",
                    "detail": (f"Two active terms ({lo.rate_pct}% v{lo.version} and {hi.rate_pct}% "
                               f"v{hi.version}). Billed at {hi.rate_pct}%; using stale rate would under-claim."),
                    "impact_inr": impact,
                })

    # NO_TERM: un-billable volume; estimate at peer rate for the mode
    nt = detail[detail.flag == "NO_TERM"]
    for (bank, mode), g in nt.groupby(["bank", "payment_mode"]):
        peer_txn = rc[(rc.payment_mode == mode) & (rc.basis == "PER_TXN")]["fee_per_txn"]
        peer_pct = rc[(rc.payment_mode == mode) & (rc.basis == "PCT_GMV")]["rate_pct"]
        if len(peer_txn):
            est = g.txn_count.sum() * peer_txn.mean()
        elif len(peer_pct):
            est = g.gmv.sum() * peer_pct.mean() / 100.0
        else:
            est = 0.0
        exceptions.append({
            "type": "NO_TERM", "severity": "high", "bank": bank, "payment_mode": mode,
            "term_id": "", "detail": (f"No commercial term for {bank} {mode}. "
                                       f"{g.gmv.sum()/CR:,.1f} Cr GMV cannot be billed until a rate is added."),
            "impact_inr": est,
        })

    # EXPIRED_TERM: would-be value, at risk pending renewal
    et = detail[detail.flag == "EXPIRED_TERM"]
    for (bank, mode), g in et.groupby(["bank", "payment_mode"]):
        exp = rc[(rc.bank == bank) & (rc.payment_mode == mode) & (rc.status == "EXPIRED")]
        rate = exp.rate_pct.iloc[0] if len(exp) and pd.notna(exp.rate_pct.iloc[0]) else 0
        impact = g.gmv.sum() * rate / 100.0
        exceptions.append({
            "type": "EXPIRED_TERM", "severity": "high", "bank": bank, "payment_mode": mode,
            "term_id": exp.term_id.iloc[0] if len(exp) else "", "detail":
            (f"Term expired {exp.effective_to.iloc[0].date() if len(exp) else '?'} but volume continues. "
             f"~Rs {impact/1e5:,.1f} L at risk until renewed; excluded from firm claim."),
            "impact_inr": impact,
        })

    # DUPLICATE_BATCH: over-claim avoided
    for _, d in dups.iterrows():
        chosen, _ = resolve_term(d.bank, d.payment_mode, d.merchant_id, rc, PERIOD_START)
        avoided = 0.0
        if chosen is not None:
            if chosen.basis == "PCT_GMV":
                avoided = d.gmv * chosen.rate_pct / 100.0
            elif chosen.basis == "PER_TXN":
                avoided = d.txn_count * chosen.fee_per_txn
        exceptions.append({
            "type": "DUPLICATE_BATCH", "severity": "medium", "bank": d.bank,
            "payment_mode": d.payment_mode, "term_id": d.batch_id,
            "detail": f"Batch {d.batch_id} appears twice in the export; deduped before billing.",
            "impact_inr": avoided,
        })

    exc = pd.DataFrame(exceptions)

    # ================= summaries =================
    billed = detail[detail.billable]
    by_bank = billed.groupby("bank")["total_commission"].sum().reset_index()
    by_bank_mode = (billed.groupby(["bank", "payment_mode"])
                    .agg(gmv=("gmv", "sum"), txn_count=("txn_count", "sum"),
                         commission=("total_commission", "sum")).reset_index())
    grand = billed.total_commission.sum()

    return {
        "detail": detail,
        "exceptions": exc,
        "by_bank": by_bank,
        "by_bank_mode": by_bank_mode,
        "grand_total": grand,
        "rows_ingested": len(vol),
        "duplicates_dropped": len(dups),
        "billable_lines": len(billed),
    }


def main():
    vol, rc, tiers, rebates = load()
    res = compute(vol, rc, tiers, rebates)
    detail, exc = res["detail"], res["exceptions"]
    by_bank, by_bank_mode = res["by_bank"], res["by_bank_mode"]
    grand = res["grand_total"]
    billed = detail[detail.billable]
    dups_n = res["duplicates_dropped"]

    detail.to_csv(os.path.join(OUT, "line_detail.csv"), index=False)
    by_bank_mode.to_csv(os.path.join(OUT, "claim_summary.csv"), index=False)
    exc.to_csv(os.path.join(OUT, "exceptions.csv"), index=False)

    # ================= console =================
    print("=" * 64)
    print(f"COMMISSION CLAIM  |  settlement month {PERIOD}")
    print("=" * 64)
    print(f"Volume rows ingested : {len(vol):>6}  ({dups_n} duplicate dropped)")
    print(f"Billable lines       : {len(billed):>6}")
    print(f"Firm claim total     : Rs {grand/CR:>8,.2f} Cr")
    print("-" * 64)
    print("Claim by bank:")
    for _, r in by_bank.sort_values("total_commission", ascending=False).iterrows():
        print(f"   {r.bank:<9} Rs {r.total_commission/CR:>7,.2f} Cr")
    print("-" * 64)
    print(f"Exceptions: {len(exc)}  (high severity: {(exc.severity=='high').sum() if len(exc) else 0})")
    if len(exc):
        for _, e in exc.sort_values("impact_inr", ascending=False).iterrows():
            amt = f"Rs {e.impact_inr/1e5:,.1f} L" if e.impact_inr else "-"
            print(f"   [{e.severity:^6}] {e.type:<18} {e.bank:<8} {e.payment_mode:<12} {amt:>12}")
    print("=" * 64)


if __name__ == "__main__":
    main()
