# Vendor Rules: PT Graha Megaria Raya (Townsquare Cilandak / CITOS)

Apply **on top of** the base invoice-to-markdown / IDP extraction rules.
Companion to `DIRECTPAY_INSTALLMENT_RENT_WORKFLOW.md` and `DIRECTPAY_FIELDS_BY_STAGE.md`.

This is the **6th** DirectPay vendor and the first one that exercises all four charge types —
Rent, Service Charge, Electricity and Water — as four separate invoices against a single contract.

## Vendor Identification

| Field | Value |
|---|---|
| Lessor / Seller (PKP) | PT GRAHA MEGARIA RAYA (manager of Townsquare Cilandak / CITOS) |
| Invoice address | CILANDAK TOWNSQUARE, JL. TB SIMATUPANG KAV.17, JAKARTA JK 12430 |
| FP address | GEDUNG CILANDAK TOWN SQUARE LT.2, JL. TB.SIMATUPANG NO.17, CILANDAK BARAT |
| Seller NPWP | 0018240572062000 *(printed on the Faktur Pajak only, never on the invoice)* |
| Leased unit | Unit No. 157, First Floor, Townsquare Cilandak — unit code `TSC-UNT-01-000-157` |
| Buyer | PT. BUMI BERKAH BOGA, KOPI KENANGAN |
| Buyer NPWP | 0828773762029000 |
| Bank | Maybank 2003072602 — PT. Graha Megaria Raya |
| FP signatory | RANDOLPH SASTRAYUDHA BUBU (electronically signed) |

Apply when the invoice header identifies the seller as "PT GRAHA MEGARIA RAYA", or the unit number
is `TSC-UNT-01-000-157`.

## Document Set Structure (critical)

The source arrived as **one 6-page PDF** holding four invoices and two supporting documents, plus
four separate Faktur Pajak files. Page order interleaves each utility invoice with its own
calculation sheet:

| Page | Document | Fixture |
|---|---|---|
| 1 | Invoice `INV/2026/04063` — Rental Tenant | `invoice_1.pdf` |
| 2 | Invoice `INV/2026/04062` — Service Charge Tenant | `invoice_2.pdf` |
| 3 | Invoice `INV/2026/03848` — Utility PAM (water) | `invoice_3.pdf` |
| 4 | **Calculation Water Consumption** sheet | `supporting_doc_inv3.pdf` |
| 5 | Invoice `INV/2026/03847` — Utility PLN (electricity) | `invoice_4.pdf` |
| 6 | **Calculation Electricity Consumption** sheet | `supporting_doc_inv4.pdf` |

Split with `pdfseparate` (poppler); the unsplit original is kept as
`dp_contracts_invoices_sd/GRAHA_MEGARIA/GRAHA_MEGARIA_INV_1_ALL_6_PAGES.pdf`.

### Two supported upload routes

Both work, and both end at the same four runs:

**A. One file per invoice** (the standard route every vendor uses) — upload
`GRAHA_MEGARIA_INV_1.pdf` … `INV_4.pdf`, optionally with their FP files. One run per upload.

**B. The combined file, exactly as the vendor sends it** — upload the single 6-page
`GRAHA_MEGARIA_INV_1_ALL_6_PAGES.pdf` plus the 4 separate FP files. The combined file **fans out
into 4 runs**, one per invoice, and each FP attaches to its own. 5 files in, 4 independent
processing runs out.

Route B is declared in `documents.json` under `combined_uploads` (see
`fixtures.DpCombinedUpload`), so it is fixture data, not vendor-specific code:

```json
"combined_uploads": [{
  "label": "Invoices 1-4 + both supporting documents (one 6-page PDF, as the vendor sends it)",
  "match": ["inv_1_all_6_pages", "inv_all_6_pages", "all_6_pages",
            "inv_all", "inv_combined", "inv_bundle", "inv_1_to_4"],
  "documents": ["invoice_1", "invoice_2", "invoice_3", "invoice_4"]
}]
```

Accepted filenames for the combined upload (any vendor-prefixed name containing one of the aliases):
`GRAHA_MEGARIA_INV_1_ALL_6_PAGES.pdf` · `GRAHA_MEGARIA_INV_ALL.pdf` ·
`GRAHA_MEGARIA_INV_COMBINED.pdf` · `GRAHA_MEGARIA_INV_BUNDLE.pdf` · `GRAHA_MEGARIA_INV_1_TO_4.pdf`

Every combined alias is deliberately **longer** than the single-document alias it overlaps, so
`GRAHA_MEGARIA_INV_1.pdf` still means invoice_1 alone while
`GRAHA_MEGARIA_INV_1_ALL_6_PAGES.pdf` means all four. Order does not matter: uploading the FP files
first creates the runs and the combined file then reuses them; uploading the combined file first
creates them and the FPs attach. Either way, four runs.

Each run's PDF viewer shows **its own page** from the split set, not the 6-page file, so a reviewer
opening the water invoice sees just the water invoice. The supporting-document link on runs 3 and 4
still opens the matching calculation sheet.

