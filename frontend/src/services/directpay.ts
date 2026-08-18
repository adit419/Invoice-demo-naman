/**
 * DirectPay API — fixture-driven contract<->invoice matching demo.
 * Mirrors services/stages.ts's generic get/approve primitives, pointed at
 * the separate /dp-api prefix (backend/src/directpay/router.py).
 */
import { api } from "./api";

// Field set is fixture-defined (see field_meta below) rather than fixed —
// the handful of keys below are the ones other DirectPay screens (dashboard,
// invoice match dropdown, the AI recommendation scorer) reference by name;
// every other key on a given contract is only ever accessed dynamically via
// field_meta's own key list, hence the index signature.
export interface DpContractFields {
  contract_type?: string | null;
  vendor_name?: string | null;
  vendor_email?: string | null;
  customer_name?: string | null;
  currency?: string | null;
  [key: string]: string | number | null | undefined;
}

export interface DpFieldBbox {
  page: number;
  // Normalized (0-1) fractions of the rendered PDF page, top-left origin —
  // same convention as P2P's own bbox_schema / PdfViewer's ActiveBbox.
  bbox_left: number;
  bbox_top: number;
  bbox_width: number;
  bbox_height: number;
  value_confidence: number;
}

export interface DpContractFieldMeta {
  label: string;
  section: string | null;
  mandatory: boolean;
  // Where the extracted value came from — shown as an audit trail.
  audit_trail?: string | null;
  // Why an invoice was (or wasn't) matched against this field's value.
  ai_match_reasoning?: string | null;
  // Where on the contract PDF this value was found — drives the
  // click-a-field-to-highlight-it-on-the-PDF interaction.
  bbox?: DpFieldBbox | null;
}

export interface DpContractRun {
  id: string;
  fixture_key: string;
  file_name: string;
  status: "review" | "postprocessing" | "saved";
  fields: DpContractFields;
  // Keyed identically to `fields`; order reflects the fixture's own
  // extraction-sheet order, which the review screen renders as-is.
  field_meta: Record<string, DpContractFieldMeta>;
  // Whether this vendor has a real payment_schedule.json — drives whether
  // approving Contract Review lands on Extraction Postprocessing or goes
  // straight to "saved" (see dashboard.tsx's contractRoute).
  has_payment_schedule: boolean;
  // Same "View Edit History" gate the invoice side uses — set once an edit
  // has been made on either Contract Extraction or Extraction
  // Postprocessing (both append to the same doc-level edit_history).
  has_edit_history: boolean;
  pdf_url: string;
  created_at: string;
  updated_at: string;
}

export interface DpLineItem {
  label?: string;
  // P2P/spreadsheet's own "item_code" field (e.g. "SEWA") — kept alongside
  // charge_type (DP's own categorical tag for GL coding) rather than
  // replacing it, since charge_type drives bill-posting logic this raw code
  // doesn't participate in.
  item_code?: string | null;
  charge_type?: string;
  quantity?: number;
  amount?: number;
  unit_price?: number;
}

