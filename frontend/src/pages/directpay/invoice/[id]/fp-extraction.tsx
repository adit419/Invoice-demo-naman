import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { CalendarOutlined, CheckCircleOutlined, ExclamationCircleOutlined, FileTextOutlined, TagOutlined, UserOutlined } from "@ant-design/icons";
import { Button as AntButton, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { withAuthGuard } from "@/components/AuthGuard";
import { ComponentHeaderAntd } from "@/components/matching";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Loader, useToast } from "@/components/ui";
import { RejectModal } from "@/components/RejectModal";
import { ApiError } from "@/services/api";
import { directpayService, DpFakturPajak, DpFakturPajakField, DpInvoiceRun } from "@/services/directpay";
import { StageTransitionOverlay } from "@/components/StageTransitionOverlay";

const PdfViewer = dynamic(() => import("@/components/PdfViewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-400">
      <Loader size="large" />
    </div>
  ),
});

// Mirrors P2P's own fp-extraction.tsx pacing exactly: a brief processing
// moment before handing off to the next stage, same StageTransitionOverlay
// convention every DirectPay stage transition uses.
const MATCHING_PHASE_MS = 2000;

const tableClassName = "dp-fp-table";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatFpValue(field: string, value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "taxable_amount" || field === "vat_amount") {
    const n = typeof value === "number" ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
  }
  return String(value);
}

function FpExtractionPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { toast } = useToast();

  const [run, setRun] = useState<DpInvoiceRun | null>(null);
  const [fp, setFp] = useState<DpFakturPajak | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(2);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(0.85);
  const [rotate, setRotate] = useState(0);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem("access_token"));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      let inv = await directpayService.getInvoice(id);
      // Defensive re-entry: FP is only ever navigated to once extraction is
      // confirmed, but if reached directly (e.g. a stale tab) run the same
      // extract step review.tsx's own load() would.
      if (inv.status === "extraction") {
        inv = await directpayService.extractInvoice(id);
      }
      setRun(inv);
      const data = await directpayService.getFakturPajak(id);
      setFp(data);
    } catch {
      toast("Invoice not found", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const isRejected = run?.status === "rejected";
  // Exactly at this stage — editable, Reject/Approve shown. Anything else
  // (already advanced past FP, or rejected) is read-only, same isActionable
  // split review.tsx and match.tsx both use.
  const isActionable = run?.status === "fp_extraction";

  const handleAcknowledge = async (fieldName: string, acknowledged: boolean) => {
    if (!id) return;
    try {
      const res = await directpayService.acknowledgeFakturPajakField(id, fieldName, acknowledged);
      setFp((prev) => (prev ? {
        ...prev,
        acknowledged_fields: res.acknowledged_fields,
        fields: prev.fields.map((f) => (f.field_name === fieldName ? { ...f, acknowledged } : f)),
      } : prev));
    } catch {
      toast("Could not acknowledge field", "error");
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await directpayService.approveFakturPajak(id, false);
      setBusy(false);
      setTransitioning(true);
      await sleep(MATCHING_PHASE_MS);
      // Extraction Postprocessing comes next now — it derives due_date/WHT/
      // net-payment fields from the contract's own payment schedule before
      // Matching runs its AI contract recommendation.
      router.push(`/directpay/invoice/${id}/extraction-postprocessing`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast("Acknowledge each mismatch before proceeding.", "error");
      } else {
        toast("Could not approve Faktur Pajak", "error");
      }
      setBusy(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!id) return;
    try {
      await directpayService.reviewAction(id, "reject", reason);
      setRejectOpen(false);
      router.push("/directpay/dashboard");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not reject invoice", "error");
    }
  };

  const blockingFields = useMemo(
    () => (fp?.fields ?? []).filter((f) => f.required && f.match_status === "mismatch" && !f.acknowledged),
    [fp]
  );
  const canApprove = blockingFields.length === 0;

  const columns: ColumnsType<DpFakturPajakField> = useMemo(
    () => [
      {
        title: "Field",
        key: "field",
        width: 220,
        onHeaderCell: () => ({ style: { background: "#F4F4F4", borderRight: "1px solid #E5E7EB" } }),
        onCell: (record) => ({
          style: {
            background: "#F4F4F4",
            borderRight: "1px solid #E5E7EB",
            boxShadow: record.match_status === "mismatch" && !record.acknowledged
              ? record.required ? "inset 2px 0 0 #C10008" : "inset 2px 0 0 #D97706"
              : undefined,
          },
        }),
        render: (_, record) => (
          <span style={{ fontSize: 14, fontWeight: 500, color: "#101828", letterSpacing: "-0.15px" }}>
            {record.display_name}
            {record.required && <span style={{ color: "#ef4444", fontSize: 14, marginLeft: 3 }}>*</span>}
          </span>
        ),
      },
      {
        title: "Faktur Pajak",
        key: "fp_value",
        width: 260,
        render: (_, record) => {
          const value = formatFpValue(record.field_name, record.fp_value);
          const isMatch = record.match_status === "match";
          const isAcked = record.acknowledged;
          return (
            <div className="flex items-center gap-2" style={{ width: "100%" }}>
              <span style={{ flex: 1, fontSize: 14, color: value === "—" ? "#9CA3AF" : "#414651", wordBreak: "break-word" }}>{value}</span>
              {isMatch ? (
                <span
                  title="System matched these values automatically"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 10px", borderRadius: 9999,
                    border: "1px solid #A5B4FC", background: "#EEF2FF", color: "#6366F1",
                    fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#6366F1">
                    <path d="M9 2C9 2 9.5 6.5 11 8C12.5 9.5 17 10 17 10C17 10 12.5 10.5 11 12C9.5 13.5 9 18 9 18C9 18 8.5 13.5 7 12C5.5 10.5 1 10 1 10C1 10 5.5 9.5 7 8C8.5 6.5 9 2 9 2Z" />
                  </svg>
                  Auto-approved
                </span>
              ) : isAcked ? (
                // Same circular check button as the Matching page's own
                // Acknowledge icon — a handled mismatch never looks "still
                // open", and stays clickable to revert while still editable.
                <button
                  type="button"
                  onClick={isActionable ? () => handleAcknowledge(record.field_name, false) : undefined}
                  title={isActionable ? "Acknowledged — click to revert" : "Acknowledged"}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    background: "#D6F4DE", border: "1px solid #A8E7B9",
                    cursor: isActionable ? "pointer" : "default", padding: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.3 4.9 8.7 9.5 3.6" stroke="#2A9F47" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : isActionable && record.required ? (
                <button
                  type="button"
                  onClick={() => handleAcknowledge(record.field_name, true)}
                  title="Acknowledge this mismatch"
                  style={{
                    flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap",
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.4px",
                    color: "#4C525E", background: "#ffffff",
                    border: "1px solid #D5D5D5", borderRadius: 4,
                    padding: "2px 7px", lineHeight: "14px", fontFamily: "Inter, sans-serif",
                  }}
                >
                  ACK
                </button>
              ) : null}
            </div>
          );
        },
      },
      {
        title: "Invoice",
        key: "invoice_value",
        width: 220,
        render: (_, record) => {
          const value = formatFpValue(record.field_name, record.invoice_value);
          return <span style={{ fontSize: 14, color: value === "—" ? "#9CA3AF" : "#414651" }}>{value}</span>;
        },
      },
    ],
    [isActionable]
  );

  const getRowClassName = (record: DpFakturPajakField): string => {
    if (selectedField === record.field_name) return "dp-fp-row-selected";
    if (record.match_status === "mismatch" && !record.acknowledged) {
      return record.required ? "dp-fp-row-mandatory-mismatch" : "dp-fp-row-optional-mismatch";
    }
    return "dp-fp-row-match";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <Loader size="large" />
      </div>
    );
  }
  if (!run || !fp) return null;

  if (transitioning) {
    return (
      <StageTransitionOverlay
        title="We're preparing the extraction postprocessing review."
        subtitle="This may take a few minutes. Please keep this page open."
        steps={[
          { label: "Verifying Faktur Pajak", status: "done" },
          { label: "Loading Extraction Postprocessing", status: "active" },
        ]}
      />
    );
  }

  const extracted = run.extracted;
  const metaItems = [
    { icon: <TagOutlined />, text: "Manual Upload" },
    extracted.vendor_name ? { icon: <UserOutlined />, text: extracted.vendor_name } : null,
    extracted.invoice_number ? { icon: <FileTextOutlined />, text: extracted.invoice_number } : null,
    extracted.invoice_date ? { icon: <CalendarOutlined />, text: extracted.invoice_date } : null,
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];

  const actionButtons = isRejected ? (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
      style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5" }}
    >
      Rejected
    </span>
  ) : isActionable ? (
    <Space>
      <AntButton danger onClick={() => setRejectOpen(true)} disabled={busy}>
        Reject
      </AntButton>
      <AntButton
        type="primary"
        onClick={handleApprove}
        loading={busy}
        disabled={busy || !canApprove}
        title={!canApprove ? `${blockingFields.length} field(s) require acknowledgement` : undefined}
      >
        Approve &amp; Continue
      </AntButton>
    </Space>
  ) : (
    <AntButton type="primary" onClick={() => router.push(`/directpay/invoice/${id}/extraction-postprocessing`)}>
      Next
    </AntButton>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#ffffff" }}>
      <style>{`
        .${tableClassName} .ant-table-bordered .ant-table-container,
        .${tableClassName} .ant-table-bordered .ant-table-container table,
        .${tableClassName} .ant-table-bordered .ant-table-container table > thead > tr > th,
        .${tableClassName} .ant-table-bordered .ant-table-container table > tbody > tr > td {
          border-color: #E5E7EB !important;
        }
        .${tableClassName} .ant-table-thead > tr > th {
          background: #F4F4F4 !important;
          color: #414651 !important;
          font-family: Inter, sans-serif !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          line-height: 22px !important;
          letter-spacing: -0.439px !important;
        }
        .${tableClassName} tr { cursor: pointer; }
        .${tableClassName} .dp-fp-row-match { background-color: #ffffff; }
        .${tableClassName} .dp-fp-row-match:hover > td { background-color: #f8fafc !important; }
        .${tableClassName} .dp-fp-row-mandatory-mismatch { background-color: #FFF0F0; }
        .${tableClassName} .dp-fp-row-mandatory-mismatch:hover > td { background-color: #fee2e2 !important; }
        .${tableClassName} .dp-fp-row-optional-mismatch { background-color: #FFFBEB; }
        .${tableClassName} .dp-fp-row-optional-mismatch:hover > td { background-color: #FEF3C7 !important; }
        .${tableClassName} .dp-fp-row-selected { background-color: #EFF6FF; }
        .${tableClassName} .dp-fp-row-selected:hover > td { background-color: #DBEAFE !important; }
        .${tableClassName} tr > td:first-child { background-color: #F4F4F4 !important; }
        .${tableClassName} .ant-table-container { border-radius: 8px !important; }
        .${tableClassName} .ant-table-container table { border-radius: 8px !important; overflow: hidden; }
      `}</style>

      <ComponentHeaderAntd
        title="Faktur Pajak"
        onBack={() => router.push(`/directpay/invoice/${id}/review`)}
        metaItems={metaItems}
        right={actionButtons}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: PDF viewer — page 2 by default, since the Faktur Pajak is the
            2nd page of the same invoice PDF for this vendor. No bbox overlay:
            unlike P2P's real OCR extraction, DP's FP fixtures carry no PDF
            coordinates to highlight. */}
        <div className="flex flex-col border-r" style={{ width: "50%", flexShrink: 0, borderColor: "#E5E7EB" }}>
          <div className="flex-1 overflow-auto py-4 px-3" style={{ background: "#F7F9FD" }}>
            <PdfViewer
              pdfUrl={directpayService.invoicePdfUrl(run.id)}
              authToken={token}
              page={pdfPage}
              scale={scale}
              rotate={rotate}
              onNumPages={setNumPages}
              activeBbox={null}
              isLineItemMode={false}
            />
          </div>
          <SourceViewerToolbar
            scale={scale}
            onZoomOut={() => setScale((s) => Math.max(ZOOM_MIN, parseFloat((s - ZOOM_STEP).toFixed(2))))}
            onZoomIn={() => setScale((s) => Math.min(ZOOM_MAX, parseFloat((s + ZOOM_STEP).toFixed(2))))}
            rotate={rotate}
            onRotateLeft={() => setRotate((r) => (r - 90 + 360) % 360)}
            onRotateRight={() => setRotate((r) => (r + 90) % 360)}
            currentPage={pdfPage}
            totalPages={numPages}
            onPrev={() => setPdfPage((p) => Math.max(1, p - 1))}
            onNext={() => setPdfPage((p) => Math.min(numPages, p + 1))}
          />
        </div>

        {/* Right: Faktur Pajak comparison panel */}
        <div
          className="flex-1 flex flex-col min-w-0 overflow-y-auto"
          style={{ background: "#ffffff", padding: "24px 28px" }}
          onClick={() => setSelectedField(null)}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 16px" }}>Extracted Data</h2>

          {!fp.has_fp_document ? (
            <div
              className="flex items-center gap-2"
              style={{
                padding: "12px 16px", borderRadius: 8, border: "1px dashed #D5D5D5",
                background: "#F9FAFB", color: "#6B7280", fontSize: 14,
              }}
            >
              No Faktur Pajak document on file for this invoice.
            </div>
          ) : (
            <div onClick={(e) => e.stopPropagation()}>
              <div
                className="flex items-center gap-3 mb-4"
                style={{
                  padding: "12px 16px", borderRadius: 8, border: `1px dashed ${canApprove ? "#86EFAC" : "#FCA5A5"}`,
                  background: canApprove ? "#F0FDF4" : "#FEF2F2",
                  color: canApprove ? "#15803D" : "#B91C1C",
                  fontSize: 14,
                }}
              >
                {canApprove ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
                {canApprove ? (
                  <span><strong>All fields matched.</strong> You&apos;re good to go!</span>
                ) : (
                  <span>
                    <strong>{blockingFields.length} mandatory field{blockingFields.length === 1 ? "" : "s"} need{blockingFields.length === 1 ? "s" : ""} attention.</strong> Acknowledge each mismatch before proceeding.
                  </span>
                )}
              </div>

              <div className="mb-4">
                <div style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>
                  FP No. <span style={{ color: "#ef4444" }}>*</span>
                </div>
                <div
                  style={{
                    height: 36, display: "flex", alignItems: "center", padding: "0 12px",
                    borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB",
                    fontFamily: "monospace", fontSize: 13, color: "#374151",
                  }}
                >
                  {fp.fp_number || "—"}
                </div>
              </div>

              <Table<DpFakturPajakField>
                className={tableClassName}
                columns={columns}
                dataSource={fp.fields}
                rowKey="field_name"
                pagination={false}
                size="middle"
                bordered
                tableLayout="fixed"
                onRow={(record) => ({
                  onClick: () => setSelectedField((prev) => (prev === record.field_name ? null : record.field_name)),
                })}
                rowClassName={getRowClassName}
              />
            </div>
          )}

          <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid #F3F4F6", fontSize: 12, color: "#9CA3AF" }}>
            Audit trail: extraction → Faktur Pajak match → extraction postprocessing → contract matching → bill posting.
          </div>
        </div>
      </div>

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        stage="fp_extraction"
      />
    </div>
  );
}

export default withAuthGuard(FpExtractionPage);
