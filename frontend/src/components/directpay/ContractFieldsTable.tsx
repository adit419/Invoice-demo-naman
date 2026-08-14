// Section-grouped Field/Value table for a DirectPay contract's extracted
// data — shared by the full Contract Extraction page (editable, with a PDF
// pane alongside) and the Matching page's read-only "Contract" modal.
// Extracted verbatim from the former contract/[id]/review.tsx so both call
// sites stay in sync (mandatory asterisk, empty-value highlight, expandable
// Audit Trail / AI Match Reasoning row) rather than drifting apart.
import { DpContractFieldMeta, DpContractFields } from "@/services/directpay";

// Field list, labels, section grouping, and mandatory-ness all come from the
// fixture's own field_meta (see backend/src/directpay/service.py's
// contract_out) rather than a hardcoded list — a new scenario can carry a
// completely different field set with no frontend change. Falls back to a
// flat, unlabeled list of `fields`' own keys if a scenario has no field_meta
// authored at all.
export function orderedFieldEntries(
  fields: DpContractFields,
  fieldMeta: Record<string, DpContractFieldMeta> | undefined
): [string, DpContractFieldMeta][] {
  const meta = fieldMeta || {};
  if (Object.keys(meta).length > 0) return Object.entries(meta);
  return Object.keys(fields || {}).map((key) => [
    key,
    { label: key, section: null, mandatory: false, audit_trail: null, ai_match_reasoning: null },
  ]);
}

interface ContractFieldsTableProps {
  fields: DpContractFields;
  fieldMeta: Record<string, DpContractFieldMeta> | undefined;
  edits: Record<string, string>;
  setEdits?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  activeKey: string | null;
  onSelectField: (key: string | null) => void;
  canEdit: boolean;
}

export function ContractFieldsTable({
  fields, fieldMeta, edits, setEdits, activeKey, onSelectField, canEdit,
}: ContractFieldsTableProps) {
  const fieldEntries = orderedFieldEntries(fields, fieldMeta);

  return (
    <div style={{ border: "1px solid #E9EAEC", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
      <table className="w-full text-sm" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left", fontSize: 13, fontWeight: 500, color: "#414651",
                padding: "10px 14px", lineHeight: "20px",
                backgroundColor: "#F4F4F4", borderBottom: "1px solid #EBEDF0",
                borderRight: "1px solid #EBEDF0", width: "32%",
              }}
            >
              Field
            </th>
            <th
              style={{
                textAlign: "left", fontSize: 13, fontWeight: 500, color: "#414651",
                padding: "10px 14px", lineHeight: "20px",
                backgroundColor: "#F4F4F4", borderBottom: "1px solid #EBEDF0",
              }}
            >
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            let lastSection: string | null | undefined = undefined;
            return fieldEntries.map(([key, meta]) => {
              const rows: React.ReactNode[] = [];
              if (meta.section !== lastSection) {
                lastSection = meta.section;
                if (meta.section) {
                  rows.push(
                    <tr key={`section-${meta.section}`}>
                      <td
                        colSpan={2}
                        style={{
                          padding: "8px 14px", fontSize: 11, fontWeight: 700, color: "#6B7280",
                          textTransform: "uppercase", letterSpacing: "0.5px",
                          backgroundColor: "#EEF0F3", borderBottom: "1px solid #EBEDF0",
                        }}
                      >
                        {meta.section}
                      </td>
                    </tr>
                  );
                }
              }

              const raw = fields[key];
              const value = edits[key] ?? (raw == null ? "" : String(raw));
              const isEmpty = !value;
              const isRequired = meta.mandatory;
              const cellBg = isEmpty ? "#FEF3C7" : "transparent";
              const leftBarColor = isEmpty ? "#F59E0B" : null;
              const isActive = activeKey === key;
              const hasDetail = Boolean(meta.audit_trail || meta.ai_match_reasoning);

              rows.push(
                <tr
                  key={key}
                  onClick={() => onSelectField(isActive ? null : key)}
                  style={{
                    borderBottom: "1px solid #EBEDF0",
                    background: isActive ? "rgba(24,118,255,0.06)" : undefined,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "#FAFAFA";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "";
                  }}
                >
                  <td
                    style={{
                      textAlign: "left", fontSize: 13, color: "#414651",
                      boxShadow: leftBarColor ? `inset 3px 0 0 ${leftBarColor}` : undefined,
                      padding: "10px 14px", lineHeight: "20px",
                      backgroundColor: "#F4F4F4", borderRight: "1px solid #EBEDF0", width: "32%",
                    }}
                  >
                    {meta.label}
                    {isRequired && <span style={{ color: "#E02D3C", fontWeight: 600, marginLeft: 3 }}>*</span>}
                  </td>
                  <td style={{ textAlign: "left", fontSize: 13, color: "#414651", padding: "10px 14px", lineHeight: "20px", background: cellBg }}>
                    {canEdit ? (
                      <input
                        className="w-full focus:outline-none"
                        type="text"
                        style={{ fontSize: 13, lineHeight: "20px", padding: 0, background: "transparent", border: "none", color: "#414651", width: "100%" }}
                        value={value}
                        onChange={(e) => setEdits?.((prev) => ({ ...prev, [key]: e.target.value }))}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectField(key);
                        }}
                      />
                    ) : (
                      <span>{value || ""}</span>
                    )}
                  </td>
                </tr>
              );

              if (isActive && hasDetail) {
                rows.push(
                  <tr key={`${key}-detail`}>
                    <td
                      colSpan={2}
                      style={{
                        padding: "10px 14px", lineHeight: "18px",
                        backgroundColor: "#F8FAFC", borderBottom: "1px solid #EBEDF0",
                      }}
                    >
                      {meta.audit_trail && (
                        <div style={{ marginBottom: meta.ai_match_reasoning ? 8 : 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>
                            Audit Trail
                          </div>
                          <div style={{ fontSize: 13, color: "#414651" }}>{meta.audit_trail}</div>
                        </div>
                      )}
                      {meta.ai_match_reasoning && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#6366F1", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 }}>
                            AI Match Reasoning
                          </div>
                          <div style={{ fontSize: 13, color: "#414651" }}>{meta.ai_match_reasoning}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }

              return rows;
            });
          })()}
        </tbody>
      </table>
    </div>
  );
}
