// Read-only Contract Extraction table shown inline from the Matching page's
// "Contract" link — same modal-on-click pattern as DocumentPreviewModal
// (invoice/contract PDF previews), just showing the field/value grid
// instead of the raw PDF. Fetches the contract fresh each time it opens
// rather than requiring the parent to already hold the full contract run.
import { useEffect, useState } from "react";
import { Modal } from "antd";
import { Loader } from "@/components/ui";
import { ContractFieldsTable } from "@/components/directpay/ContractFieldsTable";
import { directpayService, DpContractRun } from "@/services/directpay";

interface ContractExtractionModalProps {
  open: boolean;
  onClose: () => void;
  contractId: string | null;
}

export function ContractExtractionModal({ open, onClose, contractId }: ContractExtractionModalProps) {
  const [run, setRun] = useState<DpContractRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !contractId) return;
    let cancelled = false;
    setLoading(true);
    setActiveKey(null);
    directpayService.getContract(contractId)
      .then((data) => { if (!cancelled) setRun(data); })
      .catch(() => { if (!cancelled) setRun(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, contractId]);

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
        <ContractFieldsTable
          fields={run.fields}
          fieldMeta={run.field_meta}
          edits={{}}
          activeKey={activeKey}
          onSelectField={setActiveKey}
          canEdit={false}
        />
      ) : (
        <div className="flex items-center justify-center text-gray-400" style={{ height: 300 }}>
          Contract not found.
        </div>
      )}
    </Modal>
  );
}
