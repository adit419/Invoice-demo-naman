# DirectPay — Fields by Stage (PT_BANGUN · RATNA_INTAN · PALLADIUM · GRAHA_MEGARIA)

**Scope:** every field each stage actually surfaces, for the contract flow and the invoice flow.

**How this was produced:** by driving the real `/dp-api` endpoints end-to-end against the three
vendors' fixtures and recording the responses — not by reading the fixture JSON and inferring.
Field keys, display labels, mandatory flags and per-vendor differences below are all as the API
returned them.

**Verified against:** `PT_BANGUN_CONTRACT.pdf` + `PT_BANGUN_RENT_INV.pdf`,
`RATNA_INTAN_CONTRACT.pdf` + `RATNA_INTAN_INV.pdf`,
`PALLADIUM_CONTRACT.pdf` + `PALLADIUM_INV_1/2/3.pdf`,
`GRAHA_MEGARIA_CONTRACT.pdf` + `GRAHA_MEGARIA_INV_1/2/3/4.pdf`.

> **GRAHA_MEGARIA conforms to every field set below with no additions.** It was driven end-to-end
> through the same endpoints and returns the identical 49 contract fields, 27 invoice metadata
> fields, 4 Faktur Pajak fields and 7-row Matching checklist. It is the first vendor to exercise all
> four `charge_type` values against one contract; see
> `DIRECTPAY_VENDOR_RULES_GRAHA_MEGARIA.md`. Its per-vendor answers are in the summary table at the
> bottom.

> **Correction worth noting:** the invoice pipeline has **no Postprocessing stage**. An earlier
> round of the module had one between Faktur Pajak and Matching; it was removed (see the comment
> at `service.py:51-56`) and no route exists for it — only the **contract** has Postprocessing.
> `DIRECTPAY_INSTALLMENT_RENT_WORKFLOW.md` §4 still lists it in the invoice status vocabulary and
> is stale on that point.

---

## Stage map (verified from the status assignments in `service.py`)

**Contract:** `review` → `postprocessing` → `saved`
(Postprocessing only when the vendor has a `payment_schedule.json`; otherwise `review → saved`.)

**Invoice:** `extraction` → `extracted` → `fp_extraction` → `extracted` → `matching` →
`bill_posting` → `posted`, with `rejected` a possible exit.
`extracted` appears twice — before and after the Faktur Pajak stage.

| Stage | Applies to | PT_BANGUN | RATNA_INTAN | PALLADIUM |
|---|---|---|---|---|
| Contract Extraction | all | ✅ 49 fields | ✅ 49 | ✅ 49 |
| Contract Postprocessing | has payment schedule | ✅ | ✅ | ✅ |
| Invoice Extraction | all | ✅ 27 + line items | ✅ | ✅ (×3 documents) |
| Faktur Pajak | has an FP document | ✅ 4 fields | ❌ **no FP document** | ✅ 4 fields (each of 3) |
| Matching | all | ✅ 8 rows | ✅ 7 | ✅ 7 (each) |
| Bill Posting | all | ✅ | ✅ | ✅ |

GRAHA_MEGARIA: 49 contract fields · 73 postprocessing installments · 4 invoice documents ·
4 Faktur Pajak · 7 Matching rows each · Bill Posting ✅.

---

# CONTRACT FLOW

## 1. Contract Extraction — 49 fields

Identical field set for all three vendors (same `contract_field_meta.json` shape). `*` = mandatory
(drives the red asterisk on the review screen). Grouped by the `section` the fixture declares,
in display order.

### PROPERTY & PARTIES (6)
| | Key | Label |
|---|---|---|
| * | `premises_address` | Property / Premises Address |
| * | `vendor_name` | Vendor Name |
| | `lessor_phone` | Vendor Phone |
| | `vendor_email` | Vendor Email |
| * | `lessor_npwp` | Vendor NPWP |
| * | `customer_name` | Customer Name |

### AGREEMENT DATES & TERM (4)
| | Key | Label |
|---|---|---|
| * | `actual_start` | Lease Commencement Date |
| * | `lease_expiry_date` | Lease Expiry Date |
| * | `lock_in_period_months` | Lock-in Period (Months) |
| | `term_months` | Tenure (Months) |

