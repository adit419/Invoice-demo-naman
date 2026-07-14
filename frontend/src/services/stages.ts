/**
 * Pipeline-stage API.
 *
 * Every stage page previously hand-wrote `/api/v1/invoices/{id}/stages/...`
 * paths inline (the `/edit`, `/approve`, `/reject` triplet was duplicated
 * across review / extraction-confirm / vendor-validation / matching /
 * bill-posting). They now share this typed surface.
 *
 * Stage *payload* shapes stay generic — they are large and page-specific, so
 * each caller supplies its own response type via the type parameter.
 */
import { api } from "./api";

/** One visible stage in an invoice's pipeline (stages-status endpoint). */
export interface StageStatus {
  slug: string;
  /** pending | in_progress | in_review | approved | completed | rejected */
  status: string;
  display_name: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface MetadataEdit {
  field: string;
  value: string | number | null;
}

export interface LineItemEdit {
  row_id: string;
  field: string;
  value: string | number | null;
}

export interface ExtractionEditPayload {
  metadata_edits?: MetadataEdit[];
  line_item_edits?: LineItemEdit[];
}

/** One scored PO candidate from the AI PO recommendation endpoint. */
export interface PoCandidate {
  po_number: string;
  vendor_name: string | null;
  total_amount: number | null;
  currency: string | null;
  order_date: string | null;
  status: string | null;
  source: string;
  score: number;
  breakdown: Array<{ criterion: string; score: number; detail: string }>;
}

export interface PoRecommendation {
  applicable: boolean;
  reason?: string;
  current_po_number: string | null;
  /** applied | no_match */
  status?: string;
  recommended?: PoCandidate | null;
  candidates?: PoCandidate[];
  candidates_considered?: number;
  generated_at?: string | null;
  applied_at?: string | null;
}

export interface BillPostingEditPayload {
  metadata: Record<string, string>;
  line_items: Array<{ id: string; vat_tax_code: string; wht_tax_code: string }>;
}

export const stagesService = {
  /** Fetch a stage's full payload. Caller supplies the response shape. */
  get: <T>(invoiceId: string, slug: string) =>
    api.get<T>(`/api/v1/invoices/${invoiceId}/stages/${slug}`),

  /** Visible stages + their statuses, used for forward/backward navigation. */
  status: (invoiceId: string) =>
    api.get<{ stages: StageStatus[] }>(
      `/api/v1/invoices/${invoiceId}/stages-status`,
    ),

  /** Aggregate pipeline status (`{ pipeline_status }`). */
  pipelineStatus: (invoiceId: string) =>
    api.get<{ pipeline_status: string }>(
      `/api/v1/invoices/${invoiceId}/stages`,
    ),

  /** Persist inline edits made on the extraction stage. */
  editExtraction: (invoiceId: string, body: ExtractionEditPayload) =>
    api.patch(`/api/v1/invoices/${invoiceId}/stages/extraction/edit`, body),

  /**
   * AI PO recommendation for invoices extracted without a PO number.
   * Computed lazily server-side on first call; when a candidate clears the
   * threshold the backend auto-fills po_number (as a "Neo AI" extraction
   * edit) and returns status "applied". `applicable: false` when the invoice
   * already has a PO number (existing flow untouched). The user overrides
   * the suggestion by editing the field through the normal edit flow.
   */
  getPoRecommendation: (invoiceId: string) =>
    api.get<PoRecommendation>(
      `/api/v1/invoices/${invoiceId}/stages/extraction/po-recommendation`,
    ),

  /** Edit-history feed for the extraction stage. */
  extractionEdits: <T>(invoiceId: string) =>
    api.get<{ items: T[] }>(
      `/api/v1/invoices/${invoiceId}/stages/extraction/edits`,
    ),

  /** Persist bill-posting metadata + per-line tax-code edits. */
  editBillPosting: (invoiceId: string, body: BillPostingEditPayload) =>
    api.patch(`/api/v1/invoices/${invoiceId}/stages/bill_posting/edit`, body),

  /** Persist user-confirmed line-item GRN mappings. */
  saveLineMappings: (invoiceId: string, body: { checked_grn_ids: string[]; confirmed_item_ids: string[] }) =>
    api.patch(`/api/v1/invoices/${invoiceId}/stages/line_item_matching/mappings`, body),

  /**
   * Approve a stage. `body` is passed through verbatim so callers that send
   * nothing keep sending nothing and callers that send `{}` keep sending `{}`.
   */
  approve: <T = { redirect: string; next_stage?: string }>(
    invoiceId: string,
    slug: string,
    body?: unknown,
  ) => api.post<T>(`/api/v1/invoices/${invoiceId}/stages/${slug}/approve`, body),

  /** Reject a stage with a reason. */
  reject: (invoiceId: string, slug: string, reason: string) =>
    api.post(`/api/v1/invoices/${invoiceId}/stages/${slug}/reject`, { reason }),

  /** Post the prepared bill to the ERP (terminal happy-path action). */
  postBill: (invoiceId: string) =>
    api.post(`/api/v1/invoices/${invoiceId}/stages/bill_posting/post`, {}),

  /** Dry-run the ERP posting and return the simulated document. */
  simulateBillPosting: <T>(invoiceId: string) =>
    api.post<T>(
      `/api/v1/invoices/${invoiceId}/stages/bill_posting/simulate`,
      {},
    ),

  /**
   * Persist acknowledgements for required mismatch fields.
   * Idempotent — safe to call again for an already-acknowledged field.
   */
  acknowledgeFields: (invoiceId: string, fieldNames: string[]) =>
    api.post(
      `/api/v1/invoices/${invoiceId}/stages/metadata_validation/acknowledge`,
      { field_names: fieldNames },
    ),

  /** Remove acknowledgements (revert) for the given fields. */
  unacknowledgeFields: (invoiceId: string, fieldNames: string[]) =>
    api.post(
      `/api/v1/invoices/${invoiceId}/stages/metadata_validation/unacknowledge`,
      { field_names: fieldNames },
    ),

  /** Persist FP extraction field acknowledgements (stored in invoices.fp_acknowledged_fields). */
  acknowledgeFpFields: (invoiceId: string, fieldNames: string[]) =>
    api.post(
      `/api/v1/invoices/${invoiceId}/stages/fp_extraction/acknowledge`,
      { field_names: fieldNames },
    ),

  /** Revert FP extraction field acknowledgements. */
  unacknowledgeFpFields: (invoiceId: string, fieldNames: string[]) =>
    api.post(
      `/api/v1/invoices/${invoiceId}/stages/fp_extraction/unacknowledge`,
      { field_names: fieldNames },
    ),

  /** Fetch SAP VAT codes for the given invoice currency. */
  getVatCodes: (currency: string) =>
    api.get<{ country: string; codes: Array<{ tax_code: string; description: string; percentage: string }> }>(
      `/api/v1/vat-codes?currency=${encodeURIComponent(currency)}`,
    ),
};
