from datetime import datetime
from typing import Optional
from pydantic import BaseModel

# percent_complete keyed by current_stage.slug (used when pipeline status = in_progress)
STAGE_PERCENT: dict[str, int] = {
    "ingestion":            5,
    "extraction":           20,
    "vendor_validation":    37,
    "metadata_validation":  54,
    "line_item_matching":   70,
    "bill_posting":         87,
}

# pipeline_run.status values that count as "awaiting action"
AWAITING_STATUSES = {"in_progress"}

# pipeline_run.status values that count as "matched" (deep in pipeline)
MATCHED_STAGE_SLUGS = {"line_item_matching", "bill_posting"}


def percent_for_run(run: dict) -> int:
    """Derive percent_complete from pipeline_run document."""
    status = run.get("status", "pending")
    if status == "completed":
        return 100
    if status == "failed":
        return 0
    cs = run.get("current_stage") or {}
    slug = cs.get("slug", "")
    return STAGE_PERCENT.get(slug, 0)


def display_status_for_run(run: dict) -> str:
    """
    Return a human-readable status string for the invoice list table.
    Maps new pipeline status model → legacy display values the frontend uses.
    """
    status = run.get("status", "pending")
    if status == "completed":
        return "posted"
    if status == "failed":
        return "rejected"
    cs = run.get("current_stage") or {}
    return cs.get("slug", "pending")


class KpiCounts(BaseModel):
    total: int
    awaiting_action: int
    matched: int
    posted: int


class InvoiceListItem(BaseModel):
    id: str
    file_name: str
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    total_amount: Optional[float] = None
    currency: Optional[str] = None
    status: str
    fixture_key: str
    percent_complete: int
    source: str = "manual"
    tag: Optional[str] = None
    # Who initiated the invoice: the signed-in uploader for manual/trigger
    # uploads, or the sender address for email-ingested invoices.
    assignee: Optional[str] = None
    stp_enabled: bool = False
    # Auto-Process cascade state: "processing" while STP works the invoice,
    # "waiting_review" when it holds for a human, "done" after auto-posting.
    # Absent for invoices never touched by STP.
    stp_state: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class InvoiceDetail(InvoiceListItem):
    current_stage: str
    document_id: str


class InvoiceStatusResponse(BaseModel):
    status: str
    current_stage: str
    percent_complete: int


class InvoiceListResponse(BaseModel):
    items: list[InvoiceListItem]
    total: int
    kpi: KpiCounts


class ScenarioChip(BaseModel):
    key: str
    label: str
    line_items: int
    currency: str


class ScenariosResponse(BaseModel):
    scenarios: list[ScenarioChip]


class UploadResponse(BaseModel):
    invoice_id: str
    fixture_key: str
    scenario: ScenarioChip