### RENT & DEPOSIT (13)
| | Key | Label |
|---|---|---|
| | `rent_basis_type` | Rent Basis Type |
| | `currency` | Currency |
| | `vat_included` | VAT Incl/Excl |
| | `vat_rate` | VAT Rate |
| | `base_rent_monthly_excl_tax` | Base Rent (Excl Tax) Monthly |
| | `monthly_rent_incl_tax` | Monthly Rent incl. Tax (Cond.) |
| * | `total_contract_value` | Total Contract Value, Lumpsum |
| | `no_of_installments` | No. of Installments |
| | `base_fee` | Monthly Rent |
| | `revenue_share_pct` | Revenue Share (%) |
| | `revenue_threshold` | Revenue Share Threshold Amount |
| * | `rent_billing_day` | Rent Billing Day |
| * | `security_deposit` | Security Deposit |

### ESCALATION (5)
| | Key | Label |
|---|---|---|
| * | `escalation_rate` | Escalation Clause (%) |
| * | `escalation_frequency` | Escalation Frequency |
| | `escalation_starts_after_months` | Escalation Starts After (months) |
| | `next_escalation_date` | Next Escalation Date |
| | `first_escalation_date` | First Escalation Date |

### UTILITIES & TAX (3)
| | Key | Label |
|---|---|---|
| * | `utilities_billing` | Utilities Billing |
| | `wht_applicable` | WHT Applicable |
| | `wht_rate_pct` | WHT Rate (%) |

### LEGAL & COMPLIANCE (4)
| | Key | Label |
|---|---|---|
| * | `stamp_duty_registered` | Stamp Duty / Registered |
| | `registration_number` | Registration Number |
| * | `notice_period_days` | Notice Period (Days) |
| | `renewal_option` | Renewal Option |

### STATUS & TRACKING (4)
| | Key | Label |
|---|---|---|
| | `property_code` | Property Code |
| | `days_to_expiry` | Days to Expiry |
| | `computed_status` | Computed Status |
| | `rent_commencement_date` | Rent Commencement Date |

### PAYMENT STRUCTURE (7)
| | Key | Label |
|---|---|---|
| | `rent_free_months` | Rent Free Months |
| | `co_landlord` | Co-Landlord |
| | `lessor_split_pct` | Vendor Split (%) |
| | `lessor_payment_share` | Vendor Payment Share |
| * | `lessor_bank_account_name` | Bank Account Name |
| * | `lessor_bank_account_number` | Bank Account Number |
| | `split_check` | Split Check |

### REVENUE & ADDITIONAL (1)
| | Key | Label |
|---|---|---|
| | `rent_scenario_notes` | Rent Scenario Notes |

### OTHER (2)
| | Key | Label |
|---|---|---|
| | `contract_type` | Contract Type |
| | `floor` | Floor |

## 2. Contract Extraction Postprocessing

Editable. One table **per installment**, all columns from the vendor's `payment_schedule.json`.

**Installment columns (9)** — identical for all three vendors:

| Key | Label |
|---|---|
| `due_date` | Due Date |
| `billing_period_start` | Billing Period Start |
| `billing_period_end` | Billing Period End |
| `amount_excl_tax` | Total Amount Before VAT |
| `vat_rate` | VAT Rate |
| `vat_amount` | Tax Amount |
| `total_amount_incl_tax` | Total Amount (Incl. VAT) |
| `wht_rate` | WHT Rate |
| `payment_status` | Payment Status |

> `wht_amount` (WHT (Withholding Tax)) and `net_payment_to_lessor` (Net Amount After WHT) were
> **removed from this display**. Both still exist in `payment_schedule.json` and are still used by
> Bill Posting.

**One-Time Payments table (6 keys)** — present only when the vendor's schedule has that section:
`description`, `amount`, `formatted_amount`, `due_date_trigger`, `status`, `remarks`.

**Installment counts:** PT_BANGUN 2 · RATNA_INTAN 3 · PALLADIUM 13 · PAKUWON 75 ·
KARYA_NASTARI 11 · GRAHA_MEGARIA 73 (37 rent + 36 service charge).

