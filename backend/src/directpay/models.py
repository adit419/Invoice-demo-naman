from typing import Any, Optional

from pydantic import BaseModel


class DpFixtureChip(BaseModel):
    key: str
    label: str


class DpFixturesResponse(BaseModel):
    scenarios: list[DpFixtureChip]


class DpContractEditRequest(BaseModel):
    fields: dict[str, Any]


class DpContractApproveRequest(BaseModel):
    fields: Optional[dict[str, Any]] = None


class DpInvoiceEditRequest(BaseModel):
    extracted: dict[str, Any]


class DpCopyFromContractRequest(BaseModel):
    field: str


class DpInvoiceConfirmExtractionRequest(BaseModel):
    extracted: Optional[dict[str, Any]] = None


class DpInvoiceMatchRequest(BaseModel):
    contract_id: str


class DpAcknowledgeRequest(BaseModel):
    invoice_id: str
    finding_id: str
    acknowledged: bool = True


class DpReviewActionRequest(BaseModel):
    invoice_id: str
    action: str  # approve | reject
    force: bool = False
    reason: Optional[str] = None


class DpFpAcknowledgeRequest(BaseModel):
    field_name: str
    acknowledged: bool = True


class DpFpApproveRequest(BaseModel):
    force: bool = False


class DpBillPostingEditRequest(BaseModel):
    line_items: dict[str, dict[str, Any]]  # row_id -> {gl_account_code?, vat_tax_code?, wht_tax_code?}


class DpStpRequest(BaseModel):
    enabled: bool


class DpTriggerUploadRequest(BaseModel):
    """Mirrors P2P's own /ingestion/trigger-upload request shape exactly:
    same result as /invoices/upload, but the invoice is referenced by
    fixture-resolvable file name instead of an actual uploaded file."""
    file_name: str
    email: Optional[str] = None
    tag: Optional[str] = None


class DpAckThresholdRequest(BaseModel):
    value: int
