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

// ── Line Items tab ────────────────────────────────────────────────────────────

export type MatchStatus = "perfect" | "no_match";

/** The single collapsed invoice line ("Total of invoice") — used by legacy variance bar. */
export interface CollapsedInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  price: number;
}

/** One row in the legacy GRN matching dataset. */
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

// ── Per-item matching (new UI) ────────────────────────────────────────────────

/** One GRN candidate row for a specific invoice line item. */
export interface GrnCandidate {
  id: string;
  po_number: string | null;
  grn_number: string | null;
  document_date?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  /** Pre-selected by the AI matcher. */
  is_matched: boolean;
  /** True for "probable" matches — shows "AI Suggests" badge. */
  is_ai_suggested: boolean;
  /** Signed difference: grn_qty − invoice_qty. Negative = less qty. */
  qty_diff: number;
  /** Signed difference: grn_total − invoice_total. Negative = below. */
  total_diff: number;
}

export type InvoiceLineStatus = "matched" | "probable" | "no_match";

/** One invoice line item with its matched GRN candidates. */
export interface InvoiceLinePerItem {
  id: string;            // "ILI-0001"
  item_code: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  match_status: InvoiceLineStatus;
  grn_candidates: GrnCandidate[];
}

// ── Aggregate data shape ──────────────────────────────────────────────────────

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
      probable: number;
      no_match: number;
      total_items: number;
    };
    match_type: string;
    invoice_line_items: CollapsedInvoiceItem[];
    grn_line_items: GrnLineItem[];
    results: MatchResult[];
    per_item_matching: InvoiceLinePerItem[];
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