---

# INVOICE FLOW

## 3. Invoice Extraction — 27 metadata fields + line items

Identical field set for every vendor and every document. **Types below are the ones actually observed
across all 20 invoice-extraction fixtures**, not a schema declaration — there is no schema file; the
fixture JSON is the contract.

> **Read `"NA"` as "absent".** Every field can hold the literal string `"NA"` instead of a value (the
> convention in `DIRECTPAY_INSTALLMENT_RENT_WORKFLOW.md` §2a), so a money field's real type is
> `number | "NA"`. `_strip_na()` converts it back to `None` before any computation, so nothing
> downstream ever does arithmetic on the string. The "observed" column records which of the two each
> field is actually seen as today.

### Identity and parties

| Field | Type | Observed | Description |
|---|---|---|---|
| `invoice_number` | `string` | always set | The vendor's own invoice reference, verbatim. Used as the human label everywhere and in the Simulate AP line ("Vendor invoice …"). Not unique across vendors and never parsed. |
| `invoice_date` | `string` (ISO `YYYY-MM-DD`, or as printed) | always set | Date of issue. Stored ISO where the printed form is ambiguous (GRAHA_MEGARIA prints US `MM/DD/YYYY`); some vendors keep the printed Indonesian form (`10 Agustus 2026`). `_parse_loose_date()` reads all of these. |
| `vendor_name` | `string` | always set | Vendor as printed on the invoice. Compared against the contract's own `vendor_name` on Matching (mandatory row) and against the Faktur Pajak's. Shortened variants are normal and get acknowledged. |
| `vendor_address` | `string` | 18 set, 2 `"NA"` | Vendor's printed address. Compared against the contract's `premises_address` as the **Store Location** row — meaningful only for a mall operator; see `_NO_STORE_LOCATION_MATCH_VENDORS`. |
| `vendor_vat_id` | `string` | `"NA"` in all 20 | Vendor NPWP. No invoice in the set prints one — it exists only on the Faktur Pajak, and is deliberately not back-filled from there. |
| `customer_legal_entity` | `string` | always set | The billed entity (always PT Bumi Berkah Boga in some form). Compared against the FP's `customer_name`. |
| `customer_address` | `string` | 19 set, 1 `"NA"` | Billing address as printed. Display only — never compared. |
| `customer_vat_id` | `string` | `"NA"` in all 20 | Buyer NPWP. Note DEBORA/GRAHA invoices **do** print it; the extraction CSVs record `—`, and the fixtures follow the CSV (flagged in the GRAHA vendor doc). |
| `description` | `string` | always set | Free-text summary of what is billed, usually the charge plus its period. Display only. |

### Period and terms

| Field | Type | Observed | Description |
|---|---|---|---|
| `billing_period_start` | `string` (ISO date) | 2 set, 18 `"NA"` | First day of the period billed, **only when the invoice explicitly prints a range**. A month name alone (`"Bulan April"`) is not enough and stays `"NA"`. Also the second candidate in the installment due-date tie-break (§6a). |
| `billing_period_end` | `string` (ISO date) | 2 set, 18 `"NA"` | Last day of that period, same rule. Shown on Matching against the matched schedule row's own period. |
| `payment_terms` | `string` | 1 set, 19 `"NA"` | Printed terms (e.g. `C.O.D`). Display only. |
| `due_date` | `string` (ISO or as printed) | 19 set, 1 `"NA"` | When payment falls due. Drives the **primary** installment due-date tie-break (§6a) and Bill Posting's Payment Due Date. |

### Amounts

