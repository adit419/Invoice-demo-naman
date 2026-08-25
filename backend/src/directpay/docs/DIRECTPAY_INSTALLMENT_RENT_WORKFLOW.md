# DirectPay: Installment-Type Rent Invoice Processing

**Reference vendors** (5 with full fixture sets; `fixtures/dp/`):

| Vendor key | Reference case for |
|---|---|
| `PT_BANGUN` | Single invoice + a real Faktur Pajak; lumpsum installments |
| `RATNA_INTAN` | **No FP document** at all; **no VAT** vendor (individual, non-PKP landlord); a real WHT-deduction line item on the invoice |
| `PALLADIUM` | **Multi-invoice / multi-FP** (3 charge types: Service Charge, Electricity, Water); two independent payment schedules combined into one list; **supporting documents** for billed-on-actuals utilities |
| `PAKUWON` | Multi-invoice (6 documents), each with its own FP |
| `KARYA_NASTARI` | Multi-invoice (3 documents), FP for some documents only |

(`DEBORA_KEMANG` and `GRAHA_MEGARIA` currently hold source PDFs only — no fixture JSON authored
yet, so they are not resolvable scenarios.)

**Module:** `backend/src/directpay/`, `frontend/src/pages/directpay/`

**Purpose of this doc:** a complete, code-verified walkthrough of how DirectPay processes a
lumpsum-installment lease from contract upload through posted bill, so this pattern can be
reused when onboarding another vendor or extending the feature. Every claim below was checked
against the current code and fixtures, not recalled from memory.

> **Read §2a (the `"NA"` convention), §8a (vendor-specific override registry), §14 (the
> Total-Amount-Before-VAT threshold) and §15 (supporting documents) before authoring a new
> vendor** — those four are the things most likely to make a new vendor behave unexpectedly, and
> all four postdate the original version of this doc.

---

## 1. What makes this an "installment type" rent invoice

Most rent contracts have a flat **monthly rent** (`base_fee`) you can compare an invoice's
subtotal against directly. PT_BANGUN's lease doesn't: it's a 5-year lease billed as **two lumpsum
installments** (Rp 750,000,000 upfront, Rp 500,000,000 at year 2), not 60 equal monthly charges.
The contract's own `base_fee` / `base_rent_monthly_excl_tax` fields are genuinely not applicable —
not missing data (see `contract_field_meta.json`'s `base_fee.ai_match_reasoning`). They were
originally `0` in the source tracker and are now written as `"NA"` (§2a); both the `0` and the
`"NA"` form are treated as "no contract figure" rather than "expected zero."

This breaks the naive "invoice subtotal vs. contract's monthly rent" comparison Matching would
otherwise do, and it means several invoice facts (due date, WHT, net payable) are **never printed
on the invoice document itself** — they only exist in the lease's own **payment schedule**
(`payment_schedule.json`), one row per installment. The entire installment-type workflow below
exists to solve two problems:

1. **Which installment does this invoice belong to?** (there's no invoice-identifying key in the
   schedule — see §6)
2. **How do those installment figures get into Matching / Bill Posting without inventing data the
   invoice never actually stated?** (see §7 — the "no back-populate" rule)

---

## 2. Fixture files per vendor

All of a vendor's fixture data lives in one folder: `fixtures/dp/<VENDOR_KEY>/`. For a
single-invoice, installment-type vendor like PT_BANGUN:

| File | Required? | Contents | Consumed by |
|---|---|---|---|
| `contract.pdf` | yes | The real lease PDF | Contract Review's PDF viewer |
| `invoice.pdf` | yes | The real invoice/Faktur Pajak PDF | Extraction/FP/Matching/Bill Posting PDF viewers |
| `contract_extraction.json` | yes | Flat key→value contract fields (47 for PT_BANGUN) | Contract Review, Matching's contract-column lookups |
| `contract_field_meta.json` | recommended | Per-field `{label, section, mandatory, audit_trail, ai_match_reasoning}` | Contract Review's field table (labels/grouping/asterisks) |
| `invoice_extraction.json` | yes | Flat key→value invoice fields + `line_items[]` | Extraction, FP, Matching's invoice-column, Bill Posting |
| `fp_extraction.json` | optional | `{fp_number, vendor_name, customer_name, taxable_amount, vat_amount}` | Faktur Pajak stage |
| `payment_schedule.json` | **the installment-type marker** | `{installments: [...]}`, one row per installment | Contract Postprocessing, invoice Postprocessing, Matching, Bill Posting (all via `_match_payment_installment`) |
| `matching.json` | yes | `{expected, summary, findings[]}` — only for genuinely fixture-specific findings (e.g. a tax-rate anomaly); the core checklist is synthesized separately (§8) | Matching |
| `bill_posting.json` | yes | Per-line-item GL/VAT/WHT code defaults + `wht_applicable` | Bill Posting |
| `documents.json` | multi-invoice vendors only | Manifest of this vendor's several real invoices (§2b) | `DpFixtureLoader.discover`/`resolve_document` |
| `supporting_doc_<x>_extraction.json` | optional | `{"total_amount_before_vat": <number>}` — the actual amount for a charge the contract only bills "on actuals" (§15) | Matching's contract column |

**Resolution rule** (`fixtures.py`): the folder name only needs to be a case/punctuation-insensitive
prefix of BOTH the uploaded contract and invoice filenames. `PT_BANGUN` matches
`PT_BANGUN_CONTRACT.pdf` and `PT_BANGUN_RENT_INV.pdf`. A generic filename like `contract.pdf`
(no vendor prefix) is ambiguous and will resolve to whichever bundle the loader hits first —
**always rename a test upload to a vendor-prefixed filename** (see
`~/.claude/.../memory/project_dp_fixture_upload_filenames.md` for the exact real filenames per
vendor).

**The absolute rule for every fixture value**: it must trace to a real source document (the
lease PDF, the tracker spreadsheet, the Faktur Pajak). Where a fact genuinely isn't in the
source, it's absent — never guessed, backfilled, or "reasonably assumed." Where a value looks
odd (e.g. a not-applicable `base_fee`), the field's own `ai_match_reasoning` in
`contract_field_meta.json` documents *why* it's correct as-is, not evidence it should be "fixed."

### 2a. How "absent" is written: the literal `"NA"` convention

**This changed — it is no longer `null`.** Every absent value in a `contract_extraction.json` or
`*invoice*_extraction.json` is now the literal **string `"NA"`**, not JSON `null`:

```json
{ "base_rent_monthly_excl_tax": "NA", "wht": "NA", "lock_in_period_months": "NA" }
```

Two rules behind it:

- **Absent ⇒ `"NA"`, everywhere except Matching.** The Extraction/Review pages (contract and
  invoice) and Contract Postprocessing display "NA" for a blank field, with the same amber
  highlight an empty field always had. Matching is the deliberate exception — a blank Matching
  cell stays visually blank, because "nothing to compare" is itself the answer there.
- **A spreadsheet `0` that means "not applicable" is also `"NA"`**, not `0`. Several contract
  fields (`base_fee`, `base_rent_monthly_excl_tax`, `lock_in_period_months`, …) were literal `0`
  in the source tracker purely as a spreadsheet artifact; `0` would read as "the expected amount
  is zero rupiah." Only write `0` when zero is a genuine stated fact.

**The backend never computes on `"NA"`.** `_strip_na()` (`service.py`) normalizes `"NA"` back to
`None` at the top of every function that does real work with extracted/contract values —
`_apply_mandatory_field_coverage`, `_refresh_findings_from_extracted`, `_bill_posting_out`,
`simulate_bill_posting`, `get_faktur_pajak`, `acknowledge_fp_field`.
**Any new consumer of extracted/contract field values must call
`_strip_na()` too**, or it will do arithmetic on the string `"NA"` (crash) or treat it as a real
value (silently wrong comparison).

Frontend gotcha this created: a native `<input type="number">` **silently renders blank** when
given a non-numeric value like `"NA"`. Every editable numeric field therefore falls back to
`type="text"` when its value isn't actually numeric (invoice `review.tsx`,
`ContractDerivedFieldsTable.tsx`). If you add a new editable numeric field and it mysteriously
shows empty instead of "NA", this is why.

### 2b. Multi-invoice, multi-FP vendors (`documents.json`)

A vendor with more than one real invoice under one contract (PALLADIUM has 3: Service Charge,
Electricity, Water — each with its own real Faktur Pajak) uses `documents.json` instead of the
plain `invoice_extraction.json`/`fp_extraction.json` pair:

```json
{
  "invoices": [
    {
      "key": "invoice_2",
      "match": [
        "inv_2", "invoice_2", "inv_fp_5", "invoice_fp_5",
        "supporting_doc_inv2", "supporting_doc_electricity_2"
      ],
      "pdf": "invoice_2.pdf",
      "extraction": "invoice_2_extraction.json",
      "faktur_pajak": "faktur_pajak_2.json",
      "faktur_pajak_pdf": "invoice_fp_5.pdf",
      "supporting_document": "supporting_doc_inv2_extraction.json",
      "supporting_document_pdf": "supporting_doc_inv2.pdf"
    }
  ]
}
```

Full recognized key set (anything else in an entry is silently ignored by the loader):
`key`, `match`, `pdf`, `extraction`, `faktur_pajak`, `faktur_pajak_pdf`, `supporting_document`,
`supporting_document_pdf`.

- `key` — this document's stable identifier (`doc.get("document_key")` on the invoice run).
- `match` — aliases `resolve_document()` substring-matches against the normalized UPLOAD filename
  (not the on-disk one) to pick WHICH of the vendor's documents this upload is. Include both the
  on-disk stem (`inv_1`) and every real-world filename fragment the vendor's actual files use —
  the FP PDF (`inv_fp_5`) **and the supporting document** (`supporting_doc_electricity_2`, from the
  real upload name `PALLADIUM_SUPPORTING_DOC_ELECTRICITY_2.pdf`). Cheap insurance, no downside to
  extras. Because dedup is by `(fixture_key, document_key)`, every one of a document's real files
  attaches to the **same** invoice run regardless of upload order, instead of creating strays.
- `faktur_pajak_pdf` / `supporting_document_pdf` — set only when that document is its own separate
  physical PDF rather than a page of the invoice PDF.
- `supporting_document` — see §15.
- `faktur_pajak` — this document's OWN FP data file. `_resolve_faktur_pajak` picks this over any
  bundle-level `fp_extraction.json`, so a multi-invoice folder should never also carry the
  single-invoice-style file (they're mutually exclusive, not layered).
- Naming `faktur_pajak_N.json`/`invoice_N_extraction.json` to match each other by number is a
  convention for readability only — nothing in the loader requires it, `documents.json` is the
  only source of truth for which files belong together.

**Matching each real FP to its real invoice is not guesswork** — do it by amount. PALLADIUM's 3
FPs each have a `vat_amount` that matches exactly one invoice's `vat_gst` (`taxable_amount` may
differ slightly from the invoice's own subtotal when a non-taxable line item like a stamp duty
is folded into the invoice total but excluded from the FP's DPP — a real tax nuance, not a
mismatch to fix). Confirm the pairing arithmetically before writing `documents.json`, the way you'd
verify a payment-schedule installment match.

**A vendor's `matching.json`, `contract_extraction.json`, `contract_field_meta.json`,
`payment_schedule.json`, and `bill_posting.json` all stay bundle-level** (one each, not
per-document) even for a multi-invoice vendor — every document being matched against the SAME
contract is exactly the point. `bill_posting.json`'s line-item defaults array is a real
limitation here, though: it's paired to each document's own `line_items` **positionally by
index**, with no per-document override — so a vendor whose 3 real invoices are 3 genuinely
different charge types (service charge vs. electricity vs. water) cannot get 3 different GL
account codes through the current schema. Pick one reasonable, currency-correct default (real
VAT code, an honest generic GL code) rather than a specific-but-wrong one (e.g. don't default to
a rent GL code for a vendor whose invoices are never actually rent) — and flag the limitation
rather than silently pretending the code differentiates by charge type.

