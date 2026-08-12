# RCA — Zoho bill posting fails with error 71510

**Date:** 2026-08-04 · **Severity:** demo-blocking, no data loss · **Status:** fixed & verified
**Files:** `backend/src/services/zoho_bill.py`, `backend/src/config.py`, `backend/.env`

## What happened

All foreign-currency bill postings began failing with an HTTP 400:

```
'code': 71510, 'message': 'Tax Exemption should not be applied for unregistered vendors transactions.'
```

No code, fixture or credential changed. The app had been posting into the **wrong Zoho
organisation** since 2026-07-28, and a tax-exemption record created in that org on 08-04 turned a
silently-degraded state into a hard failure.

## Root cause — the app posted into the wrong org

`_get_org_id()` never had a configured target. It took **whichever org Zoho returned first**:

```python
body = await client.get("/organizations")
return str(orgs[0]["organization_id"])      # ← index 0 of an unordered list
```

The refresh token can see **four** orgs. Two of them — `NANOLUMI PTE LTD` (`60080440613`) and
`PT. BUMI BERKAH BOGA` — were created on **2026-07-28**, and from that day `orgs[0]` resolved to
NANOLUMI instead of the intended `Neoflo Tech PTE LTD` (`60058705480`). Nothing in `.env` or the code
changed; adding orgs to the Zoho account was enough to redirect every posting.

The two orgs are configured completely differently:

| | Neoflo Tech (intended) | NANOLUMI (actual) |
|---|---|---|
| `NIKE SALES (MALAYSIA) (USD)` | `ccy=USD`, `gst_treatment=overseas`, created 2026-06-01 | `ccy=INR`, unregistered, created 2026-07-28 |
| Other 6 fixture vendors | configured with correct currency + `business_gst` | absent |
| Bill history | 200+ bills back to 2026-01-06 | starts 2026-07-28 18:00 |

In NANOLUMI none of the fixture vendors existed, so `_get_or_create_vendor()` created bare contacts
— no `gst_treatment` (⇒ unregistered) and INR, because contact creation was sending `currency_code`,
which Zoho ignores in favour of `currency_id`. Consequences, all invisible at the time:

- bills booked in **INR instead of USD**, with no FX conversion;
- every line posted to a fallback account (**Purchase Discounts**);
- 7 junk vendor contacts created in NANOLUMI, one per fixture, each 0–1 s before its first bill.

Those bills still *succeeded* only because NANOLUMI had no tax-exemption records. On 08-04 between
14:35 and 20:48 IST a record appeared (`tax_exemption_code: "ABC"`, blank name). The exemption
selector has a blank-name-matches-nothing keyword filter with a `next(..., exemptions[0])` fallback,
so it applied that record to all 38 lines — and Zoho rejects any tax field on an **unregistered**
vendor's bill → 71510.

## Evidence

- 4 orgs visible to the token; `orgs[0]` = NANOLUMI, created **2026-07-28** — the same day the app's
  first bill landed there (18:00:42) and the oldest bill in that org.
- The 7 NANOLUMI vendors were app-created: each contact's `created_time` is 0–1 s before its first
  bill. The same 7 names exist in Neoflo Tech, created Feb–Jun, properly configured.
- Probes in NANOLUMI: **with** the exemption → `71510`; **without** tax fields → `201 Created`.
- A positive control on a registered vendor was accepted and echoed `tax_exemption_code` back,
  proving the 8 bills posted Jul 28 → Aug 4 14:35 (all `tax_exemption_id: ''`) carried no exemption
  — so the `ABC` record did not exist then. 0 of 97 NANOLUMI bills ever carried one.
- **Zoho did not tighten validation** — the same exemption is still accepted on a registered vendor.
- **Not credentials** — `.env` untouched since Jul 13; token scope `ZohoBooks.fullaccess.all`.
- Contact-creation probes: `currency_code` is ignored (→ INR); `currency_id` works; `gst_treatment`
  is settable at creation.
- All probe bills and contacts created during the investigation were deleted.

## Fix

**1. Pin the organisation (the actual fix).** `ZOHO_ORGANIZATION_ID` is now a setting, used by
`_get_org_id()`; the unpinned path still works for single-org accounts but logs a warning when the
token can see several. `backend/.env` sets it to `60058705480` (Neoflo Tech PTE LTD).

**2. Correct vendor creation.** `_get_or_create_vendor()` now resolves `currency_id` (via
`_get_currency_id()`) instead of sending the ignored `currency_code`, and sets
`gst_treatment: "overseas"` when the bill currency differs from the org's base currency
(`_get_org_base_currency()`). Vendors it creates are therefore no longer stuck on the base currency
and unregistered. Currency remains only a proxy for the supplier's country, so a foreign supplier
invoicing in the base currency still needs its treatment set by hand.

**3. Gate tax fields on vendor GST registration** (`get_vendor_tax_profile()` +
`_REGISTERED_GST_TREATMENTS`, committed earlier as "tax exemption fix"). This was **not required** to
resolve the incident — in the correct org the original payload is accepted, because that vendor is
`overseas`, i.e. registered. It is retained as defence in depth: it prevents 71510 if postings ever
reach an org where the vendor is unregistered. Verified not to regress the previously-working case.

## Verified

Full STP cascade with the org pinned; both vendors **resolved, not created**:

| Bill | Zoho id | Vendor | Currency | Total | Lines |
|---|---|---|---|---|---|
| `BILL-20260804164337` | `3225354000001122002` | NIKE SALES (MALAYSIA) (USD) | **USD** | 155,089.80 | 38 |
| `BILL-20260804165928` | `3225354000001117004` | CATERSPOT SINGAPORE PTE LTD | **SGD** | 288.85 | 3 |

Vendor creation tested directly against the API (test contacts deleted afterwards):

- existing vendor resolves to `3225354000000705017`, no contact created;
- new USD and SGD vendors → correct currency + `gst_treatment: overseas`;
- new base-currency (INR) vendor → INR, `business_none`, i.e. no bogus overseas flag.

## Still open

- **Line items post to "Purchase Discounts"** in both orgs: Neoflo Tech has 78 accounts, **0 with an
  `account_code`**, and no *Cost of Goods – Apparel*, so `_resolve_account_id()` misses on both code
  and name and falls through to the default. Fix requires populating account codes in Zoho (or
  mapping by name).
- **7 junk vendor contacts + 9 INR bills** remain in NANOLUMI from the period of misdirected posting.
- **The deployed app server needs `ZOHO_ORGANIZATION_ID=60058705480`** in its own `.env` — that file
  is not in version control, so until it is set, production keeps posting into NANOLUMI.
- **The exemption keyword filter reads `tax_exemption_name`**; the API field is `exemption_name`, so
  the preference logic never matches and the arbitrary-first-exemption fallback always wins.
- **Vendor name comes from live, user-editable extraction data**, and the lookup is an exact match —
  editing a vendor name in the UI will create a new contact rather than resolve the existing one.
