// 3-column (Field / Invoice / Contract) comparison table, styled to match
// components/matching/MetadataTab.tsx's antd Table exactly — same header bg,
// same mismatch row colors, same field-column shading, same Acknowledge
// button/Auto-approved badge placement INSIDE the Invoice cell (not a
// separate column) — adapted for DirectPay's invoice-vs-contract findings
// instead of invoice-vs-PO/GRN. A field the invoice has NO value for at all
// gets neither Acknowledge nor any action — there's nothing to acknowledge
// about a blank field, and no value is ever copied in from the contract onto
// the invoice — nothing back-populates the invoice's own extraction record.
// A real mismatch (invoice HAS a value, it just disagrees) still gets
// Acknowledge.
import { useMemo, useState } from "react";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DpFinding, DpInvoiceExtracted } from "@/services/directpay";
import { AiSparkleIcon, AI_VALUE_STYLE } from "@/components/directpay/AiContractBanner";

const tableClassName = "dp-matching-table";

/**
 * Explains a Contract-column value that didn't actually come from the
 * contract — a utility the contract only says is "billed as per actuals",
 * whose real amount was taken from the invoice's supporting document.
 *
 * The same inline-AI-derived-value treatment P2P uses for an AI-filled
 * metadata field (see NeoAiSuggestionBanner.tsx's AiAnalysisInfo and
 * pages/invoice/[id]/review.tsx's use of it): sparkle + italic #1F5BD5 value
 * + this hover ⓘ, same icon geometry and white card chrome, positioned
 * fixed/viewport-clamped so it's never clipped by the table's overflow
 * container.
 */
function SupportingDocumentInfo() {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const CARD_W = 300;
  // Only used to DECIDE whether to flip, never to position — a flipped card
  // is anchored by `bottom` (see below), so an imprecise estimate here can't
  // misalign it. Comfortably above the card's real rendered height (~170px).
  const CARD_H_ESTIMATE = 220;
  const show = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const left = Math.max(12, Math.min(r.right - CARD_W, window.innerWidth - CARD_W - 12));
    // Opens below by default, but flips above when the row is near the bottom
    // of the viewport — otherwise the card runs off the bottom edge and gets
    // cut off. Anchoring the flipped case by `bottom` rather than a computed
    // `top` keeps it exactly 8px above the icon whatever the card's height.
    if (window.innerHeight - r.bottom < CARD_H_ESTIMATE) {
      setPos({ left, bottom: window.innerHeight - r.top + 8 });
    } else {
      setPos({ left, top: r.bottom + 8 });
    }
  };

  return (
    <span
      className="inline-flex items-center shrink-0"
      style={{ position: "relative" }}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        aria-label="Why this value came from the supporting document"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, borderRadius: "50%", cursor: "default",
          color: pos ? "#1F5BD5" : "#8FADEA",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7 6.3v3.4M7 4.2h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>

      {pos && (
        <div
          style={{
            position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left,
            width: CARD_W, zIndex: 1000,
            background: "#ffffff", border: "1px solid #DFE5EE", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(16,24,40,0.12)", padding: "12px 14px",
            textAlign: "left", cursor: "default", fontFamily: "Inter, sans-serif",
          }}
        >
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
            <span className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: "#0D388D" }}>
              <AiSparkleIcon size={14} />
              Neo AI analysis
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: "#1F5BD5",
              background: "#EDF3FF", border: "1px solid #CFE2FF",
              borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap",
            }}>
              Supporting document
            </span>
          </div>

          <div style={{ fontSize: 11.5, color: "#585C65", lineHeight: "15px", marginBottom: 4 }}>
            Sourced from the invoice&apos;s <strong style={{ color: "#414651" }}>supporting document</strong>,
            not the contract.
          </div>

          <div style={{ fontSize: 11, color: "#8D92A6", lineHeight: "15px" }}>
            The contract sets the billing rule for this utility — charged on actual consumption
            (&ldquo;as per actuals&rdquo;) — so it states no fixed amount. Neo AI took the actual amount from
            the supporting document to compare the invoice against.
          </div>
        </div>
      )}
    </span>
  );
}

// Short field-column labels — mirrors the plain "display_name" MetadataTab
// shows for P2P (no long sentence, no description line). Keyed by the same
// DpInvoiceExtracted field the finding compares; falls back to a generic
// title-cased version of the key for any field without an explicit label.
const FIELD_LABELS: Record<string, string> = {
  vendor_name: "Vendor Name",
  vendor_vat_id: "Vendor VAT ID",
  customer_legal_entity: "Customer Legal Entity",
  customer_vat_id: "Customer VAT ID",
  vendor_address: "Store Location",
  vendor_bank_account_name: "Vendor Bank Account Name",
  vendor_bank_account_number: "Vendor Bank Account Number",
  billing_period_start: "Billing / Service Period Start",
  billing_period_end: "Billing / Service Period End",
  payment_terms: "Payment Terms",
  due_date: "Due Date",
  // Business-checklist labels — see field_mapping.CORE_CROSS_VALIDATION_FIELDS.
  total_amount_before_vat: "Total Amount Before VAT",
  tax_type: "Tax Type",
  tax_rate: "Tax Rate",
  vat_gst: "Tax Amount",
  wht_rate: "WHT Rate",
  wht: "WHT (Withholding Tax)",
  total_amount: "Total Amount After VAT",
  net_amount_after_wht: "Net Amount After WHT (Total Amount Payable)",
  invoice_number: "Invoice Number",
  invoice_date: "Invoice Date",
  currency: "Currency",
};