**A schedule-backed installment-match is only as good as the schedule's own coverage.** Palladium's
combined schedule (Rent + Service Charge) has no row at all for Electricity/Water — those are
explicitly metered/consumption-based per the contract's own text, with no fixed recurring amount.
`_match_payment_installment` still returns *something* for them (whichever schedule row is
numerically closest, regardless of how far off), so their own Postprocessing/Matching pages will
show a "matched installment" that reads oddly (an Electricity invoice "matched against Service
Charge — Month 1"). This is real, not a bug to chase down for this vendor: WHT is 0% throughout
Palladium's contract, so the mismatch never actually changes any number that matters, but it's
worth flagging to a human reviewer rather than assuming it's meaningful. A future vendor where
this WOULD change a number that matters (real WHT + genuinely no schedule coverage for some
charge type) would need either a smarter match (a reasonableness/distance threshold) or per-charge-
type schedules — not attempted here since it wasn't needed.

---

### 2c. `combined_uploads` — one file that is several invoices

A vendor can send **one PDF containing several invoices**. GRAHA_MEGARIA does: a 6-page file holding
four invoices, two of them followed by their own supporting-document page. Uploading it must produce
**one run per invoice**, not one run for the file.

Optional `documents.json` key, parsed into `fixtures.DpCombinedUpload`:

| Key | Meaning |
|---|---|
| `match` | aliases substring-matched against the normalised upload filename, exactly like a document's own `match` |
| `documents` | which `invoices[].key` entries this file contains, in the order the runs should be created |
| `label` | human description, for documentation only |

`DpFixtureLoader.resolve_combined_upload()` returns the combined entry **only when its best alias is
longer than any single-document alias** that also matches. That one rule keeps both routes working
off the same folder: `GRAHA_MEGARIA_INV_1.pdf` still resolves to `invoice_1` alone, while
`GRAHA_MEGARIA_INV_1_ALL_6_PAGES.pdf` resolves to all four.

The fan-out runs through `service._create_or_reuse_invoice_run()` — the same function a single-file
upload uses — so the invoice+Faktur-Pajak collapse (§6e) still applies per document. Uploading the
combined file and then the 4 separate FP files yields exactly 4 runs, and so does the reverse order:
the FPs create the runs and the combined file reuses them.

Response shape: `/invoices/upload` and the single-name `/ingestion/trigger-upload` return the bare
run for one result and `{"items": [...]}` for several — the same shape the batch trigger already
used — so `services/directpay.ts`'s `uploadInvoice` normalises both to `DpInvoiceRun[]` with one
`items` check. A vendor with no `combined_uploads` key always yields one run and the old shape.

Verified end to end: combined file alone gives 4 runs; then its 4 FP files all attach, still 4 runs;
FPs first then combined gives 4 runs, reusing them; all 5 names in one batch call gives 4 runs; and
single-file uploads for GRAHA_MEGARIA, PALLADIUM, PT_BANGUN and KARYA_NASTARI still yield exactly 1
run each. All four GRAHA runs then process independently to `posted` with balanced Simulate.

---

### 2d. Uploading several contracts at once

Both contract endpoints take one file or many, one run per file — each is resolved to its own
fixture and extracted separately:

| Endpoint | Single | Batch |
|---|---|---|
| `POST /contracts/upload` (multipart) | one `file` field | the **`file` field repeated** per document (`list[UploadFile]`) |
| `POST /contracts/trigger-upload` (by name) | `{"file_names": "X.pdf"}` | `{"file_names": [...]}` |

**Both trigger endpoints take one payload shape: `file_names` mandatory, `email` and `tag`
optional.** A bare string is coerced to a one-element list by `DpTriggerUploadBase`, so single and
batch are the same request. There is no `file_name` variant any more — it was removed so the two
endpoints could not drift.

Response shape matches the invoice side exactly: the bare run for one result, `{"items": [...]}` for
several, so a client normalises both with one `items` check. `services/directpay.ts`'s
`uploadContract` returns `DpContractRun[]` always.

**Which endpoint the frontend uses is provenance, not transport.** A file the user picked in the UI
always goes to the *manual* endpoint, so the run is recorded `source: "manual"`; the trigger endpoint
is used only for a simulated ingestion (one carrying `email`/`tag`). This used to be decided by file
size — anything over an 8MB threshold was diverted to trigger-upload — which stamped hand-picked
contracts `source: "trigger"` and made the dashboard's source icon show email ingestion for every
real upload, since production contract PDFs are routinely over 8MB. The threshold is gone: every
endpoint resolves its fixture from the file NAME and never reads the bytes, so `nameOnly()` sends the
name alone and size is irrelevant.

**Contracts dedupe by file name, like invoices** — see §2e. An earlier version of this doc said
contracts had no dedupe and that re-uploading one deliberately created another run; that is no longer
true on any of the four upload routes.

On the dashboard the file picker is now `multiple` on both tabs. Contracts go through one call and,
when more than one run comes back, the page reloads the list and reports the count instead of routing
to a single review screen — the same outcome the invoice batch path already had, since there is no
single "the" contract to land on.

Verified: 7 contract files in one multipart request produced 7 runs with 7 distinct `fixture_key`s and
7 distinct ids, each with its own 49-field extraction and its own vendor data; approving three of them
left the other four untouched at `review`. Single-file uploads still return the bare run object on
both endpoints.

---

### 2e. Duplicate detection (all four upload routes)

**Rule: the same file name is refused, on every route, for both document types.** `manual → manual`,
`manual → trigger`, `trigger → trigger` and `trigger → manual` all reject, and matching is
case/whitespace-insensitive (`_normalise_upload_name` strips and lowercases, so
`"  palladium_inv_1.PDF "` is caught).

| | Refused with |
|---|---|
| `POST /invoices/upload`, `POST /contracts/upload` | `409` + the duplicate inline: `{file_name, duplicate, message, existing_invoice_id}` |
| `POST /ingestion/trigger-upload`, `POST /contracts/trigger-upload` | `409` when nothing was created; `200` with a `duplicates: [...]` array when part of a batch succeeded |

This replaced a fingerprint over vendor / invoice number / service period / store location / amounts.
File name is what the requirement asks for and needs no extracted data, so the check works at upload
time before anything has been read.

**`uploaded_file_names` — why `file_name` alone was not enough.** A run holds more than one file:
`file_name` is the invoice's own PDF, while its Faktur Pajak and supporting documents arrive as
separate uploads under their own names, which were never recorded anywhere (`uploaded_artefacts`
stores the artefact *type*, `"companion"`, not the name). While the run was in flight the in-flight
branch in `upload_invoice_documents` absorbed a repeat, but once the run reached `posted`/`rejected`
that branch no longer applies, the name check had nothing to match, and re-sending the FP **created a
phantom run** whose `file_name` was a Faktur Pajak — showing up in the Tracker as a fresh invoice at
extraction stage. Every name a run receives is now recorded in `uploaded_file_names`, and
`find_duplicate_by_filename` matches that list as well as `file_name`.

A side benefit: companions are judged by NAME rather than by the single `"companion"` token, so a
Faktur Pajak and a supporting document both still attach (different names) while the same file twice
is refused — a distinction the type-level check could not make.

**What must still attach, not be refused:** an invoice's FP or supporting document under its own
name, in either order (§6e). Only the invoice's own PDF arriving twice, or a companion arriving
twice, is a duplicate.

**Frontend.** A refused upload is not reported as a failure — the file was read fine and the system
already holds it. `duplicateUploads()` (`services/api.ts`) recognises both 409 shapes and the
dashboard shows `DpNotice`, a top-centre popup naming the file. Two bugs found while wiring this:
`api.postForm` carried its own copy of the error path that passed the whole `detail` OBJECT as the
message (rendering `[object Object]`) and dropped `detail` entirely, so a duplicate was
indistinguishable from a real failure — both verbs now share one `throwApiError`; and a multi-file
batch counted duplicates as failures, so `[dup, new]` reported "1 of 2 uploaded — 1 failed" when
nothing was wrong.

## 3. Contract pipeline

**Status vocabulary**: `review → postprocessing → saved` (postprocessing only runs when the
vendor has a `payment_schedule.json`; otherwise `review → saved` directly — see
`approve_contract`, `service.py:497-514`).

| Stage | Status | Page | Backend |
|---|---|---|---|
| Contract Extraction | `review` | `contract/[id]/review.tsx` | `upload_contract`, `edit_contract`, `approve_contract` |
| Contract Extraction Postprocessing | `postprocessing` | `contract/[id]/extraction-postprocessing.tsx` | `get_contract_extraction_postprocessing`, `approve_contract_extraction_postprocessing` |
| — terminal — | `saved` | (review.tsx renders read-only) | — |

**Contract Extraction** (`review.tsx`): the PDF on the left, `contract_extraction.json`'s fields
on the right (grouped by `contract_field_meta.json`'s `section`, mandatory fields starred).
Editable until saved. "Approve & Save" calls `approve_contract`, which decides the next status
by checking `bundle.payment_schedule` — this is why a payment-schedule vendor needs no per-vendor
code change to get the extra stage.

**Contract Extraction Postprocessing**: surfaces the payment schedule's own rows so a human
confirms them before they start driving invoice Matching. Shown columns
(`_CONTRACT_DERIVED_COLUMNS`): Due Date, **Billing Period Start, Billing Period End**, Total
Amount Before VAT, VAT Rate, Tax Amount, Total Amount (Incl. VAT), WHT Rate, WHT, Net Amount After
WHT, Payment Status — **one full table per installment**, plus a One-Time Payments table for a
vendor whose schedule has that section (deposits, fit-out guarantee). Columns the real tracker
carries for *tracking an already-received invoice* (Invoice Number, Invoice Received Date, Date of
Payment, Amount Paid) are deliberately excluded — no invoice exists yet at contract-approval time,
so those facts aren't knowable here.

**This stage is now EDITABLE (it used to be review-only).** Two consequences that matter when
onboarding a vendor:

- Edits are stored as `postprocessing_overrides` on the contract run
  (`{installments: {<idx>: {...}}, one_time_payments: {<idx>: {...}}}`) — **never written back into
  the fixture**, and never into the invoice (§7 still holds).
- Those overrides are overlaid onto the raw fixture schedule by
  **`_effective_payment_schedule(schedule, contract_doc)`**, which is what every downstream
  consumer must call instead of reading `bundle.payment_schedule` directly — Matching's
  `_apply_mandatory_field_coverage`, `_bill_posting_out`, and `simulate_bill_posting` all do. A
  reviewer's correction here therefore propagates into Matching and Bill Posting. **If you add a
  new consumer of the payment schedule, route it through `_effective_payment_schedule` too**, or
  it will silently compare against stale fixture numbers.

**Both contract stages have edit history.** `edit_history` on `dp_contract_runs`, surfaced via
`GET /dp-api/contracts/{id}/edit-history` and the shared `DpEditHistory` panel ("View Edit
History" on both contract pages). `has_edit_history` on the contract payload drives the button.
Scopes are `"metadata"` (Contract Extraction) and `"installment"`/`"one_time_payment"`
(Postprocessing).

> **In-memory-DB gotcha, cost a real bug:** `find_one()` returns a **live object reference**, not a
> copy, and `update_one()`'s `$push` mutates that same dict. Appending to `edit_history` locally
> *after* an `update_one($push)` therefore double-appends. Always re-fetch (`get_contract_doc` /
> `get_invoice_doc`) instead of hand-mutating the local `doc` — the pattern the original
> `_apply_extracted_patch` already documented and which the contract-side functions initially
> missed.

Both contract pages share one important navigation rule: **reopening a contract from the
dashboard never redirects away from where it belongs.** `review.tsx` renders **read-only** (not
a forced redirect) once `status !== "review"`, with "Next" routing to
`extraction-postprocessing` if the vendor has a payment schedule (whatever the current status),
or straight to the dashboard otherwise. The Postprocessing page mirrors this: it renders
read-only once `status === "saved"` rather than bouncing back to review. (This was a real bug —
see §11.)

---

## 4. Invoice pipeline

**Status vocabulary**: `extraction → extracted → fp_extraction → postprocessing → extracted →
matching → bill_posting → posted`, with `rejected` a possible exit at any point. Note
`"extracted"` appears **twice** — right after raw extraction (not yet confirmed) and again after
Postprocessing completes (ready for Matching). Nothing in the status string itself
distinguishes the two; see §9 for why this matters.

| Stage | Status | Page | Backend |
|---|---|---|---|
| Invoice Extraction | `extraction` → `extracted` | `invoice/[id]/review.tsx` | `upload_invoice`, `extract_invoice`, `edit_invoice`, `confirm_extraction` |
| Faktur Pajak | `fp_extraction` | `invoice/[id]/fp-extraction.tsx` | `get_faktur_pajak`, `acknowledge_fp_field`, `approve_faktur_pajak` |
| Extraction Postprocessing | `postprocessing` | `invoice/[id]/extraction-postprocessing.tsx` | `get_extraction_postprocessing`, `approve_extraction_postprocessing` |
| Matching | `matching` | `invoice/[id]/match.tsx` | `match_invoice`, `acknowledge_finding`, `review_action` |
| Bill Posting | `bill_posting` → `posted` | `invoice/[id]/bill-posting.tsx` | `get_bill_posting`, `edit_bill_posting`, `simulate_bill_posting`, `post_bill` |

**The advance-past-Extraction gate** (`confirm_extraction`, `service.py:691-720`) has two
independent conditions, not one: the invoice must be IDR, AND — separately — each of
`fp_extraction`/`postprocessing` only runs if this vendor actually has the corresponding fixture.
Concretely: an IDR invoice with a real FP document (`bundle.fp_extraction` or
`document.faktur_pajak`, checked via `_resolve_faktur_pajak`) enters `fp_extraction`; an IDR
invoice with **no** FP document but a real `payment_schedule.json` skips FP entirely and enters
`postprocessing` directly (RATNA_INTAN's case); an IDR invoice with neither — or a non-IDR
invoice — stays `extracted`, ready for Matching. Approving FP always advances into
`postprocessing` next (`approve_faktur_pajak`, `service.py:932-958`, harmless even with no
payment schedule — see `get_extraction_postprocessing`'s own `has_payment_schedule=false`
branch); approving Postprocessing lands back at `extracted` either way. **Every stage page's own
"what's next" logic must agree with this** — `review.tsx`'s `handleConfirm` checks for both
`fp_extraction` and `postprocessing` as possible next stops, not just the former.

**Faktur Pajak** compares the FP document's own 4 fields against the **same invoice's own
extraction** (not the contract) — `_FP_INVOICE_FIELD_MAP` (`service.py:850-858`). For PT_BANGUN,
`vendor_name`/`customer_name` are genuine fuzzy-string mismatches (the FP shortens
"PT.Bangun Era Sejahtera" → "BANGUN ERA SEJAHTERA") requiring manual Acknowledge;
`taxable_amount`/`vat_amount` match exactly. `approve_faktur_pajak` takes its own `force` to let
a human proceed past an acknowledged-but-still-mismatched required field — this is the one stage
in the whole pipeline that still has a bypass (contrast with Matching, §9). **A vendor with no
real FP document at all (RATNA_INTAN) simply never enters this stage** — don't author a fake/empty
`fp_extraction.json` to "complete the set"; omitting the file is the correct, honest signal.

Only `vendor_name` and `customer_name` are required (`_FP_REQUIRED_FIELDS`); a
`taxable_amount`/`vat_amount` mismatch is shown amber but never needs Acknowledge and never blocks.

**FP acknowledgements now feed the same DP Acknowledge Threshold learned memory Matching uses.** A
manual ack calls `record_dp_acknowledgement(db, f"fp_{field_name}", …)` — **namespaced `fp_<field>`**
so an FP field never shares learned memory with a same-named Matching checklist field (both have
their own `vendor_name`). Once the same (field, FP value, invoice value) triple has been
acknowledged `ack_threshold` times, the field comes back pre-blessed as `system_acknowledged` and
renders the purple "Auto-approved" badge instead of an ACK button — identical treatment to
`MatchingTable.tsx`'s own system-acknowledged findings.

**ACK is only offered where the comparison column actually has a value.** A required field whose
**invoice-side** value is absent gets no ACK button, isn't counted as blocking, and renders amber
rather than red — there is nothing to acknowledge about a blank. (Matching already enforced this
via `canAck`; FP Extraction did not, and would previously offer an unresolvable ACK and block
Approve forever on a null invoice value.)

**Extraction Postprocessing** derives `due_date`, `wht_rate`, `wht`, `net_amount_after_wht` —
fields the invoice document never prints — from the payment schedule via the installment-matching
mechanism (§6). **Critically, approving this stage does NOT write these values onto the
invoice's own extraction record** (§7) — it's a review/display step only.

---

## 5. Matching

Matching (`match.tsx` + `MatchingTable.tsx`) is a 3-column Field / Invoice / Contract comparison.
Two independent things populate its rows:

1. **Fixture-authored findings** (`matching.json`'s `findings[]`) — genuinely specific anomalies
   like PT_BANGUN's tax-rate warning. Refreshed live against current extracted data on every GET
   (`_refresh_findings_from_extracted`, `service.py:208-223`).
2. **The synthesized core checklist** (`_apply_mandatory_field_coverage`, `service.py:285-376`) —
   a fixed, product-defined set of fields (`CORE_CROSS_VALIDATION_FIELDS`, §8) that ALWAYS shows,
   whether or not the fixture mentions them, so a field that simply matches still appears as an
   ordinary row instead of only surfacing when something's wrong.

An **AI contract recommendation** (`get_contract_recommendation`) runs once per invoice
(idempotent, never re-picks) and auto-applies the best-scoring saved contract when confident —
this is what makes Matching usually open with a comparison already in place instead of an empty
picker. The sparkle banner (`AiContractBanner.tsx`) shows only while the current contract still
traces back to that AI pick; picking a different one from the dropdown clears it.

**Acknowledge vs. nothing** (`MatchingTable.tsx`): a real mismatch (invoice HAS a value, it
disagrees with the contract) gets Acknowledge. A field where the invoice has **no value at all**
gets **no action at all** — not Acknowledge (nothing to confirm about a blank field), and
critically **not a Copy-from-contract action either**. That feature existed earlier this cycle
and was deliberately removed: **no value is ever copied from the contract onto the invoice** —
consistent with the same no-back-populate rule covering Postprocessing (§7).

Two further things live on this page now:

- **The Total Amount Before VAT threshold control** — a tolerance check, on by default at 5%. See
  §14; it changes whether that field blocks approval at all.
- **A provenance ⓘ on the Contract column** — when a row's value came from a supporting document
  rather than the contract, the value renders in the app's AI-derived-value treatment (sparkle +
  italic `#1F5BD5`) with a hover ⓘ explaining the source. Driven by the finding's
  **`expected_source`** field (`"contract"` | `"supporting_document"`). See §15.

---

## 6. The installment-matching mechanism

`_match_payment_installment(schedule, extracted)` (`service.py:747-764`) is the one function that
answers "which installment does this invoice belong to." The payment schedule has **no
invoice-identifying key** (no invoice number column, no unique ID) — the only signal available is
**amount proximity**: it picks whichever installment's `amount_excl_tax` is closest to the
invoice's own extracted `total_amount_before_vat`, falling back to the first installment if the
invoice amount can't be parsed. For PT_BANGUN's installment 1, the invoice's 675,675,676 matches
`amount_excl_tax` **exactly** — an unambiguous match, not a fuzzy guess, in this case.

**Always feed it `_effective_payment_schedule(bundle.payment_schedule, contract_doc)`, never the
raw fixture schedule** — that wrapper overlays the contract's own Postprocessing edits (§3). All
current call sites do.

### 6a. Due-date tie-break

Amount proximity alone cannot separate a schedule that **repeats the same figure**. PAKUWON's has
3 down payments of 30,000,000 and 24 monthly installments of 15,000,000, so invoices 2, 3 and 4 —
genuinely three *different* down payments — all landed on `Down Payment Installment 1 of 3`,
whichever row happened to come first.

`_due_date_tiebreak(schedule, extracted)` fixes that. It recomputes the set of rows that are
**equally** close on amount (within 0.01) and, only if more than one row ties, returns the tie
whose `due_date` **exactly equals** the invoice's own `due_date`. `_matched_installment` tries it
before falling back to plain amount proximity:

```python
return _due_date_tiebreak(schedule, extracted) or _match_payment_installment(schedule, extracted)
```

Three deliberate constraints keep this from guessing:

- **Exact dates only** — no nearest-date fallback. Where the dates don't line up the previous pick
  stands unchanged, so this can only ever *resolve* an ambiguity, never invent a different answer.
- **Exactly one exact match required.** Two rows sharing both amount and due date remain
  ambiguous and are left alone.
- **Ties only.** A single closest-on-amount row is already unambiguous and is never revisited.

`_parse_loose_date` handles the date shapes these fixtures actually print — ISO (`2026-03-20`),
English (`20 August 2025`) and Indonesian month names (`01 Mei 2026`, `10 Agustus 2026`) — and
returns `None` for `"NA"` or anything unrecognised, which simply skips the comparison.

**Two invoice-side dates are tried, in order:**

1. the invoice's own `due_date` — PAKUWON's case, whose due dates coincide with the schedule's;
2. the invoice's `billing_period_start` — GRAHA_MEGARIA's case. It bills
   `Period From : 01-Aug-2026 to 31-Aug-2026` while falling due on 24 July, three weeks *before*
   the schedule row it belongs to. Its 36 monthly rows each fall due on the first day of the month
   they cover, so the billing-period start identifies the row exactly where the due date cannot.

Candidate 2 is a no-op for every other vendor: PT_BANGUN, RATNA_INTAN, PALLADIUM, PAKUWON and
KARYA_NASTARI all leave `billing_period_start` as `"NA"` on every invoice, so it never parses.

Effect on the current five vendors, measured, not assumed:

| Vendor | Invoice | Before | After |
|---|---|---|---|
| PAKUWON | invoice_1 | Monthly Installment 1 of 24 | **Monthly Installment 6 of 24** (due 2026-07-01) |
| PAKUWON | invoice_3 | Down Payment 1 of 3 | **Down Payment 2 of 3** (due 2025-09-20) |
| PAKUWON | invoice_4 | Down Payment 1 of 3 | **Down Payment 3 of 3** (due 2025-10-20) |
| PAKUWON | invoice_2 | Down Payment 1 of 3 | unchanged (already correct) |
| GRAHA_MEGARIA | invoice_1 (Rent) | Monthly Installment 1 of 36 | **Monthly Installment 23 of 36** (due 2026-08-01, via billing period) |
| GRAHA_MEGARIA | invoice_2 (Service Charge) | Service Charge — Month 1 of 36 | **Service Charge — Month 23 of 36** (due 2026-08-01, via billing period) |
| PT_BANGUN, RATNA_INTAN, PALLADIUM, KARYA_NASTARI | all | — | **all unchanged** (no exact date match among ties) |

A manual pin via `PATCH /invoices/{run_id}/matched-installment` still overrides both — the
"Matched against" dropdown's `Pinned` chip wins over any automatic pick.

### 6b. Picker labels are the row heading only

The picker is narrow, so a full schedule description truncated to uselessness —
KARYA_NASTARI's rows rendered as `Installment 1 of 10 (balance 80%) — ES...`.
`_schedule_option_label()` reduces each to its heading by dropping the two kinds of trailing text
that **qualify** a row rather than **identify** it:

- parentheticals — `(balance 80%)`, `(20%, cash upfront)`, `(Year 1-2, upfront)`, `(final)`
- the ` — ESTIMATED` provenance marker

What it deliberately does **not** do is cut at an em dash generally. PAKUWON's
`Promotion Levy — Month 1 of 36` and PALLADIUM's `Service Charge — Month 1 of 24` carry the
distinguishing part after the dash; cutting there would collapse 36 and 24 rows respectively into
identical, unpickable labels. Verified across all five vendors: **no two rows share a label.**

| Vendor | Raw description | Picker label |
|---|---|---|
| KARYA_NASTARI | `Down Payment (20%, cash upfront) — ESTIMATED` | `Down Payment` |
| KARYA_NASTARI | `Installment 1 of 10 (balance 80%) — ESTIMATED` | `Installment 1 of 10` |
| PT_BANGUN | `Installment 1 (Year 1-2, upfront)` | `Installment 1` |
| PALLADIUM | `Rent — Monthly Installment 1 of 12` | *(unchanged)* |
| PAKUWON | `Promotion Levy — Month 1 of 36` | *(unchanged)* |

`ESTIMATED` provenance is not lost — the **Contract Derived Fields** table still renders every
description verbatim, and `payment_schedule_options.label` is consumed by nothing but this picker.

### 6c. The picker is locked for utility invoices

A **utility** invoice is billed on actual metered consumption, so the contract's payment schedule
has no counterpart row for it at all and the backend already returns
`matched_installment_index: null` (`_has_no_schedule_charge`, §8a). Pinning a row would assert a
match that doesn't exist, so on Matching the "Matched against" dropdown is **disabled**, its chip
reads `N/A` instead of `Auto`/`Pinned`, and its placeholder reads "Not applicable (billed on
actuals)". That placeholder is the only explanation shown — deliberately no hover tooltip on
either the chip or the control. The contract-side figure for these comes from a supporting
document instead (§15).

The frontend decides this from the same criterion as the backend — **any** line item with
`charge_type` in `{utility_electricity, utility_water}` (`invoiceKind`, which also drives the
Rent/Utility badge). The two are deliberately identical, so the lock never hides a row the
backend would actually have matched. Affected invoices today: PALLADIUM invoice_2/invoice_3,
PAKUWON invoice_5/invoice_6, KARYA_NASTARI invoice_3.

### 6d. Bill Posting defaults resolve by charge type, then by position

`bill_posting.json`'s `line_items` seed each invoice line's G/L account and VAT/WHT codes. They were
matched to the invoice's line items **positionally** (`default_items[idx]`), which works only while a
vendor's invoices all share a charge-type layout.

GRAHA_MEGARIA breaks that: it bills Rent, Service Charge, Electricity and Water as **four separate
invoices, each with exactly one line item**. Every one of them reads `line_items[0]`, so all four
would post to the same G/L account.

`_bill_posting_out` now builds a `charge_type -> default` map and prefers it, falling back to the
positional pairing:

```python
item_defaults = (
    defaults_by_charge_type.get(item.get("charge_type"))
    or (default_items[idx] if idx < len(default_items) else {})
)
```

Purely additive — a fixture whose defaults don't name a matching `charge_type` behaves exactly as
before. Verified across all six vendors and all 24 billable line items: **the only three whose ERP
coding changed are GRAHA_MEGARIA's own** service-charge, water and electricity lines. PALLADIUM's
utility invoices still fall through to its single `service_fee` default (`6200-SVC`), and
KARYA_NASTARI's invoice_3 utilities still fall through positionally, both unchanged.

This one function is reused everywhere a "which installment" answer is needed:

- **Invoice Postprocessing** (`get_extraction_postprocessing`) — to show due_date/wht_rate/wht/
  net_amount_after_wht for display.
- **Matching's contract-column values** (`_resolve_contract_value`, `service.py:264-282`, via
  `_INSTALLMENT_MATCH_FIELD_MAP`) — Total Amount Before VAT / Tax Amount / WHT / Net Amount After
  WHT have no single flat contract field to compare against (that's what `base_fee` would be for
  a plain monthly-rent lease) — the real per-installment figures come from here instead.
- **Matching's invoice-column fallback** (same function, `_SCHEDULE_FIELD_MAP`) — since WHT/Net
  Amount After WHT are never written back onto the invoice (§7), the Invoice column falls back,
  **display-only**, to the same matched installment's own figures, so the two columns can still
  be compared side-by-side instead of one showing blank forever.
- **Bill Posting** (`_bill_posting_out`, `service.py:1133-1148`) — same fallback, for
  `wht_amount` and `payable_amount` (net-of-WHT), so Simulate's WHT deduction journal line and
  the Metadata grid's "Payable Amount" aren't silently wrong.

**Design consequence worth knowing**: because both the Matching page's Invoice-column fallback
AND its Contract-column value are sourced from the *same* matched installment for WHT/Net Amount
After WHT, those two rows will always show as matching by construction — they're not two
independent facts being compared, they're the same number surfaced twice. This was a deliberate,
explicit decision (the user considered and rejected removing the whole mechanism — see §11) —
not an oversight.

---

### 6e. Re-uploading a document: the invoice+FP collapse is scoped to in-flight runs

An invoice and its separately-uploaded Faktur Pajak resolve to the **same** `document_key`
(`GRAHA_MEGARIA_INV_1.pdf` and `GRAHA_MEGARIA_INV_FP_3.pdf` are both `invoice_1`), so
`upload_invoice` attaches the second file to the first one's run rather than creating a duplicate
dashboard row whose FP stage could never resolve.

That lookup originally matched on `fixture_key` + `document_key` alone — **no status filter, no
recency** — so it could not tell "the FP partner of the run I just created" from "a deliberate
re-run". Every later upload of either file returned the very first run forever, even after it was
`posted`: six uploads of a pair produced one run stuck at `extraction`. Single-invoice folders
(PT_BANGUN, RATNA_INTAN) have no manifest, so `document` is `None`, the branch is skipped, and they
always created a new run per upload — the two halves of the module disagreed.

The lookup is now scoped to a run that is still **in flight**, newest first:

```python
cursor = dp_invoice_runs(db).find({
    "fixture_key": bundle.key,
    "document_key": document.key,
    "status": {"$nin": list(TERMINAL_STATUSES)},   # ("posted", "rejected")
}).sort("created_at", -1)
```

A finished run has no Faktur Pajak stage left to attach anything to, so a later upload of the pair
legitimately means "process this document again" and starts a fresh run. Note `bill_posting` is
**not** terminal — a run that has reached Bill Posting but hasn't been posted is still in flight and
still collapses.

Verified end to end:

| Step | Result |
|---|---|
| Pair uploaded twice while run 1 is at `extraction` | **1 run** — FP still attaches |
| Run 1 driven to `posted`, pair uploaded again | **new run**, distinct from the posted one |
| Third pair while the new run is in flight | collapses onto it |
| A **rejected** run, then re-upload | **new run**, and its FP attaches to that new run |

### 6f. Extraction is one-way: a re-upload must not walk the status backwards

**Symptom:** Matching shows the AI-matched banner, "All fields are complete. You're good to go!",
and a green Balanced variance bar, but Approve fails with
`400 {"detail":"This invoice is not at the Matching stage"}`.

**Cause — a three-part interaction, not a single bug:**

1. `dashboard.tsx`'s two upload paths call `/extract` **unconditionally** right after an upload.
   (`review.tsx` and `fp-extraction.tsx` both guard on `status === "extraction"`; the dashboard
   does not.)
2. `upload_invoice` deliberately returns the **same in-flight run** when an invoice or its Faktur
   Pajak is uploaded again (§6e). So re-uploading a pair whose run had already reached Matching fed
   that already-matched run straight back into `/extract`.
3. `extract_invoice` then set `status: "extracted"` unconditionally — dragging the run backwards out
   of `matching`.

From there it could never recover: `contract_id` was already set, so the Matching page's
`get_contract_recommendation` short-circuited on `contract_already_set` and never called
`match_invoice` again — and `match_invoice` is the **only** thing that sets `status: "matching"`.
The page still rendered every row correctly (findings are synthesized from the fixture and the core
checklist regardless of status), so the UI looked completely ready while `review_action`'s
`status != "matching"` gate rejected the approval.

**Fix:** `extract_invoice` is now a one-way stage advance, the same rule `confirm_extraction` already
documents for itself. It still refreshes `base_extracted` / `supporting_document`, but only sets the
status when the run is still at `extraction`:

```python
set_fields = {"base_extracted": ..., "supporting_document": ..., "updated_at": _now()}
if doc.get("status") == "extraction":
    set_fields["status"] = "extracted"
```

Fixed at the backend rather than by guarding the dashboard's call, so no caller — present or future
— can walk a run backwards.

Verified: a GRAHA_MEGARIA invoice+FP pair driven to Matching, then re-uploaded **three** more times
(each upload followed by the dashboard's unconditional `/extract`), stays at `matching` throughout
and approves to `bill_posting` and then `posted`. Before the fix the second upload alone was enough
to wedge it.

> `review_action`'s approve deliberately has **no `force`** — Matching's mandatory checklist "can
> never be bypassed, only fixed or acknowledged", unlike the Faktur Pajak stage's own approve. A 409
> `needs_confirmation` here is the normal "still has open issues, approve anyway?" dialog and is not
> related to this bug.

### 6g. Revenue-share contracts: the reference is COMPUTED, not looked up

Every other vendor's Total Amount Before VAT reference is a figure that exists somewhere — a schedule
row's stored amount, or a supporting document's actual. A **revenue-share** contract has neither: the
amount due is a percentage of the outlet's own reported sales, so the reference has to be computed
from **one value in each**:

| Input | Source |
|---|---|
| Revenue Share % | the matched schedule row's `revenue_share_pct` — i.e. the contract derived fields |
| Net Sales | the supporting document's `net_sales` — the sales report's own Sales (Ex. PB1) less Biaya Ojol less Discount |

```python
_REVENUE_SHARE_CHARGE_TYPES = {"revenue_share"}

def _revenue_share_reference(doc, installment):
    net_sales = (doc.get("supporting_document") or {}).get("net_sales")
    pct = (installment or {}).get("revenue_share_pct")
    ...  # returns None when either input is missing — never a partial guess
```

Three properties worth keeping:

- **It fires only for an invoice that actually carries a `revenue_share` line**
  (`_is_revenue_share_invoice`), so a revenue-share vendor's *other* invoices — DEBORA_KEMANG's flat
  monthly IPL fee — are matched against their own schedule the ordinary way and never run through the
  percentage formula.
- **Both inputs required.** A missing % or a missing sales report leaves the reference blank, and
  because `total_amount_before_vat` is in `_ALWAYS_BLOCKING_FIELDS` the row holds for manual review
  rather than falling back to something plausible.
- **Computed live, not stored.** Editing the % at Contract Extraction Postprocessing moves the
  reference immediately, which is the point of it being a derived field.

The finding carries `expected_source: "revenue_share"` plus a `revenue_share: {pct, net_sales}` block,
so `MatchingTable.tsx` renders the value in the same derived treatment a supporting-document value
gets (sparkle + italic) with a hover ⓘ that spells out the derivation and links to **both** the sales
report and the contract schedule. Matching's invoice-kind badge gains a third state, **Revenue
Share**, since neither "Rent" nor "Utility" describes it.

Two supporting changes came with it, both additive:

- `_schedule_row_category()` gained **Revenue Share** and **IPL Fee** groups. DEBORA_KEMANG runs two
  parallel 60-month schedules and both would otherwise fall through to "Rent", making the picker's
  120 rows unreadable.
- `_contract_derived_columns()` appends **Revenue Share %** and **Reported Net Sales** to the
  Postprocessing table, positioned immediately before Total Amount Before VAT so the row reads as the
  calculation — but **only** for a vendor whose schedule actually carries them, so nobody else gains
  two permanently-NA columns.
- `vat_applicable` is now read from `bill_posting.json` (defaulting to the previous RATNA_INTAN
  hardcode), because DEBORA_KEMANG is the second vendor that charges no VAT at all.

See `DIRECTPAY_VENDOR_RULES_DEBORA_KEMANG.md` for the vendor's own numbers, including the IPL
gross-up that deliberately fails Matching.

### 6h. Contract recommendation: the date criterion measured the wrong thing

**Symptom:** uploaded on its own, GRAHA_MEGARIA invoice 2 matched its own contract. Uploaded in a
batch alongside every other vendor's contract, it matched **PALLADIUM's**.

The scorer only misbehaves when several contracts are saved, which is why single-vendor testing never
caught it. With all 7 saved:

| Candidate | vendor_name | billing_date | amount | composite |
|---|---:|---:|---:|---:|
| PALLADIUM (wrong) | 0.390 | **0.997** | *skipped* | **0.698** |
| GRAHA_MEGARIA (right) | **0.950** | **0.000** | 0.308 | 0.652 |

Two defects combined:

1. **`_score_date` was backwards.** It scored the DISTANCE between the invoice's billing start and the
   contract's `actual_start`, decaying to zero over a year. For a multi-year lease that is exactly
   wrong — an invoice for month 23 of 36 is *supposed* to be far from the start. GRAHA's lease began
   2024-10-16, so its own Aug-2026 invoice scored **0.000**, while PALLADIUM's contract start
   (2026-07-31) happened to land one day from that invoice's billing period and scored **0.997** on
   pure coincidence.
2. **A candidate is rewarded for missing data.** Weights renormalise over whichever criteria apply, so
   PALLADIUM — which has no `base_fee` — skipped the `amount` criterion entirely and renormalised over
   0.75, while GRAHA carried a genuine but low amount score (a monthly rent compared against a
   service-charge total) over the full 1.00.

**Fix:** the date criterion now asks *does the invoice fall inside the contract's term?* using
`actual_start`..`lease_expiry_date`. Inside scores 1.0; outside decays by the distance to the nearest
end. It also falls back to `invoice_date` when the invoice states no billing period — most do not, so
the criterion previously never applied to them at all and the weakest signals decided the match.

Defect 2 is left as-is: with the date criterion no longer inverted, vendor name dominates as it
should, and every invoice now matches correctly. It remains a latent weakness — a candidate with
sparse fields can still out-average a fully-populated one — worth revisiting if another mismatch
appears.

Verified across the full matrix, all 20 invoices scored against all 7 saved contracts:
**before 19/20, now 20/20** pick their own vendor's contract. The batch upload that reproduced the
bug (`all_in_one_go/`: the 6-page invoice PDF + 4 FP files, with all 7 contracts saved) now yields
4 runs, all matched to GRAHA_MEGARIA, with invoice 2 on `Service Charge — Month 23 of 36`.

> Note on that folder: its `GRAHA_MEGARIA_INV_1.pdf` is the unsplit 6-page file, but the name matches
> the `inv_1` alias, so it resolves to invoice_1 alone rather than fanning out (§2c). The other three
> runs get created by the FP uploads instead, so the end state is the same 4 runs. Rename it to
> `GRAHA_MEGARIA_INV_1_ALL_6_PAGES.pdf` (or any `combined_uploads` alias) if you want the fan-out
> itself to create them.

---

## 7. The "no back-populate" rule

**Nothing computed or copied is ever written into an invoice's own extraction record
(`base_extracted`/`edited_extracted`).** This governs:

- `approve_extraction_postprocessing` — computes derived fields for display, never calls
  `_apply_extracted_patch` with them (`service.py:815-835`, see its own comment).
- The Matching page's Copy-from-Contract feature — **removed entirely** (backend function,
  router endpoint, request model, and frontend button/prop all deleted).

**Why**: the payment schedule is a different document from the invoice (the *contract's* own
records), linked to a given invoice only by amount proximity (§6) — not a verified fact the
invoice itself states. Writing it into the invoice's canonical extraction would silently
fabricate data the invoice never actually contained, violating this project's absolute rule
(§2) just as much as inventing a fixture value would.

**Consequence for downstream consumers**: anywhere that reads `extracted.get("wht")` or
`extracted.get("net_amount_after_wht")` directly will **always get `None`** for an
installment-type vendor. Every such consumer (Matching's `_apply_mandatory_field_coverage`,
`_bill_posting_out`) must independently fall back to `_match_payment_installment(...)` — this
was a real bug fixed twice this cycle (once for Matching, once for Bill Posting) after the
back-populate removal; see §11.

**Exception, not a contradiction**: manual edits a human types directly into the Extraction
page's own form still flow through `_apply_extracted_patch` and DO persist (with full
edit-history) — the rule is specifically about *automated* derivation/copying from another
document, not a ban on all writes.

---

## 8. Field mapping / core checklist

`field_mapping.py` has two distinct tables — don't confuse them:

- **`FIELD_MAPPINGS`** (22 rows) — a *reference/documentation* table mirroring the real product's
  validation logic (fuzzy/exact/range/derived/arithmetic match types, tolerances). Informational
  only; nothing computes findings from it.
- **`CORE_CROSS_VALIDATION_FIELDS`** — the actual authority for what Matching always shows and
  what can block approval:

**Current checklist (7 rows — this table has churned a lot; verify against
`field_mapping.py` before relying on it):**

| Invoice field | Contract field | Label | Mandatory |
|---|---|---|---|
| `vendor_name` | `vendor_name` | Vendor Name | **yes** |
| `vendor_bank_account_name` | `lessor_bank_account_name` | Bank Account Name | no |
| `vendor_bank_account_number` | `lessor_bank_account_number` | Bank Account Number | no |
| `vendor_address` | `premises_address` | Store Location | **yes** |
| `billing_period_start` | *(none — installment-matched, Contract column only)* | Billing / Service Period Start | no |
| `billing_period_end` | *(none — installment-matched, Contract column only)* | Billing / Service Period End | no |
| `total_amount_before_vat` | `base_fee`* | Total Amount Before VAT | **yes** |

\* `base_fee` is only used when `_resolve_contract_value` finds no matched installment (a vendor
with no payment schedule); for an installment vendor it's superseded by the installment's
`amount_excl_tax`. A literal `base_fee == 0` is treated as "no contract figure" rather than
"expected zero", and so is the string `"NA"` (§2a).

**Removed from the checklist entirely** (not just de-mandated — they no longer appear on Matching
at all): `vat_gst` (Tax Amount), `wht`, `net_amount_after_wht`. `tax_rate` is likewise not a
checklist field (it only appears when a vendor's `matching.json` authors a finding for it, as
PT_BANGUN's tax-rate anomaly does). Billing Period Start/End were removed in an earlier round and
have since been **re-added as non-mandatory**.

Historical note worth keeping: `vat_gst` was first made non-mandatory (before later being dropped)
because RATNA_INTAN exposed a real deadlock — mandatory field + contract has a value + invoice
genuinely has none = no resolution path, since Acknowledge only ever shows when the invoice HAS a
value and Copy-from-contract was removed. **Any future mandatory field can recreate that deadlock
the same way**; the fix is to make it non-mandatory (or supply the missing side from a real
document, as §15 now does for utilities), never to fabricate the invoice-side value.

**A field with `contract_field=None` and no installment match still always shows** — just with
nothing to reconcile against (an informational amber row, never mandatory, never blocking).

### 8a. Vendor-specific override registry — check this when a new vendor misbehaves

Several behaviours are keyed to a **set of vendor keys** or **charge types**. These are the
switches to look at first when a new vendor's Matching/Bill-Posting output looks wrong, and the
place to add your vendor if it's the same real-world situation. All in `service.py`:

| Constant | Current value | Meaning / when to add a vendor |
|---|---|---|
| `_NO_STORE_LOCATION_MATCH_VENDORS` | `{RATNA_INTAN, PT_BANGUN}` | The invoice states the **vendor's own registered/personal address**, not the leased premises, so comparing it against the contract's `premises_address` is meaningless. Invoice side is blanked and the row is never mandatory. **Add a vendor here only if that's genuinely true of its invoice** — a mall operator (PALLADIUM/PAKUWON/KARYA_NASTARI) whose registered address *is* the building must NOT be added; that comparison is valid for them. Both underlying values stay untouched in the fixtures — only the comparison is suppressed. |
| `_RATNA_INTAN_NO_VAT_FIELDS` | `{vat_gst, tax_rate}` | A vendor that genuinely charges **no VAT** (individual, non-PKP landlord). Excluded from every schedule-derived fallback so no VAT breakdown is fabricated. Note `total_amount_before_vat` was **removed** from this set once RATNA_INTAN's schedule was corrected to real no-VAT figures — it *is* a meaningful comparison now. Still literally named for one vendor; generalize to a set if a second no-VAT vendor appears. |
| `_NON_RENT_CHARGE_TYPES` | `{service_fee, utility_electricity, utility_water}` | Gates the "invoice is X higher/lower than the schedule — likely a rate/consumption change" reasoning detail, so a genuine *rent* mismatch isn't mislabelled with it. |
| `_NO_SCHEDULE_CHARGE_TYPES` | `{utility_electricity, utility_water}` | Metered charges with **no payment-schedule counterpart at all**. `_match_payment_installment` would otherwise return a numerically-closest but meaningless row. The contract side falls back to a **supporting document** if one exists (§15), else blank. |
| `_NO_SCHEDULE_BLANK_FIELDS` | `{total_amount_before_vat}` | Which fields the above applies to. |
| `_ALWAYS_BLOCKING_FIELDS` | `{total_amount_before_vat}` | Stays mandatory/blocking even with nothing on the contract side — "no backup document to verify" is a reason to stop, not to wave through. |
| `NO_ACK_FIELDS` (`MatchingTable.tsx`) | `{total_amount_before_vat}` | No Acknowledge shortcut at all — a mismatch here must be genuinely fixed (or cleared by the §14 threshold), never acknowledged away. |
| `vat_applicable` (`_bill_posting_out`) | `False` for `RATNA_INTAN` | Hides the whole VAT/GST Tax Code column on Bill Posting and suppresses Simulate's Input VAT row (§10). |

**Charge types are the preferred lever over vendor keys.** Four of the eight above key off
`charge_type` on the invoice's own line items, which generalizes to any vendor for free — prefer
adding a charge type to authoring a new vendor-keyed branch wherever the real distinction is
"what kind of charge is this" rather than "who is this vendor."

---

## 9. Mandatory-field & approval-gating rules

**Matching's approve is a hard rule with no bypass.** `review_action` (`service.py:1042-1084`)
raises `NeedsConfirmationError` (HTTP 409) whenever `has_open_issues(...)` is true — there is
**no `force` parameter anywhere in this call path** (removed from the Pydantic model, the router,
the service function, and every frontend call site). This is deliberately different from Faktur
Pajak's own `approve_faktur_pajak(force=...)`, which does let a human proceed past an
already-acknowledged-but-still-mismatched field.

`has_open_issues` only considers **mandatory, unresolved, unacknowledged** findings
(`service.py:423-442`). "Resolved" (`_is_finding_resolved`, `service.py:226-254`) checks the raw
extracted value first, then falls back to comparing the already-formatted `found`/`expected`
display strings — this second check exists *specifically* so WHT/Net Amount After WHT (whose
`found` value is itself a fallback, never real extracted data — see §6/§7) can still resolve.
**This backend check and the frontend's own `isFindingResolved` (`MatchingTable.tsx`) must stay in
sync** — they diverged once this cycle (frontend fixed, backend forgotten) and produced a
permanent approve deadlock: the UI showed "All fields complete" with Approve enabled, yet the
backend still 409'd forever, since nothing could ever acknowledge a row the UI already considered
resolved. See §11.

**Acknowledge only appears when there's a genuine value to compare** (`MatchingTable.tsx`
`canAck`): contract must have a value (`expected_value != null`) AND the invoice must have a
value (`hasInvoiceValue`) AND they must actually differ (`!resolved`). Neither-side-empty or
either-side-empty rows get no action at all.

---

## 10. Tax codes (VAT / WHT)

- **VAT**: real SAP codes, sourced live from P2P's own reference endpoint
  `GET /api/v1/vat-codes?currency=` (`backend/scripts/vat_codes.json`, no auth dependency, public
  data) — called directly from `directpayService.getVatCodes(currency)`. For PT_BANGUN (IDR),
  this resolves to the real `IB` code (11%).
- **WHT**: **no real Indonesian WHT/PPh code table exists anywhere in this codebase.** P2P's own
  `WHT_OPTIONS` are exclusively Philippine BIR EWT codes with no Indonesian analog. `DP_WHT_OPTIONS`
  in `bill-posting.tsx` is a **self-authored, correctly-labeled proxy** —
  `PPH4(2)-SEWA` (PPh 4(2) final tax on land/building rental, 10%) — added via an optional
  `whtOptions` prop on the shared `BillPostingTable.tsx` (defaults to P2P's own list, so P2P's
  page is completely unaffected by this addition). Flag this explicitly to anyone extending
  Bill Posting for a new vendor: **there is no verified source for this code**, only a reasonable
  domain-appropriate guess.

**A no-VAT vendor has no VAT column at all.** For RATNA_INTAN, `_bill_posting_out` returns
`vat_applicable: false` and blanks every line item's `vat_tax_code`; the frontend passes
`isVendorSubjectToVat` into the shared `BillPostingTable.tsx` (a new **optional** prop defaulting
to `true`, mirroring the existing `isVendorSubjectToWht` — so P2P's own page is unaffected), which
drops the VAT/GST Tax Code column entirely. `simulate_bill_posting` correspondingly never emits its
"Input VAT (recoverable)" row for such a vendor, which keeps Debit = Credit. The fixture's
`bill_posting.json` also has its `vat_tax_code` removed rather than left as a stale `"IB"`.
**For a new no-VAT vendor**: drop `vat_tax_code` from its `bill_posting.json` *and* extend the
`vat_applicable` condition (currently a literal `fixture_key == "RATNA_INTAN"` check — generalize
it to a set at that point).

---

## 10a. WHT: the line-item override

VAT is derived from the invoice; WHT is normally derived from the contract. Where the contract states
**no** withholding there is nothing to derive from, so the reviewer applies it by hand from the
line-item WHT dropdown, and everything downstream follows that selection live.

**One rate per invoice.** Per explicit instruction the rate is invoice-level even though the control
sits on each row, so `handleWhtChange` propagates a change to **every** line and
`_selected_wht_rate()` reads the first coded line. Rows can therefore never display different codes
while a single rate is being applied.

**Where the rate lives.** `service._WHT_CODE_RATES` and `bill-posting.tsx`'s `WHT_RATES` — two maps
that must stay in sync, the same mirroring convention `validateTaxCodes` already follows. The rate is
**not** parsed out of the option label (`"… SEWA TANAH DAN/ATAU BANGUNAN 10%"`); that is display text
and must never become a calculation input.

**What the selection resolves to**, in `_bill_posting_out`:

| Selected | Result |
|---|---|
| `00 · No Withholding` (rate 0) | WHT = **0**, whatever the data says |
| a real rate, and the documents state no withholding | WHT = **rate x Taxable Amount** |
| a real rate, and the documents state one | the **document's own figure** is kept |

The third row protects source fidelity: PT_BANGUN, RATNA_INTAN and DEBORA_KEMANG all print a real
withholding, and it would be wrong to replace a printed figure with a recomputation of itself.
"The documents state no withholding" deliberately includes an explicit **zero** — a contract with no
WHT clause still yields `wht_amount: 0.0` on every schedule row (GRAHA_MEGARIA, PALLADIUM, PAKUWON,
KARYA_NASTARI), and those four are exactly the population this override exists for. An early version
tested `is None` alone and the dropdown was a silent no-op for all of them.

`wht_from_document` is returned alongside `wht_amount` so the frontend's live preview applies the
identical rule instead of trying to infer the baseline from an already-adjusted figure.

**What moves with it — and what does not.** The selection shows up in **Simulate only**: it gains or
loses the **WHT credit** row, with the **AP credit** reduced to match (Simulate derives that itself as
`grand_total - wht_amount`, so it always balances; line-item debits stay **gross**).

**Neither metadata amount is derived from the WHT rate.** Both were wrong at some point and both are
now fixed:

- **Taxable Amount is the invoice's own pre-VAT total, never netted by the withholding.** WHT is
  withheld from the *payment*; it does not reduce the taxable base. PT_BANGUN reads **675,675,676**
  at any rate — an earlier version showed 608,108,108 (675,675,676 − 67,567,568), which was the same
  netting the user had already rejected once and it was reintroduced by accident while building this
  control. Do not net it.
- **Payable Amount follows the rate ONLY when the invoice states no net figure of its own.** Where
  the invoice prints one it is authoritative and never moves: DEBORA_KEMANG invoice 2 = 15,000,000,
  RATNA_INTAN = 770,000,000. Where it does not (`net_amount_after_wht` is `"NA"` — PT_BANGUN,
  GRAHA_MEGARIA, DEBORA_KEMANG invoice 1), payable is gross minus the WHT in effect. The payload
  carries `payable_from_document` so the frontend preview applies the same rule rather than guessing.

  This ordering matters: the pre-existing payable computation earlier in `_bill_posting_out`
  subtracts the *pre-selection* `wht_value`, which is 0 for a revenue-share row, so on its own it
  left DEBORA invoice 1 at the gross 21,759,425 instead of 19,583,482.50.

Because payable now follows, metadata Payable Amount and Simulate's AP credit agree in every case —
GRAHA_MEGARIA invoice 1 with 10% applied reads 9,905,918.40 on both sides.

**Nothing persists until Post to ERP.** The selection lives in React state (`lineEdits`); `data` is
the untouched server response and is never mutated, so it *is* the in-memory original. Reverting to
"No Withholding" recomputes straight off it and Taxable Amount lands back on its starting value with
no trace of the intermediate rate. Simulate used to `PATCH` the codes before computing, which broke
that guarantee — it now sends them in its own request body (`DpBillPostingSimulateRequest.line_items`)
and `simulate_bill_posting` merges them into a **copy** of the run. Verified: three simulations at
10% / 0% / 10% leave the stored document byte-identical.

**Superseded rule.** `_validate_bill_posting_tax_codes` no longer rejects a WHT code on a vendor whose
contract says WHT does not apply — that was an earlier explicit instruction, and manual discretion is
the direct opposite of it. `bp["wht_applicable"]` is now `fixture default OR a rate is selected`, so
a deliberate selection makes WHT applicable and posting succeeds. Both VAT directions, and the
"subject to WHT but nothing selected" error, are untouched.

Verified end to end (rate 10% -> 0% -> 10%, then Post):

| Vendor | Documents state WHT? | 10% selected | Reverted to 0% | Taxable Amount | Payable |
|---|---|---|---|---|---|
| GRAHA_MEGARIA inv 1 | no (0.0) | WHT **980,784** computed | WHT row gone | 9,807,840 throughout | 10,886,702.40 → **9,905,918.40** (derived) |
| DEBORA_KEMANG inv 1 | no (revenue share) | WHT **2,175,942.50** computed | WHT row gone | 21,759,425 throughout | **19,583,482.50** (derived) |
| DEBORA_KEMANG inv 2 | yes (1,666,666) | document figure kept | WHT row gone | 16,666,666 throughout | 15,000,000 fixed by the document |
| PT_BANGUN | yes via installment (67,567,568) | document figure kept | WHT row gone | **675,675,676 throughout** | 682,432,432 (derived) |
| RATNA_INTAN | yes (85,555,556) | document figure kept | WHT row gone | 855,555,556 throughout | 770,000,000 fixed by the document |

Every posting balanced, and posting a manual 10% on GRAHA_MEGARIA (a `wht_applicable: false` vendor)
persisted 340,550 on a 3,405,500 base and succeeded.

---

## 10b. Auto-Process (STP)

**It was broken, and the cause was a mis-reading of P2P.** `directpay/stp.py`'s own docstring
asserted that "P2P's STP does NOT auto-drive an uploaded invoice all the way through
matching/bill-posting either", and scoped DirectPay's cascade to *run extraction, then stop*. The
claim is false: `api/v1/stp.py`'s `_cascade_validation()` auto-approves every stage in
`STAGE_SEQUENCE` and `_auto_post_bill()` then posts the bill to Zoho/QBD. So the toggle looked
functional while doing nothing the Extraction screen wouldn't have done by itself.

### What P2P actually does

| | |
|---|---|
| Triggered by | upload (`ingestion.py`), trigger-upload, email ingestion — **and as a resume** whenever a human approves `fp_extraction` / `metadata_validation` / `line_item_matching` (`stages.py:255`), guarded so the STP actor can't re-trigger itself |
| Cascade | waits for each stage to reach `in_review`, then calls the real `approve_stage()` as an STP actor; skips already-approved stages, which is what makes resume work |
| Holds on | `ai_recommendation_pending_review`, `line_items_pending_review`, `mandatory_fields_missing`, `stage_not_ready` |
| Then | `_auto_post_bill()` posts to the ERP |
| Publishes | `stp_state` = processing → done \| waiting_review, which the dashboard uses to disable Review while it runs |
| Pacing | 5s after extraction, 3s between stages |

### What DirectPay now does

`_cascade_dp_invoice()` drives the same shape over DP's own stages, each step gated on the run's
current status so it is safe to re-enter:

1. `extraction` → `extract_invoice`
2. `extracted` and not yet confirmed → `confirm_extraction` (which itself advances to
   `fp_extraction` when the vendor has an FP)
3. `fp_extraction` → `approve_faktur_pajak` **without `force`**
4. `extracted` with no contract → `get_contract_recommendation` (the same lazy auto-apply the
   Matching screen performs on load)
5. `matching` → `review_action("approve")`
6. `bill_posting` → `post_bill`

**Every hand-off reuses the stage's own approve function**, so Auto-Process can never be more
permissive than a human clicking the same button: the gate that 409s a person raises here and the
cascade holds, recording why on the run.

| Reason | Meaning |
|---|---|
| `faktur_pajak_mismatch` | a required FP field mismatches and isn't acknowledged |
| `no_contract_matched` | no saved contract scored high enough to auto-apply |
| `matching_open_issues` | a mandatory Matching field is unresolved (`has_open_issues`) |
| `tax_code_invalid` | VAT/WHT codes don't apply to this vendor |
| `extraction_failed` | the cascade itself raised |

### The resume hook DirectPay was missing entirely

Nothing but the upload ever called `run_dp_stp_for_invoice`, so a hold was a **dead end**: automation
stopped for a mismatch, the reviewer cleared it, and nothing picked the invoice back up.
`resume_dp_stp_if_enabled()` is now called from the three human-facing approve handlers
(`confirm-extraction`, `faktur-pajak/approve`, `validate/review-action`), placed **after** the 409
guard so a held stage never triggers a resume, and only from the router — never from the cascade —
so it cannot recurse.

Verified end to end with Auto-Process on:

```
PT_BANGUN        extraction -> extracted -> fp_extraction   HOLD faktur_pajak_mismatch
  human acks the 2 FP name mismatches, approves
                 -> extracted -> matching                   HOLD matching_open_issues
  human acks vendor_name, approves
                 -> bill_posting -> posted                   stp_state=done, ERP bill stamped

GRAHA_MEGARIA 1  -> fp_extraction                            HOLD faktur_pajak_mismatch
DEBORA_KEMANG 2  -> (no FP) auto-matched contract -> matching HOLD matching_open_issues
```

Both holds are correct: those vendors' FP vendor/customer names are genuinely shortened variants
needing acknowledgement, and DEBORA inv 2 genuinely breaches the tolerance (§10a). With the DP
Acknowledge Threshold's learned memory, a repeat of the same mismatch becomes
`system_acknowledged` and a later run of the same vendor passes those gates without a human.

### Upload behaviour with Auto-Process on

The uploader no longer waits or navigates. Previously the dashboard polled `waitForExtraction()` and
then pushed the user to the Extraction screen even with Auto-Process on — which fought the cascade
for the same work and dropped the reviewer onto a stage automation was about to leave.

Now, exactly as P2P's own dashboard does: **stay on the dashboard, no loader, no hand-off.** The row
reports progress itself from `stp_state`, with a local `stpProcessingIds` lock covering the moment
before the server publishes the first state (released once `stp_state` settles, or on a terminal
status as a fallback — the same mechanism and auto-clear as P2P's). The frontend no longer calls
`/extract` at all when Auto-Process is on; the cascade owns it. `waitForExtraction()` is deleted —
it existed only to block the uploader for work that is now server-side.

> **Consequence worth knowing:** with Auto-Process on, approving Matching posts the bill
> immediately, so the reviewer never lands on Bill Posting — which means the line-item WHT override
> (§10a) is bypassed. P2P behaves identically (approving `line_item_matching` auto-posts). Turn
> Auto-Process off to work the Bill Posting screen by hand.

### Clearing a hold sends the reviewer back to the dashboard

The backend resume was only half the loop: a reviewer who cleared a hold was still walked forward
through the stages by the frontend, landing on a screen the cascade was already completing behind
them.

All three DirectPay stage pages now do what P2P's own already do — check the toggle after a
successful approve and, with Auto-Process on, `router.push("/directpay/dashboard")` instead of
advancing:

| Page | Action | With Auto-Process on |
|---|---|---|
| `review.tsx` | Confirm Extraction | → dashboard (cascade continues from Faktur Pajak) |
| `fp-extraction.tsx` | Approve & Continue | → dashboard (cascade continues to contract match + Matching) |
| `match.tsx` | Approve | → dashboard (cascade posts the bill itself) |

Each wraps the check in its own `try/catch` and falls through to the normal stage navigation if the
settings call fails, so a flaky read can never strand the reviewer. With Auto-Process off, every page
navigates exactly as before.

Verified as one continuous loop, GRAHA_MEGARIA invoice 1 with Auto-Process on:

```
upload (reviewer stays on the dashboard)
  -> fp_extraction        HOLD faktur_pajak_mismatch
reviewer acks + Approve & Continue   (page redirects to the dashboard)
  -> matching             HOLD matching_open_issues      [resumed unattended]
reviewer acks + Approve              (page redirects to the dashboard)
  -> bill_posting -> posted   stp_state=done, ERP bill DP-BILL-FEDCC9   [resumed unattended]
```

### Open limitation: learned acks can't clear a blocking Matching finding

`_apply_dp_ack_memory()` skips any finding with `severity == "error"`. Everything that actually
blocks Matching **is** an error (a mandatory field that mismatches), so the DP Acknowledge Threshold
is effectively inert there: a vendor whose mismatch was acknowledged 3 times still stops the cascade
on the 4th invoice.

The Faktur Pajak stage has no such filter (it counts `fp_<field>` memory directly), which is why a
repeat vendor now sails through FP unattended but still holds at Matching. Verified: with the
threshold set to 1 and one prior manual pass, a second PT_BANGUN invoice auto-cleared Faktur Pajak
and then held at `matching_open_issues` on `CORE-vendor_name` (severity `error`,
`system_acknowledged_findings: []`).

Left as-is deliberately — auto-clearing a hard error is a policy decision, not a bug fix. Removing
the severity filter would make Auto-Process able to run a known vendor end to end with no human at
all.

---

### 10c. Auto-Process for contracts (ungated)

The same global toggle also cascades contracts: `_cascade_dp_contract` /
`run_dp_stp_for_contract` (`stp.py`) drive `review → postprocessing → saved` with no checks at all.
Unlike the invoice cascade there is nothing to validate a contract against — no counterpart document
— so it never holds and always lands on `saved`; `stp_state` therefore only ever reads `processing`
then `done`, never `waiting_review`.

The visible delay is deliberate: it is what makes processing look like it is happening.
`contract_extraction_pause_s(pages)` scales it with the contract's real page count (from
`fixtures.page_count()`, parsed at byte level and cached), **capped at 6s** so a long lease doesn't
stall the demo.

### 10d. Notifications (FreshDesk ticket replies)

Every automatic notification is a **reply on the originating FreshDesk ticket** — not a fresh email
from `sales@neoflo.ai`, which is the retired path. Threading is inherent: replies land on the ticket,
so a run's notifications are one conversation by construction, with none of the
Message-ID/`threadId` bookkeeping an email thread needs.

| Notification | `kind` / `stage` | Fires from |
|---|---|---|
| Duplicate refused | `duplicate_rejected` | the upload routes (§2e) |
| Acknowledgement needed | `action_required` / `faktur_pajak_mismatch` \| `matching_open_issues` | entering the FP stage, entering Matching, **and** the Auto-Process hold |
| Reviewer escalation | `escalation` / `matching` | the Escalate button |
| Posted | `posted` / `bill_posting` | `post_bill` |

**The ticket id comes from the trigger-upload payload's `tag`** (`_dp_ticket_id` strips non-digits, so
`"81234"`, `"#81234"` and `"FD#81234"` all work). **No tag means NO notification, of any kind, with
no fallback** — a manual upload has no originating ticket, so there is no conversation to reply into
and nobody who asked to be told.

Three rules live in `_dp_notify` so no caller repeats them: no ticket → nothing; idempotent per
`(kind, stage)` (the cascade is re-entrant via `resume_dp_stp_if_enabled` and would otherwise re-post
on every resume); and never fatal — a FreshDesk failure is logged and swallowed, since posting a bill
must not depend on FreshDesk being reachable. The client retries with backoff (3 attempts, 1s/3s) but
**not on 4xx except 429**, because a closed ticket or bad id won't improve.

`action_required` fires in **both** modes. It was originally wired only into the Auto-Process hold,
so with Auto-Process off an invoice could sit at Matching with unacknowledged mismatches and nobody
was ever told. The condition that matters is "acknowledgement needed", not "the cascade stopped", so
it is now hooked to the stage *transitions* (`match_invoice`, and `confirm_extraction`'s move into
`fp_extraction`) via `_notify_if_action_required`. Hooking the Matching *screen* instead would
re-send on every page open, because findings are recomputed on each GET; a re-match onto a different
contract is likewise silent, being the same stage and the same conversation.

Escalation is **one-shot** — a second attempt returns `{"sent": false, "reason": "already_escalated"}`
— and the reasons are distinguished so a send failure can't be mistaken for "no recipient":
`no_ticket`, `already_escalated`, `send_failed`.

**The request field is `body`, not `body_html`.** `body` takes HTML and FreshDesk renders it in the
ticket and in the email to the requester. `body_html` is a field FreshDesk *returns* on a
conversation; sending it is rejected with
`400 {"field": "body_html", "message": "Unexpected/invalid field in request"}` — which this client
correctly does not retry, so every notification failed silently with nothing posted. See §11.11 for
why the test suite missed it.

---

## 11. Notable bugs already fixed (learn from these when extending)

These aren't historical trivia — each one is a **pattern that will recur** the moment a new
computed/fallback value touches more than one page:

1. **FP Faktur Pajak used a stale `taxable_amount`** (619,369,370, from an old "DPP Nilai Lain"
   calculation) instead of the real tracker value (675,675,676) — fixed by re-sourcing from the
   authoritative CSV, and the stale `ai_match_reasoning` note that explained the wrong number was
   also removed rather than left to mislead a future reader.
2. **Matching/backend resolved-check drift**: frontend's `isFindingResolved` was extended to
   handle the installment-fallback case; the backend's `_is_finding_resolved` was not updated in
   the same pass, producing a permanent Approve deadlock (§9). **Whenever a resolved/matched
   check changes on one side, check the other immediately** — there is no automated sync between
   frontend TS and backend Python for this logic.
3. **Bill Posting silently dropped WHT** after the no-back-populate change, because
   `_bill_posting_out` read `extracted.get("wht")` directly (always `None` now) instead of falling
   back through `_match_payment_installment` the way Matching already did. "Payable Amount" fell
   back further to the gross total, silently hiding the WHT deduction. **Any new field added to
   the installment-matching fallback must be propagated to every consumer, not just Matching.**
4. **Extraction page's "already confirmed" check used the wrong signal.** It originally checked
   `!contract_id` (only set at Matching, several stages later) to decide whether to show
   "Confirm Extraction" vs. "Next" — meaning it kept showing the active toolbar long after a
   human had already confirmed and moved through FP + Postprocessing. Status alone can't fix this
   either, because `"extracted"` is reused for two different moments (§4). Fixed with an explicit
   one-way `extraction_confirmed` flag, set once by `confirm_extraction` and never unset.
5. **A hardcoded "Next" destination** (`/match`) on the Extraction page ignored the invoice's
   actual current stage — reaching this button from an invoice still at `fp_extraction` or
   `postprocessing` would jump straight past those stages. Fixed by extracting the dashboard's
   own stage-routing logic (`invoiceRoute`) into `frontend/src/utils/directpayRoutes.ts` so every
   page's "Next" button and the dashboard's own row-click agree on where an invoice belongs —
   **any new stage page's "Next" should use this shared helper, not a hardcoded route.**
6. **A back-navigation loop on the Contract Postprocessing page**: its own guard force-redirected
   away whenever the contract was already `"postprocessing"` (an attempt to avoid "duplicating"
   the read-only view), which meant clicking Back from that page bounced straight back to it.
   Fixed by rendering read-only (not redirecting) once a stage is behind you — the same
   `isActionable`/read-only split every other DirectPay page already used correctly.
7. **Ambiguous test uploads**: uploading a fixture PDF under its on-disk generic name
   (`contract.pdf`) resolves to whichever vendor bundle the loader hits first, not the intended
   one — always rename to a real vendor-prefixed filename before testing an upload flow.
8. **Backend dev server without `RELOAD=true` silently serves stale code.** Several of the fixes
   above appeared not to work on first test, purely because the running `main.py` process had
   been started without the reload flag and was serving code from before the edit. Always confirm
   `RELOAD=true` before trusting a "the fix didn't work" result — restart if unsure, don't debug
   the logic first.
9. **A vendor with no FP document forced through `fp_extraction` anyway** (RATNA_INTAN) — the
   original gate was IDR-only, with no check for whether an FP document actually existed. Fixed by
   checking `_resolve_faktur_pajak(bundle, document)` before entering that stage, falling through
   to `postprocessing` (if a payment schedule exists) or straight to `extracted` otherwise. Every
   page that reasons about "what stage comes next after Extraction" needed the same three-way
   branch added (`review.tsx`'s `handleConfirm`) — a two-way `fp_extraction` vs. everything-else
   check silently skipped Postprocessing for a no-FP vendor.
10. **A WHT-deduction line item double-counted against the dedicated WHT-Payable row.**
    RATNA_INTAN's real invoice has two line items — the rent charge, and a separate negative
    "Pemotongan PPH" (WHT deduction) line, exactly as printed on the source document. PT_BANGUN
    never had this because its invoice only ever had one line item (WHT was purely a derived
    field, never a real line). `simulate_bill_posting` debited every raw line item AND separately
    added its own WHT-Payable credit row computed from `wht_amount` — the same deduction counted
    twice, producing an "unbalanced document" error. Fixed by excluding any line item whose
    `charge_type == "wht_deduction"` from `_bill_posting_out`'s own `line_items` (which both the
    Bill Posting table AND Simulate read from) — the dedicated WHT/Payable-Amount figures already
    represent it. **The fixture keeps the real line item (don't drop real data) — the derived
    views just filter it out of the per-charge debit accounting.**
11. **"Payable Amount" silently borrowed the WRONG invoice's total.** `_bill_posting_out` computed
    a missing `payable_amount` as the matched installment's own `net_payment_to_lessor` directly —
    that figure is the SCHEDULE's assumed total for that period, not necessarily THIS invoice's
    real total. PT_BANGUN and RATNA_INTAN never exposed this because both happened to have an
    invoice total that exactly equalled their matched installment's total (masking the bug).
    PALLADIUM's real per-sqm rate differs slightly from the schedule's assumed rate (real invoice
    total 7,250,530 vs. the matched installment's own total 6,954,530), and `wht_applicable=false`
    made it obvious: Payable Amount showed 6,954,530 instead of the correct 7,250,530 (the true
    total minus zero WHT). Fixed by always computing `payable_amount` as THIS invoice's own real
    `total_amount` minus `wht_value` (whether `wht_value` is real or itself an installment
    fallback) — never borrowing the installment's total wholesale. **Any "derive X from the closest
    schedule row" fallback should compute FROM this invoice's own real figures wherever one exists,
    only falling back to the schedule's own value for the piece that's genuinely never on the
    invoice (WHT itself) — not for pieces (the total) the invoice already states correctly.**
12. **Double-appended edit-history entries** — the in-memory DB's `find_one()` returns a live
    reference and `update_one($push)` mutates it in place, so also appending locally afterwards
    wrote every entry twice. Re-fetch instead of hand-mutating (§3).
13. **Contract Postprocessing edits didn't reach Matching or Bill Posting.** `postprocessing_overrides`
    were applied only on the Postprocessing page's own display; every other consumer still read the
    raw fixture schedule. Fixed with `_effective_payment_schedule` threaded through
    `_apply_mandatory_field_coverage`, `_bill_posting_out`, and `simulate_bill_posting` (§3/§6).
14. **A fixture-only fix was impossible for the Store Location comparison**, and proving that
    mattered. `_refresh_findings_from_extracted` unconditionally overwrites a pre-authored
    finding's `found` with the live `extracted` value whenever that value is non-null — so
    authoring `found: null` in `matching.json` cannot blank a field that has real underlying data.
    The correct fix was the comparison-suppression override (§8a), leaving both real values
    untouched. **When a fixture edit appears not to take effect, check whether a refresh/derive
    step is overwriting it before assuming the fixture is wrong.**
15. **A percentage stored two different ways.** `vat_rate`/`wht_rate` were a mix of `0.11` and `11`
    across fixtures and formatters, so some screens showed `1100%`. Standardized on **whole
    numbers** everywhere, with the `*100` removed from the formatters.
16. **A stale vendor-specific exclusion outlived the data it was written for.** RATNA_INTAN's
    `total_amount_before_vat` was excluded from contract-side comparison because the schedule's
    `amount_excl_tax` was then a VAT-backed-out estimate. Once the schedule was corrected to real
    no-VAT figures, the exclusion silently kept the Matching row blank/blocking. **A vendor
    override written to compensate for imperfect fixture data must be revisited whenever that data
    is corrected** — grep §8a's constants for the vendor key after any schedule change.
17. **The threshold check was dead for exactly the invoices that needed it** — placed after the
    non-rent-charge branch, so every utility/service-charge invoice bypassed it (§14.1).
18. **Existing runs don't retroactively pick up fixture edits.** `base_extracted` (and now
    `supporting_document`) are snapshotted at extract time into the in-memory DB. After editing a
    fixture, an already-uploaded invoice keeps its old values — re-upload to get a fresh run rather
    than debugging why the change "didn't work."
19. **A hover card clipped at the viewport bottom.** The supporting-document ⓘ card always opened
    downward, so rows near the page bottom cut it off; it now flips above when there isn't room,
    anchored by `bottom` (not a computed `top`) so the flip stays exact regardless of card height.
    Its earlier right-edge position also sat underneath the floating Neo widget and was unclickable
    — inline affordances in the last table column need to account for that overlay.
20. **A stub that agreed with the code instead of the API.** Every FreshDesk notification 400'd in
    production while the whole test suite passed, because the request used `body_html` and the API
    only accepts `body` — and the mock server had been written to accept `body_html` too. The tests
    were validating an assumption about the API, not the API. **A stub you wrote cannot confirm a
    contract you guessed**: exercise the real endpoint once, even destructively, or assert the
    contract from its own error responses. The mock now rejects `body_html` and requires a non-empty
    `body`, exactly as the live API does, so this cannot pass again.
21. **Fabricated money on un-extracted rows.** The Tracker showed amounts for invoices that had
    never been extracted: `_match_payment_installment` does `float(None)` on a missing amount,
    raises `TypeError`, and its `except` returns `installments[0]` — inventing a figure from the
    first schedule row. Guarded by a `has_extraction` gate; any new surface that reads
    `_bill_posting_out` before extraction needs the same gate.
22. **Provenance decided by transport.** The frontend chose its upload endpoint by file size, and
    the endpoint is what records `source` — so a hand-picked file over 8MB came back stamped
    `"trigger"` and the dashboard showed email ingestion for a manual upload (§2d). Contracts were
    worse: they posted to trigger-upload unconditionally, so the manual icon could never appear.
23. **A notification wired to the wrong condition.** `action_required` was hooked to the
    Auto-Process hold rather than to "acknowledgement needed", so with Auto-Process off the trail
    stopped after the upload acknowledgement and never resumed (§10d).

---

## 12. Checklist: onboarding another installment-type vendor

1. Gather real source documents: the lease PDF, the invoice/Faktur Pajak PDF, and — critically —
   a **real payment schedule** (tracker spreadsheet, amendment schedule, whatever the source of
   truth is). Without a genuine payment schedule, don't fabricate one; this whole workflow
   depends on it being real.
2. Create `fixtures/dp/<VENDOR_KEY>/` with `contract.pdf`, `invoice.pdf`.
3. Transcribe `contract_extraction.json` + `contract_field_meta.json` directly from the lease —
   cross-check every number against the source at least twice (render the PDF at high DPI /
   parse the underlying spreadsheet XML if `openpyxl` isn't available) before writing it down.
   Where a field is genuinely absent from the source, write **`"NA"`** (not `null`, not `0` —
   §2a) and explain why in `ai_match_reasoning` — never infer. Percentage fields (`vat_rate`,
   `wht_rate_pct`) are **whole numbers** (`11`, not `0.11`).
4. Transcribe `invoice_extraction.json` from the actual invoice — including line items. If the
   invoice itself shows a WHT deduction as its own line item (RATNA_INTAN's "Pemotongan PPH"),
   include it verbatim with `charge_type: "wht_deduction"` — that charge_type is what
   `_bill_posting_out` filters out of Simulate/the Bill Posting table so it doesn't double-count
   against the dedicated WHT-Payable figure (§11.10). Don't omit the real line item to avoid this —
   the filtering is the fix, not the omission.
5. If a Faktur Pajak exists as a separate document (or a section of the same PDF): author
   `fp_extraction.json`. **If it doesn't exist for this vendor, simply omit the file — do not
   author a placeholder/empty one.** `confirm_extraction` now checks for a real FP document
   before ever entering that stage (§4) — a vendor with no FP genuinely skips it and lands
   straight on Postprocessing (if a payment schedule exists) or Matching-ready `extracted`
   (if not), with no empty review screen to click through.
6. Author `payment_schedule.json` — one row per real installment, with the exact column set
   PT_BANGUN's has (`due_date`, `amount_excl_tax`, `vat_rate`, `vat_amount`,
   `total_amount_incl_tax`, `wht_rate`, `wht_amount`, `net_payment_to_lessor`, `payment_status`).
   This one file is what makes both Postprocessing stages and the Matching/Bill-Posting fallbacks
   activate automatically — no code changes needed.
7. Author `matching.json` with only genuinely fixture-specific findings (anomalies particular to
   this vendor/invoice) — do NOT try to re-author the core checklist rows; those are synthesized
   automatically from `CORE_CROSS_VALIDATION_FIELDS` (§8) for every vendor.
8. Author `bill_posting.json` with the correct GL account code and `wht_applicable`. Reuse the
   real VAT code from `/api/v1/vat-codes` for this currency; for WHT, either reuse
   `PPH4(2)-SEWA` if it's genuinely another land/building rental, or explicitly flag to the user
   that no real code exists yet for a different WHT category (§10) rather than inventing one.
9. Upload-test with a **correctly vendor-prefixed filename** (not the generic on-disk name),
   and walk the full pipeline end-to-end (contract review → postprocessing → saved; invoice
   extraction → FP → postprocessing → matching → bill posting → posted), verifying at each step
   that displayed values trace to the real source and that nothing was silently back-populated.
10. If this vendor's contract has NO payment schedule (a plain monthly-rent lease, not
    installment-type), simply omit `payment_schedule.json` — `approve_contract` and every
    consumer already branch on its absence (`bundle.payment_schedule` is `None`) and fall back to
    the plain `base_fee`-based comparison with zero extra code.
11. If this vendor has MORE THAN ONE real invoice under the same contract (§2b), author
    `documents.json` instead of the plain `invoice_extraction.json`/`fp_extraction.json` pair —
    one `invoice_N_extraction.json` + `faktur_pajak_N.json` per real document, matched to each
    other by amount (a real FP's `vat_amount` should match exactly one invoice's `vat_gst`).
    `contract_extraction.json`, `payment_schedule.json`, `matching.json`, and `bill_posting.json`
    all stay bundle-level, shared across every document.
12. If this vendor has TWO real payment schedules (e.g. Rent + a separately-scheduled Service
    Charge), combine both into ONE `payment_schedule.json` `installments` list — the amount-
    matching mechanism (§6) will naturally pick whichever schedule an invoice's amount is actually
    closest to. Don't build two separate schedule files; nothing in the code reads more than one.
13. **If any of this vendor's invoices is a utility billed "on actuals"** (no fixed amount anywhere
    in the contract): give that line item a `charge_type` in `_NO_SCHEDULE_CHARGE_TYPES`
    (`utility_electricity` / `utility_water`), and author a supporting-document fixture for it
    (§15). Without the supporting document that row is a permanent unresolvable error; without the
    right `charge_type` the supporting document is ignored.
14. **Check §8a's override registry against this vendor's real situation** and add its key only
    where the real-world fact genuinely applies:
    - Invoice states the vendor's own address rather than the leased premises →
      `_NO_STORE_LOCATION_MATCH_VENDORS`. (Do NOT add a mall operator whose registered address
      really is the building.)
    - Vendor genuinely charges no VAT → the `_RATNA_INTAN_NO_VAT_FIELDS` treatment **and**
      `vat_applicable` in `_bill_posting_out` **and** drop `vat_tax_code` from its
      `bill_posting.json` (§10). Both of those are currently hardcoded to `RATNA_INTAN` — generalize
      them to a set rather than adding a second `==` comparison.
15. Sanity-check the **Total Amount Before VAT threshold** (§14, on by default at 5%) against this
    vendor: with it on, a small invoice-over-contract overage will pass as informational rather
    than blocking. If that's wrong for this vendor, that's a product decision to raise — don't
    silently special-case it.
16. Verify nothing regressed for the existing vendors. The cheapest real check is a scripted
    end-to-end pass per vendor (contract trigger-upload → approve → invoice trigger-upload →
    extract → match), asserting the Matching findings' `found`/`expected`/`severity`/`mandatory`
    — several bugs in §11 were only visible cross-vendor.

---

## 13. Quick file map

**Backend** (`backend/src/directpay/`):
- `service.py` — all business logic (contracts, invoices, FP, postprocessing, matching, bill
  posting, simulate). Read top-to-bottom in the order stages actually run.
- `router.py` — thin HTTP layer, one route per `service.py` function.
- `field_mapping.py` — `FIELD_MAPPINGS` (reference) + `CORE_CROSS_VALIDATION_FIELDS` (authority).
- `fixtures.py` — `DpFixtureLoader`/`DpFixtureBundle`/`DpDocumentEntry`, the discovery/resolution
  algorithm and the `documents.json` manifest loader.
- `models.py` — Pydantic request bodies.
- `contract_recommendation.py` — the AI auto-match scorer (not detailed in this doc).
- `stp.py` — Auto-Process for invoices AND contracts (§10b, §10c). **Also holds all
  DirectPay-scoped persisted settings** — STP toggle, Ack Threshold, and the
  Total-Amount-Before-VAT threshold (§14) — each a keyed row in the shared `app_settings`
  collection.
- `store.py` — the four DP collections: `dp_invoice_runs`, `dp_contract_runs`,
  `dp_contract_recommendations`, `dp_field_acknowledgement_memory`, and their indexes.

**Shared services** (`backend/src/services/`) — used by DirectPay, some shared with P2P:
- `freshdesk_client.py` — `reply_to_ticket` (§10d). One operation, retry with backoff, never raises.
- `google_auth.py` — the ONE cached OAuth access token. Gmail and Drive run off the same OAuth app
  and the same refresh token (three scopes: `gmail.send`, `gmail.modify`, `drive`), so they must not
  each keep their own cache.
- `drive_client.py` — `upload_pdf`, `find_in_folder`, `check_access` (§17).
- `email_templates.py` — the DP notification bodies (`directpay_payment_scheduled_html`,
  `directpay_action_required_html`, `directpay_escalation_html`,
  `directpay_duplicate_rejected_html`).

**Frontend** (`frontend/src/`):
- `services/directpay.ts` — all types + API client methods; the single source of truth for
  status unions.
- `utils/directpayRoutes.ts` — `invoiceRoute()`, the shared stage-routing helper.
- `pages/directpay/dashboard.tsx` — Invoices/Contracts list, status tags, row routing, the
  manual-vs-email source icon (§2d) and the duplicate popup (§2e).
- `pages/directpay/tracker.tsx` — the Tracker (§16), with `components/directpay/dpTableUi.tsx`
  (shared list primitives), `DpFilterPanel.tsx` and `utils/trackerCsv.ts`.
- `components/directpay/DpNotice.tsx` — the top-centre upload notice. Deliberately NOT the shared
  `ui/Toast`: that one is styled from the platform's semantic tokens (a solid `surface-warning` fill
  whose values are dark-oriented) and sits bottom-right, which reads as a foreign element on
  DirectPay's white, Ant-flavoured screens.
