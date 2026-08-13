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


class DpBillPostingEditRequest(BaseModel):
    line_items: dict[str, dict[str, Any]]  # row_id -> {gl_account_code?, vat_tax_code?, wht_tax_code?}


class DpStpRequest(BaseModel):
    enabled: bool


class DpAckThresholdRequest(BaseModel):
    value: int
