import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  TagOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button as AntButton, Space } from "antd";
import { withAuthGuard } from "@/components/AuthGuard";
import { ComponentHeaderAntd } from "@/components/matching";
import { Loader, useToast } from "@/components/ui";
import { RejectModal } from "@/components/RejectModal";
import { DpBillPostingMetadataGrid } from "@/components/directpay/DpBillPostingMetadataGrid";
import { DocumentPreviewModal } from "@/components/directpay/DocumentPreviewModal";
import { ContractExtractionModal } from "@/components/directpay/ContractExtractionModal";
import { ApiError } from "@/services/api";
import { directpayService, DpBillPostingData, DpBillPostingLineItem } from "@/services/directpay";
import { BillPostingTable } from "@/components/BillPosting";
import type { BillLineItem, LineItemEdit, VatCodeOption } from "@/components/BillPosting";

// Same page/layout as Invoice Processing's own bill-posting.tsx — unified
// card with Metadata grid stacked above the Line Items table (BillPostingTable
// is reused as-is, it's pure presentation with no P2P-specific API calls),
// success banner, posting spinner overlay, WHT-subject alert. The Metadata
// grid's field SET deliberately diverges from P2P's own (PO Number, Doc
// Header, Ref Keys...) — that's SAP-posting metadata with no DirectPay
// equivalent (no PO, no SAP integration behind this) — showing the invoice's
// own real data instead (see DpBillPostingMetadataGrid). The ERP-posting
// side effect itself stays mocked — no real Zoho/QBD call, so there's no
// "View in ERP" deep link, just the posted bill number.

// P2P's own WHT_OPTIONS (BillPostingTable's default) are Philippine BIR
// Expanded Withholding Tax codes — no analog for Indonesian PPh withholding,
// so a lease invoice like PT_BANGUN's would get mislabeled (e.g. "rental of
// MOVABLE property" for a building lease, even though the 10% rate happens
// to match). This is DirectPay's own override, passed to BillPostingTable's
// whtOptions prop — P2P's own page is untouched, still gets its default.
/** The explicit "no withholding applies" code, preselected for a vendor not
 *  subject to WHT (see NO_WHT_CODE's use in toBillLineItem below). */
const NO_WHT_CODE = "00";

const DP_WHT_OPTIONS = [
  {
    label: "PPH 4(2) — FINAL TAX ON LAND/BUILDING RENTAL",
    options: [
      { value: "PPH4(2)-SEWA", label: "PPH4(2)-SEWA · SEWA TANAH DAN/ATAU BANGUNAN 10%" },
    ],
  },
  {
    label: "NO WITHHOLDING",
    options: [{ value: "00", label: "00 · NO WITHHOLDING" }],
  },
];

/**
 * Mirrors the backend's own _validate_bill_posting_tax_codes (service.py).
 * Purely for immediate feedback — the server re-checks and is the real gate,
 * so the two must stay in step (same rules, same wording).
 */
function validateTaxCodes(
  lineItems: DpBillPostingLineItem[],
  edits: Map<string, LineItemEdit>,
  vatApplicable: boolean,
  whtApplicable: boolean,
): string | null {
  const label = (li: DpBillPostingLineItem) => li.description || li.charge_type || `line ${li.id}`;
  const codes = (li: DpBillPostingLineItem) => {
    const e = edits.get(li.id);
    return {
      vat: (e?.vat_tax_code ?? li.vat_tax_code ?? "").trim(),
      wht: (e?.wht_tax_code ?? li.wht_tax_code ?? "").trim(),
    };
  };

  for (const li of lineItems) {
    const { vat } = codes(li);
    if (vatApplicable && !vat) {
      return `Select a VAT/GST Tax Code for \u201C${label(li)}\u201D before posting — this vendor is subject to VAT.`;
    }
    if (!vatApplicable && vat) {
      return `\u201C${label(li)}\u201D has VAT/GST Tax Code \u201C${vat}\u201D, but this vendor is not subject to VAT. Clear the VAT code before posting.`;
    }
  }
  for (const li of lineItems) {
    const { wht } = codes(li);
    if (whtApplicable && (!wht || wht === NO_WHT_CODE)) {
      return `Select the applicable WHT Tax Code for \u201C${label(li)}\u201D before posting — this vendor is subject to withholding tax.`;
    }
    if (!whtApplicable && wht && wht !== NO_WHT_CODE) {
      return `\u201C${label(li)}\u201D has WHT Tax Code \u201C${wht}\u201D, but this vendor is not subject to withholding tax. Set it to \u201CNo Withholding\u201D before posting.`;
    }
  }
  return null;
}