- `pages/directpay/contract/[id]/review.tsx`, `extraction-postprocessing.tsx`.
- `pages/directpay/invoice/[id]/review.tsx`, `fp-extraction.tsx`,
  `extraction-postprocessing.tsx`, `match.tsx`, `bill-posting.tsx`.
- `components/directpay/MatchingTable.tsx`, `ContractExtractionModal.tsx`,
  `ContractDerivedFieldsTable.tsx`, `AiContractBanner.tsx`, `DpBillPostingMetadataGrid.tsx`,
  `DpEditHistory.tsx` (shared by invoice + both contract stages, scope tabs per caller),
  `TotalBeforeVatThresholdControl.tsx` (§14).
- `components/BillPosting/BillPostingTable.tsx` — **shared with P2P**; DirectPay only ever
  extends it via optional props (`whtOptions`, `isVendorSubjectToVat`), never edits its default
  behavior. Both props default to P2P's existing behavior.

---

## 14. The Total Amount Before VAT threshold (tolerance check)

A configurable tolerance for the one always-blocking money field, so an invoice that runs slightly
above the contract/reference amount doesn't have to be an error.

**Rule**: passes when
`invoice_total_before_vat <= reference_amount × (1 + threshold_pct / 100)`.

| | |
|---|---|
| Persisted | `app_settings` key `directpay_total_before_vat_threshold`, value `{enabled, threshold_pct}` |
| Default | **enabled, 5%** |
| API | `GET`/`PATCH /dp-api/settings/total-before-vat-threshold` (not admin-gated, unlike the STP/Ack-Threshold settings — this one is a per-review control) |
| UI | `TotalBeforeVatThresholdControl.tsx`, rendered on the Matching page above the table (switch + % input + Save/Discard, with an Enabled/Disabled badge) |
| Backend | a branch in `_apply_mandatory_field_coverage` |

