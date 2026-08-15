import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { CalendarOutlined, TagOutlined, UserOutlined } from "@ant-design/icons";
import { Button as AntButton, Space } from "antd";
import { withAuthGuard } from "@/components/AuthGuard";
import { ComponentHeaderAntd } from "@/components/matching";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Loader, useToast } from "@/components/ui";
import { ContractDerivedFieldsTable } from "@/components/directpay/ContractDerivedFieldsTable";
import { directpayService, DpContractExtractionPostprocessing, DpContractRun } from "@/services/directpay";

const PdfViewer = dynamic(() => import("@/components/PdfViewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-400">
      <Loader size="large" />
    </div>
  ),
});

// Small pacing delay on Approve so the button's own loading spinner is
// visible — mirrors contract review.tsx's own SAVE_DELAY_MS.
const SAVE_DELAY_MS = 1500;

function ContractExtractionPostprocessingPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { toast } = useToast();

  const [run, setRun] = useState<DpContractRun | null>(null);
  const [data, setData] = useState<DpContractExtractionPostprocessing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [rotate, setRotate] = useState(0);

  useEffect(() => {
    setToken(localStorage.getItem("access_token"));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const contract = await directpayService.getContract(id);
      // This stage only ever follows an approved Contract Review — bounce
      // back if reached directly before that's happened. A "saved" contract
      // (already fully approved) is NOT bounced anywhere — it renders here
      // read-only, same isActionable/read-only split every other DirectPay
      // stage page uses, so reopening a saved contract from the dashboard
      // and clicking through Review's "Next" always lands on this page.
      if (contract.status === "review") {
        router.replace(`/directpay/contract/${id}/review`);
        return;
      }
      setRun(contract);
      const pp = await directpayService.getContractExtractionPostprocessing(id);
      setData(pp);
    } catch {
      toast("Contract not found", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async () => {
    if (!id) return;
    // Already saved — nothing left to approve, "Next" just continues on.
    if (run?.status === "saved") {
      router.push("/directpay/dashboard?tab=contracts");
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        directpayService.approveContractExtractionPostprocessing(id),
        new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS)),
      ]);
      setSaving(false);
      router.push("/directpay/dashboard?tab=contracts");
    } catch {
      toast("Could not save contract", "error");
      setSaving(false);
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

  const fields = run.fields;
  const metaItems = [
    { icon: <TagOutlined />, text: "Manual Upload" },
    fields.vendor_name ? { icon: <UserOutlined />, text: fields.vendor_name } : null,
    fields.actual_start ? { icon: <CalendarOutlined />, text: fields.actual_start } : null,
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];

  const isActionable = run.status === "postprocessing";
  const actionButtons = (
    <Space>
      <AntButton type="primary" onClick={handleApprove} loading={saving} disabled={saving}>
        {isActionable ? "Approve & Save" : "Next"}
      </AntButton>
    </Space>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#f4f6f9" }}>
      <ComponentHeaderAntd
        title="Contract Extraction Postprocessing"
        onBack={() => router.push(`/directpay/contract/${id}/review`)}
        metaItems={metaItems}
        right={actionButtons}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: PDF viewer — same layout/proportions as Contract Extraction */}
        <div className="w-[52%] shrink-0 flex flex-col border-r" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex-1 overflow-auto py-4 px-5" style={{ background: "#f8fafc" }}>
            <PdfViewer
              pdfUrl={directpayService.contractPdfUrl(run.id)}
              authToken={token}
              page={pdfPage}
              scale={scale}
              rotate={rotate}
              onNumPages={setNumPages}
              activeBbox={null}
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
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#101828", margin: 0 }}>Derived Fields — Payment Schedule</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!data.has_payment_schedule || data.installments.length === 0 ? (
              <div
                className="flex items-center gap-2"
                style={{ padding: "12px 16px", borderRadius: 8, background: "#F4F4F4", color: "#585C65", fontSize: 13 }}
              >
                No payment schedule available for this vendor — nothing to derive.
              </div>
            ) : (
              <ContractDerivedFieldsTable installments={data.installments} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default withAuthGuard(ContractExtractionPostprocessingPage);
