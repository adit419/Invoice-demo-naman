// 3-column (Field / Invoice / Contract) comparison table, styled to match
// components/matching/MetadataTab.tsx's antd Table exactly — same header bg,
// same mismatch row colors, same field-column shading, same Acknowledge
// button/Auto-approved badge placement INSIDE the Invoice cell (not a
// separate column) — adapted for DirectPay's invoice-vs-contract findings
// instead of invoice-vs-PO/GRN. No copy-value affordance: P2P's own
// MetadataTab has none either — a mismatch is either fixed (by editing on
// the Extraction screen) or acknowledged, never "copied" in place here.
import { useMemo } from "react";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DpFinding, DpInvoiceExtracted } from "@/services/directpay";

const tableClassName = "dp-matching-table";

// Short field-column labels — mirrors the plain "display_name" MetadataTab
// shows for P2P (no long sentence, no description line). Keyed by the same
// DpInvoiceExtracted field the finding compares; falls back to a generic
// title-cased version of the key for any field without an explicit label.
const FIELD_LABELS: Record<string, string> = {
  vendor_name: "Vendor Name",
  billing_period_start: "Billing Period Start",
  billing_period_end: "Billing Period End",
  subtotal: "Subtotal",
  gst_total: "Tax Total",
  gst_rate: "GST Rate",
  grand_total: "Grand Total",
  invoice_number: "Invoice Number",
  invoice_date: "Invoice Date",
  customer_name: "Customer Name",
  currency: "Currency",
};

function fieldLabel(f: DpFinding): string {
  if (f.field && FIELD_LABELS[f.field]) return FIELD_LABELS[f.field];
  if (f.field) return f.field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return f.title;
}

/** A finding is "resolved" once its mapped invoice field already equals the
 * contract's expected value — e.g. after a manual edit on the Extraction
 * screen. Exported so pages can derive the same blocking-count logic the
 * table itself uses. */
export function isFindingResolved(f: DpFinding, extracted: DpInvoiceExtracted): boolean {
  if (!f.field || f.expected_value === undefined || f.expected_value === null) return false;
  const current = (extracted as Record<string, unknown>)[f.field];
  if (current === undefined || current === null) return false;
  return String(current) === String(f.expected_value);
}

interface MatchingTableProps {
  findings: DpFinding[];
  acknowledgedFindings: string[];
  /** Findings the DirectPay Acknowledge Threshold's learned memory has
   * pre-blessed — rendered as the purple "Auto-approved" badge, distinct
   * from a human's own green-check acknowledgement. */
  systemAcknowledgedFindings: string[];
  /** Live invoice field values — a finding is "resolved" whenever its mapped
   * field already equals the contract's expected value (e.g. after a manual
   * edit on the Extraction screen). Deriving this from real data instead of
   * session-local state means the resolved state survives a page reload. */
  extracted: DpInvoiceExtracted;
  readonly?: boolean;
  onToggleAcknowledge: (findingId: string, acknowledged: boolean) => void;
}

