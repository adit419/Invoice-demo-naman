/**
 * Shared types for the Bill Posting subcomponents.
 *
 * Mirrors the demo's `/api/v1/invoices/{id}/stages/bill_posting` GET response.
 */
export interface BillLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  account_id?: string;
  account_code?: string;
  account_name?: string;
  tax_type?: string;
  tax_id?: string;
  vat_tax_code?: string;
  wht_tax_code?: string;
}

export interface BillHeader {
  vendor_name: string;
  bill_number: string;
  bill_date: string;
  due_date: string;
  reference: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  /** Present only for vendors subject to WHT (e.g. yellow_brick fixture). */
  wht?: number;
  net_amount_after_wht?: number;
}

export interface BillPostingErp {
  bill_id?: string;
  bill_number?: string;
  zoho_reference?: string;
  /** Direct deep-link into the Zoho Books bill. Empty until Post-to-ERP succeeds. */
  zoho_url?: string;
  posted_at?: string | null;
}

export interface BillPostingData {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  /** Original uploaded PDF filename — used for the success-banner source-file chip. */
  file_name?: string;
  fixture_key: string;
  /** "in_progress" / "in_review" / "completed" / "failed" */
  status: string;
  bill_header: BillHeader;
  line_items: BillLineItem[];
  /**
   * SAP-style metadata edits the user saved before clicking Post-to-ERP.
   * Keys: reference, text, ref_key_head_1, ref_key_head_2, assignment,
   *       doc_header, ref_key_2.
   */
  metadata_overrides?: Record<string, string>;
  /** Zoho post outcome — populated after a successful Post-to-ERP. */
  erp?: BillPostingErp;
}

export interface LineItemEdit {
  /** Selected VAT tax code (see VAT_OPTIONS in BillPostingTable). */
  vat_tax_code: string;
  /** Selected WHT tax code (see WHT_OPTIONS in BillPostingTable). */
  wht_tax_code: string;
}