Behaviour when it passes: `severity: "info"`, `mandatory: false` — so the row **stops blocking
approval**. When it fails: `severity: "error"`, `mandatory: true`. When disabled, the branch is
never entered and behaviour is byte-for-byte what it was before the feature existed.

**Two ordering/wording subtleties that were real bugs:**

1. **The threshold branch must be evaluated BEFORE the non-rent-invoice diff branch.** It was
   originally placed after, so for a Service Charge / Electricity / Water invoice (i.e. every
   PALLADIUM utility invoice — exactly the ones most likely to need a tolerance) the non-rent
   branch matched first and the threshold silently never applied. Once enabled, the threshold is
   the authoritative check for this field **regardless of invoice type**.
2. The detail text says "supporting document amount + X%" instead of "contract amount + X%" when
   the reference came from a supporting document (§15) — there is no contract amount in that case.

---

## 15. Supporting documents (utilities billed "as per actuals")

**The problem**: a contract can specify a billing *rule* without a billing *amount*. PALLADIUM's
lease says electricity is *"actuals via dedicated KWH meter, tenant pays monthly consumption"* —
so there is no fixed figure anywhere in the contract or its payment schedule to match an
electricity invoice against. Previously such a row fell into `_ALWAYS_BLOCKING_FIELDS` with nothing
on the contract side: a permanent, unresolvable hard error.