// This money field has no Acknowledge shortcut at all, by explicit
// instruction — a mismatch (or a null invoice value, e.g. RATNA_INTAN's
// missing VAT line) permanently blocks Approve until the underlying value
// is actually correct. Distinct from mandatory (field_mapping.py) — this
// controls the ACK button specifically, not blocking on its own. (Tax
// Amount and Total Amount After VAT were also here in earlier rounds; both
// were removed from the Matching checklist entirely.)
const NO_ACK_FIELDS = new Set(["total_amount_before_vat"]);

function fieldLabel(f: DpFinding): string {
  if (f.field && FIELD_LABELS[f.field]) return FIELD_LABELS[f.field];
  if (f.field) return f.field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return f.title;
}

/** A finding is "resolved" once its mapped invoice field already equals the
 * contract's expected value — e.g. after a manual edit on the Extraction
 * screen. A finding with no expected_value at all (a core cross-validation
 * field with no literal contract-side figure to compare against, e.g. Tax
 * Amount) can never become "equal" to anything, so it's never auto-resolved —
 * a mandatory field with nothing to automatically verify still needs an
 * explicit human Acknowledge. Exported so pages can derive the same
 * blocking-count logic the table itself uses. */
export function isFindingResolved(f: DpFinding, extracted: DpInvoiceExtracted): boolean {
  if (!f.field) return false;
  if (f.expected_value === undefined || f.expected_value === null) return false;
  const current = (extracted as Record<string, unknown>)[f.field];
  if (current !== undefined && current !== null && String(current) === String(f.expected_value)) return true;
  // Some core amount fields fall back, display-only, to the matched
  // installment's own figure when the raw invoice leaves them blank (see
  // service.py's _apply_mandatory_field_coverage) — never written back onto
  // the invoice's own extraction record. When that fallback numerically
  // equals the contract's own figure, the two formatted display strings come
  // out identical too — treat that the same as a real extracted-data match.
  return f.found != null && f.found === f.expected;
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
        width: 260,
        onHeaderCell: () => ({ style: { background: "#F4F4F4", borderRight: "1px solid #E5E7EB" } }),
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
        width: 280,
        render: (_, f) => {
          const acked = isAcked(f);
          const systemAcked = isSystemAcked(f);
          const resolved = isResolved(f);
          const hasInvoiceValue = f.found !== undefined && f.found !== null && f.found !== "";
          // Only offer Acknowledge where the contract actually has a value to
          // compare against — a field with nothing on the contract side
          // (expected_value null, e.g. no bank details in the source) has
          // nothing to acknowledge, just an informational row. And only for
          // a REAL mismatch (invoice has its own value, it just disagrees) —
          // a blank invoice value gets no action at all (no value is ever
          // copied onto the invoice from the contract).
          const canAck = !resolved && !systemAcked && f.expected_value != null && hasInvoiceValue && !(f.field && NO_ACK_FIELDS.has(f.field));
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
        width: 220,
        render: (_, f) => {
          // The contract only states the billing RULE for a utility billed
          // on actuals ("as per actuals") — never a fixed amount — so this
          // row's value comes from the invoice's supporting document instead.
          // Surfaced explicitly rather than left implicit, since the column
          // header still (correctly) reads "Contract".
          const fromSupportingDoc = f.expected_source === "supporting_document";
          // Same inline treatment P2P gives an AI-derived value (sparkle +
          // italic blue value + hover ⓘ) — see review.tsx's isAiFilled rows.
          // One deliberate deviation: P2P pushes its ⓘ to the cell's right
          // edge with marginLeft:auto; here it sits directly after the value,
          // because at the far right it collided with the floating Neo widget
          // on the lower rows and couldn't be hovered at all.
          return (
            <div className="flex items-start gap-1.5" style={{ width: "100%" }}>
              {fromSupportingDoc && <span style={{ marginTop: 3 }}><AiSparkleIcon size={14} /></span>}
              <span
                style={{
                  minWidth: 0, fontSize: 14, wordBreak: "break-word",
                  color: fromSupportingDoc ? AI_VALUE_STYLE.color : f.expected ? "#414651" : "#9CA3AF",
                  fontStyle: fromSupportingDoc ? AI_VALUE_STYLE.fontStyle : undefined,
                }}
              >
                {f.expected ?? ""}
              </span>
              {fromSupportingDoc && f.expected != null && <SupportingDocumentInfo />}
            </div>
          );
        },
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
        tableLayout="fixed"
        locale={{ emptyText: "No discrepancies found — invoice and contract fully match." }}
      />
    </>
  );
}
