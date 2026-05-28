import { useState } from "react";
import { Modal, Button, Textarea } from "@/components/ui";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  stage?: string;
}

export function RejectModal({ open, onClose, onConfirm, stage = "extraction" }: Props) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setReason("");
    onClose();
  };

  const stageLabel = stage.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <Modal open={open} onClose={handleClose} title={`Reject at ${stageLabel}`} size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-body">
          This invoice will be marked as rejected and removed from the active queue. Please provide a reason for the record.
        </p>

        <Textarea
          label="Rejection reason"
          placeholder="e.g. Duplicate invoice, missing PO number, vendor not in master…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />

        <div className="flex gap-3 justify-end pt-1 border-t border-border-default">
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!reason.trim() || loading}
            loading={loading}
          >
            Reject Invoice
          </Button>
        </div>
      </div>
    </Modal>
  );
}
