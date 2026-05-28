/**
 * ExtractionEditHistory — inline edit-history panel for the Extraction stage.
 *
 * Mirrors invoice-validator-fe's CsvEditHistory component. Replaces the
 * right-panel content when "View Edit History" is clicked on review.tsx.
 *
 * Data source: GET /api/v1/invoices/{id}/stages/extraction/edits
 *   → { items: EditHistoryItem[] }
 *   Each item: { timestamp, user_email, scope, field, row_id, old_value, new_value }
 */
import { Spin, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { stagesService } from "@/services";

interface EditHistoryItem {
  timestamp: string;
  user_email: string;
  scope: "metadata" | "line_item";
  field: string;
  row_id: string | null;
  old_value: string | null;
  new_value: string | null;
}

interface HistoryRow {
  key: string;
  time: string;
  scope: string;
  tabCategory: string;
  field: string;
  oldValue: string;
  newValue: string;
  editedBy: string;
}

interface ExtractionEditHistoryProps {
  invoiceId: string;
  /** Called when user clicks "Back to Extraction" */
  onBack: () => void;
}

function fieldLabel(f: string): string {
  return f.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    if (d.toDateString() === now.toDateString()) return `Today\n${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday\n${time}`;
    const dateStr = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    return `${dateStr}\n${time}`;
  } catch {
    return iso;
  }
}

type Tab = "all" | "metadata" | "line_items";

export function ExtractionEditHistory({ invoiceId, onBack }: ExtractionEditHistoryProps) {
  const [items, setItems] = useState<EditHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("all");

  useEffect(() => {
    if (!invoiceId) return;
    // loading is initialized to `true` — no need to set it again here.
    stagesService
      .extractionEdits<EditHistoryItem>(invoiceId)
      .then(res => setItems((res.items ?? []).slice().reverse()))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const rows = useMemo((): HistoryRow[] =>
    items.map((it, idx) => {
      const isLineItem = it.scope === "line_item";
      const linePrefix = isLineItem && it.row_id ? `Row ${it.row_id.slice(0, 6)}… · ` : "";
      return {
        key: String(idx),
        time: formatTime(it.timestamp),
        scope: isLineItem ? "Line Items" : "Metadata",
        tabCategory: isLineItem ? "line_items" : "metadata",
        field: `${linePrefix}${fieldLabel(it.field)}`,
        oldValue: it.old_value === null || it.old_value === "" ? "(Empty)" : it.old_value,
        newValue: it.new_value === null || it.new_value === "" ? "(Empty)" : it.new_value,
        editedBy: it.user_email || "—",
      };
    }),
  [items]);

  const filteredRows = useMemo(() =>
    activeTab === "all" ? rows : rows.filter(r => r.tabCategory === activeTab),
  [rows, activeTab]);

  const columns: ColumnsType<HistoryRow> = [
    {
      title: "Time",
      dataIndex: "time",
      key: "time",
      width: 120,
      fixed: "left" as const,
      render: (time: string) => {
        const [label, clock] = time.split("\n");
        return (
          <div className="leading-relaxed">
            <div className="text-gray-500 text-sm">{label}</div>
            <div className="text-gray-400 text-sm">{clock}</div>
          </div>
        );
      },
    },
    {
      title: "Section",
      dataIndex: "scope",
      key: "scope",
      width: 110,
      render: (scope: string) => (
        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${
            scope === "Metadata"
              ? "bg-purple-50 text-purple-700 border-purple-200"
              : "bg-pink-50 text-pink-700 border-pink-200"
          }`}
        >
          {scope}
        </span>
      ),
    },
    {
      title: "Field",
      dataIndex: "field",
      key: "field",
      width: 200,
      render: (field: string) => <span className="font-medium text-sm">{field}</span>,
    },
    {
      title: "Old Value",
      dataIndex: "oldValue",
      key: "oldValue",
      width: 190,
      render: (value: string) => (
        <span className="block w-full px-2 py-0.5 rounded bg-gray-100 text-sm break-all">
          {value === "(Empty)" ? (
            <span className="italic text-gray-400">(Empty)</span>
          ) : (
            <span className="text-gray-700">{value}</span>
          )}
        </span>
      ),
    },
    {
      title: "New Value",
      dataIndex: "newValue",
      key: "newValue",
      width: 190,
      render: (value: string) => (
        <span className="block w-full px-2 py-0.5 rounded bg-blue-100 text-sm break-all">
          {value === "(Empty)" ? (
            <span className="italic text-gray-400">(Empty)</span>
          ) : (
            <span className="text-blue-700 font-medium">{value}</span>
          )}
        </span>
      ),
    },
    {
      title: "Edited by",
      dataIndex: "editedBy",
      key: "editedBy",
      width: 80,
      render: (value: string) => {
        const initials = value
          .split(/[ @]/)
          .filter(Boolean)
          .map(w => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
        return (
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold">
            {initials || "?"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between border-b border-gray-200 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Edit History</h2>
          {!loading && (
            <p className="text-xs text-gray-500 mt-1">{filteredRows.length} change{filteredRows.length !== 1 ? "s" : ""} recorded</p>
          )}
        </div>
        <button
          onClick={onBack}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          Back to Extraction
        </button>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 pb-2 border-b border-gray-200 shrink-0">
        <div className="flex gap-6">
          {([
            { key: "all",        label: "All" },
            { key: "metadata",   label: "Metadata" },
            { key: "line_items", label: "Line Items" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spin />
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <Table
              columns={columns}
              dataSource={filteredRows}
              pagination={false}
              size="small"
              scroll={{ x: 800 }}
              className="[&_.ant-table-thead>tr>th]:bg-gray-50 [&_.ant-table-thead>tr>th]:font-normal [&_.ant-table-thead>tr>th]:text-gray-700 [&_.ant-table]:text-sm [&_.ant-table-cell]:border-r [&_.ant-table-cell]:border-r-gray-200 [&_.ant-table-cell:last-child]:border-r-0 [&_.ant-table-thead>tr>th]:border-r [&_.ant-table-thead>tr>th]:border-r-gray-200 [&_.ant-table-thead>tr>th:last-child]:border-r-0"
              locale={{ emptyText: "No edits recorded yet" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
