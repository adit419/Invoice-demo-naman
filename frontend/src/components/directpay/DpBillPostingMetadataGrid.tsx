/**
 * DpBillPostingMetadataGrid — same unified-card layout as Invoice Processing's
 * own BillPostingMetadataGrid (bold "Metadata" heading + Simulate button,
 * 4-column responsive grid, antd Input/InputNumber size="large") but a
 * different field SET by explicit request: P2P's own grid is SAP-posting
 * metadata (PO Number, Doc Header, Ref Keys, Assignment...), which has no
 * real DirectPay equivalent (DP posts against a contract, not a PO, and has
 * no SAP integration behind it). This grid shows the invoice's own real
 * data instead — every field here is a fact already established upstream
 * (Extraction / Extraction Postprocessing), so all of them are read-only;
 * there's nothing to edit at the Bill Posting stage itself.
 */
import { EyeOutlined } from "@ant-design/icons";
import { Button, Input, InputNumber } from "antd";
import { useState } from "react";
import { directpayService, DpBillPostingData } from "@/services/directpay";
import { ApiError } from "@/services/api";
import { formatDate } from "@/utils/format";
import { SimulateDocumentModal } from "@/components/BillPosting";
import type { SimulateDocumentData, SimulateStatus } from "@/components/BillPosting";

function getCurrencySymbol(code: string | null | undefined): string {
  switch ((code ?? "").toUpperCase()) {
    case "USD": return "$";
    case "EUR": return "€";
    case "GBP": return "£";
    case "INR": return "₹";
    case "PHP": return "₱";
    case "JPY": return "¥";
    case "MYR": return "RM";
    case "IDR": return "IDR";
    default: return code ?? "";
  }
}

interface DpBillPostingMetadataGridProps {
  data: DpBillPostingData;
  /** Invoice/run id — used by the Simulate ERP-posting preview. */
  invoiceId: string;
  /**
   * Persist current line-item edits to the backend before running simulate
   * so the server computes against the latest VAT/WHT selections. If
   * undefined or if it throws, simulate still proceeds.
   */
  persistEdits?: () => Promise<void>;
}

interface SimulateResponse {
  status: SimulateStatus;
  message: string;
  document: SimulateDocumentData | null;
}

type FieldConfig = {
  key: string;
  label: string;
  input: "text" | "amount";
  value: string | number;
};

export function DpBillPostingMetadataGrid({
  data,
  invoiceId,
  persistEdits,
}: DpBillPostingMetadataGridProps) {
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulateStatus, setSimulateStatus] = useState<SimulateStatus>("success");
  const [simulateMessage, setSimulateMessage] = useState("");
  const [simulateDoc, setSimulateDoc] = useState<SimulateDocumentData | null>(null);

  const handleSimulate = async () => {
    setSimulateLoading(true);
    if (persistEdits) {
      try {
        await persistEdits();
      } catch (err) {
        console.warn("[DpBillPostingMetadataGrid] persistEdits failed before simulate:", err);
      }
    }
    try {
      const res = await directpayService.simulateBillPosting<SimulateResponse>(invoiceId);
      setSimulateStatus(res.status ?? "error");
      setSimulateMessage(res.message ?? "Simulation completed.");
      setSimulateDoc(res.document ?? null);
    } catch (err) {
      setSimulateStatus("error");
      setSimulateMessage(err instanceof ApiError ? err.message : "Simulation failed. Please try again.");
      setSimulateDoc(null);
    } finally {
      setSimulateOpen(true);
      setSimulateLoading(false);
    }
  };

  const currencySymbol = getCurrencySymbol(data.currency);

  const fields: FieldConfig[] = [
    { key: "invoice_received_date", label: "Invoice Received Date", input: "text", value: formatDate(data.invoice_received_date) },
    { key: "vendor_name", label: "Vendor Name", input: "text", value: data.vendor_name ?? "" },
    { key: "invoice_number", label: "Invoice Number", input: "text", value: data.invoice_number ?? "" },
    { key: "invoice_date", label: "Invoice Date", input: "text", value: data.invoice_date ?? "" },
    { key: "taxable_amount", label: "Taxable Amount", input: "amount", value: data.subtotal ?? 0 },
    { key: "payable_amount", label: "Payable Amount", input: "amount", value: data.payable_amount ?? 0 },
    { key: "payment_due_date", label: "Payment Due Date", input: "text", value: formatDate(data.payment_due_date) },
    { key: "bank_account_name", label: "Bank Account Name", input: "text", value: data.bank_account_name ?? "" },
    { key: "bank_account_number", label: "Bank Account Number", input: "text", value: data.bank_account_number ?? "" },
  ];

  const renderInput = (f: FieldConfig) => {
    const node =
      f.input === "amount" ? (
        <InputNumber
          value={Number(f.value) || 0}
          disabled
          className="w-full"
          style={{ width: "100%" }}
          size="large"
          prefix={currencySymbol}
          formatter={(v) => `${v ?? 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          precision={2}
        />
      ) : (
        <Input value={String(f.value ?? "") || "—"} disabled className="w-full" size="large" />
      );
    return <div className="api-disabled-field">{node}</div>;
  };

  return (
    <>
      <style>{`
        .dp-bill-posting-metadata .ant-input,
        .dp-bill-posting-metadata .ant-input-number-input {
          font-size: 14px !important;
          color: #0f172a !important;
        }
        .dp-bill-posting-metadata .ant-input-number-prefix {
          color: #94a3b8 !important;
          font-size: 14px !important;
          margin-right: 6px;
        }
        .dp-bill-posting-metadata .ant-input-lg,
        .dp-bill-posting-metadata .ant-input-number-affix-wrapper-lg {
          min-height: 40px !important;
        }
        .dp-bill-posting-metadata .api-disabled-field .ant-input-disabled,
        .dp-bill-posting-metadata .api-disabled-field .ant-input-number-affix-wrapper-disabled {
          background-color: rgba(0, 0, 0, 0.04) !important;
          color: #374151 !important;
        }
      `}</style>
      <div className="p-5 dp-bill-posting-metadata">
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm font-bold text-gray-800">Metadata</span>
          <Button
            icon={<EyeOutlined />}
            size="small"
            className="text-gray-600 border-gray-300"
            loading={simulateLoading}
            onClick={handleSimulate}
            title="Simulate ERP posting"
          >
            Simulate
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1">{f.label}</label>
              {renderInput(f)}
            </div>
          ))}
        </div>
      </div>

      <SimulateDocumentModal
        open={simulateOpen}
        onClose={() => setSimulateOpen(false)}
        status={simulateStatus}
        message={simulateMessage}
        data={simulateDoc}
      />
    </>
  );
}
