import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  PaperClipOutlined,
  TagOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button as AntButton, Space, Typography } from "antd";
import { withAuthGuard } from "@/components/AuthGuard";
import { RejectModal } from "@/components/RejectModal";
import { Loader } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { settingsService, stagesService } from "@/services";
import { useToast } from "@/components/ui";
import { formatDate } from "@/utils/format";
import { BillPostingScreen } from "@/components/BillPosting";
import type {
  BillPostingData, LineItemEdit,
} from "@/components/BillPosting";

const { Title } = Typography;

function BillPostingPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const [data, setData] = useState<BillPostingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  // Metadata edits (string fields like Reference, Text, Ref Keys, Doc Header).
  const [metaEdits, setMetaEdits] = useState<Record<string, string>>({});

  // Per-line-item VAT/WHT selections.
  const [lineEdits, setLineEdits] = useState<Map<string, LineItemEdit>>(new Map());

  // ERP fields workflow settings:
  //   allowedErpFields — Set of field keys where mask=true (null = show all).
  //   mandatoryErpFields — Set of field keys that must be filled before posting.
  const [allowedErpFields, setAllowedErpFields] = useState<Set<string> | null>(null);
  const [mandatoryErpFields, setMandatoryErpFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    type WfField = { key: string; mask?: boolean; mandatory?: boolean };
    settingsService.getWorkflow<{ erp_fields?: { fields?: WfField[] } }>()
      .then(settings => {
        const fields = settings.erp_fields?.fields ?? [];
        if (fields.length) {
          setAllowedErpFields(
            new Set(fields.filter(f => f.mask !== false).map(f => f.key))
          );
          setMandatoryErpFields(
            new Set(fields.filter(f => f.mandatory).map(f => f.key))
          );
        }
      })
      .catch(() => { /* default: show all columns, nothing mandatory */ });
  }, []);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const result = await stagesService.get<BillPostingData>(id, "bill_posting");
      setData(result);

      // Seed metadata edits from server-persisted overrides so the read-only
      // post-posted view shows the user's previously-entered values.
      setMetaEdits(result.metadata_overrides ?? {});

      const map = new Map<string, LineItemEdit>();
      for (const li of result.line_items ?? []) {
        map.set(li.id, {
          vat_tax_code: li.vat_tax_code ?? "IO",
          wht_tax_code: li.wht_tax_code ?? "",
        });
      }
      setLineEdits(map);
    } catch {
      toast("Failed to load bill data", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMetaEdit = (key: string, value: string) => {
    setMetaEdits(prev => ({ ...prev, [key]: value }));
  };

  const handleVatChange = (itemId: string, vatCode: string) => {
    setLineEdits(prev => {
      const next = new Map(prev);
      const curr = next.get(itemId) ?? { vat_tax_code: "", wht_tax_code: "" };
      next.set(itemId, { ...curr, vat_tax_code: vatCode });
      return next;
    });
  };

  const handleWhtChange = (itemId: string, whtCode: string) => {
    setLineEdits(prev => {
      const next = new Map(prev);
      const curr = next.get(itemId) ?? { vat_tax_code: "", wht_tax_code: "" };
      next.set(itemId, { ...curr, wht_tax_code: whtCode });
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!id || !data) return;
    setConfirming(true);

    // Validate mandatory ERP fields before posting.
    // vat_tax_code / wht_tax_code must be set on every line item when mandatory.
    const missing: string[] = [];
    if (mandatoryErpFields.has("vat_tax_code")) {
      const blank = data.line_items.filter(li => {
        const v = lineEdits.get(li.id)?.vat_tax_code ?? li.vat_tax_code ?? "";
        return !v;
      });
      if (blank.length > 0) missing.push("VAT Tax Code");
    }
    if (mandatoryErpFields.has("wht_tax_code") && (data.bill_header?.wht ?? 0) > 0) {
      const blank = data.line_items.filter(li => {
        const v = lineEdits.get(li.id)?.wht_tax_code ?? li.wht_tax_code ?? "";
        return !v;
      });
      if (blank.length > 0) missing.push("WHT Tax Code");
    }
    if (missing.length > 0) {
      toast(`Required field(s) missing: ${missing.join(", ")}`, "error");
      setConfirming(false);
      return;
    }

    try {
      const lineItems = data.line_items.map(li => {
        const edits = lineEdits.get(li.id) ?? { vat_tax_code: "", wht_tax_code: "" };
        return { id: li.id, ...edits };
      });
      // Persist edits, then post to ERP. Both are best-effort; the POST is
      // the load-bearing call — it creates the bill in Zoho and marks the
      // run completed server-side.
      await stagesService.editBillPosting(id, {
        metadata: metaEdits,
        line_items: lineItems,
      }).catch(() => undefined);
      await stagesService.postBill(id);
      // Stay on the same page; reload data so the read-only completed view
      // (Bill Posted pill + success banner with source file + Zoho bill link)
      // renders in place without a route change.
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Posting failed", "error");
    } finally {
      setConfirming(false);
    }
  };

  // Persist the current meta + line-item edits to the backend without posting
  // to ERP. Called by BillPostingMetadataGrid before running simulate so the
  // server computes against the user's latest inputs rather than stale data.
  const persistEditsForSimulate = async () => {
    if (!id || !data) return;
    const lineItems = data.line_items.map(li => {
      const edit = lineEdits.get(li.id) ?? { vat_tax_code: li.vat_tax_code ?? "IO", wht_tax_code: li.wht_tax_code ?? "" };
      return { id: li.id, ...edit };
    });
    await stagesService.editBillPosting(id, {
      metadata: metaEdits,
      line_items: lineItems,
    });
  };

  const handleReject = async (reason: string) => {
    if (!id) return;
    await stagesService.reject(id, "bill_posting", reason);
    toast("Invoice rejected", "error");
    setRejectOpen(false);
    router.push("/dashboard");
  };

  if (loading) {
    return <div className="min-h-screen bg-surface-page flex items-center justify-center"><Loader size="large" /></div>;
  }

  if (!data) {
    return <div className="min-h-screen bg-surface-page flex items-center justify-center"><p className="text-text-caption">Invoice not found.</p></div>;
  }

  // A bill is "posted" when EITHER the pipeline_runs.status is completed
  // (the state-machine signal) OR the bills.zoho_url has been persisted
  // server-side. The OR makes us resilient if the cascade-complete that
  // marks the pipeline completed ever races / no-ops — the Zoho post is
  // still authoritative because the URL only exists after a 201 from Zoho.
  const isCompleted = data.status === "completed" || Boolean(data.erp?.zoho_url);
  const isVendorSubjectToWht = (data.bill_header?.wht ?? 0) > 0;

  // ── Header meta items (ComponentHeader-style) ───────────────────────────
  const metaItems = [
    { icon: <TagOutlined />, text: "Manual Upload" },
    data.invoice_number ? { icon: <FileTextOutlined />, text: data.invoice_number } : null,
    data.vendor_name ? { icon: <UserOutlined />, text: data.vendor_name } : null,
    data.invoice_date ? { icon: <CalendarOutlined />, text: formatDate(data.invoice_date, "") } : null,
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];

  // ── Action buttons ──────────────────────────────────────────────────────
  // Table is always editable when the bill has not been posted. No explicit
  // Edit toggle — matches the UX of the Extraction and Matching stages.
  const actionButtons = isCompleted ? (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
      style={{
        background: "#ecfdf5",
        color: "#059669",
        border: "1px solid #a7f3d0",
      }}
    >
      <CheckCircleOutlined />
      Bill Posted
    </span>
  ) : (
    <Space>
      <AntButton danger onClick={() => setRejectOpen(true)} disabled={confirming}>Reject</AntButton>
      <AntButton
        type="primary"
        className="!bg-[#2FB350] !border-[#2FB350] hover:!bg-[#28a047] hover:!border-[#28a047]"
        onClick={handleConfirm}
        loading={confirming}
        disabled={!canEdit}
      >
        Post to ERP
      </AntButton>
    </Space>
  );

  return (
    <div
      className="min-h-screen flex flex-col bg-white"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── ComponentHeader-style header (antd) ───────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-y-3 px-5 py-4 bg-white sticky top-0 z-10 border-b border-gray-200">
        <div className="flex items-center gap-4 min-w-0">
          <AntButton
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push(`/invoice/${id}/matching?tab=line_items`)}
            className="flex-shrink-0"
          />
          <div className="min-w-0">
            <Title level={4} className="!mb-0" style={{ margin: 0, lineHeight: 1.2 }}>
              Bill Posting Details
            </Title>
            {metaItems.length > 0 && (
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-0.5">
                {metaItems.map((item, index) => (
                  <Fragment key={index}>
                    {index > 0 && <span className="text-gray-300 select-none">|</span>}
                    <span className="flex items-center gap-1 text-gray-500 text-sm">
                      {item.icon}
                      <span>{item.text}</span>
                    </span>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">{actionButtons}</div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* ── Success banner (post-posting) or WHT alert ─────────────────── */}
        <div className="px-6 pt-4">
          {isCompleted ? (
            <div className="border border-green-200 bg-green-50 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircleOutlined className="flex-shrink-0 text-green-600" />
                <span className="text-sm text-green-800">
                  <strong>Posted to ERP successfully</strong>
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 text-sm text-green-700">
                <span className="font-medium mr-1">Attachments:</span>
                {/* Zoho bill deep-link — populated server-side by Post-to-ERP.
                    The original invoice PDF is intentionally not listed here. */}
                {data.erp?.zoho_url && (
                  <a
                    className="flex items-center gap-1 hover:underline text-green-700"
                    href={data.erp.zoho_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <PaperClipOutlined />
                    <span>{data.erp.bill_number || "Zoho bill"}</span>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <Alert
              type={isVendorSubjectToWht ? "info" : "warning"}
              message={
                <span className="text-gray-800">
                  {isVendorSubjectToWht
                    ? "Vendor is subject to WHT deduction"
                    : "Vendor is not subject to WHT deduction"}
                </span>
              }
              showIcon
              icon={<InfoCircleOutlined />}
            />
          )}
        </div>

        {/* ── Unified card (Metadata + Line items) ───────────────────────── */}
        <BillPostingScreen
          data={data}
          isEditMode={!isCompleted}
          metaEdits={metaEdits}
          onMetaEdit={handleMetaEdit}
          lineEdits={lineEdits}
          onVatChange={handleVatChange}
          onWhtChange={handleWhtChange}
          isVendorSubjectToWht={isVendorSubjectToWht}
          allowedErpFields={allowedErpFields}
          invoiceId={id}
          canSimulate={true}
          persistEdits={persistEditsForSimulate}
        />
      </div>

      <RejectModal open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={handleReject} stage="bill_posting" />
    </div>
  );
}

export default withAuthGuard(BillPostingPage);
