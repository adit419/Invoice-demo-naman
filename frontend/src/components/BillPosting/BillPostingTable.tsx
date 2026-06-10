/**
 * BillPostingTable — SAP-style line items table.
 *
 * Columns: # · Description · Line Total · VAT Tax Code · WHT Tax Code
 *
 * Mirrors invoice-validator-fe's VirtualizedBillPostingTable:
 *  - VAT select: showSearch + allowClear + word-wrap optionRender
 *  - WHT select: grouped by SAP WHT_TAX_TYPE, same format as main app
 *    (type — desc / code · name), showSearch + allowClear + word-wrap
 *  - WHT disabled (borderless, no caret, empty) when vendor not subject to WHT
 *  - No fixed y-scroll cap — table expands with content
 */
import { Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import type { BillLineItem, LineItemEdit, VatCodeOption } from "./types";

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

function formatMoney(v: number, symbol: string): string {
  const n = (v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol} ${n}`;
}

// ── VAT tax codes ─────────────────────────────────────────────────────────────
// Fallback used when no country-specific codes are available for the currency.
export const VAT_OPTIONS_FALLBACK: VatCodeOption[] = [
  { value: "IO", label: "IO: INPUT-PURCHASES FROM NON-GST REGISTERED SUPPLIER 0%" },
  { value: "IB", label: "IB: INPUT TAX-LOCAL DELIVERIES OF GOODS&SERVICES 11%" },
  { value: "IE", label: "IE: INPUT TAX-ID NONCOLLECTED VAT 0%" },
];

// ── WHT tax codes ─────────────────────────────────────────────────────────────
// Grouped options mirroring the main app's WhtTaxCodeSelect:
//   Group label  = `${WHT_TAX_TYPE} — ${WHT_TAX_DESC}`
//   Option label = `${WHT_TAX_CODE} · ${WHT_NAME}`
// Philippine BIR Expanded Withholding Tax (EWT) codes, SAP type keys W1–W3.
export const WHT_OPTIONS: {
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    label: "W1 — TECHNICAL / MGMT / CONSULTING SERV.",
    options: [
      { value: "01", label: "01 · TECHNICAL/MGMT/CONSULTING SERV. 2%" },
      { value: "02", label: "02 · CONSULTING SERV. (OTHER) 4%" },
    ],
  },
  {
    label: "W2 — RENTALS",
    options: [
      { value: "03", label: "03 · RENTAL OF PROPERTY 5%" },
      { value: "04", label: "04 · RENTAL OF MOVABLE PROPERTY 10%" },
    ],
  },
  {
    label: "W3 — GOODS",
    options: [
      { value: "05", label: "05 · PURCHASE OF GOODS 1%" },
      { value: "06", label: "06 · PURCHASE OF MINERALS 3%" },
    ],
  },
  {
    label: "W0 — NO WITHHOLDING",
    options: [
      { value: "00", label: "00 · NO WITHHOLDING" },
    ],
  },
];

interface BillPostingTableProps {
  lineItems: BillLineItem[];
  lineEdits: Map<string, LineItemEdit>;
  isEditMode: boolean;
  /** When true the WHT Tax Code column is rendered; hidden otherwise. */
  isVendorSubjectToWht: boolean;
  /**
   * Set of erp_fields keys where mask=true (from workflow settings).
   * null/undefined = no filtering (show all).
   * vat_tax_code absent → hide VAT column.
   * wht_tax_code absent → hide WHT column (on top of isVendorSubjectToWht).
   */
  allowedErpFields?: Set<string> | null;
  currency: string;
  /** Country-specific VAT code options from the backend. Falls back to VAT_OPTIONS_FALLBACK. */
  vatOptions?: VatCodeOption[];
  onVatChange: (itemId: string, vatCode: string) => void;
  onWhtChange: (itemId: string, whtCode: string) => void;
  onRequestEditMode?: () => void;
}

interface Row {
  key: string;
  index: number;
  item: BillLineItem;
}

const caretIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 4L6 8L10 4" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Word-wrap renderer for long option labels (mirrors main app's optionRender).
const wrapRender = (option: { label?: React.ReactNode }) => (
  <span style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{option.label}</span>
);

export function BillPostingTable({
  lineItems,
  lineEdits,
  isEditMode,
  isVendorSubjectToWht,
  allowedErpFields,
  currency,
  vatOptions,
  onVatChange,
  onWhtChange,
}: BillPostingTableProps) {
  const activeVatOptions = vatOptions && vatOptions.length > 0 ? vatOptions : VAT_OPTIONS_FALLBACK;
  const symbol = getCurrencySymbol(currency);

  // Column visibility: workflow settings mask=false → hide column.
  // null allowedErpFields = no filtering (show all).
  const showVatColumn = !allowedErpFields || allowedErpFields.has("vat_tax_code");
  const showWhtColumn = isVendorSubjectToWht && (!allowedErpFields || allowedErpFields.has("wht_tax_code"));

  const rows: Row[] = useMemo(
    () => lineItems.map((item, idx) => ({ key: item.id, index: idx + 1, item })),
    [lineItems]
  );

  const columns: ColumnsType<Row> = useMemo(() => {
    const base: ColumnsType<Row> = [
      {
        title: "#",
        key: "index",
        dataIndex: "index",
        width: 56,
        onHeaderCell: () => ({ style: { background: "#f7f8f9", fontWeight: 500, color: "#6b7280", whiteSpace: "nowrap" as const } }),
        render: (i: number) => <span className="text-xs" style={{ color: "#1f2937" }}>{i}</span>,
      },
      {
        title: "Description",
        key: "description",
        width: 280,
        onHeaderCell: () => ({ style: { background: "#f7f8f9", fontWeight: 500, color: "#6b7280", whiteSpace: "nowrap" as const } }),
        render: (_, row) => (
          <span className="text-xs" style={{ color: "#1f2937" }}>
            {row.item.description || "—"}
          </span>
        ),
      },
      {
        title: <span className="whitespace-nowrap">Line Total</span>,
        key: "line_total",
        width: 140,
        onHeaderCell: () => ({ style: { background: "#f7f8f9", fontWeight: 500, color: "#6b7280", whiteSpace: "nowrap" as const } }),
        render: (_, row) => (
          <span className="text-xs tabular-nums" style={{ color: "#1f2937" }}>
            {formatMoney(row.item.total, symbol)}
          </span>
        ),
      },
    ];

    // VAT/GST Tax Code — omitted when admin has masked the vat_tax_code erp field.
    if (showVatColumn) {
      base.push({
        // mirrors VatTaxCodeSelect from the main app:
        // showSearch + allowClear (when editable), word-wrap popup options.
        title: <span className="whitespace-nowrap">VAT/GST Tax Code</span>,
        key: "vat_tax_code",
        width: 200,
        onHeaderCell: () => ({ style: { background: "#f7f8f9", fontWeight: 500, color: "#6b7280", whiteSpace: "nowrap" as const } }),
        onCell: () => ({ style: { backgroundColor: "#f7f8f9", padding: 0 } }),
        render: (_, row) => {
          const current = lineEdits.get(row.item.id)?.vat_tax_code ?? row.item.vat_tax_code ?? "IO";
          return (
            <Select
              value={current || undefined}
              onChange={(val) => onVatChange(row.item.id, val ?? "")}
              disabled={!isEditMode}
              variant={isEditMode ? "outlined" : "borderless"}
              className="w-full"
              size="small"
              suffixIcon={caretIcon}
              popupMatchSelectWidth={false}
              placeholder="Select VAT code"
              options={activeVatOptions}
              style={{ minWidth: 180 }}
              allowClear={isEditMode}
              showSearch={isEditMode}
              optionFilterProp="label"
              optionRender={wrapRender}
            />
          );
        },
      });
    }

    // WHT Tax Code — only rendered when the vendor is subject to WHT AND
    // the admin has not masked the wht_tax_code erp field.
    if (showWhtColumn) {
      base.push({
        title: <span className="whitespace-nowrap">WHT Tax Code</span>,
        key: "wht_tax_code",
        width: 200,
        onHeaderCell: () => ({ style: { background: "#f7f8f9", fontWeight: 500, color: "#6b7280", whiteSpace: "nowrap" as const } }),
        onCell: () => ({ style: { backgroundColor: "#f7f8f9", padding: 0 } }),
        render: (_, row) => {
          const current = lineEdits.get(row.item.id)?.wht_tax_code ?? row.item.wht_tax_code ?? "";
          return (
            <Select
              value={current || undefined}
              onChange={(val) => onWhtChange(row.item.id, val ?? "")}
              disabled={!isEditMode}
              variant={isEditMode ? "outlined" : "borderless"}
              className="w-full"
              size="small"
              suffixIcon={caretIcon}
              popupMatchSelectWidth={false}
              placeholder="— select tax type / code —"
              options={WHT_OPTIONS}
              style={{ minWidth: 180 }}
              allowClear={isEditMode}
              showSearch={isEditMode}
              optionFilterProp="label"
              optionRender={wrapRender}
            />
          );
        },
      });
    }

    return base;
  }, [symbol, lineEdits, isEditMode, showVatColumn, showWhtColumn, activeVatOptions, onVatChange, onWhtChange]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        No line items to post.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <style>{`
        .bill-posting-line-item-table .ant-table-thead > tr > th {
          white-space: nowrap !important;
          padding: 8px 12px !important;
          font-size: 12px;
        }
        .bill-posting-line-item-table .ant-table-tbody > tr > td {
          background: #ffffff;
          font-size: 12px;
          color: #1f2937;
        }
        .bill-posting-line-item-table .ant-table-tbody > tr:hover > td {
          background: #f9fafb;
        }
        .bill-posting-line-item-table .ant-select-selection-item {
          font-size: 12px;
          color: #1f2937;
        }
        .bill-posting-line-item-table .ant-select-selection-placeholder {
          font-size: 12px;
          color: #9ca3af;
        }
        .bill-posting-line-item-table .ant-select-disabled .ant-select-selection-item {
          color: #374151;
        }
      `}</style>
      <Table<Row>
        className="bill-posting-line-item-table"
        columns={columns}
        dataSource={rows}
        rowKey="key"
        pagination={false}
        scroll={{ x: "max-content" }}
        size="small"
        bordered
      />
    </div>
  );
}
