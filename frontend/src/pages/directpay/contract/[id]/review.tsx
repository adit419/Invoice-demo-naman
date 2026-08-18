import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import {
  CalendarOutlined,
  HistoryOutlined,
  TagOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button as AntButton, Space } from "antd";
import { withAuthGuard } from "@/components/AuthGuard";
import { ComponentHeaderAntd } from "@/components/matching";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Loader, useToast } from "@/components/ui";
import { StageTransitionOverlay } from "@/components/StageTransitionOverlay";
import { DpEditHistory } from "@/components/directpay/DpEditHistory";
import { directpayService, DpContractRun } from "@/services/directpay";
import type { ActiveBbox } from "@/components/PdfViewer";
import { ContractFieldsTable, orderedFieldEntries } from "@/components/directpay/ContractFieldsTable";

const PdfViewer = dynamic(() => import("@/components/PdfViewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-400">
      <Loader size="large" />
    </div>
  ),
});

// Small pacing delay on Approve & Save so the button's own loading spinner is
// visible — the real save call is fast enough that it would otherwise flash.
const SAVE_DELAY_MS = 2000;

// Same StageTransitionOverlay pacing convention every DirectPay stage
// transition uses (invoice review.tsx's own EXTRACTING_PHASE_MS).
const POSTPROCESSING_PHASE_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Below this → red overlay, at/above → green. Mirrors P2P's own
// review.tsx/PdfViewer convention exactly (same threshold value).
const LOW_CONF = 0.85;

function ContractReviewPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { toast } = useToast();

  const [run, setRun] = useState<DpContractRun | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [rotate, setRotate] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem("access_token"));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await directpayService.getContract(id);
      setRun(data);
    } catch {
      toast("Contract not found", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchEditHistory = useCallback(() => directpayService.getContractEditHistory(id as string), [id]);

  // Individual field saves persist immediately on Enter (same as invoice
  // review.tsx's saveMetaField) — the bulk resend inside handleApprove is
  // just a safety net for anything typed but not yet committed with Enter.
  const saveMetaField = async (key: string, value: string) => {
    if (!id) return;
    try {
      const updated = await directpayService.editContract(id, { [key]: value === "" ? null : value });
      setRun(updated);
    } catch {
      // silent — the bulk auto-save on Approve & Save acts as a safety net
    }
  };

  const handleApprove = async () => {
    if (!id || !run) return;
    // Already past Review — "Next" just continues forward, no re-approve.
    // A vendor with a real payment schedule always chains on to Extraction
    // Postprocessing next (even once "saved" — that page renders read-only
    // for a completed contract, same isActionable/read-only split every
    // other DirectPay stage uses), so reopening a saved contract from the
    // dashboard and clicking Next here always reaches the Derived Fields
    // view rather than bouncing straight back to the dashboard.
    if (run.status === "postprocessing" || (run.status === "saved" && run.has_payment_schedule)) {
      router.push(`/directpay/contract/${id}/extraction-postprocessing`);
      return;
    }
    if (run.status === "saved") {
      router.push("/directpay/dashboard?tab=contracts");
      return;
    }
    setSaving(true);
    try {
      const fields: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(edits)) {
        fields[k] = v === "" ? null : v;
      }
      const [updated] = await Promise.all([
        directpayService.approveContract(id, fields),
        new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS)),
      ]);
      setSaving(false);
      // Lumpsum-lease contracts (real payment_schedule.json) get an extra
      // review step before they're terminal — see approveContract. Same
      // StageTransitionOverlay pacing every other DirectPay stage hand-off
      // uses, rather than jumping the user straight there with no feedback.
      if (updated.status === "postprocessing") {
        setTransitioning(true);
        await sleep(POSTPROCESSING_PHASE_MS);
        router.push(`/directpay/contract/${id}/extraction-postprocessing`);
        return;
      }
      setRun(updated);
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
  if (!run) return null;

  if (transitioning) {
    return (
      <StageTransitionOverlay
        title="We're preparing the payment schedule review."
        subtitle="This will only take a moment."
        steps={[{ label: "Deriving fields from the payment schedule", status: "active" }]}
      />
    );
  }

  const fields = run.fields;
  const fieldEntries = orderedFieldEntries(fields, run.field_meta);
  // Anything past Review (mid-Postprocessing or fully Saved) is read-only
  // here — back navigation from a later stage shows this data as-is instead
  // of bouncing forward, same isActionable/read-only split every other
  // DirectPay stage page uses (see invoice fp-extraction.tsx).
  const isPastReview = run.status === "postprocessing" || run.status === "saved";
  const canEdit = !isPastReview;

  // Selecting a field also jumps the PDF to the page its bbox lives on —
  // mirrors P2P's own field-click behavior (see review.tsx's useEffect on
  // activeKey), just done inline in the click handler instead of a separate
  // effect, since there's only one place a field ever gets selected from.
  const selectField = (key: string | null) => {
    setActiveKey(key);
    const bbox = key ? fieldEntries.find(([k]) => k === key)?.[1]?.bbox : null;
    if (bbox) setPdfPage(bbox.page);
  };

  const activeFieldMeta = activeKey ? fieldEntries.find(([k]) => k === activeKey)?.[1] : null;
  const activeBbox: ActiveBbox | null = activeFieldMeta?.bbox
    ? {
        bbox_left: activeFieldMeta.bbox.bbox_left,
        bbox_top: activeFieldMeta.bbox.bbox_top,
        bbox_width: activeFieldMeta.bbox.bbox_width,
        bbox_height: activeFieldMeta.bbox.bbox_height,
        page: activeFieldMeta.bbox.page,
        confidence: activeFieldMeta.bbox.value_confidence,
        confidenceThreshold: LOW_CONF,
        id: `field-${activeKey}`,
        label: activeFieldMeta.label,
        value: (edits[activeKey as string] ?? (fields[activeKey as string] == null ? undefined : String(fields[activeKey as string]))) || undefined,
      }
    : null;

  const metaItems = [
    { icon: <TagOutlined />, text: "Manual Upload" },
    fields.vendor_name ? { icon: <UserOutlined />, text: fields.vendor_name } : null,
    fields.actual_start ? { icon: <CalendarOutlined />, text: fields.actual_start } : null,
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];

  // Mirrors Invoice Extraction's own pattern exactly: once actioned, a plain
  // primary button (no colored pill) that moves forward — to Extraction
  // Postprocessing if this vendor has a payment schedule and it isn't done
  // yet, or to the dashboard once the contract is fully "saved" (see
  // handleApprove's isPastReview branches above).
  const actionButtons = (
    <Space>
      <AntButton
        type="primary"
        onClick={handleApprove}
        loading={saving}
        disabled={saving}
      >
        {isPastReview ? "Next" : "Approve & Save"}
      </AntButton>
    </Space>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#f4f6f9" }}>
      <ComponentHeaderAntd
        title="Contract Extraction"
        onBack={() => router.push("/directpay/dashboard?tab=contracts")}
        metaItems={metaItems}
        right={actionButtons}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: PDF viewer */}
        <div className="w-[52%] shrink-0 flex flex-col border-r" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex-1 overflow-auto py-4 px-5" style={{ background: "#f8fafc" }}>
            <PdfViewer
              pdfUrl={directpayService.contractPdfUrl(run.id)}
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

        {/* Right: extracted fields panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: "#ffffff" }}>
          {showEditHistory ? (
            <DpEditHistory
              fetchHistory={fetchEditHistory}
              onBack={() => setShowEditHistory(false)}
              backLabel="Back to Extraction"
              scopeTabs={[{ key: "metadata", label: "Metadata" }]}
            />
          ) : (
            <>
              <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3">
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#101828", margin: 0 }}>Extracted Data</h2>
                <button
                  onClick={() => run.has_edit_history && setShowEditHistory(true)}
                  disabled={!run.has_edit_history}
                  title={run.has_edit_history ? "View a log of every field edited on this contract" : "No edits recorded yet"}
                  className="inline-flex items-center gap-1.5"
                  style={{
                    fontSize: 13, fontWeight: 500, padding: "5px 10px", borderRadius: 6,
                    border: "1px solid #D5D5D5", background: "#ffffff",
                    color: run.has_edit_history ? "#414651" : "#B7BBC2",
                    cursor: run.has_edit_history ? "pointer" : "not-allowed",
                    opacity: run.has_edit_history ? 1 : 0.55,
                  }}
                >
                  <HistoryOutlined />
                  View Edit History
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <ContractFieldsTable
                  fields={fields}
                  fieldMeta={run.field_meta}
                  edits={edits}
                  setEdits={setEdits}
                  activeKey={activeKey}
                  onSelectField={selectField}
                  canEdit={canEdit}
                  onSaveField={saveMetaField}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default withAuthGuard(ContractReviewPage);