// Field names match P2P's own real invoice extraction vocabulary exactly
// (see backend/src/directpay/field_mapping.py and the "all_inv_ext_res.pdf"
// extraction-data source, whose own column headers are this same
// vocabulary) — invoice_number/invoice_date/vendor_name/currency are shared
// verbatim with P2P; customer_legal_entity/vendor_vat_id/customer_vat_id/
// vendor_address/customer_address/payment_terms/due_date/
// total_amount_before_vat/vat_gst/wht/total_amount/vendor_bank_name/
// vendor_bank_account_name/vendor_bank_account_number/vendor_bank_swift are
// P2P's own field names, renamed from this schema's earlier DP-specific
// choices (customer_name, vendor_npwp, customer_npwp, store_location,
// payment_due_days, payment_due_date, subtotal, tax_total, wht_total,
// grand_total, bank_account_name, bank_account_number). billing_period_start/
// billing_period_end/tax_type/tax_rate/wht_rate/notes have no P2P
// counterpart — DP-only additions for the Matching page's contract-date-range
// and derived-rate checks (see field_mapping.py's CORE_CROSS_VALIDATION_FIELDS).
// faktur_pajak_number/dpp_amount moved OUT of this schema entirely and into
// the dedicated Faktur Pajak stage (see DpFakturPajak below) — mirrors P2P
// exactly, which has no FP fields on its own invoice extraction either.
export interface DpInvoiceExtracted {
  invoice_number?: string | null;
  invoice_date?: string | null;
  vendor_name?: string | null;
  vendor_address?: string | null;
  vendor_vat_id?: string | null;
  customer_legal_entity?: string | null;
  customer_address?: string | null;
  customer_vat_id?: string | null;
  // Invoice-level metadata field, distinct from a line item's own
  // item_description — one of the source schema's 22 canonical metadata
  // fields (see "All Invoice Contract Wise data" sample CSVs), missed when
  // the fixtures were first authored.
  description?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  payment_terms?: string | null;
  due_date?: string | null;
  total_amount_before_vat?: number | null;
  tax_type?: string | null;
  tax_rate?: number | null;
  vat_gst?: number | null;
  wht_rate?: number | null;
  wht?: number | null;
  total_amount?: number | null;
  net_amount_after_wht?: number | null;
  currency?: string | null;
  vendor_bank_name?: string | null;
  vendor_bank_account_name?: string | null;
  vendor_bank_account_number?: string | null;
  vendor_bank_swift?: string | null;
  notes?: string | null;
  line_items?: DpLineItem[];
}

export interface DpTotalBeforeVatThreshold {
  enabled: boolean;
  threshold_pct: number;
}

export interface DpFinding {
  finding_id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail?: string;
  expected?: string;
  found?: string;
  charge_type?: string;
  // Which DpInvoiceExtracted key this row compares, and the raw (correctly
  // typed) contract-side value to write there via the "copy" action — set by
  // the fixture author per finding. Absent when a finding isn't tied to a
  // single copyable invoice field.
  field?: string;
  expected_value?: string | number | boolean | null;
  // Whether this field is on the Matching page's fixed, always-shown
  // checklist (field_mapping.CORE_CROSS_VALIDATION_FIELDS) — drives display.
  core?: boolean;
  // Whether this finding can block approval — a subset of `core` (e.g. Bank
  // Details is core but not mandatory). Drives the banner/button gating.
  mandatory?: boolean;
  // Where the Contract-column value came from. "supporting_document" means
  // the contract only states the billing rule for this charge (utility
  // "billed on actuals") and the amount came from the invoice's supporting
  // document — drives the ⓘ explainer next to the value. Absent/"contract"
  // for every ordinary row.
  expected_source?: "contract" | "supporting_document";
  [key: string]: unknown;
}

export interface DpReview {
  status: "pending" | "approved" | "posted" | "rejected";
  accepted_with_issues?: boolean;
  reason?: string | null;
  updated_at: string;
}

// Per-field bbox metadata for DpInvoiceExtracted's own flat keys — NOT part
// of that type's own schema, a separate lookup keyed identically to it
// (mirrors DpContractFieldMeta's own optional `bbox`, just without the
// label/section/mandatory/audit-trail fields the Invoice Extraction screen
// already gets from its own hardcoded FIELD_DEFS instead of field_meta).
export interface DpInvoiceFieldMeta {
  bbox?: DpFieldBbox | null;
}

