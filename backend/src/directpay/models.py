from typing import Any, Optional

from pydantic import BaseModel, field_validator


class DpTriggerUploadBase(BaseModel):
    """The shared trigger-upload payload: ONE mandatory field and TWO optional.

        file_names  required  the document(s) to ingest
        email       optional  address to notify
        tag         optional  free-form label recorded on the run

    `file_names` covers single AND multiple uploads on its own — a bare string
    is accepted and coerced to a one-element list — so there is no second
    "file_name" field to keep in sync, and no way to send a request that
    specifies neither or both. Both trigger-upload endpoints (contracts and
    invoices) take exactly this shape.
    """
    file_names: list[str]
    email: Optional[str] = None
    tag: Optional[str] = None

    @field_validator("file_names", mode="before")
    @classmethod
    def _accept_single_name(cls, v):
        # A single upload is the common case and shouldn't have to wrap itself
        # in a list; {"file_names": "X.pdf"} and {"file_names": ["X.pdf"]} are
        # the same request.
        if isinstance(v, str):
            return [v]
        return v

    @field_validator("file_names")
    @classmethod
    def _require_a_real_name(cls, v: list[str]) -> list[str]:
        names = [n.strip() for n in (v or []) if isinstance(n, str) and n.strip()]
        if not names:
            raise ValueError("file_names must contain at least one non-empty file name")
        return names

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip() and "@" not in v:
            raise ValueError("Invalid notification email address")
        return v


class DpFixtureChip(BaseModel):
    key: str
    label: str


class DpFixturesResponse(BaseModel):
    scenarios: list[DpFixtureChip]


class DpContractTriggerUploadRequest(DpTriggerUploadBase):
    """POST /contracts/trigger-upload — same result as POST /contracts/upload,
    but the contract is referenced by a fixture-resolvable file name instead of
    actual bytes. DirectPay's fixture resolution and the PDF preview (read back
    from the fixture's own on-disk file, never from whatever the browser sent)
    work off the file name alone, so no bytes are needed.

    Payload is DpTriggerUploadBase verbatim — identical to the invoice side's
    (see DpTriggerUploadRequest)."""


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


class DpBillPostingSimulateRequest(BaseModel):
    """Unsaved line-item tax-code selections to preview against. Optional — an
    empty body simulates the run exactly as stored."""
    line_items: Optional[dict[str, dict[str, Any]]] = None


class DpEscalateRequest(BaseModel):
    """The reviewer's own note, the only caller-supplied part of an escalation
    email — subject and body are composed server-side (see
    service.escalate_invoice on why)."""
    note: Optional[str] = None


class DpStpRequest(BaseModel):
    enabled: bool


class DpTriggerUploadRequest(DpTriggerUploadBase):
    """POST /ingestion/trigger-upload — same result as /invoices/upload, but the
    invoice is referenced by a fixture-resolvable file name instead of actual
    bytes. A vendor's real documents come as a separate invoice + Faktur Pajak
    pair, a single file with the FP already embedded, or a mixed batch covering
    several documents at once, so `file_names` carries however many a caller
    has rather than forcing one request per file.

    Payload is DpTriggerUploadBase verbatim — identical to the contract side's
    (see DpContractTriggerUploadRequest)."""


class DpAckThresholdRequest(BaseModel):
    value: int


class DpMatchedInstallmentRequest(BaseModel):
    # None reverts to the automatic amount-proximity match.
    installment_index: Optional[int] = None


class DpTotalBeforeVatThresholdRequest(BaseModel):
    enabled: bool
    threshold_pct: float
