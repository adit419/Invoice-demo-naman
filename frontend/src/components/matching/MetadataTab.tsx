// ── Metadata tab ──────────────────────────────────────────────────────────────
//
// Invoice-vs-PO metadata comparison table with inline edit + acknowledge.
// Extracted verbatim from the former monolithic matching.tsx.
import { useMemo } from "react";
import { CheckCircleOutlined } from "@ant-design/icons";
import { Button as AntButton, Table, Input as AntInput } from "antd";
import type { ColumnsType } from "antd/es/table";
import { formatValue } from "@/utils/format";
import type {
  EffectiveStatus,
  MetadataValidationData,
  ValidationField,
} from "./types";

// Fields that show as informational only — no asterisk, no validation, no
// red bar, no acknowledge button. Mirrors invoice-validator-fe.
const VALIDATION_EXEMPT_FIELDS = new Set(["po_number", "po_numbers"]);

export function MetadataTab({
  data, hasGrn, canEdit, isCompleted,
  acknowledgedFields, onAcknowledge, onUnacknowledge, allowedFields, confThreshold,
  editMode, localEdits, setLocalEdits, onSaveField,
}: {
  data: MetadataValidationData | null;
  hasGrn: boolean;
  canEdit: boolean;
  isCompleted: boolean;
  /** Client-side set of field keys the user has acknowledged this session. */
  acknowledgedFields: Set<string>;
  /** Called when user clicks "Acknowledge" on a mismatch field. */
  onAcknowledge: (fieldName: string) => void;
  /** Called when user clicks "revert" on an acknowledged field. */
  onUnacknowledge: (fieldName: string) => void;
  /** Set of field_name keys allowed by workflow settings. null → show all. */
  allowedFields: Set<string> | null;
  /** field key → min-confidence threshold (0–1) from Tolerance (%). */
  confThreshold: Record<string, number>;
  /** Whether the Metadata tab is currently in inline edit-mode. */
  editMode: boolean;
  /** field_name → pending value the user has typed (only while editMode). */
  localEdits: Record<string, string>;
  setLocalEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /**
   * Called when the user presses Enter on an inline edit input.
   * The parent page (matching.tsx) persists the edit immediately.
   */
  onSaveField?: (fieldName: string, value: string) => void;
}) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "#6B7280" }}>
        Metadata validation data not available.
      </div>
    );
  }

  // Only render fields that exist in workflow settings (admin-configured).
  // Exempt fields (po_number, po_numbers) are always shown as informational
  // context regardless of the allowedFields mask — they are not configurable.
  const visibleFields = allowedFields
    ? data.fields.filter(
        f => allowedFields.has(f.field_name) || VALIDATION_EXEMPT_FIELDS.has(f.field_name)
      )
    : data.fields;

  // Effective match status per field, taking acknowledgments into account.
  // A field "blocks" approval if it's required AND mismatched AND not handled.
  // Checks both server-persisted (f.is_acknowledged) and optimistic local state.
  const effectiveStatus = (f: ValidationField): "match" | "mismatch" | "acknowledged" | "exempt" => {
    if (VALIDATION_EXEMPT_FIELDS.has(f.field_name)) return "exempt";
    if (f.is_acknowledged || acknowledgedFields.has(f.field_name)) return "acknowledged";
    return f.match_status;
  };

  const blockingMismatchCount = visibleFields.filter(
    f => f.required && effectiveStatus(f) === "mismatch"
  ).length;

  // Auto-approved = either (a) the backend marked acknowledged_by === 'system',
  // or (b) the backend says match but the raw values aren't strictly identical
  // (fuzzy match: case / trailing punctuation). Renders the purple sparkle badge.
  const isAutoApprovedMatch = (f: ValidationField): boolean => {
    if (VALIDATION_EXEMPT_FIELDS.has(f.field_name)) return false;
    // Server explicitly marked this as a system acknowledgement
    if (f.is_acknowledged && f.acknowledged_by === "system") return true;
    if (f.match_status !== "match") return false;
    const inv = String(f.values.invoice?.[0]?.value ?? "").trim();
    const po = String(f.values.po?.[0]?.value ?? "").trim();
    if (!inv || !po || inv === po) return false;
    const normalize = (s: string) => s.toLowerCase().replace(/[.,;:\s]+$/g, "").replace(/\s+/g, " ");
    return normalize(inv) === normalize(po);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6">

        {/* ── Status banner ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px", borderRadius: 8, marginBottom: 16,
            background: blockingMismatchCount === 0 ? "#F0FDF4" : "#FEF2F2",
            border: `1px dashed ${blockingMismatchCount === 0 ? "#86EFAC" : "#FCA5A5"}`,
            color: blockingMismatchCount === 0 ? "#15803D" : "#B91C1C",
            fontSize: 14,
          }}
        >
          {blockingMismatchCount === 0 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 7v6M12 16v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
          <span>
            {blockingMismatchCount === 0 ? (
              <><strong>All mandatory fields are complete.</strong> You&apos;re good to go!</>
            ) : (
              <>
                <strong>
                  {blockingMismatchCount} mandatory field{blockingMismatchCount === 1 ? "" : "s"} need
                  {blockingMismatchCount === 1 ? "s" : ""} attention.
                </strong>{" "}
                Fix the value or acknowledge each mismatch before proceeding.
              </>
            )}
          </span>
        </div>

        {/* ── Comparison table (MatchingValidationTable-style, antd) ─────── */}
        <MetadataAntdTable
          fields={visibleFields}
          hasGrn={hasGrn}
          canEdit={canEdit}
          isCompleted={isCompleted}
          editMode={editMode}
          localEdits={localEdits}
          setLocalEdits={setLocalEdits}
          onSaveField={onSaveField}
          acknowledgedFields={acknowledgedFields}
          onAcknowledge={onAcknowledge}
          onUnacknowledge={onUnacknowledge}
          confThreshold={confThreshold}
          effectiveStatus={effectiveStatus}
          isAutoApprovedMatch={isAutoApprovedMatch}
        />
      </div>
    </div>
  );
}

