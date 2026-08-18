from typing import Any, Optional

from pydantic import BaseModel


class DpFixtureChip(BaseModel):
    key: str
    label: str


class DpFixturesResponse(BaseModel):
    scenarios: list[DpFixtureChip]


class DpContractTriggerUploadRequest(BaseModel):
    """Mirrors DpTriggerUploadRequest on the invoice side: same result as
    POST /contracts/upload, but the contract is referenced by a
    fixture-resolvable file name instead of actual bytes. Used by the FE
    when the real file is large enough that sending its bytes through the
    dev proxy isn't worth it — DirectPay's fixture resolution and the PDF
    preview (read back from the fixture's own on-disk file, never from
    whatever the browser sent) work off the file name alone regardless."""
    file_name: str


class DpContractEditRequest(BaseModel):
    fields: dict[str, Any]


class DpContractApproveRequest(BaseModel):
    fields: Optional[dict[str, Any]] = None


class DpContractPostprocessingEditRequest(BaseModel):
    """Edits to the Contract Extraction Postprocessing stage's per-installment
    and one-time-payment derived fields — keyed by stringified index into the
    payment schedule's own `installments`/`one_time_payments` arrays (the
    schedule has no other stable per-row identifier), value is a
    {field_name: new_value} patch merged onto that row. Both are optional so
    a single field edit only needs to send the one row it touched."""
    installments: Optional[dict[str, dict[str, Any]]] = None
    one_time_payments: Optional[dict[str, dict[str, Any]]] = None


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
    """Mirrors P2P's own /ingestion/trigger-upload request shape for a single
    file (file_name) — same result as /invoices/upload, but the invoice is
    referenced by fixture-resolvable file name instead of an actual uploaded
    file. Extended, DP-only (P2P's own invoice/PO/GRN model has no equivalent
    need), with an optional file_names batch: a vendor's real documents come
    as a separate invoice + Faktur Pajak pair, a single file with the FP
    already embedded, or a mixed batch covering several documents at once —
    file_names lets a caller submit all of them in one request instead of one
    call per file. Exactly one of file_name / file_names should be given; if
    both are, file_names takes precedence."""
    file_name: Optional[str] = None
    file_names: Optional[list[str]] = None
    email: Optional[str] = None
    tag: Optional[str] = None


class DpAckThresholdRequest(BaseModel):
    value: int


class DpTotalBeforeVatThresholdRequest(BaseModel):
    enabled: bool
    threshold_pct: float
