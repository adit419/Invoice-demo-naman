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
  status: "review" | "saved";
  fields: DpContractFields;
  // Keyed identically to `fields`; order reflects the fixture's own
  // extraction-sheet order, which the review screen renders as-is.
  field_meta: Record<string, DpContractFieldMeta>;
  pdf_url: string;
  created_at: string;
  updated_at: string;
}

export interface DpLineItem {
  label?: string;
  charge_type?: string;
  quantity?: number;
  amount?: number;
  unit_price?: number;
}

// Field set matches "PT_BANGUN_INVOICE_EXTRACTION - Sheet1.csv" (the real
// invoice extraction) — vendor_npwp/customer_npwp/tax_rate/tax_total/
// wht_rate/wht_total keys are kept from the earlier "Contract Invoice
// Mapping" field-naming pass (see backend/src/directpay/field_mapping.py)
// since they're semantically identical to that CSV's vendor_gstin/
// gst_rate/gst_total/tds_total columns; payment_due_days/payment_due_date/
// bank_details/faktur_pajak_number/dpp_amount/notes are new, and
// vendor_email/premises_floor/payment_terms were dropped — none of them
// were real extracted fields.
export interface DpInvoiceExtracted {
  invoice_number?: string | null;
  invoice_date?: string | null;
  vendor_name?: string | null;
  customer_name?: string | null;
  vendor_npwp?: string | null;
  customer_npwp?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  // Not in the real extraction CSV — added for the Matching page's core
  // cross-validation checklist (see backend/src/directpay/field_mapping.py's
  // CORE_CROSS_VALIDATION_FIELDS).
  store_location?: string | null;
  payment_due_days?: string | null;
  payment_due_date?: string | null;
  subtotal?: number | null;
  tax_type?: string | null;
  tax_rate?: number | null;
  tax_total?: number | null;
  wht_rate?: number | null;
  wht_total?: number | null;
  grand_total?: number | null;
  currency?: string | null;
  bank_details?: string | null;
  faktur_pajak_number?: string | null;
  dpp_amount?: number | null;
  notes?: string | null;
  line_items?: DpLineItem[];
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
  [key: string]: unknown;
}

export interface DpReview {
  status: "pending" | "approved" | "posted" | "rejected";
  accepted_with_issues?: boolean;
  reason?: string | null;
  updated_at: string;
}

export interface DpInvoiceRun {
  id: string;
  fixture_key: string;
  file_name: string;
  status: "extraction" | "extracted" | "matching" | "bill_posting" | "posted" | "rejected";
  contract_id: string | null;
  extracted: DpInvoiceExtracted;
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
  currency?: string | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  wht_amount?: number | null;
  grand_total?: number | null;
  wht_applicable: boolean;
  line_items: DpBillPostingLineItem[];
  erp: DpBillPostingErp | null;
  updated_at: string;
}

export interface DpEditHistoryItem {
  timestamp: string;
  user_email: string;
  scope: "metadata" | "line_item";
  field: string;
  row_id: string | null;
  old_value: string | null;
  new_value: string | null;
}

export const directpayService = {
  fixtures: () => api.get<{ scenarios: DpFixtureChip[] }>("/dp-api/fixtures"),

  // Contracts
  uploadContract: (file: File) => {
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

  // Invoices
  uploadInvoice: (file: File) => {
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

  acknowledgeFinding: (invoiceId: string, findingId: string, acknowledged = true) =>
    api.post<{ ok: boolean; acknowledged_findings: string[] }>("/dp-api/validate/acknowledge", {
      invoice_id: invoiceId,
      finding_id: findingId,
      acknowledged,
    }),

  reviewAction: (invoiceId: string, action: "approve" | "reject", force = false, reason?: string) =>
    api.post<{ ok: boolean; review: DpReview }>("/dp-api/validate/review-action", {
      invoice_id: invoiceId,
      action,
      force,
      reason,
    }),

  // Bill Posting
  getBillPosting: (id: string) => api.get<DpBillPostingData>(`/dp-api/invoices/${id}/bill-posting`),
  editBillPosting: (id: string, lineItems: Record<string, Partial<DpBillPostingLineItem>>) =>
    api.patch<DpBillPostingData>(`/dp-api/invoices/${id}/bill-posting`, { line_items: lineItems }),
  postBill: (id: string) => api.post<DpBillPostingData>(`/dp-api/invoices/${id}/bill-posting/post`),
  simulateBillPosting: <T>(id: string) => api.post<T>(`/dp-api/invoices/${id}/bill-posting/simulate`),

  contractPdfUrl: (id: string) => `/dp-api/contracts/${id}/pdf`,
  invoicePdfUrl: (id: string) => `/dp-api/invoices/${id}/pdf`,

  // Settings — DirectPay-scoped, independent of Invoice Processing's own.
  getStp: () => api.get<{ stp_enabled: boolean }>("/dp-api/settings/stp"),
  setStp: (enabled: boolean) => api.patch<{ stp_enabled: boolean }>("/dp-api/settings/stp", { enabled }),
  getAckThreshold: () => api.get<{ ack_threshold: number }>("/dp-api/settings/ack-threshold"),
  setAckThreshold: (value: number) =>
    api.patch<{ ack_threshold: number }>("/dp-api/settings/ack-threshold", { value }),
};
