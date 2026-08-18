// Per-installment payment-schedule table — shared between the Contract
// Extraction Postprocessing page (editable while actionable) and the
// ContractExtractionModal's read-only "Derived Fields" tab on the Matching
// page, so the two can never drift apart visually.
import { useState } from "react";
import { DpContractInstallment, DpContractOneTimePayment } from "@/services/directpay";

// vat_rate/wht_rate are stored as a whole percentage number (11, not 0.11) —
// same convention as the contract's own flat vat_rate field — shown/edited
// here as-is, just with a "%" suffix on display (see _format_contract_
// derived_value on the backend).
export const CONTRACT_DERIVED_PERCENT_FIELDS = new Set(["vat_rate", "wht_rate"]);
export const CONTRACT_DERIVED_NUMBER_FIELDS = new Set(["amount_excl_tax", "vat_amount", "total_amount_incl_tax", "wht_amount", "net_payment_to_lessor"]);
const PERCENT_FIELDS = CONTRACT_DERIVED_PERCENT_FIELDS;
const NUMBER_FIELDS = CONTRACT_DERIVED_NUMBER_FIELDS;

type OneTimePaymentField = "description" | "amount" | "due_date_trigger" | "status" | "remarks";
type OneTimePaymentTextField = Exclude<OneTimePaymentField, "amount">;

interface ContractDerivedFieldsTableProps {
  installments: DpContractInstallment[];
  // Optional — only present for a vendor whose source tracker had a real
  // "ONE-TIME PAYMENTS" section (deposits, fit-out guarantee, etc.).
  oneTimePayments?: DpContractOneTimePayment[];
  // Defaults to read-only (the Matching page's preview modal never edits) —
  // only the Postprocessing page itself passes true, and only while its own
  // isActionable holds.
  canEdit?: boolean;
  onSaveInstallmentField?: (instIdx: number, fieldName: string, value: string) => void;
  onSaveOneTimePaymentField?: (otpIdx: number, fieldName: OneTimePaymentField, value: string) => void;
}