| Field | Type | Observed | Description |
|---|---|---|---|
| `total_amount_before_vat` | `number` | always set | Pre-VAT total. **The single most important field in the module**: the always-mandatory, never-acknowledgeable Matching row (`_ALWAYS_BLOCKING_FIELDS` / `NO_ACK_FIELDS`), the subject of the tolerance check and the variance bar, and Bill Posting's "Taxable Amount". For a no-VAT vendor it equals `total_amount`. |
| `tax_type` | `string` | 1 set (`PPN`), 19 `"NA"` | Tax regime named on the invoice. Display only. |
| `tax_rate` | `number` (whole percent) | 1 set (`11`), 19 `"NA"` | VAT rate as a **whole number** (`11`, never `0.11`). Labels Simulate's Input VAT row. Not mandatory: a mismatch here is informational. |
| `vat_gst` | `number` | 17 set, 3 `"NA"` | VAT/PPN charged. `"NA"` means the vendor charges none at all (RATNA_INTAN, DEBORA_KEMANG) — not missing data, which is why those vendors also carry `vat_applicable: false`. |
| `wht_rate` | `number` (whole percent) | `"NA"` in all 20 | Withholding rate, if the invoice prints one. None does — DEBORA's invoice prints the withheld *amount* but no rate, so the reviewer's dropdown supplies the rate instead (§10a). |
| `wht` | `number` | 2 set, 18 `"NA"` | Withholding tax deducted, as printed ("Pemotongan PPH"). Feeds Simulate's WHT-Payable credit and is the `wht_from_document` baseline the manual override respects. |
| `net_amount_after_wht` | `number` | 2 set, 18 `"NA"` | What the vendor actually receives after withholding. Becomes Bill Posting's **Payable Amount**, which the WHT dropdown deliberately never moves (§10a). |
| `total_amount` | `number` | always set | Invoice grand total including VAT. Simulate's AP credit is derived from it (`grand_total − wht`). |
| `currency` | `string` (ISO code) | always set | `IDR` throughout. Drives the currency symbol and the VAT code list. |

### Vendor bank details

| Field | Type | Observed | Description |
|---|---|---|---|
| `vendor_bank_name` | `string` | always set | Bank as printed. Display only. |
| `vendor_bank_account_name` | `string` | 17 set, 3 `"NA"` | Account holder. Compared against the contract's `lessor_bank_account_name` — a core Matching row, but **not** mandatory. |
| `vendor_bank_account_number` | `string` | always set | Account number, kept as a **string** (leading zeros and length must survive). Compared against `lessor_bank_account_number`. |
| `vendor_bank_swift` | `string` | `"NA"` in all 20 | SWIFT/BIC. No domestic Indonesian invoice in the set prints one. |
| `notes` | `string` | 3 set, 17 `"NA"` | Free-text provenance note carried by the fixture author, e.g. explaining a real discrepancy. Never compared; exists so an oddity is recorded next to the data rather than only in a doc. |

### Line items — `line_items[]`

| Field | Type | Observed | Description |
|---|---|---|---|
| `label` | `string` | always set | The line's printed description. Becomes the Bill Posting row description and the Simulate debit narration. |
| `item_code` | `string \| null` | 3 set, 33 `null` | Vendor's own item/SKU code where printed. Note this one uses `null`, **not** `"NA"` — it is a structural absence inside an array, not an unfilled form field. |
| `charge_type` | `string` (enum below) | always set | **The routing key for the whole module.** Decides the reference source on Matching, whether the installment picker is enabled, which G/L account Bill Posting uses, and whether the line is billable at all. |
| `quantity` | `number \| null` | 34 set, 2 `null` | Quantity billed. Mostly `1`; a metered line may be fractional. |
| `unit_price` | `number \| null` | 34 set, 2 `null` | Price per unit. Equals `amount` when quantity is 1. |
| `amount` | `number` | always set | Line total, pre-VAT. The per-line figures must sum to `total_amount_before_vat` — asserted when the fixtures are built. |

**`charge_type` values in use** (count across the 20 fixtures):