### Invoice ↔ Faktur Pajak pairing — stated, not inferred

**The FP numbering is crossed, but this vendor requires no detective work:** every FP prints its
counterpart invoice number on its own face as `(Referensi: INV/2026/…)`. Each pairing below is
confirmed twice — by that reference line and by the FP's own Harga Jual.

| Invoice | Charge | FP file | FP serial | Harga Jual |
|---|---|---|---|---:|
| `INV/2026/04063` | Rental | `invoice_fp_3.pdf` | 04002600245765594 | 9,807,840.00 |
| `INV/2026/04062` | Service Charge | `invoice_fp_2.pdf` | 04002600245767204 | 3,405,500.00 |
| `INV/2026/03848` | Utility PAM | `invoice_fp_5.pdf` | 04002600244864984 | 320,390.00 |
| `INV/2026/03847` | Utility PLN | `invoice_fp_4.pdf` | 04002600244844464 | 2,407,870.14 |

Never pair by filename order: FP_2 belongs to the *second* invoice, FP_3 to the *first*, FP_4 to
the *fourth*, FP_5 to the *third*.

## PPN Treatment — no exemption for this vendor

Unlike Karya Nastari and Pakuwon, Graha Megaria charges **real 11% PPN on every charge, including
water and electricity**. There is no "PPN DIBEBASKAN" stamp anywhere in the set.

| Charge | PPN on FP | PPN payable | Exemption stamp |
|---|---|---|---|
| Rental | Yes | **Yes** | No |
| Service Charge | Yes | **Yes** | No |
| Utility PAM (water) | Yes | **Yes** | No |
| Utility PLN (electricity) | Yes | **Yes** | No |

Do **not** apply the PP 49/2022 water/electricity exemption to this vendor by analogy. The mall
here is reselling metered supply as a taxable service rather than delivering exempt utility goods,
and the documents charge PPN accordingly. If a future Graha Megaria invoice *does* carry an
exemption stamp, treat it as a deviation and flag it rather than silently accepting it.

Each FP computes `Dasar Pengenaan Pajak = 11/12 x Harga Jual` and then `PPN = 12% x DPP`, i.e. the
Indonesian effective-rate mechanism that yields 11%. Verified: `3,405,500 x 11/12 = 3,121,708`, and
`12% x 3,121,708 = 374,605` — the figure the invoice itself prints.

### Expect sub-rupiah FP rounding differences

The FP rounds to whole rupiah while the invoice prints cents, so three of the four pairs differ by
less than Rp 0.50. **These are real differences between two real documents and are left visible**
rather than reconciled in the fixtures:

| Invoice | DPP delta | PPN delta |
|---|---:|---:|
| Rental | 0.00 | **-0.40** |
| Service Charge | 0.00 | 0.00 |
| Utility PAM | 0.00 | **+0.10** |
| Utility PLN | **-0.14** | **+0.28** |

`taxable_amount` and `vat_amount` are not in `_FP_REQUIRED_FIELDS`, so these flag as mismatches on
the Faktur Pajak stage but do not block Approve & Continue. `vendor_name` and `customer_name` *are*
required and always mismatch for this vendor (`GRAHA MEGARIA RAYA` vs `PT GRAHA MEGARIA RAYA`;
`BUMI BERKAH BOGA` vs `PT. BUMI BERKAH BOGA, KOPI KENANGAN`) — both are shortened variants of the
same entity and are acknowledged, exactly as for PALLADIUM.

## Amount-Matching Logic (Total Amount Before VAT)

Two different reference sources apply, decided by charge type.

### Rent and Service Charge → the contract's payment schedule

Both are billed for **August 2026** and both invoices print
`Period From : 01-Aug-2026 to 31-Aug-2026`, which is captured as
`billing_period_start` / `billing_period_end`.

| Invoice | Invoice amount | Schedule row | Schedule amount | Result |
|---|---:|---|---:|---|
| Rental | 9,807,840.00 | `Monthly Installment 23 of 36` (due 2026-08-01) | 9,807,840.00 | **exact match, satisfied** |
| Service Charge | 3,405,500.00 | `Service Charge — Month 23 of 36` (due 2026-08-01) | 3,210,900.00 | **+6.06%, exceeds the 5% tolerance → blocks** |

