# Vendor Rules: Debora Debby Wage (Kopi Kenangan DOCO Kemang Timur)

Apply **on top of** the base invoice-to-markdown / IDP extraction rules.
Companion to `DIRECTPAY_INSTALLMENT_RENT_WORKFLOW.md` and `DIRECTPAY_FIELDS_BY_STAGE.md`.

This is the **7th** DirectPay vendor and the first that is **not a lease at all**. It is a
Revenue-Share Cooperation Agreement (Perjanjian Kerja Sama) with an individual property owner, so
there is no fixed rent, no installment schedule in the usual sense, and no Faktur Pajak.

## Vendor Identification

| Field | Value |
|---|---|
| Lessor / "the PARTNER" (MITRA) | **Debora Debby Wage** — an individual, not a company |
| NPWP | Not stated; the tracker records NIK 3276024502830010 instead (non-PKP) |
| Phone / Email | 0811-9222-588 · deborawage.perindo@gmail.com |
| Property | Kopi Kenangan DOCO Kemang Timur, Jl. Kemang Bangka I, Pejaten Barat, South Jakarta |
| Tenant | PT Bumi Berkah Boga ("BBB"), per POA No. 002/LEG/BBB/INT/I/2026 |
| Bank | MANDIRI 1270000055283 — DEBORA DEBBY WAGE |
| Agreement | No. 009/LEG/BBB/EXT/III/2026, term 12-Mar-2026 to 11-Mar-2031 |

Apply when the invoice is issued in the personal name "Debora Debby Wage", or the store is
DOCO / Kemang Timur (store code `DOCOKK.JKT.KMGTMR`).

**No Faktur Pajak exists for either invoice** and none is expected — an individual, non-PKP vendor.
The Faktur Pajak stage is skipped entirely, exactly as for RATNA_INTAN.

## Document Set Structure

Four PDFs, and the two invoices are **completely unrelated to each other**:

| Fixture | Source | Role |
|---|---|---|
| `contract.pdf` | `DEBORA_KEMANG_CONTRACT.pdf` | 19-page Cooperation Agreement (a pure scan, no text layer) |
| `invoice_1.pdf` | `DEBORA_KEMANG_INV_1.pdf` | **Revenue Sharing** invoice, April — `Invoice - 1`, Rp 21,759,425 |
| `supporting_doc_inv1.pdf` | `DEBORA_KEMANG_INV_REV_3.pdf` | 3-page **sales report** backing invoice 1 |
| `invoice_2.pdf` | `DEBORA_KEMANG_INV_2.pdf` | **Listrik + IPL** invoice, April — `Invoice - 2`, Rp 16,666,666 gross |

The sales report has three pages, each feeding the next: a Revenue Sharing summary (page 1), the
**SALES** table that computes Net Sales (page 2), and a Biaya Ojol breakdown by platform (page 3).

> On page 3 the per-platform columns (Gojek / Grab / ShopeeFood) are the **sales** taken through each
> channel, not the fees — they sum to far more than the `BIAYA OJOL` column beside them. Only page 2's
> `BIAYA OJOL` figure feeds the Net Sales calculation. Don't add up the platform columns.

## The revenue-share calculation (this vendor's whole point)

**Rent due = Revenue Share % x Net Sales.** Neither input comes from the invoice:

| Input | Comes from | April value |
|---|---|---|
| Revenue Share % | the **contract derived fields** (schedule row's `revenue_share_pct`) | **15%** |
| Net Sales | the **supporting document** (sales report, page 2) | **145,062,833** |
| ⇒ Rent due | computed | **21,759,424.95** |
| Invoice amount | invoice 1 | **21,759,425.00** |

**Net Sales is not the gross sales figure.** It is the report's own subtraction:

```
Sales (Ex. PB1)   174,071,117
- Biaya Ojol        1,493,415
- Discount         27,514,868
= Net Sales       145,062,833
```

Matching this against the raw `Sales (Ex. PB1)` figure would overstate the rent by ~20%.

*As implemented:* `service._revenue_share_reference()` computes it live from the two inputs, so the
row's `expected_source` is **`revenue_share`** rather than `contract` or `supporting_document`, and
the Matching page renders the value in the derived treatment (sparkle + italic) with a hover ⓘ
spelling out the derivation and linking to both the sales report and the contract schedule. Because
it is computed rather than stored, editing the % at Contract Extraction Postprocessing moves the
reference immediately.

> The arithmetic lands 5 sen apart (15% x 145,062,833 = 21,759,424.95 vs the invoice's 21,759,425)
> and the report's own April Net Sales is 1 rupiah below its stated components
> (174,071,117 − 1,493,415 − 27,514,868 = 145,062,834). Both are rounding in the **source
> documents** and are left exactly as they are. The 5-sen gap sits far inside the tolerance, so the
> row is satisfied.

## The two schedules

`payment_schedule.json` carries **120 rows** — two parallel monthly schedules over the 5-year term,
which is why `_schedule_row_category()` gained two groups so the picker can tell them apart:

| Rows | Description form | Picker group | Amount |
|---|---|---|---|
| 1-60 | `Revenue Share — M1 Mar-26` … | **Revenue Share** | 15% x that month's reported Net Sales |
| 61-120 | `IPL Fee — M1 Mar-26` … | **IPL Fee** | flat Rp 15,000,000 |

Only **M1** has a reported Net Sales figure; the other 59 revenue-share rows are `0` with status
"No Sales Reported", exactly as the source tracker has them. Descriptions deliberately avoid
parentheses (`M1 Mar-26`, not `M1 (Mar-26)`) because the picker's label shortener strips
parentheticals and here the month is the identifying part, not a qualifier.

The revenue-share rows also carry `revenue_share_pct` and `reported_net_sales`, which appear as two
extra columns in the Contract Extraction Postprocessing table, positioned immediately before Total
Amount Before VAT so the row reads left-to-right as the calculation. Those columns are appended
**only** when a vendor's schedule actually has them (`_contract_derived_columns`), so no other vendor
gains two permanently-NA columns.

`due_date` is `NA` on every revenue-share row: the contract sets payment at 14 working days after a
complete invoice is received, not on a calendar date, and the source's own Payment Due Date column is
empty throughout.

## The utility invoice is a FLAT charge, not a metered one

Invoice 2 bills "Tagihan Listrik" and "Tagihan IPL", but this is **not** a billed-on-actuals utility:

- The contract levies a fixed IPL of **Rp4,000,000/month** (security, cleanliness, waste) plus
  **Rp11,000,000/month** (electricity and water) = **Rp15,000,000/month** excl. VAT, explicitly
  *in lieu of* metered utility billing.
- Both invoice lines therefore carry `charge_type: "ipl_fee"`, **not** `utility_electricity` /
  `utility_water`. That keeps them out of `_NO_SCHEDULE_CHARGE_TYPES`, so the invoice is matched
  against the IPL schedule the ordinary way, the installment picker stays enabled, and no supporting
  document is demanded.
- It must never be fed into the `Revenue Share % x Net Sales` formula. The revenue-share reference
  only fires for an invoice carrying a `revenue_share` line (`_is_revenue_share_invoice`).

### Open discrepancy: the IPL invoice is grossed up (currently fails Matching)

| | Amount |
|---|---:|
| Contract / schedule IPL fee | **15,000,000** |
| Invoice, gross | **16,666,666** |
| less PPh withheld (10%, printed as "Pemotongan PPH") | 1,666,666 |
| Invoice, net received | **15,000,000** |

The vendor grosses the fee up so that the amount it *receives* after withholding equals the contract's
Rp15,000,000 (11,000,000 / 0.9 = 12,222,222 and 4,000,000 / 0.9 = 4,444,444). The contract instead
reads as Rp15,000,000 being the charge, with PPh deducted *from* it — and the derived schedule models
WHT at 0%, so its net equals its gross.

Compared as printed, the invoice's pre-VAT total is **+11.11%** over the contract figure, which
exceeds the 5% tolerance, so the row is a hard `error`, cannot be acknowledged away
(`_ALWAYS_BLOCKING_FIELDS` / `NO_ACK_FIELDS`) and activates **Escalate**. **This is deliberate and is
left unreconciled** — it is a real, systematic difference between what the contract says and how the
vendor bills, and silently comparing the net figure instead would hide it. If the intended reading is
that Rp15,000,000 is what the lessor must receive, the fix is a contract-side decision, not an
extraction change.

## Tax treatment

| | Revenue Share invoice | Listrik + IPL invoice |
|---|---|---|
| VAT / PPN | none charged | none charged |
| Faktur Pajak | none exists | none exists |
| PPh withheld on the invoice | **no** | **yes — 10%, Rp 1,666,666** |
| `vat_applicable` | **false** | **false** |
| `wht_applicable` | true | true |

`vat_applicable` is now read from `bill_posting.json` (defaulting to the old RATNA_INTAN hardcode), so
this vendor's VAT column is hidden and `_validate_bill_posting_tax_codes` does not demand a VAT code
that cannot exist. Both invoices post with a balanced Simulate; the IPL one emits a
`2230 · Withholding Tax Payable` credit of 1,666,666 and an AP credit of 15,000,000.

| charge_type | G/L account | VAT code | WHT code |
|---|---|---|---|
| `revenue_share` | `6150-REVSHARE` | *(none — no VAT)* | `PPH4(2)-SEWA` |
| `ipl_fee` | `6250-IPL` | *(none — no VAT)* | `PPH4(2)-SEWA` |

## Common extraction pitfalls

- **Neither invoice prints a pre-VAT subtotal**, because neither charges VAT.
  `total_amount_before_vat` is therefore the invoice total, exactly as RATNA_INTAN's own no-VAT
  invoice is authored. Do not leave it blank — it is the always-blocking Matching field.
- **Invoice 2's printed "Total Rp 15.000.000" is the NET**, after PPh, not the gross. The gross is
  the sum of the two line items (16,666,666). Reading the printed Total as the invoice amount
  understates it by the withholding.
- **Invoices 1 and 2 are unrelated.** They are not two halves of one billing; they hit two different
  schedules and two different G/L accounts. Only invoice 1 has a supporting document.
- **Neither invoice states a billing period**, only a month name ("Bulan April"), so
  `billing_period_start` / `billing_period_end` are `NA` on both rather than a derived range.
- **Neither invoice prints a vendor address.** DEBORA_KEMANG is therefore in
  `_NO_STORE_LOCATION_MATCH_VENDORS` (with RATNA_INTAN and PT_BANGUN, both also individual/
  non-mall landlords) so Store Location is a non-blocking warning instead of a permanent error.
- **The sales report's period labelling differs from the contract's.** The contract's years run
  12th-to-11th, so the derived schedule's M1 is 12-Mar-2026 to 11-Apr-2026 while the report is by
  calendar month. The source tracker places April's Net Sales in **M1**, and the fixtures follow it.
- **Do not enter the Rp211,670,000 Investment Cost as a deposit or contract value.** It is paid by
  the PARTNER **to BBB** for outlet assets — the opposite direction from a tenant deposit — and is
  carried as a one-time payment row instead.
- The contract PDF is a **19-page scan with no text layer**; all contract values come from
  `all_vendor_contract_ex_res.csv` and `DeboraKemang_contract_derived_fields.csv`.
