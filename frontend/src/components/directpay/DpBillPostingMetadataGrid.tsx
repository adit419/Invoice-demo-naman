/**
 * DpBillPostingMetadataGrid — DirectPay's clone of Invoice Processing's
 * BillPostingMetadataGrid (SAP-style 4-col metadata grid + Simulate button),
 * pointed at DirectPay's own bill-posting data and /dp-api simulate endpoint
 * instead of P2P's. Field set and layout are replicated verbatim EXCEPT
 * "PO Number" — DirectPay matches invoices against contracts, not purchase
 * orders, so that field has no analog here and is dropped. The synthesized
 * default *values* for the remaining fields are sourced from DirectPay's
 * DpBillPostingData (invoice_number/vendor_name/currency/subtotal/
 * tax_amount/grand_total) instead of P2P's BillHeader.
 *
 * These field labels (Doc Header, Ref Key...) are placeholder — mock data
 * until the real DirectPay ERP-posting response shape is shared, at which
 * point the field keys/labels/sources here should be updated.
 */
import { EyeOutlined } from "@ant-design/icons";
import { Button, Input, InputNumber } from "antd";
import { useState } from "react";
import { directpayService, DpBillPostingData } from "@/services/directpay";
import { ApiError } from "@/services/api";
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
  isEditMode: boolean;
  /** Field-name → pending value (for editable text fields). */
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
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
  required?: boolean;
  /** disabled = system-computed, never editable. */
  disabled?: boolean;
  input: "text" | "number";
  value: string | number;
  placeholder?: string;
};

export function DpBillPostingMetadataGrid({
  data,
  isEditMode,
  edits,
  onEdit,
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

  // Synthesize SAP-style values from DirectPay's own bill-posting data —
  // mock/placeholder until the real ERP-posting response shape is shared.
  const refDefault = (data.invoice_number ?? "").toString();
  const docHeaderDefault = (refDefault.replace(/\D/g, "") || "0000000000").slice(-10);
  const refKeyHead1Default = (refDefault.replace(/\D/g, "") || "0000000000").slice(-10);
  const refKeyHead2Default = (refDefault.replace(/\D/g, "") || "0000000000") +
    new Date(data.invoice_date ?? Date.now()).getFullYear().toString();
  const assignmentDefault = refDefault;
  const textDefault = data.line_items?.[0]?.description || data.line_items?.[0]?.charge_type || "";

  const get = (key: string, fallback: string) => (edits[key] ?? fallback) || "";

  const fields: FieldConfig[] = [
    { key: "amount_before_vat", label: "Amount before VAT", required: true, disabled: true, input: "number", value: data.subtotal ?? 0 },
    { key: "total_after_vat", label: "Total amount after VAT", required: true, disabled: true, input: "number", value: data.grand_total ?? 0 },
    { key: "reference", label: "Reference", required: true, input: "text", value: get("reference", refDefault) },
    { key: "text", label: "Text", input: "text", value: get("text", textDefault) },
    { key: "ref_key_head_1", label: "Ref Key (head) 1", input: "text", value: get("ref_key_head_1", refKeyHead1Default) },
    { key: "ref_key_head_2", label: "Ref Key (head) 2", required: true, input: "text", value: get("ref_key_head_2", refKeyHead2Default) },
    { key: "assignment", label: "Assignment", input: "text", value: get("assignment", assignmentDefault) },
    { key: "doc_header", label: "Doc Header", input: "text", value: get("doc_header", docHeaderDefault) },
    { key: "ref_key_2", label: "Ref Key 2", input: "text", value: get("ref_key_2", ""), placeholder: "Enter Ref Key 2" },
    { key: "variance", label: "Variance", disabled: true, input: "number", value: 0 },
  ];

  const renderInput = (f: FieldConfig) => {
    const disabled = !!f.disabled || !isEditMode;
    const wrap = (node: React.ReactNode) => (f.disabled ? <div className="api-disabled-field">{node}</div> : node);

    if (f.input === "number") {
      return wrap(
        <InputNumber
          value={Number(f.value) || 0}
          disabled={disabled}
          className="w-full"
          style={{ width: "100%" }}
          size="large"
          prefix={currencySymbol}
          formatter={(v) => `${v ?? 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          parser={(v) => Number((v ?? "").replace(/,/g, ""))}
          precision={2}
        />
      );
    }

    return wrap(
      <Input
        value={String(f.value ?? "")}
        onChange={(e) => onEdit(f.key, e.target.value)}
        disabled={disabled}
        className="w-full"
        size="large"
        placeholder={f.placeholder ?? `Enter ${f.label}`}
      />
    );
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
        .dp-bill-posting-metadata .ant-input::placeholder {
          color: #94a3b8 !important;
        }
        .dp-bill-posting-metadata .ant-input-lg,
        .dp-bill-posting-metadata .ant-input-number-affix-wrapper-lg {
          min-height: 40px !important;
        }
        .dp-bill-posting-metadata .api-disabled-field .ant-input-disabled,
        .dp-bill-posting-metadata .api-disabled-field .ant-input-number-affix-wrapper-disabled {
          background-color: rgba(0, 0, 0, 0.04) !important;
          color: #94a3b8 !important;
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {f.label}
                {f.required && <span className="text-red-500">*</span>}
              </label>
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