export interface DpInvoiceRun {
  id: string;
  fixture_key: string;
  file_name: string;
  status: "extraction" | "extracted" | "fp_extraction" | "matching" | "bill_posting" | "posted" | "rejected";
  contract_id: string | null;
  extracted: DpInvoiceExtracted;
  // Keyed identically to `extracted`; a key with no bbox (or absent
  // entirely) just renders with no PDF highlight — same fallback
  // contract_field_meta's own currently-all-empty `bbox` already relies on.
  field_meta: Record<string, DpInvoiceFieldMeta>;
  expected?: Record<string, unknown> | null;
  summary?: { errors: number; warnings: number; info: number; total: number } | null;
  findings?: DpFinding[] | null;
  original_findings?: DpFinding[] | null;
  acknowledged_findings: string[];
  // Findings the DirectPay Acknowledge Threshold's learned memory has
  // pre-blessed — same (field, contract-value) -> invoice-value pair has been
  // manually acknowledged enough times before. Rendered as the purple
  // "Auto-approved" badge, distinct from a human's own green-check ack.
  system_acknowledged_findings: string[];
  has_edit_history: boolean;
  // One-way flag: has a human clicked Confirm Extraction at least once?
  // Drives the Extraction page's own isActionable — status alone can't tell
  // (it reuses "extracted" for both "just extracted, not yet confirmed" and
  // "post-Faktur-Pajak, ready for Matching"), and contract_id isn't set
  // until several stages later, at Matching.
  extraction_confirmed: boolean;
  // Whether this specific invoice actually has a Faktur Pajak document — a
  // vendor like RATNA_INTAN has none at all, so "back" navigation from later
  // stages must check this rather than assuming the stage always applied.
  has_faktur_pajak: boolean;
  has_payment_schedule: boolean;
  // "manual" (real multipart /invoices/upload) vs "trigger"
  // (/ingestion/trigger-upload, single or batch) — drives the dashboard's
  // source icon, same distinction/naming as P2P's own pipeline_runs.source.
  source?: "manual" | "trigger";
  // Notification/tag metadata — only ever set when the run was created via
  // /ingestion/trigger-upload with those fields; not surfaced in the UI yet.
  tag?: string | null;
  notify_email?: string | null;
  stp_state?: "processing" | "waiting_review" | "done" | null;
  stp_failure_reason?: string | null;
  review: DpReview;
  pdf_url: string;
  created_at: string;
  updated_at: string;
}

export interface DpFixtureChip {
  key: string;
  label: string;
}

export interface DpContractCandidate {
  contract_id: string;
  file_name?: string | null;
  vendor_name?: string | null;
  customer_name?: string | null;
  base_fee?: number | null;
  currency?: string | null;
  actual_start?: string | null;
  contract_type?: string | null;
  score: number;
  breakdown: Array<{ criterion: string; score: number; detail: string }>;
}

export interface DpContractRecommendation {
  applicable: boolean;
  reason?: string;
  current_contract_id: string | null;
  status?: "applied" | "no_match";
  recommended?: DpContractCandidate | null;
  candidates?: DpContractCandidate[];
  candidates_considered?: number;
  generated_at?: string | null;
  applied_at?: string | null;
}

export interface DpBillPostingLineItem {
  id: string;
  description?: string | null;
  charge_type?: string | null;
  quantity?: number | null;
  amount?: number | null;
  gl_account_code: string;
  vat_tax_code: string;
  wht_tax_code: string;
}

export interface DpBillPostingErp {
  bill_number: string;
  posted_at: string;
}

export interface DpBillPostingData {
  id: string;
  status: "bill_posting" | "posted";
  contract_id?: string | null;
  vendor_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  // When this invoice run was uploaded — "received" into DirectPay.
  invoice_received_date?: string | null;
  payment_due_date?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  wht_amount?: number | null;
  grand_total?: number | null;
  // Actual cash owed to the vendor — net_amount_after_wht when WHT applies,
  // else the same as grand_total.
  payable_amount?: number | null;
  wht_applicable: boolean;
  // False only for a vendor with no VAT at all (RATNA_INTAN) — drives
  // hiding the VAT/GST Tax Code column on the Bill Posting page.
  vat_applicable: boolean;
  line_items: DpBillPostingLineItem[];
  erp: DpBillPostingErp | null;
  updated_at: string;
}

