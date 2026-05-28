/**
 * Shared types for the Matching screen (Metadata + Line Items tabs).
 * Extracted from the former monolithic `pages/invoice/[id]/matching.tsx`.
 */

export interface FieldValue {
  document_id: string;
  value: string | number | null;
}

export interface ValidationField {
  field_name: string;
  display_name: string;
  type: string;
  required: boolean;
  match_status: "match" | "mismatch";
  values: { invoice: FieldValue[]; po: FieldValue[]; grn?: FieldValue[] };
  /** Invoice extraction confidence for this field (0–1). */
  value_confidence?: number | null;
  /** Set by backend when a user (or the system) has acknowledged this mismatch. */
  is_acknowledged?: boolean;
  /** "system" for auto-approvals; user's display name for manual acknowledges. */
  acknowledged_by?: string | null;
  /** ISO timestamp of when this field was acknowledged. */
  acknowledged_at?: string | null;
}

export interface MetadataValidationData {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  po_number: string | null;
  grn_number: string | null;
  file_name: string;
  fixture_key: string;
  status: string;
  stage_status: string;
  fields: ValidationField[];
  document_types: string[];
}

// ── Line Items tab (mirrors invoice-validator-fe Matching ▸ Line Items) ───────
//
// The backend collapses ALL invoice lines into ONE invoice row (= total before
// VAT) and exposes the granular extraction lines as the GRN matching dataset.
// One result references the single collapsed invoice line; result_data.grn is
// the set of GRN ids the matcher selected (and pre-checks on load).

export type MatchStatus = "perfect" | "no_match";

/** The single collapsed invoice line ("Total of invoice"). */
export interface CollapsedInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  price: number;
}

/** One row of the matching dataset shown (with a checkbox) on the right. */
export interface GrnLineItem {
  id: string;
  po_number: string | null;
  grn_number?: string;
  document_date?: string;
  description: string;
  quantity: number;
  amount: number;
  line_total: number;
}

export interface ToleranceConfig {
  currency: string;
  value: number;
}

export interface AllowedRange {
  min: number;
  max: number;
}

export interface VarianceData {
  value: number;
  direction: "positive" | "negative";
}

export interface MatchResultData {
  po?: string[];
  grn?: string[];
  confidence?: number | null;
}

export interface MatchResult {
  id: number;
  invoice_line_ids: string[];
  group_id?: string | null;
  match_status: MatchStatus;
  result_data: MatchResultData;
  reasoning?: string | null;
  matching_method?: string | null;
  matched_by?: string | null;
}

export interface LineItemMatchingData {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  po_number: string | null;
  currency: string | null;
  fixture_key: string;
  status: string;
  stage_status: string;
  matching: {
    summary: {
      perfect: number;
      no_match: number;
      total_items: number;
    };
    match_type: string;
    invoice_line_items: CollapsedInvoiceItem[];
    grn_line_items: GrnLineItem[];
    results: MatchResult[];
    tolerance: ToleranceConfig | null;
    allowed_range: AllowedRange | null;
    variance: VarianceData | null;
  };
}

export type VarianceStatus =
  | "balanced"
  | "within_tolerance"
  | "exceeds_tolerance"
  | "unchecked";

export type EffectiveStatus = "match" | "mismatch" | "acknowledged" | "exempt";
