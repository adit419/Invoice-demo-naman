// Read-only Contract Extraction table shown inline from the Matching/Bill
// Posting pages' "Contract" link — same modal-on-click pattern as
// DocumentPreviewModal (invoice/contract PDF previews), just showing the
// field/value grid instead of the raw PDF. Also offers a second tab for the
// contract's Derived Fields (the payment schedule's per-installment Total
// Amount Before VAT / Tax Amount / WHT / Net Amount After WHT — the same
// data the Contract Extraction Postprocessing stage reviewed before this
// contract was saved), reusing ContractDerivedFieldsTable so the two views
// can never drift apart. Fetches the contract fresh each time it opens
// rather than requiring the parent to already hold the full contract run.
import { useEffect, useState } from "react";
import { Modal } from "antd";
import { Loader } from "@/components/ui";
import { ContractFieldsTable } from "@/components/directpay/ContractFieldsTable";
import { ContractDerivedFieldsTable } from "@/components/directpay/ContractDerivedFieldsTable";
import { directpayService, DpContractExtractionPostprocessing, DpContractRun } from "@/services/directpay";

interface ContractExtractionModalProps {
  open: boolean;
  onClose: () => void;
  contractId: string | null;
}

type Tab = "extracted" | "derived";

export function ContractExtractionModal({ open, onClose, contractId }: ContractExtractionModalProps) {
  const [run, setRun] = useState<DpContractRun | null>(null);
  const [derived, setDerived] = useState<DpContractExtractionPostprocessing | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("extracted");

  useEffect(() => {
    if (!open || !contractId) return;
    let cancelled = false;
    setLoading(true);
    setActiveKey(null);
    setTab("extracted");
    Promise.all([
      directpayService.getContract(contractId),
      // Derived Fields tab is only shown at all when this resolves with
      // has_payment_schedule — a vendor with no payment schedule simply
      // never offers the tab, no error state needed for that case.
      directpayService.getContractExtractionPostprocessing(contractId).catch(() => null),
    ])
      .then(([contract, pp]) => {
        if (cancelled) return;
        setRun(contract);
        setDerived(pp);
      })
      .catch(() => { if (!cancelled) setRun(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, contractId]);

  const hasDerivedFields = !!derived?.has_payment_schedule && derived.installments.length > 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={run?.fields.vendor_name ? `Contract Extraction — ${run.fields.vendor_name}` : "Contract Extraction"}
      width="70vw"
      style={{ top: 24 }}
      styles={{ body: { maxHeight: "82vh", overflow: "auto", padding: "16px 20px" } }}
      footer={null}
      destroyOnHidden
    >
      {loading ? (
        <div className="flex items-center justify-center" style={{ height: 300 }}>
          <Loader size="large" />
        </div>
      ) : run ? (
        <>
          {hasDerivedFields && (
            <div className="flex items-center gap-5 mb-4" style={{ borderBottom: "1px solid #EBEDF0" }}>
              {([
                { key: "extracted" as const, label: "Extracted Fields" },
                { key: "derived" as const, label: "Derived Fields" },
              ]).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: "8px 2px 10px", fontSize: 14, fontWeight: 600,
                    color: tab === t.key ? "#1876FF" : "#585C65",
                    marginBottom: -1, background: "transparent",
                    border: "none", borderBottom: tab === t.key ? "2px solid #1876FF" : "2px solid transparent",
                    cursor: "pointer", fontFamily: "Inter, sans-serif",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {tab === "derived" && hasDerivedFields ? (
            <ContractDerivedFieldsTable installments={derived!.installments} />
          ) : (
            <ContractFieldsTable
              fields={run.fields}
              fieldMeta={run.field_meta}
              edits={{}}
              activeKey={activeKey}
              onSelectField={setActiveKey}
              canEdit={false}
            />
          )}
        </>
      ) : (
        <div className="flex items-center justify-center text-gray-400" style={{ height: 300 }}>
          Contract not found.
        </div>
      )}
    </Modal>
  );
}