**The fix**: a *supporting document* (the utility company's own bill) supplies the actual amount.

- **The contract still governs the RULE; the supporting document only supplies the AMOUNT.** It
  never replaces or overrides the contract.
- **Fixture shape** — one tiny JSON per document, only ever the one field:
  ```json
  { "total_amount_before_vat": 4390312.30 }
  ```
  Wired in via `documents.json`'s `supporting_document` (+ optional `supporting_document_pdf`)
  keys (§2b). Current examples: `supporting_doc_inv2_extraction.json` (Electricity, 4,390,312.30)
  and `supporting_doc_inv3_extraction.json` (Water, 319,990.00).
- **No extraction UI, by design.** Unlike Invoice/FP/Contract extraction there is no upload flow,
  no review screen, and no stage for this. `extract_invoice` persists the value onto the invoice
  run as `supporting_document` at the same moment it sets `base_extracted` — a stable snapshot,
  not a live fixture read.
- **Where it's consumed**: `_apply_mandatory_field_coverage`. When a charge is in
  `_NO_SCHEDULE_CHARGE_TYPES` and the run has a `supporting_document` value for the field, that
  value becomes the Contract-column reference amount (instead of blanking); otherwise it blanks
  exactly as before.
- **Transparency**: the finding carries `expected_source: "contract" | "supporting_document"`, and
  Matching renders a supporting-document value in the AI-derived-value treatment (sparkle + italic
  `#1F5BD5` + hover ⓘ) so it's obvious the number under the "Contract" header didn't come from the
  contract.
- **Upload filenames** must be added to that document's `match` aliases — e.g.
  `PALLADIUM_SUPPORTING_DOC_ELECTRICITY_2.pdf` → alias `supporting_doc_electricity_2` on the
  `invoice_2` entry. Dedup is by `(fixture_key, document_key)`, so uploading the supporting doc
  attaches to the same invoice run whether it arrives before or after the invoice itself.

**To add one for a new vendor**: author the one-field JSON, point `documents.json`'s
`supporting_document` at it, add the real upload filename to `match`, and ensure the invoice's own
line item carries a `charge_type` that's in `_NO_SCHEDULE_CHARGE_TYPES` (else the schedule-based
path is used and the supporting document is ignored).

