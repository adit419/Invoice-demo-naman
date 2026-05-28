/**
 * BillPostingMetadataGrid — SAP-style metadata grid (4-col antd inputs).
 *
 * Fields mirror the new invoice-validator-fe layout:
 *   PO Number · Amount before VAT · Total amount after VAT · Reference
 *   Text · Ref Key (head) 1 · Ref Key (head) 2 · Assignment
 *   Doc Header · Ref Key 2 · Variance
 *
 * Values are synthesized from the demo's BillPostingData (no contract — demo
 * fixture is generic). System-computed fields (PO Number, Amounts, Variance)
 * stay disabled regardless of edit mode.
 */
import { EyeOutlined } from "@ant-design/icons";
import { Button, Input, InputNumber } from "antd";
import React, { useState } from "react";
import { stagesService } from "@/services";
import type { BillPostingData } from "./types";
import {
  SimulateDocumentModal,
  type SimulateDocumentData,
  type SimulateStatus,
} from "./SimulateDocumentModal";

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

interface BillPostingMetadataGridProps {
  data: BillPostingData;
  isEditMode: boolean;
  /** Field-name → pending value (for editable text fields). */
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  onRequestEditMode?: () => void;
  /** Invoice/run id — used by the Simulate ERP-posting preview. */
  invoiceId: string;
  /** Simulate is unavailable once the bill is already posted. */
  canSimulate?: boolean;
  /**
   * Persist current edits (meta + line items) to the backend before
   * running simulate so the server computes against the latest inputs.
   * If undefined or if it throws, simulate still proceeds.
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
  /** "text" or "number". Numbers render with currency prefix. */
  input: "text" | "number";
  /** Read-only display value (for disabled fields). */
  value: string | number;
  /** Placeholder when value is empty. */
  placeholder?: string;
};

export function BillPostingMetadataGrid({
  data,
  isEditMode,
  edits,
  onEdit,
  onRequestEditMode,
  invoiceId,
  canSimulate = true,
  persistEdits,
}: BillPostingMetadataGridProps) {
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulateStatus, setSimulateStatus] = useState<SimulateStatus>("success");
  const [simulateMessage, setSimulateMessage] = useState("");
  const [simulateDoc, setSimulateDoc] = useState<SimulateDocumentData | null>(null);

  const handleSimulate = async () => {
    setSimulateLoading(true);
    // Persist any unsaved edits (metadata + line-item tax codes) to the backend
    // first so the simulate endpoint computes against the user's latest inputs.
    // Failure is non-fatal — we still proceed so the user gets some feedback.
    if (persistEdits) {
      try {
        await persistEdits();
      } catch (err) {
        console.warn("[BillPostingMetadataGrid] persistEdits failed before simulate:", err);
      }
    }
    try {
      const res = await stagesService.simulateBillPosting<SimulateResponse>(
        invoiceId,
      );
      setSimulateStatus(res.status ?? "error");
      setSimulateMessage(res.message ?? "Simulation completed.");
      setSimulateDoc(res.document ?? null);
    } catch (err) {
      setSimulateStatus("error");
      setSimulateMessage(
        err instanceof Error ? err.message : "Simulation failed. Please try again.",
      );
      setSimulateDoc(null);
    } finally {
      setSimulateOpen(true);
      setSimulateLoading(false);
    }
  };

  const header = data.bill_header ?? ({} as Partial<BillPostingData["bill_header"]>);
  const currencySymbol = getCurrencySymbol(header.currency);

  // Synthesize the SAP-style values from the demo's fixture.
  const refDefault = (data.invoice_number ?? header.bill_number ?? "").toString();
  const poDefault = header.reference ?? "";
  // "Doc Header" in SAP is usually the doc-num / posting key reference. We
  // derive a stable digit string from the PO ref to look authentic.
  const docHeaderDefault = (poDefault.replace(/\D/g, "") || "0000000000").slice(-10);
  const refKeyHead1Default = (refDefault.replace(/\D/g, "") || "0000000000").slice(-10);
  const refKeyHead2Default = (refDefault.replace(/\D/g, "") || "0000000000") +
    new Date(header.bill_date ?? Date.now()).getFullYear().toString();
  const assignmentDefault = refDefault;
  const textDefault = data.line_items?.[0]?.description ?? "";

  const get = (key: string, fallback: string) =>
    (edits[key] ?? fallback) || "";

  const fields: FieldConfig[] = [
    { key: "po_number",          label: "PO Number",            required: true, disabled: true, input: "text",   value: poDefault },
    { key: "amount_before_vat",  label: "Amount before VAT",    required: true, disabled: true, input: "number", value: header.subtotal ?? 0 },
    { key: "total_after_vat",    label: "Total amount after VAT", required: true, disabled: true, input: "number", value: header.total ?? 0 },
    { key: "reference",          label: "Reference",            required: true, input: "text",   value: get("reference", refDefault) },
    { key: "text",               label: "Text",                                input: "text",   value: get("text", textDefault) },
    { key: "ref_key_head_1",     label: "Ref Key (head) 1",                    input: "text",   value: get("ref_key_head_1", refKeyHead1Default) },
    { key: "ref_key_head_2",     label: "Ref Key (head) 2",     required: true, input: "text",   value: get("ref_key_head_2", refKeyHead2Default) },
    { key: "assignment",         label: "Assignment",                          input: "text",   value: get("assignment", assignmentDefault) },
    { key: "doc_header",         label: "Doc Header",                          input: "text",   value: get("doc_header", docHeaderDefault) },
    { key: "ref_key_2",          label: "Ref Key 2",                           input: "text",   value: get("ref_key_2", ""), placeholder: "Enter Ref Key 2" },
    { key: "variance",           label: "Variance",                            disabled: true, input: "number", value: 0 },
  ];

  const renderInput = (f: FieldConfig) => {
    const disabled = !!f.disabled || !isEditMode;
    const wrap = (node: React.ReactNode) =>
      f.disabled ? <div className="api-disabled-field">{node}</div> : node;

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
        .bill-posting-metadata .ant-input,
        .bill-posting-metadata .ant-input-number-input {
          font-size: 14px !important;
          color: #0f172a !important;
        }
        .bill-posting-metadata .ant-input-number-prefix {
          color: #94a3b8 !important;
          font-size: 14px !important;
          margin-right: 6px;
        }
        .bill-posting-metadata .ant-input::placeholder {
          color: #94a3b8 !important;
        }
        .bill-posting-metadata .ant-input-lg,
        .bill-posting-metadata .ant-input-number-affix-wrapper-lg {
          min-height: 40px !important;
        }
        .bill-posting-metadata .api-disabled-field .ant-input-disabled,
        .bill-posting-metadata .api-disabled-field .ant-input-number-affix-wrapper-disabled {
          background-color: rgba(0, 0, 0, 0.04) !important;
          color: #94a3b8 !important;
        }
      `}</style>
      <div className="p-5 bill-posting-metadata">
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
          {fields.map((f) => {
            const clickable = !isEditMode && !f.disabled && !!onRequestEditMode;
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  {f.label}
                  {f.required && <span className="text-red-500">*</span>}
                </label>
                <div
                  className={clickable ? "cursor-pointer" : ""}
                  onClick={clickable ? onRequestEditMode : undefined}
                >
                  <div style={clickable ? { pointerEvents: "none" } : undefined}>
                    {renderInput(f)}
                  </div>
                </div>
              </div>
            );
          })}
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
