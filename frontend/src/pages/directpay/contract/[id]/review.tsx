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
import { directpayService, DpContractFields, DpContractRun } from "@/services/directpay";

const PdfViewer = dynamic(() => import("@/components/PdfViewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-400">
      <Loader size="large" />
    </div>
  ),
});

const REQUIRED_FIELDS = new Set(["vendor_name", "customer_name", "base_fee"]);

const FIELD_DEFS: { key: keyof DpContractFields; label: string; type: "text" | "number" | "date" }[] = [
  { key: "vendor_name", label: "Vendor", type: "text" },
  { key: "customer_name", label: "Customer", type: "text" },
  { key: "contract_type", label: "Contract Type", type: "text" },
  { key: "premises_address", label: "Premises Address", type: "text" },
  { key: "floor", label: "Floor", type: "text" },
  { key: "base_fee", label: "Base Fee", type: "number" },
  { key: "currency", label: "Currency", type: "text" },
  { key: "fee_type", label: "Fee Type", type: "text" },
  { key: "escalation_rate", label: "Escalation Rate (%)", type: "number" },
  { key: "payment_due_days", label: "Payment Due (days)", type: "number" },
  { key: "actual_start", label: "Start Date", type: "date" },
  { key: "term_months", label: "Term (months)", type: "number" },
];

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
      router.push("/directpay/dashboard");
      return;
    }
    setSaving(true);
    try {
      const fields: Partial<DpContractFields> = {};
      for (const [k, v] of Object.entries(edits)) {
        const def = FIELD_DEFS.find((f) => f.key === k);
        (fields as Record<string, unknown>)[k] = def?.type === "number" ? (v === "" ? null : Number(v)) : v;
      }
      const updated = await directpayService.approveContract(id, fields);
      setRun(updated);
    } catch {
      toast("Could not save contract", "error");
    } finally {
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
  const isSaved = run.status === "saved";
  const canEdit = !isSaved;

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
        onBack={() => router.push("/directpay/dashboard")}
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

        {/* Right: extracted fields panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: "#ffffff" }}>
          <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3">
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#101828", margin: 0 }}>Extracted Data</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div style={{ border: "1px solid #E9EAEC", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
              <table className="w-full text-sm" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left", fontSize: 13, fontWeight: 500, color: "#414651",
                        padding: "10px 14px", lineHeight: "20px",
                        backgroundColor: "#F4F4F4", borderBottom: "1px solid #EBEDF0",
                        borderRight: "1px solid #EBEDF0", width: "32%",
                      }}
                    >
                      Field
                    </th>
                    <th
                      style={{
                        textAlign: "left", fontSize: 13, fontWeight: 500, color: "#414651",
                        padding: "10px 14px", lineHeight: "20px",
                        backgroundColor: "#F4F4F4", borderBottom: "1px solid #EBEDF0",
                      }}
                    >
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_DEFS.map((f) => {
                    const raw = fields[f.key];
                    const value = edits[f.key] ?? (raw == null ? "" : String(raw));
                    const isEmpty = !value;
                    const isRequired = REQUIRED_FIELDS.has(f.key);
                    const cellBg = isEmpty && isRequired ? "#FEF3C7" : "transparent";
                    const leftBarColor = isEmpty && isRequired ? "#F59E0B" : null;
                    const isActive = activeKey === f.key;
                    return (
                      <tr
                        key={f.key}
                        onClick={() => setActiveKey(isActive ? null : f.key)}
                        style={{
                          borderBottom: "1px solid #EBEDF0",
                          background: isActive ? "rgba(24,118,255,0.06)" : undefined,
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) (e.currentTarget as HTMLElement).style.background = "#FAFAFA";
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) (e.currentTarget as HTMLElement).style.background = "";
                        }}
                      >
                        <td
                          style={{
                            textAlign: "left", fontSize: 13, color: "#414651",
                            boxShadow: leftBarColor ? `inset 3px 0 0 ${leftBarColor}` : undefined,
                            padding: "10px 14px", lineHeight: "20px",
                            backgroundColor: "#F4F4F4", borderRight: "1px solid #EBEDF0", width: "32%",
                          }}
                        >
                          {f.label}
                          {isRequired && <span style={{ color: "#E02D3C", fontWeight: 600, marginLeft: 3 }}>*</span>}
                        </td>
                        <td style={{ textAlign: "left", fontSize: 13, color: "#414651", padding: "10px 14px", lineHeight: "20px", background: cellBg }}>
                          {canEdit ? (
                            <input
                              className="w-full focus:outline-none"
                              type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                              style={{ fontSize: 13, lineHeight: "20px", padding: 0, background: "transparent", border: "none", color: "#414651", width: "100%" }}
                              value={value}
                              onChange={(e) => setEdits((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveKey(f.key);
                              }}
                            />
                          ) : (
                            <span>{value || ""}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default withAuthGuard(ContractReviewPage);