export function MatchingTable({
  findings,
  acknowledgedFindings,
  systemAcknowledgedFindings,
  extracted,
  readonly,
  onToggleAcknowledge,
}: MatchingTableProps) {
  const isResolved = (f: DpFinding): boolean => isFindingResolved(f, extracted);
  const isSystemAcked = (f: DpFinding): boolean => systemAcknowledgedFindings.includes(f.finding_id);
  const isAcked = (f: DpFinding): boolean => acknowledgedFindings.includes(f.finding_id);
  // Acknowledged is a fully handled state, same as P2P's MetadataTab
  // (effectiveStatus "acknowledged" renders identically to "match" — a
  // handled mismatch is not still red/amber, it's just done).
  const isHandled = (f: DpFinding): boolean => isResolved(f) || isSystemAcked(f) || isAcked(f);

  const getRowClassName = (f: DpFinding): string => {
    if (isHandled(f)) return "dp-row-match";
    if (f.severity === "error") return "dp-row-mandatory-mismatch";
    if (f.severity === "warning") return "dp-row-optional-mismatch";
    return "dp-row-match";
  };

  const columns: ColumnsType<DpFinding> = useMemo(
    () => [
      {
        title: "Field",
        key: "field",
        onHeaderCell: () => ({ style: { background: "#F4F4F4", borderRight: "1px solid #E5E7EB", minWidth: 260 } }),
        onCell: (record) => ({
          style: {
            background: "#F4F4F4",
            boxShadow: isHandled(record)
              ? undefined
              : record.severity === "error"
              ? "inset 2px 0 0 #C10008"
              : record.severity === "warning"
              ? "inset 2px 0 0 #D97706"
              : undefined,
            borderRight: "1px solid #E5E7EB",
            minWidth: 260,
          },
        }),
        render: (_, f) => (
          <div className="flex items-center" style={{ width: "100%" }}>
            <span style={{ color: "#101828", fontSize: 14, fontWeight: 500, lineHeight: "22px", letterSpacing: "-0.15px", fontFamily: "Inter, sans-serif" }}>
              {fieldLabel(f)}
            </span>
            {f.severity === "error" && <span className="text-red-500 text-sm leading-none ml-0.5">*</span>}
          </div>
        ),
      },
      {
        title: "Invoice",
        key: "invoice",
        onHeaderCell: () => ({ style: { minWidth: 280 } }),
        onCell: () => ({ style: { minWidth: 280 } }),
        render: (_, f) => {
          const acked = isAcked(f);
          const systemAcked = isSystemAcked(f);
          const resolved = isResolved(f);
          const canAck = !resolved && !systemAcked;
          const value = resolved ? f.expected ?? f.found : f.found;

          return (
            <div className="flex items-center gap-2" style={{ width: "100%" }}>
              <span style={{ flex: 1, color: value ? "#414651" : "#9CA3AF", fontSize: 14, wordBreak: "break-word" }}>
                {value ?? ""}
              </span>
              {systemAcked ? (
                <span
                  title="Auto-approved — the DirectPay Acknowledge Threshold has learned this exact mismatch from prior manual acknowledgements"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, whiteSpace: "nowrap",
                    padding: "2px 10px", borderRadius: 9999,
                    border: "1px solid #A5B4FC", background: "#EEF2FF", color: "#6366F1",
                    fontSize: 13, fontWeight: 500, cursor: "default",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#6366F1" style={{ flexShrink: 0 }}>
                    <path d="M9 2C9 2 9.5 6.5 11 8C12.5 9.5 17 10 17 10C17 10 12.5 10.5 11 12C9.5 13.5 9 18 9 18C9 18 8.5 13.5 7 12C5.5 10.5 1 10 1 10C1 10 5.5 9.5 7 8C8.5 6.5 9 2 9 2Z" />
                  </svg>
                  Auto-approved
                </span>
              ) : canAck && acked ? (
                // Same badge whether editable or read-only — only its
                // click-ability changes, same as P2P's own acknowledged
                // check icon (a handled mismatch never looks "still open").
                <button
                  type="button"
                  onClick={!readonly ? () => onToggleAcknowledge(f.finding_id, false) : undefined}
                  title={!readonly ? "Acknowledged — click to revert" : "Acknowledged"}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    background: "#D6F4DE", border: "1px solid #A8E7B9",
                    cursor: !readonly ? "pointer" : "default", padding: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.3 4.9 8.7 9.5 3.6" stroke="#2A9F47" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : canAck && !readonly ? (
                <button
                  type="button"
                  onClick={() => onToggleAcknowledge(f.finding_id, true)}
                  title="Acknowledge this mismatch"
                  style={{
                    flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap",
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.4px",
                    color: "#4C525E", background: "#ffffff",
                    border: "1px solid #D5D5D5", borderRadius: 4,
                    padding: "2px 7px", lineHeight: "14px", fontFamily: "Inter, sans-serif",
                  }}
                >
                  ACK
                </button>
              ) : null}
            </div>
          );
        },
      },
      {
        title: "Contract",
        key: "contract",
        onHeaderCell: () => ({ style: { minWidth: 220 } }),
        onCell: () => ({ style: { minWidth: 220 } }),
        render: (_, f) => (
          <span style={{ color: f.expected ? "#414651" : "#9CA3AF", fontSize: 14, wordBreak: "break-word" }}>
            {f.expected ?? ""}
          </span>
        ),
      },
    ],
    [acknowledgedFindings, systemAcknowledgedFindings, extracted, readonly, onToggleAcknowledge]
  );

  const tableStyles = `
    .${tableClassName} .ant-table-bordered .ant-table-container,
    .${tableClassName} .ant-table-bordered .ant-table-container table,
    .${tableClassName} .ant-table-bordered .ant-table-container table > thead > tr > th,
    .${tableClassName} .ant-table-bordered .ant-table-container table > tbody > tr > td {
      border-color: #E5E7EB !important;
    }
    .${tableClassName} .ant-table-thead > tr > th {
      background: #F4F4F4 !important;
      color: #414651 !important;
      font-family: Inter, sans-serif !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      line-height: 22px !important;
      letter-spacing: -0.439px !important;
    }
    .${tableClassName} .dp-row-match { background-color: #ffffff; }
    .${tableClassName} .dp-row-match:hover > td { background-color: #f8fafc !important; }
    .${tableClassName} .dp-row-match > td:first-child,
    .${tableClassName} .dp-row-match:hover > td:first-child { background-color: #F4F4F4 !important; border-right: 1px solid #E5E7EB !important; }
    .${tableClassName} .dp-row-mandatory-mismatch { background-color: #FFF0F0; }
    .${tableClassName} .dp-row-mandatory-mismatch:hover > td { background-color: #fee2e2 !important; }
    .${tableClassName} .dp-row-mandatory-mismatch > td:first-child,
    .${tableClassName} .dp-row-mandatory-mismatch:hover > td:first-child { background-color: #F4F4F4 !important; border-right: 1px solid #E5E7EB !important; }
    .${tableClassName} .dp-row-optional-mismatch { background-color: #FFFBEB; }
    .${tableClassName} .dp-row-optional-mismatch:hover > td { background-color: #FEF3C7 !important; }
    .${tableClassName} .dp-row-optional-mismatch > td:first-child,
    .${tableClassName} .dp-row-optional-mismatch:hover > td:first-child { background-color: #F4F4F4 !important; border-right: 1px solid #E5E7EB !important; }
    .${tableClassName} .ant-table-tbody > tr > td { word-break: break-word; white-space: normal !important; }
    .${tableClassName} .ant-table-container { border-radius: 8px !important; }
    .${tableClassName} .ant-table-container table { border-radius: 8px !important; overflow: hidden; }
  `;

  return (
    <>
      <style>{tableStyles}</style>
      <Table<DpFinding>
        className={tableClassName}
        columns={columns}
        dataSource={findings}
        rowKey="finding_id"
        pagination={false}
        rowClassName={(record) => getRowClassName(record)}
        bordered
        size="middle"
        locale={{ emptyText: "No discrepancies found — invoice and contract fully match." }}
      />
    </>
  );
}