| Value | Count | Billable? | Meaning and effect |
|---|---:|---|---|
| `rental_fee` | 13 | yes | Rent. Matched against the contract's payment schedule. |
| `stamp_duty` | 7 | **no** | Fixed government duty (materai). Excluded from Bill Posting's line items, added back by Simulate as its own debit row so Debit still equals Credit. |
| `utility_water` | 4 | yes | Metered water. In `_NO_SCHEDULE_CHARGE_TYPES`: no schedule counterpart, so the reference comes from a supporting document and the installment picker is locked (§6c). |
| `utility_electricity` | 4 | yes | Metered electricity. Same treatment. |
| `service_fee` | 3 | yes | Service charge. Schedule-backed, but in `_NON_RENT_CHARGE_TYPES` because its rate can legitimately move. |
| `ipl_fee` | 2 | yes | DEBORA_KEMANG's flat monthly IPL fee. Bills electricity and water but is **not** metered, so deliberately *not* a `utility_*` type — it has its own schedule (§10b vendor doc). |
| `revenue_share` | 1 | yes | DEBORA_KEMANG's revenue-share rent. Triggers the computed `Revenue Share % × Net Sales` reference (§6g). |
| `late_fee` | 1 | **no** | Denda. Real money owed but not a taxable supply; excluded from line items and given its own Simulate row (`6500 · Late Payment Charges`). |
| `wht_deduction` | 1 | **no** | RATNA_INTAN's printed "Pemotongan PPH" line. Excluded — the dedicated WHT figures already represent it, so keeping it would double-count. |

GRAHA_MEGARIA is the only vendor using four *different* billable types against a single contract, one
per invoice, which is why Bill Posting defaults resolve by charge type rather than by position
(`DIRECTPAY_INSTALLMENT_RENT_WORKFLOW.md` §6d).

## 4. Faktur Pajak — 4 fields

`*` = required (must match or be acknowledged before the stage can be approved).

| | Key | Label | Compared against (invoice field) |
|---|---|---|---|
| * | `vendor_name` | Vendor Name (FP) | `vendor_name` |
| * | `customer_name` | Customer Name (FP) | `customer_legal_entity` |
| | `taxable_amount` | Taxable Amount (DPP) | `total_amount_before_vat` |
| | `vat_amount` | VAT Amount (PPN) | `vat_gst` |

| Vendor | Stage runs? |
|---|---|
| PT_BANGUN | ✅ 1 FP |
| **RATNA_INTAN** | ❌ **skipped — no FP document exists** (goes straight to Matching-ready) |
| PALLADIUM | ✅ 3 FPs, one per invoice document |

## 5. Matching

Two things populate the rows: the fixture's own `matching.json` findings, plus the synthesized
core checklist (`CORE_CROSS_VALIDATION_FIELDS`). `*` = mandatory / can block Approve.

**Core checklist (7 rows, every vendor):**

| | Key | Row title | Contract side |
|---|---|---|---|
| * | `vendor_name` | Vendor Name comparison | `vendor_name` |
| | `vendor_bank_account_name` | Bank Account Name comparison | `lessor_bank_account_name` |
| | `vendor_bank_account_number` | Bank Account Number comparison | `lessor_bank_account_number` |
| ⚠ | `vendor_address` | Store Location comparison | `premises_address` |
| | `billing_period_start` | Billing Period Start comparison | matched installment |
| | `billing_period_end` | Billing Period End comparison | matched installment |
| * | `total_amount_before_vat` | Total Amount Before VAT comparison | matched installment / `base_fee` / supporting doc |

⚠ **`vendor_address` mandatory-ness differs by vendor** (verified):

| Vendor | `vendor_address` mandatory? | Why |
|---|---|---|
| PT_BANGUN | ❌ no | in `_NO_STORE_LOCATION_MATCH_VENDORS` — invoice states the vendor's own business address, not the leased unit |
| RATNA_INTAN | ❌ no | same set — individual landlord's personal address |
| PALLADIUM | ✅ **yes** | mall operator whose registered address *is* the building, so the comparison is meaningful |

**`total_amount_before_vat` is always mandatory** but is *satisfied* (non-blocking) when inside the
configured tolerance. It is **not rendered as a table row** — it appears in the variance bar at the
bottom of the page. It can never be acknowledged away (`NO_ACK_FIELDS`).

**Fixture-authored extras:**

| Vendor | Extra finding | Core? | Mandatory? |
|---|---|---|---|
| PT_BANGUN | `tax_rate` — "Tax rate is 11%, expected 18%" | no | no |
| RATNA_INTAN | none | — | — |
| PALLADIUM | none | — | — |

