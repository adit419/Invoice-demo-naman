import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { CalendarOutlined, FileTextOutlined, TagOutlined, UserOutlined } from "@ant-design/icons";
import { Button as AntButton, Space } from "antd";
import { withAuthGuard } from "@/components/AuthGuard";
import { ComponentHeaderAntd } from "@/components/matching";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Loader, useToast } from "@/components/ui";
import { RejectModal } from "@/components/RejectModal";
import { StageTransitionOverlay } from "@/components/StageTransitionOverlay";
import { ApiError } from "@/services/api";
import { directpayService, DpExtractionPostprocessing, DpInvoiceRun } from "@/services/directpay";

const PdfViewer = dynamic(() => import("@/components/PdfViewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-400">
      <Loader size="large" />
    </div>
  ),
});

// Same StageTransitionOverlay pacing convention every DirectPay stage
// transition uses (review.tsx's own EXTRACTING_PHASE_MS/MATCHING_PHASE_MS).
const FP_PHASE_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ExtractionPostprocessingPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { toast } = useToast();

  const [run, setRun] = useState<DpInvoiceRun | null>(null);
  const [data, setData] = useState<DpExtractionPostprocessing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [rotate, setRotate] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem("access_token"));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      let inv = await directpayService.getInvoice(id);
      // Defensive re-entry: only ever navigated to once extraction is
      // confirmed, but if reached directly (e.g. a stale tab) run the same
      // extract step review.tsx's own load() would.
      if (inv.status === "extraction") {
        inv = await directpayService.extractInvoice(id);
      }
      // Postprocessing only ever follows Faktur Pajak — bounce back if this
      // invoice hasn't cleared that stage yet (direct/stale navigation).
      // Note: "extracted" is NOT an early-stage signal here — it's reused
      // for "fully past postprocessing, ready for Matching" too (see
      // service.py's status vocabulary comment), so only fp_extraction
      // (unambiguously "before" this stage) triggers the bounce-back.
      if (inv.status === "fp_extraction") {
        router.replace(`/directpay/invoice/${id}/fp-extraction`);
        return;
      }
      setRun(inv);
      const pp = await directpayService.getExtractionPostprocessing(id);
      setData(pp);
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
  // (already advanced past postprocessing, or rejected) is read-only, same
  // isActionable split every other DirectPay stage page uses.
  const isActionable = run?.status === "postprocessing";

  const handleApprove = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await directpayService.approveExtractionPostprocessing(id);
      // Same AI contract-recommendation-then-Matching hand-off review.tsx
      // originally ran right after Confirm Extraction — relocated here now
      // that Faktur Pajak + Postprocessing both sit between the two.
      try {
        await directpayService.getContractRecommendation(id);
      } catch {
        // No contracts available yet — Matching screen prompts for one.
      }
      setBusy(false);
      setTransitioning(true);
      await sleep(FP_PHASE_MS);
      router.push(`/directpay/invoice/${id}/match`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not approve postprocessing", "error");
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

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <Loader size="large" />
      </div>
    );
  }
  if (!run || !data) return null;

  if (transitioning) {
    return (
      <StageTransitionOverlay
        title="We're matching the invoice against the contract."
        subtitle="This may take a few minutes. Please keep this page open."
        steps={[
          { label: "Deriving fields from the payment schedule", status: "done" },
          { label: "Matching against contract", status: "active" },
        ]}
      />
    );
  }

  const extracted = run.extracted;
  const metaItems = [
    { icon: <TagOutlined />, text: "Manual Upload" },
    extracted.invoice_number ? { icon: <FileTextOutlined />, text: extracted.invoice_number } : null,
    extracted.vendor_name ? { icon: <UserOutlined />, text: extracted.vendor_name } : null,
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
      <AntButton type="primary" onClick={handleApprove} loading={busy} disabled={busy}>
        Approve &amp; Continue
      </AntButton>
    </Space>
  ) : (
    <AntButton type="primary" onClick={() => router.push(`/directpay/invoice/${id}/match`)}>
      Next
    </AntButton>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#f4f6f9" }}>
      <ComponentHeaderAntd
        title="Extraction Postprocessing"
        onBack={() =>
          router.push(
            run.has_faktur_pajak
              ? `/directpay/invoice/${id}/fp-extraction`
              : `/directpay/invoice/${id}/review`
          )
        }
        metaItems={metaItems}
        right={actionButtons}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: PDF viewer — same layout/proportions as the Extraction page */}
        <div className="w-[52%] shrink-0 flex flex-col border-r" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex-1 overflow-auto py-4 px-5" style={{ background: "#f8fafc" }}>
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
            onZoomOut={() => setScale((s) => Math.max(ZOOM_MIN, parseFloat((s - ZOOM_STEP).toFixed(1))))}
            onZoomIn={() => setScale((s) => Math.min(ZOOM_MAX, parseFloat((s + ZOOM_STEP).toFixed(1))))}
            rotate={rotate}
            onRotateLeft={() => setRotate((r) => (r - 90 + 360) % 360)}
            onRotateRight={() => setRotate((r) => (r + 90) % 360)}
            currentPage={pdfPage}
            totalPages={numPages}
            onPrev={() => setPdfPage((p) => Math.max(1, p - 1))}
            onNext={() => setPdfPage((p) => Math.min(numPages, p + 1))}
          />
        </div>

        {/* Right: derived-fields panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: "#ffffff" }}>
          <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-2">
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#101828", margin: 0 }}>Derived Fields</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!data.has_payment_schedule ? (
              <div
                className="flex items-center gap-2"
                style={{ padding: "12px 16px", borderRadius: 8, background: "#F4F4F4", color: "#585C65", fontSize: 13 }}
              >
                No payment schedule available for this vendor — nothing to derive.
              </div>
            ) : (
              <>
                {data.matched_installment && (
                  <div className="mb-4" style={{ fontSize: 13, color: "#585C65" }}>
                    Matched against the contract&apos;s payment schedule:{" "}
                    <span style={{ fontWeight: 500, color: "#414651" }}>{data.matched_installment}</span>
                  </div>
                )}

                <div style={{ border: "1px solid #E9EAEC", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
                  <table className="w-full text-sm" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", fontSize: 13, fontWeight: 500, color: "#414651", padding: "10px 14px", lineHeight: "20px", backgroundColor: "#F4F4F4", borderBottom: "1px solid #EBEDF0", borderRight: "1px solid #EBEDF0", width: "28%" }}>
                          Field
                        </th>
                        <th style={{ textAlign: "left", fontSize: 13, fontWeight: 500, color: "#414651", padding: "10px 14px", lineHeight: "20px", backgroundColor: "#F4F4F4", borderBottom: "1px solid #EBEDF0", borderRight: "1px solid #EBEDF0", width: "32%" }}>
                          Derived Value
                        </th>
                        <th style={{ textAlign: "left", fontSize: 13, fontWeight: 500, color: "#414651", padding: "10px 14px", lineHeight: "20px", backgroundColor: "#F4F4F4", borderBottom: "1px solid #EBEDF0" }}>
                          Source
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fields.map((f) => {
                        // Same empty-field convention as the Extraction page's own
                        // Metadata table — yellow highlight, no "—" placeholder text.
                        const isEmpty = f.derived_value == null;
                        return (
                          <tr key={f.field_name} style={{ borderBottom: "1px solid #EBEDF0" }}>
                            <td style={{ textAlign: "left", fontSize: 13, color: "#414651", boxShadow: isEmpty ? "inset 3px 0 0 #F59E0B" : undefined, padding: "10px 14px", lineHeight: "20px", backgroundColor: "#F4F4F4", borderRight: "1px solid #EBEDF0" }}>
                              {f.display_name}
                            </td>
                            <td style={{ textAlign: "left", fontSize: 13, color: "#101828", fontWeight: 500, padding: "10px 14px", lineHeight: "20px", fontVariantNumeric: "tabular-nums", borderRight: "1px solid #EBEDF0", background: isEmpty ? "#FEF3C7" : undefined }}>
                              {f.formatted_value}
                            </td>
                            <td style={{ textAlign: "left", fontSize: 13, color: "#9CA3AF", padding: "10px 14px", lineHeight: "20px" }}>
                              Payment Schedule — {data.matched_installment}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12 }}>
                  These fields are not printed on the invoice document itself — they are computed from the matched
                  contract&apos;s own payment schedule and applied to the invoice once approved.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        stage="extraction_postprocessing"
      />
    </div>
  );
}

export default withAuthGuard(ExtractionPostprocessingPage);
