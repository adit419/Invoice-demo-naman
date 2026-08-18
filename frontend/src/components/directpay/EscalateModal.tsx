/**
 * Escalation preview for the Matching stage — a MOCK. Nothing is sent.
 *
 * The eventual intent is to email an escalation when an invoice can't clear
 * Matching on its own, so this shows the message that would go out, composed
 * from the invoice's real figures and the actual reason it's blocked. Built to
 * the same idiom as RejectModal (ui/Modal, secondary + primary footer actions).
 */
import { Modal, Button, Textarea } from "@/components/ui";

export interface EscalateModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired by the primary action — the caller decides what "sending" means
   *  (today: a toast saying it isn't wired up). */
  onSend: () => void;
  invoiceNumber?: string | null;
  vendorName?: string | null;
  /** Pre-formatted amounts, so they read exactly as the variance bar shows them. */
  invoiceAmount?: string | null;
  referenceAmount?: string | null;
  /** Where the reference came from, for the right wording. */
  referenceLabel?: string;
  /** The backend's own explanation of why this is blocked. */
  reason?: string | null;
  thresholdEnabled: boolean;
  thresholdPct: number;
}

const FieldRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex gap-3" style={{ fontSize: 13, lineHeight: "20px" }}>
    <span style={{ width: 78, flexShrink: 0, color: "#8D92A6" }}>{label}</span>
    <span style={{ color: "#101828", minWidth: 0, wordBreak: "break-word" }}>{children}</span>
  </div>
);

export function EscalateModal({
  open, onClose, onSend,
  invoiceNumber, vendorName, invoiceAmount, referenceAmount,
  referenceLabel = "Contract", reason, thresholdEnabled, thresholdPct,
}: EscalateModalProps) {
  const subject = `Escalation: ${invoiceNumber || "invoice"} — Total Amount Before VAT outside tolerance`;

  const body = [
    `Hi,`,
    ``,
    `This invoice cannot be approved at the Matching stage and needs a decision.`,
    ``,
    `  Vendor              : ${vendorName || "—"}`,
    `  Invoice number      : ${invoiceNumber || "—"}`,
    `  Invoice amount      : ${invoiceAmount || "—"}`,
    `  ${referenceLabel.padEnd(18)}: ${referenceAmount || "—"}`,
    `  Tolerance           : ${thresholdEnabled ? `${thresholdPct}%` : "disabled — exact match required"}`,
    ``,
    `Reason it is blocked:`,
    `  ${reason || "Total Amount Before VAT does not satisfy the configured tolerance."}`,
    ``,
    `Please review and confirm whether to approve this variance, or advise on the`,
    `correction required.`,
    ``,
    `Sent from DirectPay — Matching stage`,
  ].join("\n");

  return (
    <Modal open={open} onClose={onClose} title="Escalate for Approval" size="md">
      <div className="flex flex-col gap-4">
        {/* Say plainly that this doesn't send, rather than implying it does. */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 8,
            background: "#FFFBEB", border: "1px dashed #FCD34D", color: "#92400E", fontSize: 12.5,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 7v6M12 16v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span><strong>Preview only.</strong> Email escalation isn&apos;t wired up yet — nothing will be sent.</span>
        </div>

        <div
          style={{
            border: "1px solid #E9EAEC", borderRadius: 8, overflow: "hidden",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div style={{ padding: "10px 14px", background: "#F9FAFB", borderBottom: "1px solid #EBEDF0" }}>
            <div className="flex flex-col gap-1.5">
              <FieldRow label="To">Finance Approver</FieldRow>
              <FieldRow label="Cc">AP Team</FieldRow>
              <FieldRow label="Subject">
                <span style={{ fontWeight: 600 }}>{subject}</span>
              </FieldRow>
            </div>
          </div>
          <Textarea value={body} onChange={() => undefined} readOnly rows={14} />
        </div>

        <div className="flex gap-3 justify-end pt-1 border-t border-border-default">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSend}>
            Send Escalation
          </Button>
        </div>
      </div>
    </Modal>
  );
}
