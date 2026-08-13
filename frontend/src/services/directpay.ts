/**
 * DirectPay API — fixture-driven contract<->invoice matching demo.
 * Mirrors services/stages.ts's generic get/approve primitives, pointed at
 * the separate /dp-api prefix (backend/src/directpay/router.py).
 */
import { api } from "./api";

export interface DpContractFields {
  contract_type?: string | null;
  vendor_name?: string | null;
  customer_name?: string | null;
  premises_address?: string | null;
  floor?: string | null;
  base_fee?: number | null;
  currency?: string | null;
  fee_type?: string | null;
  escalation_rate?: number | null;
  payment_due_days?: number | null;
  actual_start?: string | null;
  term_months?: number | null;
  contract_id?: string | null;
}

export interface DpContractRun {
  id: string;
  fixture_key: string;
  file_name: string;
  status: "review" | "saved";
  fields: DpContractFields;
  pdf_url: string;
  created_at: string;
  updated_at: string;
}

export interface DpLineItem {
  label?: string;
  charge_type?: string;
  quantity?: number;
  amount?: number;
}

export interface DpInvoiceExtracted {
  invoice_number?: string | null;
  invoice_date?: string | null;
  vendor_name?: string | null;
  customer_name?: string | null;
  vendor_gstin?: string | null;
  customer_gstin?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  payment_due_days?: number | null;
  payment_due_date?: string | null;
  subtotal?: number | null;
  gst_total?: number | null;
  tds_total?: number | null;
  grand_total?: number | null;
  gst_rate?: number | null;
  currency?: string | null;
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