---

## 16. The Tracker

`GET /dp-api/tracker` → `pages/directpay/tracker.tsx`. A flat, one-row-per-invoice register of the
whole pipeline, **from the first stage onward** — not a record of finished work. It lists invoices at
every status (`find({})`, no status filter), so a row appears the moment an invoice is uploaded and
updates as it progresses.

**Columns** (in render order): Invoice Number, Invoice Date, Invoice Received Date, Vendor Name,
Description, Taxable Amount, VAT Amount, Status. Values are left-aligned, headers evenly spaced, and
the table scrolls horizontally within its own container so the page body never scrolls sideways.

**Where the values come from.** The invoice's **extracted data**, not its file name — and a
reviewer's edit is reflected immediately, because the Tracker reads the same
`base_extracted` + `edited_extracted` merge every other surface reads. Money comes from
`_bill_posting_out`, so Taxable/VAT/WHT/Payable agree with Bill Posting rather than being recomputed.

**Two things a pre-extraction row must get right.** `has_extraction` gates every money column — see
§11.21, where its absence let the fabricated-installment bug print invented figures on rows that had
never been extracted. And unknown-vs-absent stays distinguishable: `—` means "not known yet", while
`"NA"` means the document genuinely doesn't state it (§the `_strip_na` convention).

**Filters**: Contract, Vendor, Status, Invoice Date, Invoice Received Date, Payment Due Date, plus
search and amount range. Each date column has its own preset mode (Today / Last 7 / Last 30 /
custom). Two traps, both fixed: preset arithmetic must be done in **local** midnight, not UTC, or
"Today" is off by one for part of the day (`localDay()`); and the filter panel's own button must not
sit inside the outside-click handler's target test, or the click closes and immediately reopens it —
the test is against the panel's *positioning parent*.