→ Row totals: **PT_BANGUN 8**, **RATNA_INTAN 7**, **PALLADIUM 7** (per document).

**Supporting document** (contract states "billed on actuals", so the reference amount comes from a
utility bill instead):

| Document | Supporting doc? | Reference amount |
|---|---|---|
| PALLADIUM_INV_1 (Service Charge) | ❌ | contract / schedule |
| **PALLADIUM_INV_2** (Electricity) | ✅ | `4,390,312.30` from supporting doc |
| **PALLADIUM_INV_3** (Water) | ✅ | `319,990.00` from supporting doc |
| PT_BANGUN, RATNA_INTAN | ❌ | contract / schedule |
| GRAHA_MEGARIA_INV_1 (Rental) | ❌ | schedule — `Monthly Installment 23 of 36`, exact match |
| GRAHA_MEGARIA_INV_2 (Service Charge) | ❌ | schedule — `Service Charge — Month 23 of 36`, **+6.06% → blocks** |
| **GRAHA_MEGARIA_INV_3** (Water) | ✅ | `320,390.00` from the water calculation sheet |
| **GRAHA_MEGARIA_INV_4** (Electricity) | ✅ | `2,407,870.14` from the electricity calculation sheet |

## 6. Bill Posting

**Metadata grid (9 displayed fields):**

| Key | Label |
|---|---|
| `invoice_received_date` | Invoice Received Date |
| `vendor_name` | Vendor Name |
| `invoice_number` | Invoice Number |
| `invoice_date` | Invoice Date |
| `subtotal` | Taxable Amount |
| `payable_amount` | Payable Amount |
| `payment_due_date` | Payment Due Date |
| `bank_account_name` | Bank Account Name |
| `bank_account_number` | Bank Account Number |

**Full payload (20 top-level fields):** `id`, `status`, `contract_id`, `vendor_name`,
`invoice_number`, `invoice_date`, `invoice_received_date`, `payment_due_date`, `bank_account_name`,
`bank_account_number`, `currency`, `subtotal`, `tax_amount`, `wht_amount`, `grand_total`,
`payable_amount`, `wht_applicable`, `vat_applicable`, `stamp_duty_amount`, `updated_at`.

**Line item table (8 keys):** `id`, `description`, `charge_type`, `quantity`, `amount`,
`gl_account_code`, `vat_tax_code`, `wht_tax_code`.
Displayed columns: `#`, Description, Line Total, **VAT/GST Tax Code**, **WHT Tax Code**.

| Vendor | `vat_applicable` | `wht_applicable` | Effect |
|---|---|---|---|
| PT_BANGUN | ✅ true | ✅ true | both columns, real WHT code |
| **RATNA_INTAN** | ❌ **false** | ✅ true | **VAT column hidden entirely**; no Input VAT row in Simulate |
| PALLADIUM | ✅ true | ❌ false | WHT column shown with `00 · NO WITHHOLDING` preselected |

**Simulate document columns (7):** `#`, Posting Key, G/L Account, Description, Tax Code, Debit,
Credit.

---

## Per-vendor summary

| | PT_BANGUN | RATNA_INTAN | PALLADIUM | GRAHA_MEGARIA |
|---|---|---|---|---|
| Contract fields | 49 | 49 | 49 | 49 |
| Contract postproc installments | 2 | 3 | 13 | **73** |
| Invoice documents | 1 | 1 | **3** | **4** |
| Invoice metadata fields | 27 | 27 | 27 | 27 |
| Faktur Pajak | ✅ 4 fields | ❌ none | ✅ 4 fields × 3 | ✅ 4 fields × 4 |
| Matching rows | 8 | 7 | 7 per document | 7 per document |
| Store Location mandatory | ❌ | ❌ | ✅ | ✅ (mall operator) |
| VAT applicable | ✅ | ❌ | ✅ | ✅ |
| WHT applicable | ✅ | ✅ | ❌ | ❌ |
| Supporting documents | ❌ | ❌ | ✅ 2 of 3 | ✅ 2 of 4 |
| Distinct G/L accounts | 1 | 1 | 1 | **4** |
