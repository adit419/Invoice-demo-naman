import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { CalendarOutlined, FileTextOutlined, HistoryOutlined, TagOutlined, UserOutlined } from "@ant-design/icons";
import { Button as AntButton, Space } from "antd";
import { withAuthGuard } from "@/components/AuthGuard";
import { ComponentHeaderAntd } from "@/components/matching";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Loader, useToast } from "@/components/ui";
import { RejectModal } from "@/components/RejectModal";
import { DpEditHistory } from "@/components/directpay/DpEditHistory";
import { DocumentPreviewModal } from "@/components/directpay/DocumentPreviewModal";
import { ApiError } from "@/services/api";
import { directpayService, DpInvoiceExtracted, DpInvoiceRun, DpLineItem } from "@/services/directpay";

const PdfViewer = dynamic(() => import("@/components/PdfViewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-400">
      <Loader size="large" />
    </div>
  ),
});

const REQUIRED_FIELDS = new Set(["invoice_number", "vendor_name", "grand_total"]);

const FIELD_DEFS: { key: keyof DpInvoiceExtracted; label: string; type: "text" | "number" | "date" }[] = [
  { key: "invoice_number", label: "Invoice Number", type: "text" },
  { key: "invoice_date", label: "Invoice Date", type: "date" },
  { key: "vendor_name", label: "Vendor", type: "text" },
  { key: "customer_name", label: "Customer", type: "text" },
  { key: "billing_period_start", label: "Billing Period Start", type: "date" },
  { key: "billing_period_end", label: "Billing Period End", type: "date" },
  { key: "subtotal", label: "Subtotal", type: "number" },
  { key: "gst_total", label: "Tax Total", type: "number" },
  { key: "grand_total", label: "Grand Total", type: "number" },
  { key: "currency", label: "Currency", type: "text" },
];

function InvoiceReviewPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { toast } = useToast();

  const [run, setRun] = useState<DpInvoiceRun | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [lineItems, setLineItems] = useState<DpLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<"metadata" | "line_items">("metadata");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [rotate, setRotate] = useState(0);
  const [contractPdfOpen, setContractPdfOpen] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem("access_token"));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      let data = await directpayService.getInvoice(id);
      if (data.status === "extraction") {
        data = await directpayService.extractInvoice(id);
      }
      setRun(data);
      setLineItems(data.extracted.line_items ?? []);
      setEdits({});
    } catch {
      toast("Invoice not found", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const isTerminal = run ? ["posted", "rejected"].includes(run.status) : false;
  const isRejected = run?.status === "rejected";
  // Mirrors Invoice Processing's Extraction page exactly: the Reject/Confirm
  // pair is only available before the invoice has moved on to Matching —
  // once a contract is set (by AI or a human), this page shows "Next"
  // instead, same as P2P's isActionable → Next split. Fields themselves stay
  // editable through Matching too (only locked once terminal), same as P2P's
  // separate isEditable gate — an edit here is picked up live by Matching's
  // own resolved-field logic next time that page is viewed. The `!isRejected`
  // guard matters: an invoice rejected straight from here (before ever being
  // matched) still has no contract_id, so without this it would keep showing
  // an active Reject/Confirm toolbar on an already-decided invoice.
  const isActionable = run ? !run.contract_id && !isRejected : false;
  const isEditable = !isTerminal;

  // Individual field saves persist immediately on Enter (same as P2P's
  // saveMetaField) — the bulk resend inside handleConfirm is just a safety
  // net for anything typed but not yet committed with Enter.
  const saveMetaField = async (key: string, value: string) => {
    if (!id) return;
    const def = FIELD_DEFS.find((f) => f.key === key);
    const payload: Record<string, unknown> = {
      [key]: def?.type === "number" ? (value === "" ? null : Number(value)) : value,
    };
    try {
      const updated = await directpayService.editInvoice(id, payload as Partial<DpInvoiceExtracted>);
      setRun(updated);
    } catch {
      // silent — the bulk auto-save on Confirm Extraction acts as a safety net
    }
  };

  const saveLineItems = async (nextItems: DpLineItem[]) => {
    if (!id) return;
    try {
      const updated = await directpayService.editInvoice(id, { line_items: nextItems });
      setRun(updated);
    } catch {
      // silent — same safety net as saveMetaField
    }
  };

  const handleConfirm = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const payload: Partial<DpInvoiceExtracted> = { line_items: lineItems };
      for (const [k, v] of Object.entries(edits)) {
        const def = FIELD_DEFS.find((f) => f.key === k);
        (payload as Record<string, unknown>)[k] = def?.type === "number" ? (v === "" ? null : Number(v)) : v;
      }
      await directpayService.editInvoice(id, payload);
      let updated = await directpayService.confirmExtraction(id, payload);
      // No separate Confirm Match step — AI recommends and auto-applies the
      // best-scoring saved contract (vendor/customer/amount/currency/date
      // similarity) so the Matching screen opens directly showing a
      // comparison. The user can always re-pick from the contract dropdown
      // right there if the AI's match is wrong.
      try {
        const rec = await directpayService.getContractRecommendation(id);
        if (rec.current_contract_id) {
          updated = await directpayService.getInvoice(id);
        }
      } catch {
        // No contracts available yet — Matching screen will prompt the user
        // to pick one once a contract has been uploaded.
      }
      router.push(`/directpay/invoice/${updated.id}/match`);
    } catch {
      toast("Could not confirm extraction", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!id) return;
    try {
      await directpayService.reviewAction(id, "reject", false, reason);
      setRejectOpen(false);
      router.push("/directpay/dashboard");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not reject invoice", "error");
    }
  };

  const setLineItem = (idx: number, patch: Partial<DpLineItem>) => {
    setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addLineItem = () => setLineItems((items) => [...items, { label: "", charge_type: "service_fee", quantity: 1, amount: 0 }]);
  const removeLineItem = (idx: number) => {
    const next = lineItems.filter((_, i) => i !== idx);
    setLineItems(next);
    if (isEditable) void saveLineItems(next);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <Loader size="large" />
      </div>
    );
  }
  if (!run) return null;

  const extracted = run.extracted;

  const metaItems = [
    { icon: <TagOutlined />, text: "Manual Upload" },
    extracted.invoice_number ? { icon: <FileTextOutlined />, text: extracted.invoice_number } : null,
    extracted.vendor_name
      ? {
          icon: <UserOutlined />,
          text: extracted.vendor_name,
          onClick: run.contract_id ? () => setContractPdfOpen(true) : undefined,
        }
      : null,
    extracted.invoice_date ? { icon: <CalendarOutlined />, text: extracted.invoice_date } : null,
  ].filter(Boolean) as { icon: React.ReactNode; text: string; onClick?: () => void }[];

  // Mirrors P2P's own Extraction page exactly: once the stage is no longer
  // actionable it's just a plain "Next" button, no colored pill. P2P has no
  // on-page state to mirror for "rejected" (it routes to a dedicated
  // rejected.tsx page instead), so a static pill is DirectPay's own stand-in
  // for that one case — and unlike the other terminal cases, there's nowhere
  // for Next to go, so it's the only button shown.
  const actionButtons = isActionable ? (
    <Space>
      <AntButton danger onClick={() => setRejectOpen(true)} disabled={saving}>
        Reject
      </AntButton>
      <AntButton type="primary" onClick={handleConfirm} loading={saving} disabled={saving}>
        Confirm Extraction
      </AntButton>
    </Space>
  ) : isRejected ? (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
      style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5" }}
    >
      Rejected
    </span>
  ) : (
    <AntButton type="primary" onClick={() => router.push(`/directpay/invoice/${id}/match`)}>
      Next
    </AntButton>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#f4f6f9" }}>
      <ComponentHeaderAntd
        title="Invoice Extraction"
        onBack={() => router.push("/directpay/dashboard")}
        metaItems={metaItems}
        right={actionButtons}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: PDF viewer */}
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
              isLineItemMode={activeTab === "line_items"}
            />
          </div>
          <SourceViewerToolbar
            scale={scale}
            onZoomOut={() => setScale((s) => Math.max(ZOOM_MIN, parseFloat((s - ZOOM_STEP).toFixed(1))))}
            onZoomIn={() => setScale((s) => Math.min(ZOOM_MAX, parseFloat((s + ZOOM_STEP).toFixed(1))))}
            rotate={rotate}
            onRotateLeft={() => { setRotate((r) => (r - 90 + 360) % 360); setActiveKey(null); }}
            onRotateRight={() => { setRotate((r) => (r + 90) % 360); setActiveKey(null); }}
            currentPage={pdfPage}
            totalPages={numPages}
            onPrev={() => setPdfPage((p) => Math.max(1, p - 1))}
            onNext={() => setPdfPage((p) => Math.min(numPages, p + 1))}
          />
        </div>

        {/* Right: extracted data panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: "#ffffff" }}>
          {showEditHistory ? (
            <DpEditHistory invoiceId={run.id} onBack={() => setShowEditHistory(false)} />
          ) : (
            <>
              <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-2">
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#101828", margin: 0 }}>Extracted Data</h2>
                <button
                  onClick={() => run.has_edit_history && setShowEditHistory(true)}
                  disabled={!run.has_edit_history}
                  title={run.has_edit_history ? "View a log of every field edited on this invoice" : "No edits recorded yet"}
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

              {/* Tabs */}
              <div className="shrink-0 flex border-b px-5" style={{ borderColor: "#EBEDF0" }}>
                {(["metadata", "line_items"] as const).map((tab) => {
                  const count = tab === "metadata" ? FIELD_DEFS.length : lineItems.length;
                  const label = tab === "metadata" ? "Metadata" : "Line Item";
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab);
                        setActiveKey(null);
                      }}
                      className="inline-flex items-center gap-2"
                      style={{
                        padding: "12px 0", marginRight: 24, fontSize: 14, fontWeight: 500,
                        color: isActive ? "#1876FF" : "#585C65",
                        borderBottom: `2px solid ${isActive ? "#1876FF" : "transparent"}`,
                        background: "transparent", cursor: "pointer",
                      }}
                    >
                      {label}
                      <span
                        style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 13, fontWeight: 500,
                          background: isActive ? "#E8F1FF" : "#EEF0F3",
                          color: isActive ? "#1876FF" : "#585C65", lineHeight: "18px",
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {activeTab === "metadata" && (
                  <div style={{ border: "1px solid #E9EAEC", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
                    <table className="w-full text-sm" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", fontSize: 13, fontWeight: 500, color: "#414651", padding: "10px 14px", lineHeight: "20px", backgroundColor: "#F4F4F4", borderBottom: "1px solid #EBEDF0", borderRight: "1px solid #EBEDF0", width: "32%" }}>
                            Field
                          </th>
                          <th style={{ textAlign: "left", fontSize: 13, fontWeight: 500, color: "#414651", padding: "10px 14px", lineHeight: "20px", backgroundColor: "#F4F4F4", borderBottom: "1px solid #EBEDF0" }}>
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {FIELD_DEFS.map((f) => {
                          const raw = extracted[f.key];
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
                              style={{ borderBottom: "1px solid #EBEDF0", background: isActive ? "rgba(24,118,255,0.06)" : undefined, cursor: "pointer" }}
                              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#FAFAFA"; }}
                              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ""; }}
                            >
                              <td style={{ textAlign: "left", fontSize: 13, color: "#414651", boxShadow: leftBarColor ? `inset 3px 0 0 ${leftBarColor}` : undefined, padding: "10px 14px", lineHeight: "20px", backgroundColor: "#F4F4F4", borderRight: "1px solid #EBEDF0", width: "32%" }}>
                                {f.label}
                                {isRequired && <span style={{ color: "#E02D3C", fontWeight: 600, marginLeft: 3 }}>*</span>}
                              </td>
                              <td style={{ textAlign: "left", fontSize: 13, color: "#414651", padding: "10px 14px", lineHeight: "20px", background: cellBg }}>
                                {isEditable ? (
                                  <input
                                    className="w-full focus:outline-none"
                                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                                    style={{ fontSize: 13, lineHeight: "20px", padding: 0, background: "transparent", border: "none", color: "#414651", width: "100%" }}
                                    value={value}
                                    onChange={(e) => setEdits((prev) => ({ ...prev, [f.key]: e.target.value }))}
                                    onClick={(e) => { e.stopPropagation(); setActiveKey(f.key); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") void saveMetaField(f.key, edits[f.key] ?? value); }}
                                  />
                                ) : (
                                  <span>{value || "—"}</span>
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
                  <div style={{ border: "1px solid #E9EAEC", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
                    <table className="text-sm" style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr>
                          {["#", "Description", "Charge Type", "Qty", "Amount", ""].map((h, i) => (
                            <th
                              key={h}
                              style={{
                                textAlign: i >= 3 && i <= 4 ? "right" : "left",
                                padding: "8px 12px", fontSize: 13, fontWeight: 500, color: "#414651",
                                lineHeight: "20px", backgroundColor: "#F4F4F4", border: "1px solid #EBEDF0",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: "8px 12px", textAlign: "center", fontSize: 13, backgroundColor: "#F4F4F4", border: "1px solid #EBEDF0", color: "#717680" }}>
                              {idx + 1}
                            </td>
                            <td style={{ padding: "8px 12px", border: "1px solid #EBEDF0" }}>
                              {isEditable ? (
                                <input
                                  className="w-full focus:outline-none"
                                  style={{ fontSize: 13, background: "transparent", border: "none", color: "#414651", width: "100%" }}
                                  value={item.label ?? ""}
                                  onChange={(e) => setLineItem(idx, { label: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === "Enter") void saveLineItems(lineItems); }}
                                />
                              ) : (
                                <span style={{ fontSize: 13, color: "#414651" }}>{item.label || "—"}</span>
                              )}
                            </td>
                            <td style={{ padding: "8px 12px", border: "1px solid #EBEDF0", fontSize: 13, color: "#414651" }}>
                              {item.charge_type ?? "—"}
                            </td>
                            <td style={{ padding: "8px 12px", border: "1px solid #EBEDF0", textAlign: "right", fontSize: 13, color: "#414651", fontVariantNumeric: "tabular-nums" }}>
                              {item.quantity ?? 1}
                            </td>
                            <td style={{ padding: "8px 12px", border: "1px solid #EBEDF0", textAlign: "right" }}>
                              {isEditable ? (
                                <input
                                  type="number"
                                  className="w-full focus:outline-none"
                                  style={{ fontSize: 13, background: "transparent", border: "none", color: "#414651", width: "100%", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                                  value={item.amount ?? 0}
                                  onChange={(e) => setLineItem(idx, { amount: Number(e.target.value) })}
                                  onKeyDown={(e) => { if (e.key === "Enter") void saveLineItems(lineItems); }}
                                />
                              ) : (
                                <span style={{ fontSize: 13, color: "#414651", fontVariantNumeric: "tabular-nums" }}>{item.amount ?? 0}</span>
                              )}
                            </td>
                            <td style={{ padding: "8px 12px", border: "1px solid #EBEDF0", textAlign: "center" }}>
                              {isEditable && (
                                <button onClick={() => removeLineItem(idx)} style={{ color: "#9CA3AF", background: "none", border: "none", cursor: "pointer" }}>
                                  ✕
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {isEditable && (
                      <button
                        onClick={addLineItem}
                        style={{ margin: 10, fontSize: 13, color: "#1876FF", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
                      >
                        + Add line item
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        stage="extraction"
      />

      {run.contract_id && (
        <DocumentPreviewModal
          open={contractPdfOpen}
          onClose={() => setContractPdfOpen(false)}
          title={extracted.vendor_name ? `Contract — ${extracted.vendor_name}` : "Contract Preview"}
          pdfUrl={directpayService.contractPdfUrl(run.contract_id)}
          authToken={token}
        />
      )}
    </div>
  );
}

export default withAuthGuard(InvoiceReviewPage);