**Download CSV** exports exactly what the filters currently show, via `utils/trackerCsv.ts`.

`list_tracker` hoists `get_dp_loader().discover()` once for the whole request; it used to run one
disk scan per row. (`list_invoices` still does two per row — a known, unfixed cost.)

---

## 17. File standardisation & Google Drive upload

After extraction settles, an invoice's documents are renamed to a standard convention and uploaded to
the `Kopi_Non_PO_docs` shared drive.

**Naming**: `[VendorName]_[InvoiceNo]_[DocType]`, where DocType is Invoice, Faktur Pajak or
Supporting Document — charge-type-aware where a vendor bills several (e.g.
`..._Utility Invoice - Admin Fee`), vendor names normalised (dots stripped, title-cased) and `/`
replaced with `-` so an invoice number like `BES-FAK/VII/2026/002` is a legal filename. The
pre-split, correctly-named set lives in `fixtures/dp/drive_uploads/` (45 PDFs + `manifest.json`);
`_drive_documents_for(doc)` resolves a run to its entries.

**When it fires** — two triggers, so an FP is never uploaded mid-stage:
- `confirm_extraction`, but only `if doc.get("status") != "fp_extraction"` — an invoice with no FP
  stage has everything settled at that point.
- `approve_faktur_pajak`, for one that does.

