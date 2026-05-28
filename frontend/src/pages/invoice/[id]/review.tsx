import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";
import { RejectModal } from "@/components/RejectModal";
import { Loader } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, settingsService, stagesService } from "@/services";
import { useToast } from "@/components/ui";
import { formatDate } from "@/utils/format";
import type { ActiveBbox } from "@/components/PdfViewer";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { StageTransitionOverlay } from "@/components/StageTransitionOverlay";
import { usePipelineCompleted } from "@/hooks/usePipelineCompleted";
import { ExtractionEditHistory } from "@/components/ExtractionEditHistory";

const PdfViewer = dynamic(
  () => import("@/components/PdfViewer").then(m => m.PdfViewer),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center"><Loader size="large" /></div> }
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface MetaField { field: string; value: string; }
interface LineItem {
  id: number; row_id: string; item_code: string; item_description: string;
  unit_of_measurement: string; quantity: number; unit_price: number;
  total_price_before_vat: number;
}
interface BboxMeta {
  field: string; row_id?: string; bbox_left: number; bbox_top: number;
  bbox_width: number; bbox_height: number; page: number; value_confidence: number;
}
interface BboxLineItem {
  row_id: string; bbox_left: number; bbox_top: number; bbox_width: number;
  bbox_height: number; page: number;
  item_code_confidence: number; item_description_confidence: number;
  unit_of_measurement_confidence: number; quantity_confidence: number;
  unit_price_confidence: number; total_price_before_vat_confidence: number;
}
interface ExtractionData {
  invoice_schema: { metadata: MetaField[]; line_items: LineItem[] };
  bbox_schema: { metadata: BboxMeta[]; line_items: BboxLineItem[] };
  status: string; stage_status: string; fixture_key: string; file_name: string;
  vendor_name: string | null; invoice_number: string | null;
  total_amount: number | null; currency: string | null;
}
// ── Constants ─────────────────────────────────────────────────────────────────

import { envConfig } from "@/config/envConfig";

const BASE = envConfig.BE_BASE_URL;

const LOW_CONF = 0.85;

function fieldLabel(f: string) {
  return f.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function avgLineConf(item: BboxLineItem): number {
  const vals = [
    item.item_code_confidence, item.item_description_confidence,
    item.quantity_confidence, item.unit_price_confidence,
    item.total_price_before_vat_confidence,
  ].filter(v => typeof v === "number" && !isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n);
}


// ── Main Review Page ───────────────────────────────────────────────────────────

function ReviewPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const isCompleted = usePipelineCompleted(id);

  const [data, setData] = useState<ExtractionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"metadata" | "line_items">("metadata");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [rotate, setRotate] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  // Pending line-item edits — key = `${row_id}|${field}` → string value (always
  // sent as a string; backend coerces numeric fields).
  const [lineItemEdits, setLineItemEdits] = useState<Record<string, string>>({});
  // Edit-history panel state — replaces right-panel content when true
  const [showEditHistory, setShowEditHistory] = useState(false);
  // Whether any edits have been recorded server-side for this invoice's
  // extraction stage. Fetched once on mount; disables "View Edit History"
  // when false so the button is only clickable if there's history to show.
  const [hasEditHistory, setHasEditHistory] = useState(false);
  // Live mandatory map from workflow settings — re-fetched on each mount so that
  // edits in /admin/workflow-settings reflect immediately on this page.
  const [mandatoryMap, setMandatoryMap] = useState<Record<string, boolean>>({});
  // Mask-driven visibility (null = no config → show everything). A field is
  // shown only when its workflow-settings Mask toggle is ON.
  const [maskMeta, setMaskMeta] = useState<Set<string> | null>(null);
  const [maskLine, setMaskLine] = useState<Set<string> | null>(null);
  // Per-field minimum-confidence threshold (workflow-settings Tolerance %, 0–100
  // → 0–1). When a field's extraction confidence is below it the row is flagged
  // red. Falls back to LOW_CONF when no tolerance is configured.
  const [confThreshMeta, setConfThreshMeta] = useState<Record<string, number>>({});
  const [confThreshLine, setConfThreshLine] = useState<Record<string, number>>({});

  useEffect(() => { setToken(localStorage.getItem("access_token")); }, []);

  // Pre-fetch edit-history count so we can enable "View Edit History" only
  // when there is actually something to show.
  useEffect(() => {
    if (!id) return;
    stagesService
      .extractionEdits<{ items: unknown[] }>(id)
      .then(res => setHasEditHistory((res.items ?? []).length > 0))
      .catch(() => setHasEditHistory(false));
  }, [id]);

  useEffect(() => {
    type WfField = { key: string; mandatory?: boolean; mask?: boolean; tolerance?: number | null };
    settingsService.getWorkflow<{
      extraction_metadata?: { fields?: WfField[] };
      extraction_line_items?: { fields?: WfField[] };
    }>()
      .then(settings => {
        const metaFields = settings.extraction_metadata?.fields ?? [];
        const lineFields = settings.extraction_line_items?.fields ?? [];
        const map: Record<string, boolean> = {};
        for (const f of metaFields) map[f.key] = !!f.mandatory;
        setMandatoryMap(map);
        // Tolerance (%) → confidence threshold (0–1). Only set when configured.
        const buildConf = (arr: WfField[]) => {
          const t: Record<string, number> = {};
          for (const f of arr) {
            if (f.tolerance != null && f.tolerance > 0) t[f.key] = f.tolerance / 100;
          }
          return t;
        };
        setConfThreshMeta(buildConf(metaFields));
        setConfThreshLine(buildConf(lineFields));
        setMaskMeta(
          metaFields.length
            ? new Set(metaFields.filter(f => f.mask !== false).map(f => f.key))
            : null,
        );
        setMaskLine(
          lineFields.length
            ? new Set(lineFields.filter(f => f.mask !== false).map(f => f.key))
            : null,
        );
      })
      .catch(() => { /* fall back: nothing required, show everything */ });
  }, []);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const result = await stagesService.get<ExtractionData>(id, "extraction");
      setData(result);
    } catch {
      toast("Failed to load extraction data", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Derive activeBbox from activeKey + activeTab (with padding for visibility)
  const activeBbox: ActiveBbox | null = (() => {
    if (!data || !activeKey) return null;
    if (activeTab === "metadata") {
      const b = data.bbox_schema.metadata.find(b => b.field === activeKey);
      if (!b) return null;
      const meta = data.invoice_schema.metadata.find(m => m.field === activeKey);
      return {
        // Raw normalized coords — PdfViewer applies validator-fe-style padding.
        bbox_left: b.bbox_left,
        bbox_top: b.bbox_top,
        bbox_width: b.bbox_width,
        bbox_height: b.bbox_height,
        page: b.page, confidence: b.value_confidence,
        confidenceThreshold: LOW_CONF,
        id: `meta-${b.field}`,
        label: fieldLabel(b.field), value: meta?.value,
      };
    } else {
      const b = data.bbox_schema.line_items.find(b => b.row_id === activeKey);
      if (!b) return null;
      const li = data.invoice_schema.line_items.find(l => l.row_id === activeKey);
      return {
        bbox_left: b.bbox_left,
        bbox_top: b.bbox_top,
        bbox_width: b.bbox_width,
        bbox_height: b.bbox_height,
        page: b.page, confidence: avgLineConf(b),
        confidenceThreshold: LOW_CONF,
        id: `li-${b.row_id}`,
        label: li?.item_code ?? "Line Item",
        value: li?.item_description?.slice(0, 40),
      };
    }
  })();

  // Auto-navigate to the bbox's page when selection changes
  useEffect(() => {
    if (activeBbox && activeBbox.page !== pdfPage) {
      setPdfPage(activeBbox.page);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const handleApprove = async () => {
    if (!id) return;
    if (data?.status === "approved" || data?.status === "completed") {
      // vendor_validation is skipped, metadata + line-items now live in a
      // single tabbed page at /matching. Land on the Metadata tab.
      router.push(`/invoice/${id}/matching?tab=metadata`);
      return;
    }
    setApproving(true);
    try {
      // Auto-save any inline edits before approving (no separate Save step).
      const metadata_edits = Object.entries(edits).map(([field, value]) => ({ field, value }));
      const line_item_edits = Object.entries(lineItemEdits).map(([key, value]) => {
        const sep = key.indexOf("|");
        return { row_id: key.slice(0, sep), field: key.slice(sep + 1), value };
      });
      if (metadata_edits.length > 0 || line_item_edits.length > 0) {
        try {
          await stagesService.editExtraction(id, { metadata_edits, line_item_edits });
          // Edits are now recorded — enable the history button if the user
          // stays on this page (e.g. approval fails and they retry).
          setHasEditHistory(true);
        } catch (saveErr) {
          console.warn("[ReviewPage] auto-save before approve failed:", saveErr);
        }
      }
      const res = await stagesService.approve(id, "extraction");
      setTransitioning(true);
      setTimeout(() => router.push(res.redirect), 2500);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Approval failed", "error");
      setApproving(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!id) return;
    await stagesService.reject(id, "extraction", reason);
    toast("Invoice rejected", "error");
    setRejectOpen(false);
    router.push("/dashboard");
  };

  // ── Enter-to-save helpers ─────────────────────────────────────────────────
  // Called when the user presses Enter in an inline edit input. Persists just
  // the changed field/cell immediately so the user gets instant feedback.
  const saveMetaField = async (field: string, value: string) => {
    if (!id) return;
    try {
      await stagesService.editExtraction(id, { metadata_edits: [{ field, value }] });
      setHasEditHistory(true);
    } catch {
      // silent — auto-save on Confirm Extraction acts as a safety net
    }
  };

  const saveLineItemField = async (rowId: string, field: string, value: string) => {
    if (!id) return;
    try {
      await stagesService.editExtraction(id, { line_item_edits: [{ row_id: rowId, field, value }] });
      setHasEditHistory(true);
    } catch {
      // silent — auto-save on Confirm Extraction acts as a safety net
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <Loader size="large" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <p className="text-text-caption">Invoice not found.</p>
      </div>
    );
  }

  if (transitioning) {
    return (
      <StageTransitionOverlay
        title="We're matching the invoice metadata against the PO."
        subtitle="This may take a few minutes. Please keep this page open."
        steps={[
          { label: "Extracting data from document", status: "done" },
          { label: "Matching metadata against PO", status: "active" },
        ]}
      />
    );
  }

  const isActionable = data.stage_status === "in_review";
  // Allow edits on any non-completed stage (extraction approved but matching/
  // bill-posting not yet done). Locks only once the pipeline is fully posted.
  const isEditable = !isCompleted && canEdit;

  const metaMap: Record<string, string> = {};
  data.invoice_schema.metadata.forEach(m => { metaMap[m.field] = m.value; });

  const bboxMetaMap: Record<string, BboxMeta> = {};
  data.bbox_schema.metadata.forEach(b => { bboxMetaMap[b.field] = b; });

  const bboxLineMap: Record<string, BboxLineItem> = {};
  data.bbox_schema.line_items.forEach(b => { bboxLineMap[b.row_id] = b; });

  const pdfUrl = `${BASE}/api/v1/invoices/${id}/file`;
  const invoiceDate = metaMap["invoice_date"];
  const invoiceNumber = data.invoice_number ?? metaMap["invoice_number"];
  const vendorName = data.vendor_name ?? metaMap["vendor_name"];

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#f4f6f9" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center justify-between px-6 py-3 border-b"
        style={{ background: "#ffffff", borderColor: "#e2e8f0" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="shrink-0" style={{ color: "#64748b" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 4L7.5 10l5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="font-semibold leading-tight" style={{ fontSize: 16, color: "#1e293b" }}>
              Extraction
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs flex-wrap" style={{ color: "#64748b" }}>
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Manual Upload
              </span>
              {invoiceNumber && <>
                <span>|</span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="1.5" y="1" width="9" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4 4h4M4 7h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {invoiceNumber}
                </span>
              </>}
              {vendorName && <>
                <span>|</span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M1.5 10.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {vendorName}
                </span>
              </>}
              {invoiceDate && <>
                <span>|</span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="1" y="2" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {formatDate(invoiceDate, "—")}
                </span>
              </>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          {isActionable && canEdit ? (
            <>
              <button
                onClick={() => setRejectOpen(true)}
                disabled={approving}
                className="px-4 py-1.5 text-sm font-medium rounded border transition-colors disabled:opacity-50"
                style={{ color: "#f87171", borderColor: "#f87171", background: "transparent" }}
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="px-4 py-1.5 text-sm font-medium rounded transition-colors disabled:opacity-70"
                style={{ background: "#3b82f6", color: "#ffffff", border: "none" }}
              >
                {approving ? "Confirming…" : "Confirm Extraction"}
              </button>
            </>
          ) : !isActionable ? (
            // Stage is approved or completed — Next always goes to Matching
            // (the sequential next step after Extraction, regardless of whether
            // matching/bill-posting stages are also already completed).
            <button
              onClick={() => router.push(`/invoice/${id}/matching?tab=metadata`)}
              className="inline-flex items-center gap-1 disabled:opacity-50"
              style={{
                height: 32, padding: "0 16px", fontSize: 14, fontWeight: 500,
                background: "#1876FF", color: "#ffffff",
                border: "none", borderRadius: 6, cursor: "pointer",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#0F65E3")}
              onMouseLeave={e => (e.currentTarget.style.background = "#1876FF")}
            >
              Next
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M4 2.5L8 6 4 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: PDF viewer ──────────────────────────────────────────────── */}
        <div
          className="w-[52%] shrink-0 flex flex-col border-r"
          style={{ borderColor: "#e2e8f0" }}
        >
          {/* Scrollable PDF area */}
          <div
            className="flex-1 overflow-auto py-4 px-5"
            style={{ background: "#f8fafc" }}
          >
            <PdfViewer
              pdfUrl={pdfUrl}
              authToken={token}
              page={pdfPage}
              scale={scale}
              rotate={rotate}
              onNumPages={setNumPages}
              activeBbox={activeBbox}
              isLineItemMode={activeTab === "line_items"}
            />
          </div>

          {/* Bottom toolbar */}
          <SourceViewerToolbar
            scale={scale}
            onZoomOut={() => setScale(s => Math.max(ZOOM_MIN, parseFloat((s - ZOOM_STEP).toFixed(1))))}
            onZoomIn={() => setScale(s => Math.min(ZOOM_MAX, parseFloat((s + ZOOM_STEP).toFixed(1))))}
            rotate={rotate}
            onRotateLeft={() => { setRotate(r => (r - 90 + 360) % 360); setActiveKey(null); }}
            onRotateRight={() => { setRotate(r => (r + 90) % 360); setActiveKey(null); }}
            currentPage={pdfPage}
            totalPages={numPages}
            onPrev={() => setPdfPage(p => Math.max(1, p - 1))}
            onNext={() => setPdfPage(p => Math.min(numPages, p + 1))}
          />
        </div>

        {/* ── Right: Extracted data panel (or Edit History) ────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: "#ffffff" }}>

          {/* ── Edit History inline panel ── */}
          {showEditHistory && (
            <ExtractionEditHistory
              invoiceId={id}
              onBack={() => setShowEditHistory(false)}
            />
          )}

          {/* ── Normal extraction data panel ── */}
          {!showEditHistory && <>

          {/* Panel header (mirrors invoice-validator-fe CsvViewer header) */}
          <div
            className="shrink-0 flex items-center justify-between px-5 pt-5 pb-2"
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#101828", margin: 0 }}>
              Extracted Data
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => hasEditHistory && setShowEditHistory(true)}
                disabled={!hasEditHistory}
                className="inline-flex items-center gap-1.5"
                style={{
                  height: 28, padding: "0 12px", fontSize: 14, fontWeight: 500,
                  color: hasEditHistory ? "#414651" : "#9ca3af",
                  background: "#ffffff",
                  border: "1px solid #D5D5D5", borderRadius: 6,
                  cursor: hasEditHistory ? "pointer" : "not-allowed",
                  opacity: hasEditHistory ? 1 : 0.55,
                }}
                onMouseEnter={e => { if (hasEditHistory) e.currentTarget.style.background = "#F9F9F9"; }}
                onMouseLeave={e => (e.currentTarget.style.background = "#ffffff")}
              >
                {/* EyeOutlined */}
                <svg width="14" height="14" viewBox="0 0 1024 1024" fill="currentColor">
                  <path d="M942.2 486.2C847.4 286.5 704.1 186 512 186c-192.2 0-335.4 100.5-430.2 300.3a60.3 60.3 0 0 0 0 51.5C176.6 737.5 319.9 838 512 838c192.2 0 335.4-100.5 430.2-300.3 7.7-16.2 7.7-35 0-51.5zM512 766c-161.3 0-279.4-81.8-362.7-254C232.6 339.8 350.7 258 512 258c161.3 0 279.4 81.8 362.7 254C791.5 684.2 673.4 766 512 766zm-4-430c-97.2 0-176 78.8-176 176s78.8 176 176 176 176-78.8 176-176-78.8-176-176-176zm0 288c-61.9 0-112-50.1-112-112s50.1-112 112-112 112 50.1 112 112-50.1 112-112 112z" />
                </svg>
                View Edit History
              </button>
            </div>
          </div>

          {/* Tabs (mirrors invoice-validator-fe AntD Tabs with rounded count badges) */}
          <div className="shrink-0 flex border-b px-5" style={{ borderColor: "#e6e6e6" }}>
            {(["metadata", "line_items"] as const).map(tab => {
              const count = tab === "metadata"
                ? data.invoice_schema.metadata.length
                : data.invoice_schema.line_items.length;
              const label = tab === "metadata" ? "Metadata" : "Line Item";
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setActiveKey(null); }}
                  className="inline-flex items-center gap-2"
                  style={{
                    padding: "12px 0",
                    marginRight: 24,
                    fontSize: 14,
                    fontWeight: 500,
                    color: isActive ? "#1677FF" : "#4B5563",
                    borderBottom: `2px solid ${isActive ? "#1677FF" : "transparent"}`,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  {label}
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 500,
                      background: isActive ? "#DBEAFE" : "#E5E7EB",
                      color: isActive ? "#2563EB" : "#4B5563",
                      lineHeight: "18px",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto px-5 py-4">

            {activeTab === "metadata" && (
              <div style={{ border: "1px solid #E6E6E6", borderRadius: 4, overflow: "hidden", background: "#ffffff" }}>
                <table className="w-full text-sm" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th
                        style={{
                          textAlign: "left",  fontSize: "0.8rem", fontWeight: 600,
                          padding:"4px 8px",
                          lineHeight:"20px",
                          backgroundColor: "#f6f3f4",
                           border: "1px solid #e5e7eb",
                          width: "42%",
                        }}
                      >
                        Field
                      </th>
                      <th
                        style={{
                          textAlign: "left", fontSize: "0.8rem", fontWeight: 600,
                          padding:"4px 8px",
                          lineHeight:"20px",
                            backgroundColor: "#f6f3f4",
                            border: "1px solid #e5e7eb",
                        }}
                      >
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoice_schema.metadata
                      .filter(field => !maskMeta || maskMeta.has(field.field))
                      .map(field => {
                    const bbox = bboxMetaMap[field.field];
                    const conf = bbox?.value_confidence ?? 0;
                    const value = edits[field.field] ?? field.value ?? "";
                    const isEmpty = !value;
                    const isRequired = mandatoryMap[field.field] === true;
                    // Cell-coloring rules (user spec, mirrors invoice-validator-fe):
                    //   empty value           → amber  (#FEF3C7 bg, #F59E0B left bar)
                    //   has value + low conf  → red    (#FFF0F0 bg, #C10008 left bar)
                    // Threshold = configured Tolerance (%) for this field, else LOW_CONF.
                    const confThreshold = confThreshMeta[field.field] ?? LOW_CONF;
                    const lowConfidence = !isEmpty && conf > 0 && conf < confThreshold;
                    const cellBg = isEmpty ? "#FEF3C7" : lowConfidence ? "#FFF0F0" : "transparent";
                    const leftBarColor = isEmpty ? "#F59E0B" : lowConfidence ? "#C10008" : null;
                    const isActive = activeKey === field.field;

                      return (
                        <tr
                          key={field.field}
                          onClick={() => setActiveKey(isActive ? null : field.field)}
                          style={{
                            borderBottom: "1px solid #E6E6E6",
                            background: isActive ? "rgba(22,118,255,0.06)" : undefined,
                            cursor: "pointer",
                            
                          }}
                          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#FAFAFA"; }}
                          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ""; }}
                        >
                        <td
                          style={{
                            textAlign: "left",  fontSize: "0.8rem",
                            boxShadow: leftBarColor ? `inset 3px 0 0 ${leftBarColor}` : undefined,
                            padding:"4px 8px",
                            lineHeight:"20px",
                            backgroundColor: "#f6f3f4",
                            border: "1px solid #e5e7eb",
                            width: "42%",
                          }}
                        >

                          
                          {fieldLabel(field.field)}
                          {isRequired && (
                            <span style={{ color: "#C10008", fontWeight: 700, marginLeft: 2 }}>*</span>
                          )}
                        </td>
                        <td
                          style={{
                            textAlign: "left",  fontSize: "0.8rem",
                            padding:"4px 8px",
                            lineHeight:"20px",
                            border: "1px solid #e5e7eb",
                            background: cellBg,
                          }}
                        >
                          {isEditable ? (
                            <input
                              className="w-full focus:outline-none"
                              style={{
                                fontSize: "0.8rem", lineHeight: "20px",
                                padding: 0, background: "transparent",
                                border: "none", color: "#414651",
                                width: "100%",
                              }}
                              value={edits[field.field] ?? value}
                              onChange={e => setEdits(prev => ({ ...prev, [field.field]: e.target.value }))}
                              onClick={e => { e.stopPropagation(); setActiveKey(field.field); }}
                              onKeyDown={e => { if (e.key === "Enter") void saveMetaField(field.field, edits[field.field] ?? value); }}
                            />
                          ) : (
                            value || ""
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            {activeTab === "line_items" && (
              <div className="overflow-x-auto">
                <div style={{ border: "1px solid #E6E6E6", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
                  <table className="w-full text-sm" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <thead className="sticky top-0 z-10">
                      <tr>
                      {[
                        { field: "_idx",                  label: "#",            align: "left"  as const, width: 40  },
                        { field: "item_code",             label: "Code",         align: "left"  as const, width: 120 },
                        { field: "item_description",      label: "Description",  align: "left"  as const             },
                        { field: "unit_of_measurement",   label: "UOM",          align: "left"  as const, width: 64  },
                        { field: "quantity",              label: "Qty",          align: "right" as const, width: 72  },
                        { field: "unit_price",            label: "Unit Price",   align: "right" as const, width: 110 },
                        { field: "total_price_before_vat",label: "Total",        align: "right" as const, width: 110 },
                      ].filter(h => h.field === "_idx" || !maskLine || maskLine.has(h.field)).map((h) => (
                        <th
                          key={h.label}
                          style={{
                            textAlign: h.align,
                            padding: "4px 8px",
                            fontSize: ".875rem",
                            fontWeight: 600,
                            lineHeight:"20px",
                            backgroundColor: "#f6f3f4",
                            border: "1px solid #d1d5dc",
                            whiteSpace: "nowrap",
                            width: h.width,
                          }}
                        >
                          {h.label}
                        </th>
                      ))}
                      </tr>
                    </thead>
                    <tbody>
                    {data.invoice_schema.line_items.map((li, i) => {
                      const bbox = bboxLineMap[li.row_id];
                      const isActive = activeKey === li.row_id;

                      // Per-cell coloring: empty → amber, has value + low confidence → red
                      const cellStyleFor = (raw: unknown, fieldConf: number | undefined, fieldKey?: string) => {
                        const text = raw == null || raw === "" ? "" : String(raw);
                        const empty = !text;
                        const conf = typeof fieldConf === "number" ? fieldConf : 0;
                        // Threshold = configured Tolerance (%) for this field, else LOW_CONF.
                        const threshold = fieldKey != null && confThreshLine[fieldKey] != null
                          ? confThreshLine[fieldKey]
                          : LOW_CONF;
                        const lowConf = !empty && conf > 0 && conf < threshold;
                        return {
                          bg: empty ? "#FEF3C7" : lowConf ? "#FFF0F0" : "transparent",
                          empty, lowConf, text,
                        };
                      };

                      // Underlying (raw) values are used for coloring and editing.
                      // `display` is what we render in view mode.
                      const cells = [
                        { field: "item_code",              raw: li.item_code,              display: li.item_code,                          conf: bbox?.item_code_confidence },
                        { field: "item_description",       raw: li.item_description,       display: li.item_description,                   conf: bbox?.item_description_confidence },
                        { field: "unit_of_measurement",    raw: li.unit_of_measurement,    display: li.unit_of_measurement,                conf: bbox?.unit_of_measurement_confidence },
                        { field: "quantity",               raw: li.quantity,               display: li.quantity == null ? "" : String(li.quantity),  conf: bbox?.quantity_confidence,             align: "right" as const, isNum: true },
                        { field: "unit_price",             raw: li.unit_price,             display: fmt(li.unit_price),                    conf: bbox?.unit_price_confidence,           align: "right" as const, isNum: true },
                        { field: "total_price_before_vat", raw: li.total_price_before_vat, display: fmt(li.total_price_before_vat),        conf: bbox?.total_price_before_vat_confidence, align: "right" as const, isNum: true },
                      ];

                      // Hide columns the admin masked off in workflow settings.
                      const visibleCells = !maskLine
                        ? cells
                        : cells.filter(c => maskLine.has(c.field));

                      const rowHasIssue = visibleCells.some(c => {
                        const s = cellStyleFor(c.raw, c.conf, c.field);
                        return s.empty || s.lowConf;
                      });

                      const lineItemEditKey = (field: string) => `${li.row_id}|${field}`;
                      const setLineItemEdit = (field: string, value: string) =>
                        setLineItemEdits(prev => ({ ...prev, [lineItemEditKey(field)]: value }));

                      return (
                        <tr
                          key={li.row_id}
                          onClick={() => setActiveKey(isActive ? null : li.row_id)}
                          style={{
                            border: "0px solid",
                            background: isActive ? "rgba(22,118,255,0.06)" : undefined,
                            cursor: isEditable ? "default" : "pointer",
                          }}
                          onMouseEnter={e => { if (!isActive && !isEditable) (e.currentTarget as HTMLElement).style.background = "#FAFAFA"; }}
                          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ""; }}
                        >
                          {/* Row # — left bar if any cell in the row has issues */}
                          <td
                            style={{
                              padding: "4px 8px",
                              textAlign:"center",
                              fontSize: 14,
                              backgroundColor:"#f3f4f6",
                              border: "1px solid #d1d5db",
                              color: "#717680",
                              boxShadow: rowHasIssue
                                ? `inset 3px 0 0 ${visibleCells.some(c => cellStyleFor(c.raw, c.conf, c.field).lowConf) ? "#C10008" : "#F59E0B"}`
                                : undefined,
                            }}
                          >
                            {i + 1}
                          </td>
                          {visibleCells.map((c) => {
                            const s = cellStyleFor(c.raw, c.conf, c.field);
                            const pendingEdit = lineItemEdits[lineItemEditKey(c.field)];
                            const inputValue = pendingEdit ?? (c.raw == null ? "" : String(c.raw));
                            return (
                              <td
                                key={c.field}
                                title={c.field !== "item_description" && typeof c.display === "string" ? c.display : undefined}
                                style={{
                                  padding: "4px 8px",
                                  textAlign: c.align ?? "left",
                                  color: "#414651",
                                  background: s.bg,
                                  whiteSpace: c.isNum ? "nowrap" : (c.field === "item_description" ? "normal" : "nowrap"),
                                  wordBreak: c.field === "item_description" ? "break-word" : undefined,
                                  fontVariantNumeric: c.isNum ? "tabular-nums" : undefined,
                                  border: "1px solid #d1d5db",
                                }}
                                onClick={e => { if (isEditable) { e.stopPropagation(); setActiveKey(li.row_id); } }}
                              >
                                {isEditable ? (
                                  c.field === "item_description" ? (
                                    <textarea
                                      className="w-full focus:outline-none"
                                      rows={1}
                                      ref={el => {
                                        if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
                                      }}
                                      style={{
                                        fontSize: 14, padding: 0,
                                        background: "transparent", border: "none",
                                        color: "#414651", width: "100%",
                                        resize: "none", lineHeight: "1.4",
                                        overflow: "hidden",
                                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                                        fontFamily: "inherit",
                                      }}
                                      value={inputValue}
                                      onChange={e => {
                                        e.target.style.height = "auto";
                                        e.target.style.height = e.target.scrollHeight + "px";
                                        setLineItemEdit(c.field, e.target.value);
                                      }}
                                    />
                                  ) : (
                                    <input
                                      type={c.isNum ? "number" : "text"}
                                      step={c.isNum ? "any" : undefined}
                                      className="w-full focus:outline-none"
                                      style={{
                                        fontSize: 14, padding: 0,
                                        background: "transparent", border: "none",
                                        color: "#414651", width: "100%",
                                        textAlign: c.align ?? "left",
                                        fontVariantNumeric: c.isNum ? "tabular-nums" : undefined,
                                      }}
                                      value={inputValue}
                                      onChange={e => setLineItemEdit(c.field, e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") void saveLineItemField(li.row_id, c.field, inputValue); }}
                                    />
                                  )
                                ) : (
                                  s.text === "" ? "" : c.display
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          </>}
        </div>
      </div>

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        stage="extraction"
      />

    </div>
  );
}

export default withAuthGuard(ReviewPage);
