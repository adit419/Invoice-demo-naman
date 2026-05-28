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

  /** Edit-history feed for the extraction stage. */
  extractionEdits: <T>(invoiceId: string) =>
    api.get<{ items: T[] }>(
      `/api/v1/invoices/${invoiceId}/stages/extraction/edits`,
    ),

  /** Persist bill-posting metadata + per-line tax-code edits. */
  editBillPosting: (invoiceId: string, body: BillPostingEditPayload) =>
    api.patch(`/api/v1/invoices/${invoiceId}/stages/bill_posting/edit`, body),

  /**
   * Approve a stage. `body` is passed through verbatim so callers that send
   * nothing keep sending nothing and callers that send `{}` keep sending `{}`.
   */
  approve: <T = { redirect: string }>(
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
};