// Contract-side derived fields — reviewed once per contract (not tied to any
// one invoice yet, so every installment is shown, not just a matched one).
// See backend/src/directpay/service.py's _CONTRACT_DERIVED_COLUMNS — Total
// Amount Before VAT is the one figure Matching later pulls per-invoice from
// whichever installment its amount matches.
export interface DpContractDerivedField {
  field_name: string;
  display_name: string;
  value: string | number | null;
  formatted_value: string;
}

export interface DpContractInstallment {
  description?: string | null;
  fields: DpContractDerivedField[];
}

// Optional and schema-driven — only present for a vendor whose source
// tracker had a real "ONE-TIME PAYMENTS" section (deposits, fit-out
// guarantee, etc.). Flat rows, not the recurring per-installment
// amount_excl_tax/VAT/WHT breakdown — these are never matched against an
// invoice, just shown for reference.
export interface DpContractOneTimePayment {
  description?: string | null;
  amount: number | null;
  formatted_amount: string;
  due_date_trigger?: string | null;
  status?: string | null;
  remarks?: string | null;
}

export interface DpContractExtractionPostprocessing {
  id: string;
  status: DpContractRun["status"];
  vendor_name?: string | null;
  has_payment_schedule: boolean;
  has_edit_history: boolean;
  installments: DpContractInstallment[];
  one_time_payments: DpContractOneTimePayment[];
}

// Faktur Pajak stage — mirrors P2P's own fp-extraction.tsx/fp_extraction.py
// field-for-field (see backend/src/directpay/service.py's
// _FP_FIELD_DISPLAY/_FP_INVOICE_FIELD_MAP). `bbox` locates this field's value
// on whichever PDF the FP stage is showing — has_own_pdf below decides
// whether that's a dedicated faktur_pajak_pdf or (PT_BANGUN's case) the
// invoice's own PDF — generated the same way as invoice_field_meta (see its
// own docstring in generate_dp_invoice_bbox.py).
export interface DpFakturPajakField {
  field_name: "vendor_name" | "customer_name" | "taxable_amount" | "vat_amount";
  display_name: string;
  fp_value: string | number | null;
  invoice_value: string | number | null;
  match_status: "match" | "mismatch";
  required: boolean;
  acknowledged: boolean;
  // Pre-blessed by the DP Acknowledge Threshold's learned memory — same
  // (field, fp-value) -> invoice-value pair has been manually acknowledged
  // enough times before. Rendered as the purple "Auto-approved" badge,
  // mirroring MatchingTable.tsx's own system-acknowledged findings.
  system_acknowledged: boolean;
  bbox?: DpFieldBbox | null;
}

export interface DpFakturPajak {
  id: string;
  status: DpInvoiceRun["status"];
  invoice_number?: string | null;
  invoice_date?: string | null;
  vendor_name?: string | null;
  currency?: string | null;
  fp_number?: string | null;
  fp_number_bbox?: DpFieldBbox | null;
  has_fp_document: boolean;
  // True for a vendor whose FP was uploaded as its own separate PDF (e.g.
  // Palladium's invoice_fp_4/5/6.pdf) rather than being page 2 of the same
  // PDF as the invoice (PT_BANGUN's case) — drives which PDF URL/page the
  // FP Extraction screen shows.
  has_own_pdf: boolean;
  fields: DpFakturPajakField[];
  acknowledged_fields: string[];
}

export interface DpEditHistoryItem {
  timestamp: string;
  user_email: string;
  // "installment"/"one_time_payment" are Contract Extraction Postprocessing's
  // own row-scoped edits — same shape as "line_item", different source.
  scope: "metadata" | "line_item" | "installment" | "one_time_payment";
  field: string;
  row_id: string | null;
  old_value: string | null;
  new_value: string | null;
}

// Next.js dev's proxy for the /dp-api/* rewrite caps request bodies at
// ~10MB (see next.config.ts's rewrites() comment) — kept a couple MB under
// that as margin for multipart overhead.
const LARGE_FILE_THRESHOLD_BYTES = 8 * 1024 * 1024;

