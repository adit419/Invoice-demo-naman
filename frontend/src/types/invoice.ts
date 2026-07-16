export interface KpiCounts {
  total: number;
  awaiting_action: number;
  matched: number;
  posted: number;
}

export interface InvoiceListItem {
  id: string;
  file_name: string;
  vendor_name: string | null;
  invoice_number: string | null;
  total_amount: number | null;
  currency: string | null;
  status: string;
  fixture_key: string;
  percent_complete: number;
  source?: string;
  /** Signed-in uploader (manual/trigger) or sender address (email ingestion). */
  assignee?: string | null;
  /** Auto-Process state: "processing" | "waiting_review" | "done" (absent when STP never ran). */
  stp_state?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceListResponse {
  items: InvoiceListItem[];
  total: number;
  kpi: KpiCounts;
}

export interface InvoiceDetail extends InvoiceListItem {
  current_stage: string;
  document_id: string;
}

export interface InvoiceStatusResponse {
  status: string;
  current_stage: string;
  percent_complete: number;
}

export interface ScenarioChip {
  key: string;
  label: string;
  line_items: number;
  currency: string;
}

export interface UploadResponse {
  invoice_id: string;
  fixture_key: string;
  scenario: ScenarioChip;
}

export interface ScenariosResponse {
  scenarios: ScenarioChip[];
}
