# Vendor Rules: Karya Nastari Prapta (Mall Ambassador Utilities)

Apply **on top of** the base invoice-to-markdown / IDP extraction rules.
Companion to `DIRECTPAY_INSTALLMENT_RENT_WORKFLOW.md` and `DIRECTPAY_FIELDS_BY_STAGE.md`.

> **Correction note.** An earlier version of this rule matched "Total Amount Before VAT" against the
> sum of Harga Jual across the Faktur Pajak set, on the reasoning that no other supporting document
> existed. **That was incorrect and has been superseded** — see "Amount-Matching Logic" below. An FP
> is not a valid substitute for a contract value or an independent supporting document. The
> `_FP_SUM_REFERENCE_VENDORS` mechanism that implemented it has been removed from `service.py`.

## Vendor Identification

| Field | Value |
|---|---|
| Seller (PKP) | KARYA NASTARI PRAPTA |
| Seller Address | MSIG Tower 34th Floor, Jl. Jenderal Sudirman No. 21, Karet Kuningan, Setiabudi, Jakarta Selatan |
| Seller NPWP | 0610387631011000 |
| Billed Location | Mall Ambassador, Cafe & Sit Lt. Dasar Ex. ATM Pintu Timur |
| Buyer | PT. Bumi Berkah Boga (Kopi Kenangan) |
| Buyer NPWP | 0828773762029000 |

Apply when the invoice header identifies the seller as "Karya Nastari Prapta", or the buyer's
billing location is Mall Ambassador.

## Document Set Structure (critical)

Each billing cycle produces **one billing statement + multiple Faktur Pajak**, not one combined
tax invoice:

| Document | Contents |
|---|---|
| Rincian Tagihan (billing statement) | Combined summary: Listrik, Air, Admin Fee, with meter readings/tariffs, denda (late fees), grand total |
| FP #1 | Admin Fee only |
| FP #2 | Air (Water) only |
| FP #3 | Listrik (Electricity) only |

**There is no single supporting document itemising all three charges together** — the statement
gives the total; the per-category breakdown and tax treatment exist only across the separate FPs.
Extract every FP in the set before validating the invoice total.

*As implemented:* the three FPs are pages 2–4 of `invoice_3.pdf` and are also split out as
`invoice_3_fp_admin_fee.pdf` / `_water.pdf` / `_electricity.pdf`, registered in `documents.json`
under `faktur_pajak_pdfs` so each is individually linkable from the Matching page.

## PPN Treatment — vendor-specific

Legal basis: **PP Nomor 49 Tahun 2022** lists electricity and clean water among VAT-exempt
("PPN dibebaskan") strategic goods. Electricity's exemption has one carve-out — residential
supply above 6,600 VA — which does **not** apply here, because this is a commercial tenant.
Water's exemption is effectively unconditional and covers connection and fixed base charges.

Unlike Pakuwon Sentosa Abadi, Karya Nastari applies the exemption stamp to **both** electricity
and water:

| Charge | PPN on FP | PPN actually charged | Exemption stamp |
|---|---|---|---|
| Admin Fee | Yes | **Yes — fully taxed** | No |
| Air (Water) | Yes (shown) | No — waived | Yes |
| Listrik (Electricity) | Yes (shown) | No — waived | Yes |

- Do **not** treat the PPN on the water/electricity FPs as amounts owed — computed for reporting
  only, waived per the stamp.
- Only the Admin Fee's PPN is real and payable.
- If a future invoice from this vendor shows electricity **without** the stamp, flag it as a
  deviation from the established pattern rather than silently accepting it.

*As implemented:* `faktur_pajak_3.json` records `vat_amount: 2200.0` (Admin Fee only), with the
reasoning in its `ai_reasoning.vat_amount` so the Faktur Pajak stage renders it in the AI-derived
treatment (sparkle + italic + hover ⓘ) rather than silently replacing the printed figure. This
**agrees** with the invoice's own `vat_gst` of 2,200 — it is not a discrepancy.

## Amount-Matching Logic (Total Amount Before VAT) — Corrected

**Do not match Total Amount Before VAT against the sum of Harga Jual across the FPs.** The FP is a
tax document, not a supporting/source document for the underlying charge.

**Rationale:** an FP's Harga Jual is *derived from* — not independent of — the vendor's own billing
calculation. Matching an invoice against a document produced from the same underlying number does
not provide independent validation; it only confirms the vendor's tax filing is internally
consistent with its own invoice, not that the invoice amount itself is correct.

Correct sources of truth, in order of precedence:

1. **Contract values** — the agreed rate card / lease or service agreement covering this unit
   (tariff per kWh, per m³, fixed fees, capacity charges), if present in the system.
2. **Supporting document** — a source document *independent of the FP* itemising the charge being
   billed: a detailed usage/calculation sheet (analogous to Pakuwon's "Rekap Perhitungan Utilitas"),
   a meter-reading report, or a signed billing backup from the vendor.

**Match validation rule**
- Contract value or independent supporting document present → compare against it; pass/fail on that
  comparison.
- **Neither present → match status FAILED / NOT VALIDATED, flagged for manual review.** Never fall
  back to FP figures as a source of truth.

*As implemented:* there is no FP fallback in `_apply_mandatory_field_coverage`. With no contract
figure and no supporting document the reference is left blank, and because
`total_amount_before_vat` is in `_ALWAYS_BLOCKING_FIELDS` the row is a hard `error` that cannot be
acknowledged away (`NO_ACK_FIELDS`) — i.e. it holds for manual review rather than auto-approving.
Verified: **KARYA_NASTARI invoice_3 currently FAILS this check**, since neither a contract rate card
nor an independent supporting document exists for it. Its three FP PDFs are still viewable, but are
deliberately not offered as a match source in the UI.

For contrast, PAKUWON's invoice_6 *does* have an independent supporting document — a "Rekap
Perhitungan Utilitas" page showing the meter reading and computing the amount — and therefore
passes legitimately.

**Reference figures** (internal-consistency observation only, **not** a match source):

| FP | Harga Jual (Rp) |
|---|---:|
| Admin Fee | 20,000.00 |
| Air | 277,390.00 |
| Listrik | 4,741,120.00 |
| **Sum** | **5,038,510.00** |

This equals the statement's "Total Bulan Berjalan". Do **not** match against the invoice's final
"TOTAL" (Rp 5,080,938.00) either — that adds denda and the Admin Fee's PPN.

## Common extraction pitfalls

- The statement's "PPN" column for Listrik/Air sits visually next to the "Denda" column — don't
  confuse them; PPN is 0/blank for these rows in practice, denda is the populated figure.
- Meter reading tables (Awal/Akhir/Pemakaian) appear only on the statement, never on the FPs.
- The due date may precede the print/invoice date (denda is pre-calculated to print date per the
  document's own footnote) — expected vendor behaviour, not an OCR error.
- **FP-to-invoice pairing is not sequential for this vendor.** `INV_1 ↔ FP_5`, `INV_2 ↔ FP_4`.
  Verified from each FP's own printed serial, its Harga Jual/PPN totals, and the invoice number its
  line items cite. Never pair by filename order.
- `INV_1`'s FP Harga Jual is exactly Rp 10,000 below the invoice's pre-VAT total — the stamp duty,
  excluded from the DPP. A real tax nuance, not a mismatch.
