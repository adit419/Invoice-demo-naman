// FP Extraction review screen — IDR-only pipeline stage between
// extraction and metadata_validation.
//
// Left  : Page 2 of the invoice PDF (where the Faktur Pajak lives), with
//         zoom/rotate/page controls via SourceViewerToolbar.
// Right : Comparison table (FP value vs invoice value) + Acknowledge + Approve.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button as AntButton, Space, Table } from "antd";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Spinner } from "@/components/ui";
import { invoicesService } from "@/services";
import type { ActiveBbox } from "@/components/PdfViewer";

const PdfViewer = dynamic(
  () => import("@/components/PdfViewer").then(m => m.PdfViewer),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center"><Spinner size="lg" /></div> }
);

import { withAuthGuard } from "@/components/AuthGuard";
import { RejectModal } from "@/components/RejectModal";
import { StageTransitionOverlay } from "@/components/StageTransitionOverlay";
import { ComponentHeaderAntd } from "@/components/matching";
import { Loader } from "@/components/ui";
import { useToast } from "@/components/ui";
import { ApiError, settingsService, stagesService } from "@/services";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FpField {
  field_name: string;
  display_name: string;
  fp_value: string | null;
  invoice_value: string | null;
  match_status: "match" | "mismatch";
  required: boolean;
  bbox_left: number | null;
  bbox_top: number | null;
  bbox_width: number | null;
  bbox_height: number | null;
  bbox_page: number;
  confidence: number | null;
}

interface FpExtractionData {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  currency: string;
  file_name: string;
  stage_status: string;
  fp_number: string | null;
  fp_date: string | null;
  fields: FpField[];
  has_fp_document: boolean;
  acknowledged_fields: string[];
}


// ── Page ──────────────────────────────────────────────────────────────────────

function FpExtractionPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const { toast } = useToast();

  const [data, setData] = useState<FpExtractionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [selectedFieldName, setSelectedFieldName] = useState<string | null>(null);
  // Seeded from server on load; mutations are persisted immediately via API.
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [activeBbox, setActiveBbox] = useState<ActiveBbox | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(1);
  // FP document is on page 2 of the invoice PDF.
  const [pdfPage, setPdfPage] = useState(2);
  const [scale, setScale] = useState(0.85);
  const [rotate, setRotate] = useState(0);

  useEffect(() => { setToken(localStorage.getItem("access_token")); }, []);

  useEffect(() => {
    if (!id) return;
    stagesService
      .get<FpExtractionData>(id, "fp_extraction")
      .then((d) => {
        setData(d);
        // Seed acknowledged state from server so it survives navigation.
        if (d.acknowledged_fields?.length) {
          setAcknowledged(new Set(d.acknowledged_fields));
        }
      })
      .catch(() => toast("Failed to load FP extraction data", "error"))
      .finally(() => setLoading(false));
  }, [id]);

  function handleRowClick(record: FpField) {
    const name = record.field_name;
    setSelectedFieldName((prev) => (prev === name ? null : name));

    // Navigate to the field's page and set the highlight bbox.
    if (
      record.bbox_left != null &&
      record.bbox_top != null &&
      record.bbox_width != null &&
      record.bbox_height != null
    ) {
      const page = record.bbox_page ?? 2;
      setPdfPage(page);
      setActiveBbox({
        bbox_left: record.bbox_left,
        bbox_top: record.bbox_top,
        bbox_width: record.bbox_width,
        bbox_height: record.bbox_height,
        page,
        confidence: record.confidence ?? 1,
        label: record.display_name,
        value: record.fp_value ?? undefined,
        id: record.field_name,
      });
    } else {
      setActiveBbox(null);
    }
  }

  async function handleAcknowledge(fieldName: string) {
    try {
      await stagesService.acknowledgeFpFields(id, [fieldName]);
      setAcknowledged((prev) => new Set([...prev, fieldName]));
    } catch {
      toast("Failed to acknowledge field", "error");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert type="error" message="Failed to load FP extraction data." />
      </div>
    );
  }

  // Redirect if stage is not yet in_review (e.g., invoice navigated here directly
  // before fp_extraction was triggered).
  if (data.stage_status === "pending" || data.stage_status === "start") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Alert type="warning" message="FP Extraction is not yet available for this invoice." />
        <AntButton onClick={() => router.push(`/invoice/${id}/review`)}>
          ← Back to Extraction
        </AntButton>
      </div>
    );
  }

  const requiredMismatches = data.fields.filter(
    (f) => f.required && f.match_status === "mismatch" && !acknowledged.has(f.field_name),
  );
  const canApprove = requiredMismatches.length === 0;
  const isAlreadyApproved = data.stage_status === "approved" || data.stage_status === "completed";

  async function handleApprove() {
    if (!id) return;
    setConfirming(true);
    try {
      await stagesService.approve(id, "fp_extraction");
      // With Auto-Process on, return the reviewer to the dashboard — STP
      // continues the remaining stages in the background.
      try {
        const stp = await settingsService.getStp();
        if (stp.stp_enabled) { router.push("/dashboard"); return; }
      } catch { /* fall through to normal stage navigation */ }
      setTransitioning(true);
      setTimeout(() => router.push(`/invoice/${id}/matching?tab=metadata`), 2000);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Approval failed", "error");
      setConfirming(false);
    }
  }

  async function handleReject(reason: string) {
    if (!id) return;
    try {
      await stagesService.reject(id, "fp_extraction", reason);
      toast("Invoice rejected", "error");
      setRejectOpen(false);
      router.push("/dashboard");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Reject failed", "error");
    }
  }

  const TABLE_CLASS = "fp-validation-table";
  const ROW_PREFIX = "fp";

  const tableStyles = `
    .${TABLE_CLASS} .ant-table-bordered .ant-table-container,
    .${TABLE_CLASS} .ant-table-bordered .ant-table-container table,
    .${TABLE_CLASS} .ant-table-bordered .ant-table-container table > thead > tr > th,
    .${TABLE_CLASS} .ant-table-bordered .ant-table-container table > tbody > tr > td {
      border-color: #E5E7EB !important;
    }
    .${TABLE_CLASS} .ant-table-thead > tr > th {
      background: #F4F4F4 !important;
      color: #414651 !important;
      font-family: Inter, sans-serif !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      line-height: 22px !important;
      letter-spacing: -0.439px !important;
    }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-match { background-color: #ffffff; }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-match:hover > td { background-color: #f8fafc !important; }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-match > td:first-child,
    .${TABLE_CLASS} .${ROW_PREFIX}-row-match:hover > td:first-child {
      background-color: #F4F4F4 !important;
      border-right: 1px solid #E5E7EB !important;
    }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-selected { background-color: #EFF6FF; }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-selected:hover > td { background-color: #DBEAFE !important; }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-selected > td:first-child,
    .${TABLE_CLASS} .${ROW_PREFIX}-row-selected:hover > td:first-child {
      background-color: #F4F4F4 !important;
      border-right: 1px solid #E5E7EB !important;
    }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-mandatory-mismatch { background-color: #FFF0F0; }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-mandatory-mismatch:hover > td { background-color: #fee2e2 !important; }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-mandatory-mismatch > td:first-child,
    .${TABLE_CLASS} .${ROW_PREFIX}-row-mandatory-mismatch:hover > td:first-child {
      background-color: #F4F4F4 !important;
      border-right: 1px solid #E5E7EB !important;
    }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-optional-mismatch { background-color: #FFFBEB; }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-optional-mismatch:hover > td { background-color: #FEF3C7 !important; }
    .${TABLE_CLASS} .${ROW_PREFIX}-row-optional-mismatch > td:first-child,
    .${TABLE_CLASS} .${ROW_PREFIX}-row-optional-mismatch:hover > td:first-child {
      background-color: #F4F4F4 !important;
      border-right: 1px solid #E5E7EB !important;
    }
    .${TABLE_CLASS} .ant-table-tbody > tr > td {
      word-break: break-word;
      white-space: normal !important;
    }
    .${TABLE_CLASS} .ant-table-container { border-radius: 8px !important; }
    .${TABLE_CLASS} .ant-table-container table { border-radius: 8px !important; overflow: hidden; }
  `;

  const getFpRowClass = (record: FpField) => {
    if (record.field_name === selectedFieldName) return `${ROW_PREFIX}-row-selected`;
    const isAck = acknowledged.has(record.field_name);
    if (record.match_status === "match" || isAck) return `${ROW_PREFIX}-row-match`;
    return record.required ? `${ROW_PREFIX}-row-mandatory-mismatch` : `${ROW_PREFIX}-row-optional-mismatch`;
  };

  const isMismatch = (record: FpField) =>
    record.match_status === "mismatch" && !acknowledged.has(record.field_name);

  const columns = [
    {
      title: "Field",
      dataIndex: "display_name",
      key: "field",
      onHeaderCell: () => ({ style: { background: "#F4F4F4", borderRight: "1px solid #E5E7EB", minWidth: 200 } }),
      onCell: (record: FpField) => ({
        style: {
          background: "#F4F4F4",
          boxShadow: isMismatch(record)
            ? record.required ? "inset 2px 0 0 #C10008" : "inset 2px 0 0 #D97706"
            : undefined,
          borderRight: "1px solid #E5E7EB",
          minWidth: 200,
        },
      }),
      render: (_: string, record: FpField) => (
        <div className="flex items-center" style={{ width: "100%" }}>
          <span style={{ color: "#101828", fontSize: 14, fontWeight: 500, lineHeight: "22px", letterSpacing: "-0.15px", fontFamily: "Inter, sans-serif" }}>
            {record.display_name}
          </span>
          {record.required && <span style={{ color: "#ef4444", fontSize: 14, marginLeft: 2, lineHeight: 1 }}>*</span>}
        </div>
      ),
    },
    {
      title: "Faktur Pajak",
      dataIndex: "fp_value",
      key: "fp_value",
      onHeaderCell: () => ({ style: { minWidth: 240 } }),
      onCell: () => ({ style: { minWidth: 240 } }),
      render: (val: string | null, record: FpField) => {
        const isAck = acknowledged.has(record.field_name);
        const showAck = record.required && record.match_status === "mismatch" && !isAck;
        const isMatch = record.match_status === "match";
        return (
          <div className="flex items-center gap-2" style={{ width: "100%", flexWrap: "wrap" }}>
            <div style={{ flex: 1, color: val ? "#414651" : "#9CA3AF", wordBreak: "break-word", fontSize: 14 }}>
              {val || "—"}
            </div>
            {isMatch && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 10px", borderRadius: 9999,
                border: "1px solid #A5B4FC", background: "#EEF2FF", color: "#6366F1",
                fontSize: 13, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap",
              }} title="System matched these values automatically">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#6366F1" style={{ flexShrink: 0 }}>
                  <path d="M9 2C9 2 9.5 6.5 11 8C12.5 9.5 17 10 17 10C17 10 12.5 10.5 11 12C9.5 13.5 9 18 9 18C9 18 8.5 13.5 7 12C5.5 10.5 1 10 1 10C1 10 5.5 9.5 7 8C8.5 6.5 9 2 9 2Z" />
                </svg>
                Auto-approved
              </span>
            )}
            {isAck && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 10px", borderRadius: 9999,
                border: "1px solid #86EFAC", background: "#F0FDF4", color: "#16A34A",
                fontSize: 13, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap",
              }}>
                <CheckCircleOutlined style={{ fontSize: 13 }} />
                Acknowledged
              </span>
            )}
            {showAck && (
              <AntButton
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={(e) => { e.stopPropagation(); void handleAcknowledge(record.field_name); }}
                style={{ flexShrink: 0 }}
              >
                Acknowledge
              </AntButton>
            )}
          </div>
        );
      },
    },
    {
      title: "Invoice",
      dataIndex: "invoice_value",
      key: "invoice_value",
      onHeaderCell: () => ({ style: { minWidth: 200 } }),
      onCell: () => ({ style: { minWidth: 200 } }),
      render: (val: string | null) => (
        <span style={{ color: val ? "#414651" : "#9CA3AF", fontSize: 14, wordBreak: "break-word" }}>
          {val || "—"}
        </span>
      ),
    },
  ];

  const allMatch = data.fields.every((f) => f.match_status === "match" || acknowledged.has(f.field_name));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#fff" }}>
      {transitioning && (
        <StageTransitionOverlay
          title="FP Extraction Validated"
          subtitle="Running line-item matching…"
          steps={[
            { label: "Extraction reviewed", status: "done" },
            { label: "Metadata validated", status: "done" },
            { label: "Faktur Pajak verified", status: "done" },
            { label: "Line-item matching", status: "active" },
          ]}
          onBack={() => setTransitioning(false)}
        />
      )}

      {/* Header */}
      <ComponentHeaderAntd
        title="Faktur Pajak"
        onBack={() => router.push(`/invoice/${id}/review`)}
        metaItems={[
          { icon: <UserOutlined />, text: data.vendor_name ?? "" },
          ...(data.invoice_number ? [{ icon: <FileTextOutlined />, text: data.invoice_number }] : []),
          ...(data.invoice_date ? [{ icon: <CalendarOutlined />, text: data.invoice_date }] : []),
        ]}
        right={
          isAlreadyApproved ? (
            <AntButton type="primary" onClick={() => router.push(`/invoice/${id}/matching?tab=metadata`)}>
              Next →
            </AntButton>
          ) : (
            <Space>
              <AntButton
                danger
                onClick={() => setRejectOpen(true)}
                disabled={confirming}
              >
                Reject
              </AntButton>
              <AntButton
                type="primary"
                loading={confirming}
                disabled={!canApprove}
                title={
                  !canApprove
                    ? `${requiredMismatches.length} field(s) require acknowledgement`
                    : undefined
                }
                onClick={handleApprove}
              >
                Approve & Continue
              </AntButton>
            </Space>
          )
        }
      />

      {/* Body */}
      <div
        onClick={() => { setSelectedFieldName(null); setActiveBbox(null); }}
        style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}
      >
        {/* LEFT: real PDF — page 2 contains the Faktur Pajak */}
        <div style={{ width: "50%", borderRight: "1px solid #E5E7EB", overflow: "hidden", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 12px", background: "#F7F9FD" }}>
            <PdfViewer
              pdfUrl={invoicesService.fileUrl(id)}
              authToken={token}
              page={pdfPage}
              scale={scale}
              rotate={rotate}
              onNumPages={setNumPages}
              activeBbox={activeBbox}
            />
          </div>
          <SourceViewerToolbar
            scale={scale}
            onZoomOut={() => setScale(s => Math.max(ZOOM_MIN, parseFloat((s - ZOOM_STEP).toFixed(1))))}
            onZoomIn={() => setScale(s => Math.min(ZOOM_MAX, parseFloat((s + ZOOM_STEP).toFixed(1))))}
            rotate={rotate}
            onRotateLeft={() => setRotate(r => (r - 90 + 360) % 360)}
            onRotateRight={() => setRotate(r => (r + 90) % 360)}
            currentPage={pdfPage}
            totalPages={numPages}
            onPrev={() => setPdfPage(p => Math.max(1, p - 1))}
            onNext={() => setPdfPage(p => Math.min(numPages, p + 1))}
          />
        </div>

        {/* RIGHT: extracted data panel */}
        <div
          style={{ flex: 1, overflowY: "auto", padding: "24px 28px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>Extracted Data</div>

          {/* Status banner — matches MetadataTab style */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px", borderRadius: 8,
            background: canApprove ? "#F0FDF4" : "#FEF2F2",
            border: `1px dashed ${canApprove ? "#86EFAC" : "#FCA5A5"}`,
            color: canApprove ? "#15803D" : "#B91C1C",
            fontSize: 14,
          }}>
            {canApprove ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 7v6M12 16v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
            <span>
              {allMatch ? (
                <><strong>All fields matched.</strong> You&apos;re good to go!</>
              ) : canApprove ? (
                <><strong>All required mismatches acknowledged.</strong> You&apos;re good to go!</>
              ) : (
                <>
                  <strong>{requiredMismatches.length} mandatory field{requiredMismatches.length === 1 ? "" : "s"} need{requiredMismatches.length === 1 ? "s" : ""} attention.</strong>{" "}
                  Acknowledge each mismatch before proceeding.
                </>
              )}
            </span>
          </div>

          {/* FP No */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>
              FP No. <span style={{ color: "#ef4444" }}>*</span>
            </div>
            <div
              style={{
                height: 36,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                borderRadius: 6,
                border: "1px solid #E5E7EB",
                background: "#F9FAFB",
                fontFamily: "monospace",
                fontSize: 13,
                color: "#374151",
              }}
            >
              {data.fp_number ?? "—"}
            </div>
          </div>

          {/* Comparison table — matches MetadataTab (MetadataAntdTable) style */}
          <style>{tableStyles}</style>
          <Table<FpField>
            className={TABLE_CLASS}
            dataSource={data.fields.map((f) => ({ ...f, key: f.field_name }))}
            columns={columns}
            pagination={false}
            bordered
            size="middle"
            rowClassName={getFpRowClass}
            locale={{ emptyText: "No FP fields to compare." }}
            onRow={(record) => ({
              style: { cursor: "pointer" },
              onClick: (e) => {
                e.stopPropagation();
                handleRowClick(record);
              },
            })}
          />

          {/* Audit footer */}
          <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12, fontSize: 12, color: "#9CA3AF", marginTop: "auto" }}>
            Audit trail: ingest → OCR → metadata validation → Faktur Pajak match → GL code → PPN check → post.
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
