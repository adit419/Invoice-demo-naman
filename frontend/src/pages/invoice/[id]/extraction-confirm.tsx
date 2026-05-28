import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";
import { RejectModal } from "@/components/RejectModal";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Spinner } from "@/components/ui";
import { ApiError, invoicesService, stagesService } from "@/services";
import { useToast } from "@/components/ui";
import { formatDate } from "@/utils/format";
import type { ActiveBbox } from "@/components/PdfViewer";

const PdfViewer = dynamic(
  () => import("@/components/PdfViewer").then(m => m.PdfViewer),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center"><Spinner size="lg" /></div> }
);

interface ExtractionData {
  invoice_schema: { metadata: { field: string; value: string }[] };
  file_name: string;
  invoice_number?: string | null;
  vendor_name?: string | null;
  invoice_date?: string | null;
}

function getMetaField(schema: ExtractionData["invoice_schema"], field: string): string {
  return schema.metadata.find(m => m.field === field)?.value ?? "";
}

function ExtractionConfirmPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const { toast } = useToast();

  useEffect(() => {
    if (id) router.replace(`/invoice/${id}/review`);
  }, [id]);

  const [data, setData] = useState<ExtractionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [poNumber, setPoNumber] = useState("");
  const [originalPoNumber, setOriginalPoNumber] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [pdfPage, setPdfPage] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [rotate, setRotate] = useState(0);

  useEffect(() => { setToken(localStorage.getItem("access_token")); }, []);

  useEffect(() => {
    if (!id) return;
    stagesService.get<ExtractionData>(id, "extraction")
      .then(d => {
        setData(d);
        const po = getMetaField(d.invoice_schema, "po_number");
        setPoNumber(po);
        setOriginalPoNumber(po);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleConfirm = async () => {
    if (!id) return;
    setConfirming(true);
    try {
      if (poNumber.trim() !== originalPoNumber.trim()) {
        await stagesService.editExtraction(id, {
          metadata_edits: [{ field: "po_number", value: poNumber.trim() }],
        });
      }
      router.push(`/invoice/${id}/review`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to save PO number", "error");
      setConfirming(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!id) return;
    try {
      await stagesService.reject(id, "extraction", reason);
      toast("Invoice rejected", "error");
      router.push("/dashboard");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Reject failed", "error");
    }
    setRejectOpen(false);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  }

  const pdfUrl = id ? invoicesService.fileUrl(id) : "";
  const activeBbox: ActiveBbox | null = null;

  const invoiceNumber = data?.invoice_number ?? getMetaField(data?.invoice_schema ?? { metadata: [] }, "invoice_number");
  const vendorName = data?.vendor_name ?? getMetaField(data?.invoice_schema ?? { metadata: [] }, "vendor_name");
  const invoiceDate = data?.invoice_date ?? getMetaField(data?.invoice_schema ?? { metadata: [] }, "invoice_date");

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#080c18" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center justify-between px-6 py-3 border-b"
        style={{ background: "#0a0e1a", borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="shrink-0" style={{ color: "#64748b" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 4L7.5 10l5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="font-semibold leading-tight" style={{ fontSize: 16, color: "#f1f5f9" }}>
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
                  {formatDate(invoiceDate, "")}
                </span>
              </>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={() => setRejectOpen(true)}
            disabled={confirming}
            className="px-4 py-1.5 text-sm font-medium rounded border transition-colors disabled:opacity-50"
            style={{ color: "#f87171", borderColor: "#f87171", background: "transparent" }}
          >
            Reject
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="px-4 py-1.5 text-sm font-medium rounded transition-colors disabled:opacity-60"
            style={{ background: "#3b82f6", color: "#ffffff", border: "none" }}
          >
            {confirming ? "Saving…" : "Confirm and Continue"}
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: PDF viewer ─────────────────────────────────────────────── */}
        <div className="w-[52%] shrink-0 flex flex-col border-r" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex-1 overflow-auto py-4 px-5" style={{ background: "#0a0e1a" }}>
            {pdfUrl ? (
              <PdfViewer
                pdfUrl={pdfUrl}
                authToken={token}
                page={pdfPage}
                scale={scale}
                rotate={rotate}
                onNumPages={setNumPages}
                activeBbox={activeBbox}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Spinner size="lg" />
              </div>
            )}
          </div>
          <SourceViewerToolbar
            scale={scale}
            onZoomOut={() => setScale(s => Math.max(ZOOM_MIN, parseFloat((s - ZOOM_STEP).toFixed(1))))}
            onZoomIn={() => setScale(s => Math.min(ZOOM_MAX, parseFloat((s + ZOOM_STEP).toFixed(1))))}
            rotate={rotate}
            onRotateLeft={() => { setRotate(r => (r - 90 + 360) % 360); }}
            onRotateRight={() => { setRotate(r => (r + 90) % 360); }}
            currentPage={pdfPage}
            totalPages={numPages}
            onPrev={() => setPdfPage(p => Math.max(1, p - 1))}
            onNext={() => setPdfPage(p => Math.min(numPages, p + 1))}
          />
        </div>

        {/* ── Right: PO confirmation panel ─────────────────────────────────── */}
        <div
          className="flex-1 flex items-center justify-center p-8 min-w-0 overflow-auto"
          style={{ background: "#0e1424" }}
        >
          <div
            className="w-full max-w-sm flex flex-col gap-6 rounded-2xl p-8"
            style={{ background: "#0e1424", boxShadow: "0 4px 24px rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {/* Icon + title */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(59,130,246,0.1)" }}
              >
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="4" y="3" width="20" height="22" rx="2.5" stroke="#3b82f6" strokeWidth="1.6" />
                  <path d="M9 10h10M9 14h10M9 18h6" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold" style={{ fontSize: 16, color: "#f1f5f9" }}>
                  Confirm Purchase Order Number
                </h2>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "#64748b" }}>
                  Please review and confirm the PO number extracted from the invoice. You can edit it if needed before proceeding.
                </p>
              </div>
            </div>

            {/* Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>
                Purchase Order Number
              </label>
              <input
                type="text"
                value={poNumber}
                onChange={e => setPoNumber(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !confirming && handleConfirm()}
                autoFocus
                disabled={confirming}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
                style={{
                  borderColor: "#3b82f6",
                  color: "#f1f5f9",
                  background: "rgba(255,255,255,0.06)",
                  boxShadow: "0 0 0 3px rgba(59,130,246,0.1)",
                }}
              />
            </div>

            {/* Button */}
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "#3b82f6", color: "#fff" }}
            >
              {confirming ? (
                <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin">
                  <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
                  <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M4.5 7l2 2L9.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {confirming ? "Saving…" : "Confirm and Continue"}
            </button>

          </div>
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

export default withAuthGuard(ExtractionConfirmPage);