export function ContractDerivedFieldsTable({
  installments, oneTimePayments, canEdit, onSaveInstallmentField, onSaveOneTimePaymentField,
}: ContractDerivedFieldsTableProps) {
  const [instEdits, setInstEdits] = useState<Record<string, string>>({});
  const [otpEdits, setOtpEdits] = useState<Record<string, string>>({});

  return (
    <>
      <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 16 }}>
        These figures come from the lease&apos;s own payment schedule, not the flat Monthly Rent field — each
        installment below is what an invoice matching this contract will be compared against once its amount
        identifies which installment it belongs to.
      </p>

      {installments.map((inst, idx) => (
        <div
          key={idx}
          className="mb-5"
          style={{ border: "1px solid #E9EAEC", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}
        >
          <div
            style={{
              padding: "10px 14px", background: "#F4F4F4", borderBottom: "1px solid #EBEDF0",
              fontSize: 13, fontWeight: 600, color: "#101828",
            }}
          >
            {inst.description || `Installment ${idx + 1}`}
          </div>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
            <tbody>
              {inst.fields.map((f) => {
                // Same empty-field convention as the Extraction page's own
                // Metadata table — yellow highlight + "NA" text, driven off
                // the raw `value` (not the formatted string), so this stays
                // correct regardless of what _format_contract_derived_value
                // renders.
                const isEmpty = f.value == null;
                const editKey = `${idx}.${f.field_name}`;
                const isPercent = PERCENT_FIELDS.has(f.field_name);
                // vat_rate/wht_rate are stored as a whole percentage number
                // (11, not 0.11) — same convention as the contract's own
                // flat vat_rate field — so no conversion is needed here,
                // just the "%" suffix on display (below).
                const editValue = instEdits[editKey] ?? (f.value == null ? "NA" : String(f.value));
                // A native type="number" input can't display a non-numeric
                // string like "NA" — it silently renders blank instead.
                const isNumericEditValue = editValue !== "" && !Number.isNaN(Number(editValue));
                const save = () => {
                  if (!onSaveInstallmentField) return;
                  const typed = instEdits[editKey];
                  if (typed === undefined) return;
                  onSaveInstallmentField(idx, f.field_name, typed);
                };
                return (
                  <tr key={f.field_name} style={{ borderBottom: "1px solid #EBEDF0" }}>
                    <td
                      style={{
                        textAlign: "left", fontSize: 13, color: "#414651", padding: "9px 14px", lineHeight: "20px",
                        backgroundColor: "#FAFAFA", borderRight: "1px solid #EBEDF0", width: "45%",
                        boxShadow: isEmpty ? "inset 3px 0 0 #F59E0B" : undefined,
                      }}
                    >
                      {f.display_name}
                    </td>
                    <td
                      style={{
                        textAlign: "left", fontSize: 13, color: "#101828", fontWeight: 500, padding: "9px 14px",
                        lineHeight: "20px", fontVariantNumeric: "tabular-nums",
                        background: isEmpty ? "#FEF3C7" : undefined,
                      }}
                    >
                      {canEdit ? (
                        <input
                          className="w-full focus:outline-none"
                          type={(isPercent || NUMBER_FIELDS.has(f.field_name)) && isNumericEditValue ? "number" : "text"}
                          style={{ fontSize: 13, lineHeight: "20px", padding: 0, background: "transparent", border: "none", color: "#101828", width: "100%", fontVariantNumeric: "tabular-nums" }}
                          value={editValue}
                          onChange={(e) => setInstEdits((prev) => ({ ...prev, [editKey]: e.target.value }))}
                          onBlur={save}
                          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                        />
                      ) : (
                        f.formatted_value
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {oneTimePayments && oneTimePayments.length > 0 && (
        <div
          className="mb-5"
          style={{ border: "1px solid #E9EAEC", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}
        >
          <div
            style={{
              padding: "10px 14px", background: "#F4F4F4", borderBottom: "1px solid #EBEDF0",
              fontSize: 13, fontWeight: 600, color: "#101828",
            }}
          >
            One-Time Payments
          </div>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #EBEDF0" }}>
                {["Description", "Amount", "Due Date / Trigger", "Status", "Remarks"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left", fontSize: 12, fontWeight: 600, color: "#585C65", padding: "9px 14px",
                      lineHeight: "18px", backgroundColor: "#FAFAFA", borderRight: "1px solid #EBEDF0",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {oneTimePayments.map((p, idx) => {
                const textCell = (field: OneTimePaymentTextField, value: string | null | undefined, style: React.CSSProperties) => {
                  const editKey = `${idx}.${field}`;
                  const editValue = otpEdits[editKey] ?? (value ?? "NA");
                  const save = () => {
                    if (!onSaveOneTimePaymentField) return;
                    const typed = otpEdits[editKey];
                    if (typed === undefined) return;
                    onSaveOneTimePaymentField(idx, field, typed);
                  };
                  return (
                    <td style={{ ...style, background: value ? undefined : "#FEF3C7" }}>
                      {canEdit ? (
                        <input
                          className="w-full focus:outline-none"
                          style={{ fontSize: "inherit", fontWeight: "inherit", color: "inherit", lineHeight: "inherit", padding: 0, background: "transparent", border: "none", width: "100%" }}
                          value={editValue}
                          onChange={(e) => setOtpEdits((prev) => ({ ...prev, [editKey]: e.target.value }))}
                          onBlur={save}
                          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                        />
                      ) : (
                        value || "NA"
                      )}
                    </td>
                  );
                };
                const amountEditKey = `${idx}.amount`;
                const amountEditValue = otpEdits[amountEditKey] ?? (p.amount == null ? "NA" : String(p.amount));
                const isNumericAmount = amountEditValue !== "" && !Number.isNaN(Number(amountEditValue));
                const saveAmount = () => {
                  if (!onSaveOneTimePaymentField) return;
                  const typed = otpEdits[amountEditKey];
                  if (typed === undefined) return;
                  onSaveOneTimePaymentField(idx, "amount", typed);
                };
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid #EBEDF0" }}>
                    {textCell("description", p.description, { fontSize: 13, color: "#101828", fontWeight: 500, padding: "9px 14px", lineHeight: "20px", borderRight: "1px solid #EBEDF0" })}
                    <td style={{ fontSize: 13, color: "#101828", padding: "9px 14px", lineHeight: "20px", fontVariantNumeric: "tabular-nums", borderRight: "1px solid #EBEDF0", background: p.amount == null ? "#FEF3C7" : undefined }}>
                      {canEdit ? (
                        <input
                          type={isNumericAmount ? "number" : "text"}
                          className="w-full focus:outline-none"
                          style={{ fontSize: 13, lineHeight: "20px", padding: 0, background: "transparent", border: "none", color: "#101828", width: "100%", fontVariantNumeric: "tabular-nums" }}
                          value={amountEditValue}
                          onChange={(e) => setOtpEdits((prev) => ({ ...prev, [amountEditKey]: e.target.value }))}
                          onBlur={saveAmount}
                          onKeyDown={(e) => { if (e.key === "Enter") saveAmount(); }}
                        />
                      ) : (
                        p.formatted_amount
                      )}
                    </td>
                    {textCell("due_date_trigger", p.due_date_trigger, { fontSize: 13, color: "#414651", padding: "9px 14px", lineHeight: "20px", borderRight: "1px solid #EBEDF0" })}
                    {textCell("status", p.status, { fontSize: 13, color: "#414651", padding: "9px 14px", lineHeight: "20px", borderRight: "1px solid #EBEDF0" })}
                    {textCell("remarks", p.remarks, { fontSize: 13, color: "#585C65", padding: "9px 14px", lineHeight: "20px" })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
