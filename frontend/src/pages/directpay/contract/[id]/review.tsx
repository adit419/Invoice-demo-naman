import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import {
  CalendarOutlined,
  TagOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button as AntButton, Space } from "antd";
import { withAuthGuard } from "@/components/AuthGuard";
import { ComponentHeaderAntd } from "@/components/matching";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Loader, useToast } from "@/components/ui";
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

  const handleApprove = async () => {
    if (!id || !run) return;
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
      setRun(updated);
      setSaving(false);
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

  const fields = run.fields;
  const fieldEntries = orderedFieldEntries(fields, run.field_meta);
  const isSaved = run.status === "saved";
  const canEdit = !isSaved;

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
  // primary button (no colored pill) that moves forward — for a contract
  // there's no further contract-specific stage, so "Next" just means back to
  // the dashboard, same as handleApprove's existing isSaved branch already does.
  const actionButtons = (
    <Space>
      <AntButton
        type="primary"
        onClick={handleApprove}
        loading={saving}
        disabled={saving}
      >
        {isSaved ? "Next" : "Approve & Save"}
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
          <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3">
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#101828", margin: 0 }}>Extracted Data</h2>
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default withAuthGuard(ContractReviewPage);