export const directpayService = {
  fixtures: () => api.get<{ scenarios: DpFixtureChip[] }>("/dp-api/fixtures"),

  // Contracts
  // Real fixture PDFs can exceed Next.js dev's proxy body cap (~10MB) — a
  // large file's bytes are never actually used anyway (fixture resolution
  // and the PDF preview both work off the file name alone), so above the
  // threshold this sends just the name instead of the real upload.
  uploadContract: (file: File) => {
    if (file.size > LARGE_FILE_THRESHOLD_BYTES) {
      return api.post<DpContractRun>("/dp-api/contracts/trigger-upload", { file_name: file.name });
    }
    const fd = new FormData();
    fd.append("file", file);
    return api.postForm<DpContractRun>("/dp-api/contracts/upload", fd);
  },
  listContracts: () => api.get<{ items: DpContractRun[] }>("/dp-api/contracts"),
  getContract: (id: string) => api.get<DpContractRun>(`/dp-api/contracts/${id}`),
  editContract: (id: string, fields: Partial<DpContractFields>) =>
    api.patch<DpContractRun>(`/dp-api/contracts/${id}/edit`, { fields }),
  approveContract: (id: string, fields?: Partial<DpContractFields>) =>
    api.post<DpContractRun>(`/dp-api/contracts/${id}/approve`, { fields }),
  getContractExtractionPostprocessing: (id: string) =>
    api.get<DpContractExtractionPostprocessing>(`/dp-api/contracts/${id}/extraction-postprocessing`),
  editContractExtractionPostprocessing: (
    id: string,
    body: { installments?: Record<string, Record<string, unknown>>; one_time_payments?: Record<string, Record<string, unknown>> }
  ) => api.patch<DpContractExtractionPostprocessing>(`/dp-api/contracts/${id}/extraction-postprocessing`, body),
  approveContractExtractionPostprocessing: (id: string) =>
    api.post<DpContractRun>(`/dp-api/contracts/${id}/extraction-postprocessing/approve`),
  getContractEditHistory: (id: string) =>
    api.get<{ items: DpEditHistoryItem[] }>(`/dp-api/contracts/${id}/edit-history`),

  // Invoices
  uploadInvoice: (file: File) => {
    if (file.size > LARGE_FILE_THRESHOLD_BYTES) {
      return api.post<DpInvoiceRun>("/dp-api/ingestion/trigger-upload", { file_name: file.name });
    }
    const fd = new FormData();
    fd.append("file", file);
    return api.postForm<DpInvoiceRun>("/dp-api/invoices/upload", fd);
  },
  listInvoices: () => api.get<{ items: DpInvoiceRun[] }>("/dp-api/invoices"),
  getInvoice: (id: string) => api.get<DpInvoiceRun>(`/dp-api/invoices/${id}`),
  extractInvoice: (id: string) => api.post<DpInvoiceRun>(`/dp-api/invoices/${id}/extract`),
  editInvoice: (id: string, extracted: Partial<DpInvoiceExtracted>) =>
    api.patch<DpInvoiceRun>(`/dp-api/invoices/${id}/edit`, { extracted }),
  confirmExtraction: (id: string, extracted?: Partial<DpInvoiceExtracted>) =>
    api.post<DpInvoiceRun>(`/dp-api/invoices/${id}/confirm-extraction`, { extracted }),
  matchInvoice: (id: string, contractId: string) =>
    api.post<DpInvoiceRun>(`/dp-api/invoices/${id}/match`, { contract_id: contractId }),
  getContractRecommendation: (id: string) =>
    api.get<DpContractRecommendation>(`/dp-api/invoices/${id}/contract-recommendation`),
  getEditHistory: (id: string) =>
    api.get<{ items: DpEditHistoryItem[] }>(`/dp-api/invoices/${id}/edit-history`),

  // Extraction Postprocessing
  // Faktur Pajak
  getFakturPajak: (id: string) => api.get<DpFakturPajak>(`/dp-api/invoices/${id}/faktur-pajak`),
  acknowledgeFakturPajakField: (id: string, fieldName: string, acknowledged = true) =>
    api.post<{ ok: boolean; acknowledged_fields: string[] }>(`/dp-api/invoices/${id}/faktur-pajak/acknowledge`, {
      field_name: fieldName,
      acknowledged,
    }),
  approveFakturPajak: (id: string, force = false) =>
    api.post<DpInvoiceRun>(`/dp-api/invoices/${id}/faktur-pajak/approve`, { force }),

  acknowledgeFinding: (invoiceId: string, findingId: string, acknowledged = true) =>
    api.post<{ ok: boolean; acknowledged_findings: string[] }>("/dp-api/validate/acknowledge", {
      invoice_id: invoiceId,
      finding_id: findingId,
      acknowledged,
    }),

  // Matching's mandatory field checks are a hard rule — no force/bypass
  // parameter exists here (unlike Faktur Pajak's own force-retry approve).
  reviewAction: (invoiceId: string, action: "approve" | "reject", reason?: string) =>
    api.post<{ ok: boolean; review: DpReview }>("/dp-api/validate/review-action", {
      invoice_id: invoiceId,
      action,
      reason,
    }),

  // Bill Posting
  getBillPosting: (id: string) => api.get<DpBillPostingData>(`/dp-api/invoices/${id}/bill-posting`),
  editBillPosting: (id: string, lineItems: Record<string, Partial<DpBillPostingLineItem>>) =>
    api.patch<DpBillPostingData>(`/dp-api/invoices/${id}/bill-posting`, { line_items: lineItems }),
  postBill: (id: string) => api.post<DpBillPostingData>(`/dp-api/invoices/${id}/bill-posting/post`),
  simulateBillPosting: <T>(id: string) => api.post<T>(`/dp-api/invoices/${id}/bill-posting/simulate`),
  // Reuses P2P's own real, currency-driven SAP VAT code reference endpoint
  // as-is (backend/src/api/v1/bill_posting.py's /vat-codes) — it's public
  // reference data (country codes from scripts/vat_codes.json), not
  // P2P-pipeline-specific, so there's no need for a DirectPay-scoped copy.
  getVatCodes: (currency: string) =>
    api.get<{ country: string; codes: Array<{ tax_code: string; description: string; percentage: string }> }>(
      `/api/v1/vat-codes?currency=${encodeURIComponent(currency)}`,
    ),

  contractPdfUrl: (id: string) => `/dp-api/contracts/${id}/pdf`,
  invoicePdfUrl: (id: string) => `/dp-api/invoices/${id}/pdf`,
  // Only meaningfully different from invoicePdfUrl when has_own_pdf is true
  // (see DpFakturPajak) — falls back server-side to the invoice's own PDF
  // otherwise, same as before.
  fakturPajakPdfUrl: (id: string) => `/dp-api/invoices/${id}/faktur-pajak/pdf`,

  // Settings — DirectPay-scoped, independent of Invoice Processing's own.
  getStp: () => api.get<{ stp_enabled: boolean }>("/dp-api/settings/stp"),
  setStp: (enabled: boolean) => api.patch<{ stp_enabled: boolean }>("/dp-api/settings/stp", { enabled }),
  getAckThreshold: () => api.get<{ ack_threshold: number }>("/dp-api/settings/ack-threshold"),
  setAckThreshold: (value: number) =>
    api.patch<{ ack_threshold: number }>("/dp-api/settings/ack-threshold", { value }),

  // Matching-stage Total Amount Before VAT tolerance — disabled by default;
  // lives on the Matching page itself (see MatchingTable/match.tsx), not the
  // admin Workflow Settings page, since it's a per-review-session control.
  getTotalBeforeVatThreshold: () =>
    api.get<DpTotalBeforeVatThreshold>("/dp-api/settings/total-before-vat-threshold"),
  setTotalBeforeVatThreshold: (enabled: boolean, thresholdPct: number) =>
    api.patch<DpTotalBeforeVatThreshold>("/dp-api/settings/total-before-vat-threshold", {
      enabled,
      threshold_pct: thresholdPct,
    }),
};