**Drive specifics that cost time to discover:** the full `drive` scope is required, not
`drive.file` — the latter grants access only to files the app created or the user picked via Google
Picker, and a backend service has no Picker, so a hand-made shared-drive folder is unreachable.
`supportsAllDrives=true` is needed on **every** call, and searching also needs
`includeItemsFromAllDrives` + `corpora=allDrives`; without them Drive reports a folder that plainly
exists as "not found", which reads like a wrong ID and isn't. A shared drive's own ID doubles as its
root folder ID, and that root reports its name as the literal string `"Drive"` — `check_access`
therefore also fetches `drives/{driveId}` so the diagnostic names the destination a human
recognises. A Content manager can trash but not permanently delete (`canDelete: false`,
`canTrash: true`).

`settings.drive_api_base` is a test seam for pointing the client at a local stub; it is never set in
normal operation.

---

## 18. Clearing DirectPay data

`DELETE /dp-api/data` → `service.reset_dp_data`, surfaced as **Clear DirectPay Data** in the admin
Workflow Settings page (DirectPay group, styled as a danger action with a two-step confirm that
relaxes after 6s). Admin-gated like the other DP settings: `401` unauthenticated, `403` for a member.

Empties all four DP collections and returns per-collection counts, so the UI reports what it actually
removed. The same clean slate a backend restart gives — the demo DB is in-memory — but **scoped to
DirectPay**, which is the entire reason it exists rather than telling someone to restart the server:
P2P's `pipeline_runs` / `invoices` / `executed_stages` / `field_acknowledgement_memory` survive.

Two deliberate decisions:
- **Learned acknowledgements ARE cleared.** They change how *future* invoices behave — a remembered
  mismatch is auto-approved and never reaches the reviewer — so leaving them behind would make a
  "clean" demo silently skip the acknowledgement step it is meant to demonstrate.
- **Settings are NOT cleared.** The `directpay_*` keys in `app_settings` (Auto-Process, Ack
  Threshold, Total-Before-VAT tolerance) are configuration, not processing data. A restart *would*
  reset them, so this is a deliberate difference from "restart the server".

Dedup state goes with the runs, so a previously-refused file can be re-uploaded afterwards.
