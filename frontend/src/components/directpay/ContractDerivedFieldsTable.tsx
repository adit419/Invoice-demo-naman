// Read-only per-installment payment-schedule table — shared between the
// Contract Extraction Postprocessing page and the ContractExtractionModal's
// "Derived Fields" tab, so the two can never drift apart visually.
import { DpContractInstallment } from "@/services/directpay";

interface ContractDerivedFieldsTableProps {
  installments: DpContractInstallment[];
}

export function ContractDerivedFieldsTable({ installments }: ContractDerivedFieldsTableProps) {
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
              {inst.fields.map((f) => (
                <tr key={f.field_name} style={{ borderBottom: "1px solid #EBEDF0" }}>
                  <td
                    style={{
                      textAlign: "left", fontSize: 13, color: "#414651", padding: "9px 14px", lineHeight: "20px",
                      backgroundColor: "#FAFAFA", borderRight: "1px solid #EBEDF0", width: "45%",
                    }}
                  >
                    {f.display_name}
                  </td>
                  <td
                    style={{
                      textAlign: "left", fontSize: 13, color: "#101828", fontWeight: 500, padding: "9px 14px",
                      lineHeight: "20px", fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {f.formatted_value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
