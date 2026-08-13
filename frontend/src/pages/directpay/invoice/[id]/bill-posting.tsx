import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  PaperClipOutlined,
  TagOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button as AntButton, Space } from "antd";
import { withAuthGuard } from "@/components/AuthGuard";
import { ComponentHeaderAntd } from "@/components/matching";
import { Loader, useToast } from "@/components/ui";
import { RejectModal } from "@/components/RejectModal";
import { DpBillPostingMetadataGrid } from "@/components/directpay/DpBillPostingMetadataGrid";
import { DocumentPreviewModal } from "@/components/directpay/DocumentPreviewModal";
import { ApiError } from "@/services/api";
import { directpayService, DpBillPostingData, DpBillPostingLineItem } from "@/services/directpay";
import { BillPostingTable, VAT_OPTIONS_FALLBACK } from "@/components/BillPosting";
import type { BillLineItem, LineItemEdit } from "@/components/BillPosting";

// Same page/layout as Invoice Processing's own bill-posting.tsx — unified
// card with Metadata grid stacked above the Line Items table (BillPostingTable
// is reused as-is, it's pure presentation with no P2P-specific API calls),
// success banner, posting spinner overlay, WHT-subject alert. The Metadata
// grid's field set (PO Number, Doc Header, Ref Keys...) is replicated
// verbatim with mock/synthesized values — DirectPay's real bill-posting
// response shape hasn't been shared yet, so field names/sources here are
// placeholders to be corrected once it is. The ERP-posting side effect
// itself stays mocked — no real Zoho/QBD call, so there's no "View in ERP"
// deep link, just the posted bill number.

function toBillLineItem(item: DpBillPostingLineItem): BillLineItem {
  return {
    id: item.id,
    description: item.description || item.charge_type || "",
    quantity: item.quantity ?? 1,
    unit_price: item.amount ?? 0,
    total: item.amount ?? 0,
    vat_tax_code: item.vat_tax_code,
    wht_tax_code: item.wht_tax_code,
  };
}

function InvoiceBillPostingPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { toast } = useToast();

  const [data, setData] = useState<DpBillPostingData | null>(null);
  const [lineEdits, setLineEdits] = useState<Map<string, LineItemEdit>>(new Map());
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [invoicePdfOpen, setInvoicePdfOpen] = useState(false);
  const [contractPdfOpen, setContractPdfOpen] = useState(false);
  const [pdfToken, setPdfToken] = useState<string | null>(null);

  // Metadata edits (Reference, Text, Ref Keys, Doc Header...) — client-side
  // only for now, same mock-data caveat as DpBillPostingMetadataGrid itself.
  const [metaEdits, setMetaEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const bp = await directpayService.getBillPosting(id);
      setData(bp);
      const map = new Map<string, LineItemEdit>();
      for (const li of bp.line_items) {
        map.set(li.id, { vat_tax_code: li.vat_tax_code ?? "", wht_tax_code: li.wht_tax_code ?? "" });
      }
      setLineEdits(map);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // Not at (or past) Bill Posting yet — Matching owns this invoice.
        router.replace(`/directpay/invoice/${id}/match`);
        return;
      }
      toast("Invoice not found", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast, router]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPdfToken(localStorage.getItem("access_token"));
  }, []);

  const handleVatChange = (itemId: string, vatCode: string) => {
    setLineEdits((prev) => {
      const next = new Map(prev);
      const curr = next.get(itemId) ?? { vat_tax_code: "", wht_tax_code: "" };
      next.set(itemId, { ...curr, vat_tax_code: vatCode });
      return next;
    });
  };

  const handleWhtChange = (itemId: string, whtCode: string) => {
    setLineEdits((prev) => {
      const next = new Map(prev);
      const curr = next.get(itemId) ?? { vat_tax_code: "", wht_tax_code: "" };
      next.set(itemId, { ...curr, wht_tax_code: whtCode });
      return next;
    });
  };

  const handlePost = async () => {
    if (!id || !data) return;
    setPosting(true);
    try {
      const overrides: Record<string, Partial<DpBillPostingLineItem>> = {};
      for (const li of data.line_items) {
        const edit = lineEdits.get(li.id) ?? { vat_tax_code: li.vat_tax_code, wht_tax_code: li.wht_tax_code };
        overrides[li.id] = { gl_account_code: li.gl_account_code, vat_tax_code: edit.vat_tax_code, wht_tax_code: edit.wht_tax_code };
      }
      await directpayService.editBillPosting(id, overrides).catch(() => undefined);
      await directpayService.postBill(id);
      // Stay on the same page; reload so the read-only completed view
      // (Bill Posted pill + success banner) renders in place.
      await load();
    } catch {
      toast("Could not post bill", "error");
    } finally {
      setPosting(false);
    }
  };

  const handleMetaEdit = (key: string, value: string) => {
    setMetaEdits((prev) => ({ ...prev, [key]: value }));
  };

  // Persist current line-item VAT/WHT edits to the backend before running
  // simulate, so the server computes against the user's latest inputs —
  // same ordering as P2P's own persistEditsForSimulate.
  const persistLineEdits = async () => {
    if (!id || !data) return;
    const overrides: Record<string, Partial<DpBillPostingLineItem>> = {};
    for (const li of data.line_items) {
      const edit = lineEdits.get(li.id) ?? { vat_tax_code: li.vat_tax_code, wht_tax_code: li.wht_tax_code };
      overrides[li.id] = { vat_tax_code: edit.vat_tax_code, wht_tax_code: edit.wht_tax_code };
    }
    await directpayService.editBillPosting(id, overrides);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <Loader size="large" />
      </div>
    );
  }
  if (!data) return null;

  const isCompleted = data.status === "posted";
  const isVendorSubjectToWht = data.wht_applicable;

  const metaItems = [
    { icon: <TagOutlined />, text: "Manual Upload" },
    data.invoice_number
      ? { icon: <FileTextOutlined />, text: data.invoice_number, onClick: () => setInvoicePdfOpen(true) }
      : null,
    data.vendor_name
      ? {
          icon: <UserOutlined />,
          text: data.vendor_name,
          onClick: data.contract_id ? () => setContractPdfOpen(true) : undefined,
        }
      : null,
    data.invoice_date ? { icon: <CalendarOutlined />, text: data.invoice_date } : null,
  ].filter(Boolean) as { icon: React.ReactNode; text: string; onClick?: () => void }[];

  const actionButtons = isCompleted ? (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
      style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }}
    >
      <CheckCircleOutlined />
      Bill Posted
    </span>
  ) : (
    <Space>
      <AntButton danger onClick={() => setRejectOpen(true)} disabled={posting}>
        Reject
      </AntButton>
      <AntButton type="primary" onClick={handlePost} loading={posting}>
        Post to ERP
      </AntButton>
    </Space>
  );

  return (
    <div className="min-h-screen flex flex-col bg-white" style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {posting && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(255,255,255,0.85)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
          }}
        >
          <svg className="animate-spin" width="40" height="40" viewBox="0 0 1024 1024" style={{ color: "#1876FF" }}>
            <path
              fill="currentColor"
              d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 0 0-94.3-139.9 437.71 437.71 0 0 0-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"
            />
          </svg>
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#101828" }}>Posting to ERP…</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>Please wait, do not close this page</p>
          </div>
        </div>
      )}

      <ComponentHeaderAntd
        title="Bill Posting Details"
        onBack={() => router.push(`/directpay/invoice/${id}/match`)}
        metaItems={metaItems}
        right={actionButtons}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-4">
          {isCompleted ? (
            <div className="border border-green-200 bg-green-50 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircleOutlined className="flex-shrink-0 text-green-600" />
                <span className="text-sm text-green-800">
                  <strong>Posted to ERP successfully</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {data.erp?.bill_number && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(data.erp!.bill_number)}
                    title="Click to copy bill number"
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-semibold text-green-800 bg-green-100 border border-green-300 hover:bg-green-200 transition-colors cursor-copy"
                  >
                    <PaperClipOutlined />
                    {data.erp.bill_number}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <Alert
              type={isVendorSubjectToWht ? "info" : "warning"}
              message={
                <span className="text-gray-800">
                  {isVendorSubjectToWht ? "Vendor is subject to WHT deduction" : "Vendor is not subject to WHT deduction"}
                </span>
              }
              showIcon
              icon={<InfoCircleOutlined />}
            />
          )}
        </div>

        {/* ── Unified card (Metadata + Line items) — mirrors P2P's BillPostingScreen ── */}
        <div className="px-6 py-5">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <DpBillPostingMetadataGrid
              data={data}
              isEditMode={!isCompleted}
              edits={metaEdits}
              onEdit={handleMetaEdit}
              invoiceId={id ?? ""}
              persistEdits={persistLineEdits}
            />

            <div className="mx-5 border-t border-gray-200" />

            <div className="px-5 pb-5 pt-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">Line item</h3>
              <BillPostingTable
                lineItems={data.line_items.map(toBillLineItem)}
                lineEdits={lineEdits}
                isEditMode={!isCompleted}
                isVendorSubjectToWht={isVendorSubjectToWht}
                currency={data.currency ?? ""}
                vatOptions={VAT_OPTIONS_FALLBACK}
                onVatChange={handleVatChange}
                onWhtChange={handleWhtChange}
              />
            </div>
          </div>
        </div>
      </div>

      <RejectModal open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={handleReject} stage="bill_posting" />

      {id && (
        <DocumentPreviewModal
          open={invoicePdfOpen}
          onClose={() => setInvoicePdfOpen(false)}
          title={data.invoice_number ? `Invoice ${data.invoice_number}` : "Invoice Preview"}
          pdfUrl={directpayService.invoicePdfUrl(id)}
          authToken={pdfToken}
        />
      )}
      {data.contract_id && (
        <DocumentPreviewModal
          open={contractPdfOpen}
          onClose={() => setContractPdfOpen(false)}
          title={data.vendor_name ? `Contract — ${data.vendor_name}` : "Contract Preview"}
          pdfUrl={directpayService.contractPdfUrl(data.contract_id)}
          authToken={pdfToken}
        />
      )}
    </div>
  );
}

export default withAuthGuard(InvoiceBillPostingPage);
