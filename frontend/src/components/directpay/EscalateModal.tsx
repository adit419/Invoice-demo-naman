/**
 * Email escalation for the Matching stage.
 *
 * Posts a reply on the invoice's originating FreshDesk ticket — the `tag` its
 * trigger-upload carried. POST /dp-api/invoices/{id}/escalate does the posting;
 * the body shown here is a faithful preview, but what actually goes out is
 * composed server-side from the run (only the reviewer's note is sent up, so the
 * endpoint can't be used to post arbitrary content).
 *
 * With no originating ticket there is no conversation to reply into, and the flow
 * keeps its original behaviour: a local confirmation with nothing transmitted.
 * The confirmation text distinguishes the outcomes, so it never claims something
 * went out when nothing did. Built to the same idiom as RejectModal (ui/Modal,
 * secondary + primary footer actions).
 */
import { useState } from "react";
import { Modal, Button, Textarea } from "@/components/ui";
import { directpayService } from "@/services/directpay";

export interface EscalateModalProps {
  open: boolean;
  onClose: () => void;
  /** Invoice run id — the escalate endpoint's subject. */
  invoiceId: string;
  /** Fired when the reviewer dismisses the sent confirmation, i.e. once the
   *  escalation flow is finished. */
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
  /** Additional findings worth stating in the mail, beyond `reason` — e.g. that
   *  the invoice appears grossed up for a withholding the contract never
   *  mentions. Each becomes its own bullet. */
  notes?: string[];
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
  open, onClose, onSend, invoiceId,
  invoiceNumber, vendorName, invoiceAmount, referenceAmount,
  referenceLabel = "Contract", reason, notes, thresholdEnabled, thresholdPct,
}: EscalateModalProps) {
  // Compose then sent. Both exits clear it, so reopening always starts back at
  // the message rather than at a stale confirmation.
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  // Who it actually reached — null when the invoice had no payload email, in
  // which case nothing was transmitted and the confirmation says so.
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const reset = () => { setSentAt(null); setTicketId(null); setFailed(false); setOutcome(null); };
  const cancel = () => { reset(); onClose(); };
  const done = () => { reset(); onSend(); };

  const send = async () => {
    setSending(true);
    setFailed(false);
    try {
      const res = await directpayService.escalateInvoice(invoiceId);
      // Four distinct outcomes, and they must not be conflated: sent; nothing to
      // send to (no payload email — a legitimate no-op); already escalated (the
      // button should have been disabled, so this is a stale tab); or a real send
      // that failed. Calling any of the last three a success, or each other,
      // misleads the reviewer about whether anyone was actually told.
      setTicketId(res.sent ? res.ticket_id : null);
      setOutcome(res.sent ? null : res.reason ?? "send_failed");
      setFailed(!res.sent && res.reason === "send_failed");
    } catch {
      setFailed(true);
      setTicketId(null);
      setOutcome("send_failed");
    } finally {
      setSending(false);
      setSentAt(new Date());
    }
  };

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
    ...((notes ?? []).length ? [``, `Also noted:`, ...(notes ?? []).map((n) => `  - ${n}`)] : []),
    ``,
    `Please review and confirm whether to approve this variance, or advise on the`,
    `correction required.`,
    ``,
    `Sent from DirectPay — Matching stage`,
  ].join("\n");

  return (
    <Modal
      open={open}
      onClose={sentAt ? done : cancel}
      title={sentAt ? "Escalation Sent" : "Escalate for Approval"}
      size="md"
    >
      <div className="flex flex-col gap-4">
        {sentAt && (
          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 12px", borderRadius: 8,
              background: failed ? "#FEF2F2" : outcome ? "#FFFBEB" : "#F0FDF4",
              border: `1px solid ${failed ? "#FECACA" : outcome ? "#FDE68A" : "#BBF7D0"}`,
              color: failed ? "#B91C1C" : outcome ? "#92400E" : "#15803D",
              fontSize: 12.5,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 12.4l2.7 2.6L16 9.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ lineHeight: "18px" }}>
              <strong>
                {failed ? "Escalation could not be posted."
                  : outcome === "already_escalated" ? "Already escalated."
                  : ticketId ? `Escalation posted to ticket #${ticketId}.`
                  : "Escalation recorded."}
              </strong>
              <br />
              {failed
                ? "The invoice is still awaiting a decision — retry, or follow up manually."
                : outcome === "already_escalated"
                ? "This invoice was escalated earlier; nothing was posted again. "
                : outcome === "no_ticket"
                ? "This invoice has no originating support ticket, so nothing was posted. "
                : ""}
              {!failed && (
                <>
                  {invoiceNumber ? `${invoiceNumber} is ` : "This invoice is "}
                  now awaiting an approval decision.{" "}
                  {sentAt.toLocaleString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                  .
                </>
              )}
            </span>
          </div>
        )}

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
          {sentAt ? (
            <Button variant="primary" onClick={done}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={cancel}>
                Cancel
              </Button>
              <Button variant="primary" onClick={send} disabled={sending}>
                {sending ? "Sending…" : "Send Escalation"}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