**The Service Charge variance is genuine and explainable, and is deliberately left unreconciled.**
The contract sets the Service Charge at Rp165,000/m²/month; the invoice bills
Rp3,405,500 ÷ 19.46 m² = **Rp175,000/m²/month** exactly. That is a Rp10,000/m² rate increase, which
Section 3b of the contract expressly permits ("may be revised annually at Management's
discretion") but which no document in this set evidences. So it correctly fails Matching, cannot be
acknowledged away (`total_amount_before_vat` is in `_ALWAYS_BLOCKING_FIELDS` / `NO_ACK_FIELDS`), and
activates the **Escalate** button. This is the intended demo path for a real, defensible dispute.

Both figures reconcile at the schedule level: rent 9,807,840 = 80% of the contract's
Rp12,259,800/month base rent (the other 20% having been taken as the Down Payment), and the rent
schedule's own TOTAL of Rp441,352,800 equals the contract's Total Contract Value to the rupiah.

### Electricity and Water → the supporting document

The contract states **no Rp consumption rate at all** for utilities ("billing basis for consumption
is not detailed in this offer letter"), so there is no schedule counterpart and none is invented.
Each utility invoice is matched against its own calculation sheet instead:

| Invoice | Calculation sheet | Result |
|---|---|---|
| Utility PAM | Meter `WTR00187`, 1,579.0 → 1,593.0 = **14.0 m³** x Rp21,500 = 301,000, + Abodemen 19,390 = **320,390.00** | **exact match** |
| Utility PLN | Meter `ELC00304`, 82,973.0 → 84,299.0 = **1,326.0 kWh** x Rp1,763 = 2,337,738, + PPJ/RPJU 3% 70,132.14 = **2,407,870.14** | **exact match** |

Both sheets reproduce the invoice figure to the cent, so both rows are satisfied. On Matching the
contract-side value carries the neutral "Supporting Doc" source note (a hyperlink to the sheet), and
the **"Matched against" installment picker is disabled** with an `N/A` chip, because a metered charge
has no payment-schedule row (`_NO_SCHEDULE_CHARGE_TYPES`).

**Precedence, same as every other vendor:** contract/schedule value → independent supporting
document → otherwise FAILED / NOT VALIDATED for manual review. A Faktur Pajak is never a substitute
(see the correction note in `DIRECTPAY_VENDOR_RULES_KARYA_NASTARI.md`).

## Bill Posting — four charge types, four G/L accounts

This is the vendor that made **charge-type-keyed ERP defaults** necessary. Its four invoices each
carry exactly one line item, so under the old purely positional pairing all four read
`bill_posting.json`'s `line_items[0]` and would have posted to the same account. See §6d of
`DIRECTPAY_INSTALLMENT_RENT_WORKFLOW.md`.

| charge_type | G/L account | VAT code | WHT code |
|---|---|---|---|
| `rental_fee` | `6100-RENT` | `IB` | *(none)* |
| `service_fee` | `6200-SVC` | `IB` | *(none)* |
| `utility_electricity` | `6300-ELEC` | `IB` | *(none)* |
| `utility_water` | `6310-WATER` | `IB` | *(none)* |

`vat_applicable` = true (all four charges carry real 11% VAT). `wht_applicable` = **false** — the
contract records WHT as "Not stated", so the WHT column preselects `00 · NO WITHHOLDING`. All four
Simulate documents balance (Debit = Credit), verified against the live API.

## Common extraction pitfalls

- **Dates are US-format `MM/DD/YYYY` on the invoice face** (`07/01/2026`, `06/30/2026`), not the
  Indonesian `DD/MM/YYYY` a reader might assume. The reading is confirmed by the Faktur Pajak, which
  dates the rental/service-charge pair `01 Juli 2026` and both utilities `30 Juni 2026`. Fixtures
  store ISO to keep this unambiguous.
- **The two utility invoices print no billing period** — only a Unit Number, with the billed month
  buried in the description ("Utility PAM: June 2026"). `billing_period_start`/`end` are therefore
  `NA` for them, and populated only for the rent/service-charge pair.
- **The invoice never prints the vendor's own NPWP** — only the buyer's. The seller NPWP
  0018240572062000 exists solely on the Faktur Pajak and is not back-filled into `vendor_vat_id`.
- **The billed period leads the invoice date.** Both August 2026 invoices are dated 1 July 2026 and
  fall due 24 July 2026 — i.e. billed a month in advance, which is what the contract's "monthly in
  advance" Service Charge term describes. Not an extraction error.
- **The utility invoices bill June 2026 while the rent bills August 2026.** The four invoices in one
  PDF are *not* all for the same period; utilities are billed in arrears on actual meter readings,
  rent and service charge in advance.
- Each calculation sheet prints its own `PPN` and a `Stamp Duty Rp 0.00` line. The stamp duty is
  genuinely zero here, so there is no `stamp_duty` line item for this vendor (contrast PAKUWON,
  whose Rp10,000 duty produces the recurring Simulate delta).
- The contract source is internally inconsistent on the floor: Section 1(a) says "Second Floor"
  (Lantai Dua) while Section 1(c) and the tenant floor plan both say "First Floor". The floor plan
  is treated as authoritative and the conflict is recorded in `premises_address` and its
  `ai_match_reasoning` rather than silently resolved.

## Known deviation from the reference CSV

`GrahaMegaria_inv_extraction_data.csv` records `customer_vat_id` as `—` for all four invoices, but
**every invoice page does print `NPWP: 0828 7737 6202 9000` in the customer block**. The fixtures
follow the CSV (it is the designated extraction reference), so `customer_vat_id` is `"NA"`. Flagged
here rather than silently corrected — if the CSV is the authority this is fine; if the extractor is
expected to catch it, the CSV understates what the document contains.
