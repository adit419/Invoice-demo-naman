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

Identical field set across all three vendors and all PALLADIUM documents.

| # | Key | # | Key | # | Key |
|---|---|---|---|---|---|
| 1 | `invoice_number` | 10 | `billing_period_start` | 19 | `total_amount` |
| 2 | `invoice_date` | 11 | `billing_period_end` | 20 | `currency` |
| 3 | `vendor_name` | 12 | `payment_terms` | 21 | `vendor_bank_name` |
| 4 | `vendor_address` | 13 | `due_date` | 22 | `vendor_bank_account_name` |
| 5 | `vendor_vat_id` | 14 | `total_amount_before_vat` | 23 | `vendor_bank_account_number` |
| 6 | `customer_legal_entity` | 15 | `tax_type` | 24 | `vendor_bank_swift` |
| 7 | `customer_address` | 16 | `tax_rate` | 25 | `notes` |
| 8 | `customer_vat_id` | 17 | `vat_gst` | | |
| 9 | `description` | 18 | `wht` / `wht_rate` / `net_amount_after_wht` | | |

Full list, verbatim: `invoice_number`, `invoice_date`, `vendor_name`, `vendor_address`,
`vendor_vat_id`, `customer_legal_entity`, `customer_address`, `customer_vat_id`, `description`,
`billing_period_start`, `billing_period_end`, `payment_terms`, `due_date`,
`total_amount_before_vat`, `tax_type`, `tax_rate`, `vat_gst`, `wht_rate`, `wht`,
`net_amount_after_wht`, `total_amount`, `currency`, `vendor_bank_name`,
`vendor_bank_account_name`, `vendor_bank_account_number`, `vendor_bank_swift`, `notes`.

**Line item keys (6):** `label`, `item_code`, `charge_type`, `quantity`, `unit_price`, `amount`.

**`charge_type` values in use:** `rental_fee`, `service_fee`, `stamp_duty`, `wht_deduction`,
`utility_electricity`, `utility_water`, `late_fee`, `revenue_share`, `ipl_fee`.
The last two are DEBORA_KEMANG's: `revenue_share` triggers the computed
`Revenue Share % x Net Sales` reference (§6g), and `ipl_fee` is a FLAT contractual fee that must
**not** be classified as a metered utility even though it bills electricity.
(`stamp_duty`, `wht_deduction` and `late_fee` lines are filtered out of Bill Posting's line items and
added back by Simulate as their own dedicated rows.)

GRAHA_MEGARIA is the only vendor using all four *billable* types against a single contract — one per
invoice — which is why Bill Posting defaults are now resolved by charge type rather than by position
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
