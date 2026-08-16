// Read-only per-installment payment-schedule table — shared between the
// Contract Extraction Postprocessing page and the ContractExtractionModal's
// "Derived Fields" tab, so the two can never drift apart visually.
import { DpContractInstallment, DpContractOneTimePayment } from "@/services/directpay";

interface ContractDerivedFieldsTableProps {
  installments: DpContractInstallment[];
  // Optional — only present for a vendor whose source tracker had a real
  // "ONE-TIME PAYMENTS" section (deposits, fit-out guarantee, etc.).
  oneTimePayments?: DpContractOneTimePayment[];
}

export function ContractDerivedFieldsTable({ installments, oneTimePayments }: ContractDerivedFieldsTableProps) {
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
                // Metadata table — yellow highlight, no "—" placeholder text.
                const isEmpty = f.value == null;
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
                      {f.formatted_value}
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
              {oneTimePayments.map((p, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #EBEDF0" }}>
                  <td style={{ fontSize: 13, color: "#101828", fontWeight: 500, padding: "9px 14px", lineHeight: "20px", borderRight: "1px solid #EBEDF0", background: p.description ? undefined : "#FEF3C7" }}>
                    {p.description}
                  </td>
                  <td style={{ fontSize: 13, color: "#101828", padding: "9px 14px", lineHeight: "20px", fontVariantNumeric: "tabular-nums", borderRight: "1px solid #EBEDF0", background: p.amount == null ? "#FEF3C7" : undefined }}>
                    {p.formatted_amount}
                  </td>
                  <td style={{ fontSize: 13, color: "#414651", padding: "9px 14px", lineHeight: "20px", borderRight: "1px solid #EBEDF0", background: p.due_date_trigger ? undefined : "#FEF3C7" }}>
                    {p.due_date_trigger}
                  </td>
                  <td style={{ fontSize: 13, color: "#414651", padding: "9px 14px", lineHeight: "20px", borderRight: "1px solid #EBEDF0", background: p.status ? undefined : "#FEF3C7" }}>
                    {p.status}
                  </td>
                  <td style={{ fontSize: 13, color: "#585C65", padding: "9px 14px", lineHeight: "20px", background: p.remarks ? undefined : "#FEF3C7" }}>
                    {p.remarks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