function toBillLineItem(item: DpBillPostingLineItem, whtApplicable: boolean): BillLineItem {
  return {
    id: item.id,
    description: item.description || item.charge_type || "",
    quantity: item.quantity ?? 1,
    unit_price: item.amount ?? 0,
    total: item.amount ?? 0,
    vat_tax_code: item.vat_tax_code,
    // A vendor with no WHT gets the explicit "no withholding" code by default
    // rather than a blank cell — the WHT column is now always shown, so the
    // absence of withholding has to be stated, not implied.
    wht_tax_code: item.wht_tax_code || (whtApplicable ? "" : NO_WHT_CODE),
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
  const [contractExtractionOpen, setContractExtractionOpen] = useState(false);
  const [pdfToken, setPdfToken] = useState<string | null>(null);
  // Country-specific VAT code options — fetched once per currency after data
  // loads, same pattern as P2P's own bill-posting.tsx. Falls back to
  // VAT_OPTIONS_FALLBACK (inside BillPostingTable) if the fetch fails or the
  // currency has no real code list.
  const [vatOptions, setVatOptions] = useState<VatCodeOption[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const bp = await directpayService.getBillPosting(id);
      setData(bp);

      const currency = bp.currency ?? "";
      directpayService.getVatCodes(currency)
        .then(({ codes }) => {
          setVatOptions(codes.map((c) => {
            const pct = `${parseFloat(c.percentage)}%`;
            const desc = c.description.trimEnd();
            const label = desc.endsWith(pct) ? `${c.tax_code}: ${desc}` : `${c.tax_code}: ${desc} ${pct}`;
            return { value: c.tax_code, label };
          }));
        })
        .catch(() => { /* fallback to VAT_OPTIONS_FALLBACK in BillPostingTable */ });

      const map = new Map<string, LineItemEdit>();
      // Seed the same "no withholding" default toBillLineItem applies, so the
      // dropdown shows it AND a Post/Simulate persists it — an empty string
      // here would otherwise win over that default (?? only falls through on
      // null/undefined, not "").
      const whtApplicable = bp.wht_applicable;
      for (const li of bp.line_items) {
        map.set(li.id, {
          vat_tax_code: li.vat_tax_code ?? "",
          wht_tax_code: li.wht_tax_code || (whtApplicable ? "" : NO_WHT_CODE),
        });
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
    const taxError = validateTaxCodes(data.line_items, lineEdits, data.vat_applicable, data.wht_applicable);
    if (taxError) {
      toast(taxError, "error");
      return;
    }
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
    } catch (err) {
      // The backend re-validates and returns its message as a 400 — show that
      // rather than a generic failure, so the user knows which code to fix.
      toast(err instanceof ApiError ? err.message : "Could not post bill", "error");
    } finally {
      setPosting(false);
    }
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
  if (!data) return null;

  const isCompleted = data.status === "posted";
  const isVendorSubjectToWht = data.wht_applicable;
  const isVendorSubjectToVat = data.vat_applicable;

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
    // Distinct from the vendor-name link above (which opens a read-only PDF
    // preview) — this opens the actual Contract Extraction table for the
    // matched contract, same as the Matching page's own "Contract" link.
    data.contract_id
      ? { icon: <FileProtectOutlined />, text: "Contract", onClick: () => setContractExtractionOpen(true) }
      : null,
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
          ) : null}
        </div>

        {/* ── Unified card (Metadata + Line items) — mirrors P2P's BillPostingScreen ── */}
        <div className="px-6 py-5">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <DpBillPostingMetadataGrid
              data={data}
              invoiceId={id ?? ""}
              persistEdits={persistLineEdits}
            />

            <div className="mx-5 border-t border-gray-200" />

            <div className="px-5 pb-5 pt-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">Line item</h3>
              <BillPostingTable
                lineItems={data.line_items.map((li) => toBillLineItem(li, isVendorSubjectToWht))}
                lineEdits={lineEdits}
                isEditMode={!isCompleted}
                isVendorSubjectToWht={isVendorSubjectToWht}
                isVendorSubjectToVat={isVendorSubjectToVat}
                alwaysShowWhtColumn
                currency={data.currency ?? ""}
                vatOptions={vatOptions}
                whtOptions={DP_WHT_OPTIONS}
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
      <ContractExtractionModal
        open={contractExtractionOpen}
        onClose={() => setContractExtractionOpen(false)}
        contractId={data.contract_id ?? null}
      />
    </div>
  );
}

export default withAuthGuard(InvoiceBillPostingPage);
