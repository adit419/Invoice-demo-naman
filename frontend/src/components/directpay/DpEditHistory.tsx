/**
 * DpEditHistory — DirectPay's Edit History panel, mirroring
 * components/ExtractionEditHistory.tsx's exact layout/columns (P2P's
 * Extraction-stage edit-history view). Generalized (not just invoice
 * Extraction) so Contract Extraction and Contract Extraction Postprocessing
 * render the identical panel against their own edit-history endpoint and
 * scope vocabulary — the caller supplies which fetch call and which scopes
 * exist (flat "metadata" only for Contract Extraction; "installment"/
 * "one_time_payment" for Postprocessing; "metadata"/"line_item" for
 * invoices), everything else (columns, time formatting, (Empty) styling)
 * stays identical across all three.
 *
 * Data source: caller-provided fetchHistory() → { items: DpEditHistoryItem[] }
 * Each item: { timestamp, user_email, scope, field, row_id, old_value, new_value }
 * Backend already returns newest-first — no client-side reversal needed.
 */
import { Spin, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { DpEditHistoryItem } from "@/services/directpay";

interface HistoryRow {
  key: string;
  time: string;
  scopeLabel: string;
  scopeKey: string;
  field: string;
  oldValue: string;
  newValue: string;
  editedBy: string;
}

export interface DpEditHistoryScopeTab {
  /** Raw `scope` value the backend returns for this row type. */
  key: string;
  /** Displayed both as the tab label and the row's Section badge text. */
  label: string;
}

const DEFAULT_SCOPE_TABS: DpEditHistoryScopeTab[] = [
  { key: "metadata", label: "Metadata" },
  { key: "line_item", label: "Line Items" },
];

interface DpEditHistoryProps {
  fetchHistory: () => Promise<{ items: DpEditHistoryItem[] }>;
  /** Called when the user clicks the back button. */
  onBack: () => void;
  /** Defaults to "Back to Extraction" (the invoice page's original copy). */
  backLabel?: string;
  /** Which scopes exist for this caller and what to label them — see module doc. */
  scopeTabs?: DpEditHistoryScopeTab[];
}

function fieldLabel(f: string): string {
  return f.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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

export function DpEditHistory({ fetchHistory, onBack, backLabel = "Back to Extraction", scopeTabs = DEFAULT_SCOPE_TABS }: DpEditHistoryProps) {
  const [items, setItems] = useState<DpEditHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    fetchHistory()
      .then((res) => setItems(res.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    // scopeTabs/backLabel are stable per call site — only the fetch itself
    // should re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchHistory]);

  const scopeLabelFor = (scope: string) => scopeTabs.find((t) => t.key === scope)?.label ?? fieldLabel(scope);
  // First configured scope is treated as the "primary" one (metadata, for
  // every current caller) and gets the purple badge; anything else (a
  // row-scoped edit — line item, installment, one-time payment) gets pink.
  const primaryScopeKey = scopeTabs[0]?.key;

  const rows = useMemo(
    (): HistoryRow[] =>
      items.map((it, idx) => {
        const isRowScoped = it.scope !== primaryScopeKey;
        const rowPrefix = isRowScoped && it.row_id != null ? `Row ${Number(it.row_id) + 1} · ` : "";
        return {
          key: String(idx),
          time: formatTime(it.timestamp),
          scopeLabel: scopeLabelFor(it.scope),
          scopeKey: it.scope,
          field: `${rowPrefix}${fieldLabel(it.field)}`,
          oldValue: it.old_value === null || it.old_value === "" ? "(Empty)" : it.old_value,
          newValue: it.new_value === null || it.new_value === "" ? "(Empty)" : it.new_value,
          editedBy: it.user_email || "NA",
        };
      }),
    // scopeLabelFor/primaryScopeKey are derived from the scopeTabs prop —
    // stable per call site, not worth re-deriving as a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  );

  const filteredRows = useMemo(
    () => (activeTab === "all" ? rows : rows.filter((r) => r.scopeKey === activeTab)),
    [rows, activeTab]
  );

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
      dataIndex: "scopeLabel",
      key: "scopeLabel",
      width: 130,
      render: (scopeLabel: string, record: HistoryRow) => (
        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${
            record.scopeKey === primaryScopeKey
              ? "bg-purple-50 text-purple-700 border-purple-200"
              : "bg-pink-50 text-pink-700 border-pink-200"
          }`}
        >
          {scopeLabel}
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
          {value === "(Empty)" ? <span className="italic text-gray-400">(Empty)</span> : <span className="text-gray-700">{value}</span>}
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
          .map((w) => w[0])
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
      <div className="px-5 py-4 flex items-start justify-between border-b border-gray-200 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Edit History</h2>
          {!loading && <p className="text-xs text-gray-500 mt-1">{filteredRows.length} change{filteredRows.length !== 1 ? "s" : ""} recorded</p>}
        </div>
        <button
          onClick={onBack}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          {backLabel}
        </button>
      </div>

      <div className="px-5 pt-3 pb-2 border-b border-gray-200 shrink-0">
        <div className="flex gap-6">
          {([{ key: "all", label: "All" }, ...scopeTabs] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key ? "text-blue-600 border-blue-600" : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

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