// ── MatchingValidationTable-style antd Table (Metadata tab) ──────────────────

function MetadataAntdTable({
  fields,
  hasGrn,
  canEdit,
  isCompleted,
  editMode,
  localEdits,
  setLocalEdits,
  onSaveField,
  acknowledgedFields,
  onAcknowledge,
  onUnacknowledge,
  confThreshold,
  effectiveStatus,
  isAutoApprovedMatch,
}: {
  fields: ValidationField[];
  hasGrn: boolean;
  canEdit: boolean;
  isCompleted: boolean;
  editMode: boolean;
  localEdits: Record<string, string>;
  setLocalEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSaveField?: (fieldName: string, value: string) => void;
  acknowledgedFields: Set<string>;
  onAcknowledge: (fieldName: string) => void;
  onUnacknowledge: (fieldName: string) => void;
  confThreshold: Record<string, number>;
  effectiveStatus: (f: ValidationField) => EffectiveStatus;
  isAutoApprovedMatch: (f: ValidationField) => boolean;
}) {
  const tableClassName = "matching-validation-table";
  const rowClassPrefix = "metadata";

  // A field's invoice value comes from extraction — when its extraction
  // confidence is below the configured Tolerance (%) threshold, flag the row
  // red (value cells only; the field-name cell keeps its grey background via
  // the `> td:first-child` rule, same as a mismatch row).
  const isLowConfidence = (field: ValidationField): boolean => {
    const t = confThreshold[field.field_name];
    if (t == null || t <= 0) return false;
    const conf = field.value_confidence;
    return typeof conf === "number" && conf > 0 && conf < t;
  };

  // Returns true when the user has typed a value that (when normalized) matches
  // the PO value — used both for row class and the left-bar shadow so the row
  // immediately looks "resolved" without waiting for a server re-evaluation.
  const isEditedMatch = (field: ValidationField): boolean => {
    if (!editMode) return false;
    const edited = localEdits[field.field_name];
    if (edited === undefined) return false;
    const po = String(field.values.po?.[0]?.value ?? "").trim();
    if (!edited.trim() || !po) return false;
    const norm = (s: string) =>
      s.toLowerCase().replace(/[.,;:\s]+$/g, "").replace(/\s+/g, " ").trim();
    return norm(edited) === norm(po);
  };

  const getRowClassName = (field: ValidationField): string => {
    const status = effectiveStatus(field);
    if (isLowConfidence(field)) return `${rowClassPrefix}-row-mandatory-mismatch`;
    if (status === "exempt") return `${rowClassPrefix}-row-exempt`;
    if (status === "match" || status === "acknowledged") return `${rowClassPrefix}-row-match`;
    // If the user's inline edit now matches the PO value, treat the row as
    // matched immediately (client-side) without waiting for server re-evaluation.
    if (isEditedMatch(field)) return `${rowClassPrefix}-row-match`;
    return field.required
      ? `${rowClassPrefix}-row-mandatory-mismatch`
      : `${rowClassPrefix}-row-optional-mismatch`;
  };

  const renderFieldCell = (field: ValidationField) => {
    const isExempt = VALIDATION_EXEMPT_FIELDS.has(field.field_name);
    const isMandatory = field.required && !isExempt;
    return (
      <div className="flex items-center" style={{ width: "100%" }}>
        <span style={{ color: "#101828", fontSize: 14, fontWeight: 500, lineHeight: "22px", letterSpacing: "-0.15px", fontFamily: "Inter, sans-serif" }}>
          {field.display_name}
        </span>
        {isMandatory && <span className="text-red-500 text-sm leading-none ml-0.5">*</span>}
        {isExempt && (
          <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full ml-2">Info Only</span>
        )}
      </div>
    );
  };

  const renderInvoiceCell = (field: ValidationField) => {
    const fieldName = field.field_name;
    const isExempt = VALIDATION_EXEMPT_FIELDS.has(fieldName);
    const isAcknowledged = acknowledgedFields.has(fieldName);
    const isAutoApproved = isAutoApprovedMatch(field);

    const rawInvoiceVal = formatValue(field.values.invoice?.[0]?.value, field.type);
    const poVal = formatValue(field.values.po?.[0]?.value, field.type);
    // After acknowledging a field whose invoice had no value, show the PO value
    // in the Invoice column so reviewers can see what was accepted rather than
    // staring at a blank cell. Mirrors the intent of "I accept the PO value".
    const isEffectivelyAcknowledged = acknowledgedFields.has(fieldName) || (field.is_acknowledged ?? false);
    const invoiceVal = (isEffectivelyAcknowledged && rawInvoiceVal === "-" && poVal !== "-")
      ? poVal
      : rawInvoiceVal;

    const status = effectiveStatus(field);
    const isUnhandledMismatch = status === "mismatch";
    // Required fields are never editable — if they mismatch the user must
    // acknowledge or fix them, not type over them. This mirrors invoice-validator-fe
    // where isEditable = !field.required.
    const showAcknowledge = field.required && !isExempt && isUnhandledMismatch && canEdit && !isCompleted;

    // Three states for required mismatch fields:
    //   1. acknowledged_by === 'system'  → purple "Auto-approved" badge (no revert)
    //   2. isAcknowledged (user)         → green "Acknowledged" badge + revert link
    //   3. neither                       → clickable "Acknowledge" button
    const isSystemAcknowledged = field.is_acknowledged && field.acknowledged_by === "system";

    // Use raw field.match_status (not effectiveStatus) as the outer gate so that
    // already-acknowledged fields (effectiveStatus="acknowledged") still enter the
    // badge branch rather than rendering nothing.
    const acknowledgeUI = field.required && field.match_status === "mismatch" ? (
      isAcknowledged && !isSystemAcknowledged ? (
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 10px", borderRadius: 9999,
            border: "1px solid #86EFAC", background: "#F0FDF4", color: "#16A34A",
            fontSize: 13, fontWeight: 500, cursor: "default",
            flexShrink: 0, whiteSpace: "nowrap",
          }}
        >
          <CheckCircleOutlined style={{ fontSize: 13 }} />
          Acknowledged
        </span>
      ) : !isAcknowledged && showAcknowledge ? (
        <AntButton
          size="small"
          icon={<CheckCircleOutlined />}
          onClick={() => onAcknowledge(fieldName)}
          style={{ flexShrink: 0 }}
        >
          Acknowledge
        </AntButton>
      ) : null
    ) : null;

    // Auto-approved badge: fuzzy match OR system acknowledgement.
    const autoApprovedBadge = (isAutoApproved || isSystemAcknowledged) && !acknowledgedFields.has(fieldName) ? (
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 10px", borderRadius: 9999,
          border: "1px solid #A5B4FC", background: "#EEF2FF", color: "#6366F1",
          fontSize: 13, fontWeight: 500, cursor: "default",
          flexShrink: 0, whiteSpace: "nowrap",
        }}
        title="System matched these values automatically despite minor formatting differences"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#6366F1" style={{ flexShrink: 0 }}>
          <path d="M9 2C9 2 9.5 6.5 11 8C12.5 9.5 17 10 17 10C17 10 12.5 10.5 11 12C9.5 13.5 9 18 9 18C9 18 8.5 13.5 7 12C5.5 10.5 1 10 1 10C1 10 5.5 9.5 7 8C8.5 6.5 9 2 9 2Z" />
        </svg>
        Auto-approved
      </span>
    ) : null;

    // Revert link: only for user-acknowledged fields (not system-auto-approved).
    const revertLink = isAcknowledged && !isSystemAcknowledged && canEdit && !isCompleted ? (
      <button
        type="button"
        onClick={() => onUnacknowledge(fieldName)}
        className="text-xs text-gray-500 underline bg-transparent border-0 cursor-pointer flex-shrink-0"
      >
        revert
      </button>
    ) : null;

    // Required fields are never editable (they show the Acknowledge button instead).
    // Exempt fields (po_number) are read-only in both modes.
    // This mirrors invoice-validator-fe: isEditable = !field.required && !NON_EDITABLE.
    if (editMode && !isExempt && !field.required) {
      // Seed with "" when the server value is the "-" empty-placeholder so the
      // input starts blank rather than showing the literal dash character.
      const seedVal = invoiceVal === "-" ? "" : invoiceVal;
      const currentEditVal = localEdits[fieldName] ?? seedVal;
      return (
        <div className="flex items-center gap-2" style={{ width: "100%" }}>
          <AntInput
            value={currentEditVal}
            onChange={(e) => setLocalEdits((prev) => ({ ...prev, [fieldName]: e.target.value }))}
            onPressEnter={() => onSaveField?.(fieldName, localEdits[fieldName] ?? seedVal)}
            size="small"
            variant="borderless"
            style={{ flex: 1, padding: 0 }}
          />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2" style={{ width: "100%" }}>
        <div
          className="text-gray-700"
          style={{
            flex: 1,
            color: invoiceVal === "-" ? "#9CA3AF" : "#414651",
            wordBreak: "break-word",
          }}
        >
          {invoiceVal === "-" ? "" : invoiceVal}
        </div>
        {autoApprovedBadge}
        {acknowledgeUI}
        {revertLink}
      </div>
    );
  };

  const columns: ColumnsType<ValidationField> = useMemo(() => {
    const cols: ColumnsType<ValidationField> = [
      {
        title: "Field",
        dataIndex: "display_name",
        key: "field_name",
        onHeaderCell: () => ({ style: { background: "#F4F4F4", borderRight: "1px solid #E5E7EB", minWidth: 260 } }),
        onCell: (record) => ({
          style: {
            background: "#F4F4F4",
            boxShadow:
              effectiveStatus(record) === "mismatch" && !isEditedMatch(record)
                ? record.required
                  ? "inset 2px 0 0 #C10008"
                  : "inset 2px 0 0 #D97706"
                : undefined,
            borderRight: "1px solid #E5E7EB",
            minWidth: 260,
          },
        }),
        render: (_, field) => renderFieldCell(field),
      },
      {
        title: "Invoice",
        key: "invoice",
        onHeaderCell: () => ({ style: { minWidth: 280 } }),
        onCell: () => ({ style: { minWidth: 280 } }),
        render: (_, field) => renderInvoiceCell(field),
      },
      {
        title: "PO / SAP Document",
        key: "po",
        onHeaderCell: () => ({ style: { minWidth: 220 } }),
        onCell: () => ({ style: { minWidth: 220 } }),
        render: (_, field) => {
          const poVal = formatValue(field.values.po?.[0]?.value, field.type);
          return (
            <span style={{ color: poVal === "-" ? "#9CA3AF" : "#414651", fontSize: 14, wordBreak: "break-word" }}>
              {poVal === "-" ? "" : poVal}
            </span>
          );
        },
      },
    ];
    if (hasGrn) {
      cols.push({
        title: "GRN",
        key: "grn",
        onHeaderCell: () => ({ style: { minWidth: 220 } }),
        onCell: () => ({ style: { minWidth: 220 } }),
        render: (_, field) => {
          const grnVal = formatValue(field.values.grn?.[0]?.value, field.type);
          return (
            <span style={{ color: grnVal === "-" ? "#9CA3AF" : "#414651", fontSize: 14, wordBreak: "break-word" }}>
              {grnVal === "-" ? "" : grnVal}
            </span>
          );
        },
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGrn, editMode, localEdits, onSaveField, acknowledgedFields, onAcknowledge, onUnacknowledge, isCompleted, canEdit]);

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
    .${tableClassName} .${rowClassPrefix}-row-exempt {
      background-color: #f9fafb;
    }
    .${tableClassName} .${rowClassPrefix}-row-exempt:hover > td {
      background-color: #f3f4f6 !important;
    }
    .${tableClassName} .${rowClassPrefix}-row-exempt > td:first-child {
      background-color: #F4F4F4 !important;
      border-right: 1px solid #E5E7EB !important;
    }
    .${tableClassName} .${rowClassPrefix}-row-match {
      background-color: #ffffff;
    }
    .${tableClassName} .${rowClassPrefix}-row-match:hover > td {
      background-color: #f8fafc !important;
    }
    .${tableClassName} .${rowClassPrefix}-row-match > td:first-child,
    .${tableClassName} .${rowClassPrefix}-row-match:hover > td:first-child {
      background-color: #F4F4F4 !important;
      border-right: 1px solid #E5E7EB !important;
    }
    .${tableClassName} .${rowClassPrefix}-row-mandatory-mismatch {
      background-color: #FFF0F0;
    }
    .${tableClassName} .${rowClassPrefix}-row-mandatory-mismatch:hover > td {
      background-color: #fee2e2 !important;
    }
    .${tableClassName} .${rowClassPrefix}-row-mandatory-mismatch > td:first-child,
    .${tableClassName} .${rowClassPrefix}-row-mandatory-mismatch:hover > td:first-child {
      background-color: #F4F4F4 !important;
      border-right: 1px solid #E5E7EB !important;
    }
    .${tableClassName} .${rowClassPrefix}-row-optional-mismatch {
      background-color: #FFFBEB;
    }
    .${tableClassName} .${rowClassPrefix}-row-optional-mismatch:hover > td {
      background-color: #FEF3C7 !important;
    }
    .${tableClassName} .${rowClassPrefix}-row-optional-mismatch > td:first-child,
    .${tableClassName} .${rowClassPrefix}-row-optional-mismatch:hover > td:first-child {
      background-color: #F4F4F4 !important;
      border-right: 1px solid #E5E7EB !important;
    }
    .${tableClassName} .ant-table-tbody > tr > td {
      word-break: break-word;
      white-space: normal !important;
    }
    .${tableClassName} .ant-table-container {
      border-radius: 8px !important;
    }
    .${tableClassName} .ant-table-container table {
      border-radius: 8px !important;
      overflow: hidden;
    }
  `;

  return (
    <>
      <style>{tableStyles}</style>
      <Table<ValidationField>
        className={tableClassName}
        columns={columns}
        dataSource={fields}
        rowKey="field_name"
        pagination={false}
        rowClassName={(record) => getRowClassName(record)}
        bordered
        size="middle"
        locale={{ emptyText: "No metadata to compare." }}
      />
    </>
  );
}
