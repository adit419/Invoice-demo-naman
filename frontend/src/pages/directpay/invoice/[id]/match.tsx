import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { CalendarOutlined, FileProtectOutlined, FileTextOutlined, TagOutlined, UserOutlined } from "@ant-design/icons";
import { Button as AntButton, Select as AntSelect, Space } from "antd";
import { withAuthGuard } from "@/components/AuthGuard";
import { ComponentHeaderAntd } from "@/components/matching";
import { Loader, useToast } from "@/components/ui";
import { RejectModal } from "@/components/RejectModal";
import { ApiError } from "@/services/api";
import {
  directpayService,
  DpContractRecommendation,
  DpContractRun,
  DpInvoiceRun,
} from "@/services/directpay";
import { isFindingResolved, MatchingTable } from "@/components/directpay/MatchingTable";
import AiContractBanner from "@/components/directpay/AiContractBanner";
import { TotalBeforeVatVarianceBar } from "@/components/directpay/TotalBeforeVatVarianceBar";
import { EscalateModal } from "@/components/directpay/EscalateModal";
import { DocumentPreviewModal } from "@/components/directpay/DocumentPreviewModal";
import { ContractExtractionModal } from "@/components/directpay/ContractExtractionModal";
import { StageTransitionOverlay } from "@/components/StageTransitionOverlay";

// Simulated processing latency for the forward transition after Approve —
// mirrors P2P's own matching.tsx exactly: the real approve call only spins
// the button (see `busy` below), and StageTransitionOverlay is reserved for
// this separate post-approval hand-off, paced in two phases so both the
// "matching" and "preparing the bill" steps get their own visible moment.
const MATCHING_PHASE_DELAY_MS = 5000;
const PREPARING_BILL_PHASE_DELAY_MS = 3000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function InvoiceMatchPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { toast } = useToast();

  const [run, setRun] = useState<DpInvoiceRun | null>(null);
  const [contracts, setContracts] = useState<DpContractRun[]>([]);
  const [recommendation, setRecommendation] = useState<DpContractRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Saving…");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [invoicePdfOpen, setInvoicePdfOpen] = useState(false);
  const [contractPdfOpen, setContractPdfOpen] = useState(false);
  const [contractExtractionOpen, setContractExtractionOpen] = useState(false);
  const [supportingDocOpen, setSupportingDocOpen] = useState(false);
  const [fpDocIndex, setFpDocIndex] = useState<number | null>(null);
  const [escalateOpen, setEscalateOpen] = useState(false);
  // Mirrors the saved threshold so the variance bar can show the tolerance and
  // its resulting cap. Refreshed whenever the control saves.
  const [threshold, setThreshold] = useState<{ enabled: boolean; threshold_pct: number }>({ enabled: true, threshold_pct: 5 });
  const [pdfToken, setPdfToken] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState<"matching" | "preparing">("matching");

  useEffect(() => {
    setPdfToken(localStorage.getItem("access_token"));
  }, []);

  const loadThreshold = useCallback(() => {
    directpayService.getTotalBeforeVatThreshold().then(setThreshold).catch(() => { /* keep default */ });
  }, []);
  useEffect(() => { loadThreshold(); }, [loadThreshold]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      let [inv, con] = await Promise.all([directpayService.getInvoice(id), directpayService.listContracts()]);
      // An IDR invoice must clear Faktur Pajak before Matching — guards
      // direct/stale navigation to this page (the normal path only ever
      // arrives here via fp-extraction.tsx's own Approve, or straight from
      // Extraction for a vendor with no FP document).
      if (inv.status === "fp_extraction") {
        router.replace(`/directpay/invoice/${id}/fp-extraction`);
        return;
      }
      setContracts(con.items.filter((c) => c.status === "saved"));
      // Always call this (unless already decided) — it's idempotent (never
      // re-picks once a contract is set) and is the only way to learn
      // whether the CURRENT contract traces back to an AI pick, which
      // drives the sparkle banner below. Covers both the common case
      // (Extraction screen already applied it) and the fallback case
      // (confirmed before any contract existed). Skipped once terminal —
      // an invoice rejected straight from Extraction (before ever having a
      // contract) must never get retroactively matched just by being viewed.
      const isTerminalNow = ["bill_posting", "posted", "rejected"].includes(inv.status);
      if (!isTerminalNow) {
        try {
          const rec = await directpayService.getContractRecommendation(id);
          setRecommendation(rec);
          if (rec.current_contract_id && !inv.contract_id) {
            inv = await directpayService.getInvoice(id);
          }
        } catch {
          // No saved contracts yet — the "No contract matched yet" banner covers this.
        }
      }
      setRun(inv);
    } catch {
      toast("Invoice not found", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast, router]);

  useEffect(() => {
    load();
  }, [load]);

  const isTerminal = run ? ["bill_posting", "posted", "rejected"].includes(run.status) : false;
  const isRejected = run?.status === "rejected";

  // Selecting a different contract from the header dropdown re-runs the
  // match immediately — no separate "Confirm Match" screen.
  const handleContractChange = async (contractId: string) => {
    if (!id || !contractId) return;
    setBusyLabel("Matching against contract…");
    setBusy(true);
    try {
      const updated = await directpayService.matchInvoice(id, contractId);
      setRun(updated);
    } catch {
      toast("Could not match invoice to contract", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAcknowledge = async (findingId: string, acknowledged: boolean) => {
    if (!id) return;
    try {
      const res = await directpayService.acknowledgeFinding(id, findingId, acknowledged);
      setRun((r) => (r ? { ...r, acknowledged_findings: res.acknowledged_findings } : r));
    } catch {
      toast("Could not acknowledge finding", "error");
    }
  };

  const submitAction = async (action: "approve" | "reject", reason?: string) => {
    if (!id) return;
    setBusyLabel(action === "reject" ? "Rejecting…" : "Saving decision…");
    setBusy(true);
    try {
      await directpayService.reviewAction(id, action, reason);
      if (action === "reject") {
        const updated = await directpayService.getInvoice(id);
        setRun(updated);
        setRejectOpen(false);
      } else {
        // The approve call itself only spun the button above — the visible
        // "processing" moment is this hand-off to Bill Posting, shown via
        // the same StageTransitionOverlay P2P uses between its own stages.
        setBusy(false);
        setTransitionPhase("matching");
        setTransitioning(true);
        await sleep(MATCHING_PHASE_DELAY_MS);
        setTransitionPhase("preparing");
        await sleep(PREPARING_BILL_PHASE_DELAY_MS);
        router.push(`/directpay/invoice/${id}/bill-posting`);
      }
    } catch (err) {
      // P2P has no "approve anyway" override for a blocked mismatch — a
      // mandatory field is either fixed or acknowledged, never bypassed. The
      // Approve button below is disabled whenever blockingCount > 0 so this
      // 409 shouldn't normally be reachable by clicking it; it's a safety
      // net in case findings changed between render and click.
      if (err instanceof ApiError && err.status === 409) {
        toast("Fix the value or acknowledge each mismatch before proceeding.", "error");
      } else {
        toast("Could not save review decision", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (reason: string) => {
    await submitAction("reject", reason);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <Loader size="large" />
      </div>
    );
  }
  if (!run) return null;

  if (transitioning) {
    return (
      <StageTransitionOverlay
        title={
          transitionPhase === "matching"
            ? "We're matching the invoice against the contract."
            : "Preparing the bill for ERP posting."
        }
        subtitle="This may take a few minutes. Please keep this page open."
        steps={
          transitionPhase === "matching"
            ? [{ label: "Matching against contract", status: "active" }]
            : [
                { label: "Matching against contract", status: "done" },
                { label: "Preparing bill for ERP", status: "active" },
              ]
        }
      />
    );
  }

  const metaItems = [
    { icon: <TagOutlined />, text: "Manual Upload" },
    run.extracted.invoice_number
      ? { icon: <FileTextOutlined />, text: run.extracted.invoice_number, onClick: () => setInvoicePdfOpen(true) }
      : null,
    run.extracted.vendor_name
      ? {
          icon: <UserOutlined />,
          text: run.extracted.vendor_name,
          onClick: run.contract_id ? () => setContractPdfOpen(true) : undefined,
        }
      : null,
    run.extracted.invoice_date ? { icon: <CalendarOutlined />, text: run.extracted.invoice_date } : null,
    // Distinct from the vendor-name link above (which opens a read-only PDF
    // preview) — this opens the actual Contract Extraction table for the
    // matched contract, so the full field-by-field data is one click away.
    run.contract_id
      ? {
          icon: <FileProtectOutlined />,
          text: "Contract",
          onClick: () => setContractExtractionOpen(true),
        }
      : null,
  ].filter(Boolean) as { icon: React.ReactNode; text: string; onClick?: () => void }[];

  const findings = run.findings ?? [];
  // Every finding is acknowledgeable regardless of severity (mirrors P2P's
  // MetadataTab, where Acknowledge is exactly how a mandatory-field mismatch
  // gets unblocked) — so "blocking" means any MANDATORY finding still
  // neither resolved nor acknowledged, same set the backend's
  // has_open_issues() gate checks (non-mandatory mismatches, e.g. tax_rate,
  // are informational only and never require acknowledgement to proceed).
  const blockingCount = findings.filter(
    (f) =>
      f.mandatory &&
      // Mandatory but rule-satisfied (e.g. within the Total Amount Before VAT
      // tolerance) — must match the backend's has_open_issues exactly, or the
      // button and the gate disagree.
      !f.satisfied &&
      !run.acknowledged_findings.includes(f.finding_id) &&
      !run.system_acknowledged_findings.includes(f.finding_id) &&
      !isFindingResolved(f, run.extracted)
  ).length;
  // The table always shows the fixed core cross-validation checklist
  // (Vendor Name, Bank Details, Store Location, Billing/Service Period, and
  // the four key amounts — see field_mapping.CORE_CROSS_VALIDATION_FIELDS),
  // matched or not. The backend synthesizes a row for any checklist field
  // the fixture didn't already flag as a mismatch, so a field that simply
  // matches still shows up here (rendered as an ordinary matched row).
  // Non-checklist findings (e.g. tax_rate) drop out of this table entirely.
  // Bank Details is on the checklist (`core`) but explicitly non-mandatory
  // (`mandatory`), so this filters on `core`, not `mandatory`.
  // Total Amount Before VAT is a normal table row; the variance bar below shows
  // only its variance and the tolerance (configured in admin Workflow Settings).
  const totalBeforeVatFinding = findings.find((f) => f.field === "total_amount_before_vat") ?? null;
  // Escalation only makes sense once the Total Amount Before VAT match can't be
  // satisfied — i.e. the invoice is outside tolerance (or there's no reference
  // amount to compare against at all). Until then the button stays inactive.
  const totalBeforeVatUnsatisfied = Boolean(totalBeforeVatFinding && !totalBeforeVatFinding.satisfied);
  // A metered/billed-on-actuals charge (Electricity/Water) is compared against a
  // supporting document, never a contract figure. Derived from the charge type
  // rather than from expected_source, so the label is still correct when no
  // supporting document has been attached yet (PAKUWON's utility invoices).
  const isBilledOnActuals = (run.extracted.line_items ?? []).some(
    (li) => li.charge_type === "utility_electricity" || li.charge_type === "utility_water"
  );
  const referenceLabel = isBilledOnActuals ? "Supporting Doc" : "Contract";
  // When one invoice's reference is a set of Faktur Pajak (KARYA_NASTARI
  // invoice_3), each is linked individually rather than as one document.
  const fpDocs = run.faktur_pajak_documents ?? [];
  const displayFindings = findings.filter((f) => f.core);
  const hasContract = !!run.contract_id;
  // Traces the current contract selection back to the AI's pick — reverting
  // once a human picks a different contract from the dropdown, same property
  // as P2P's AI-filled PO number losing its styling on manual override.
  const showAiBanner =
    !isTerminal &&
    recommendation?.status === "applied" &&
    recommendation.recommended?.contract_id === run.contract_id;

  // Mirrors P2P's own header exactly: once nothing is left "in review" it
  // shows a single plain "Next" button — no colored badge/pill at all. There
  // being no P2P state to mirror for "rejected" (P2P navigates straight back
  // to the dashboard on reject, it never lingers on this page), that's the
  // one case DirectPay still needs its own static indicator for.
  const actionButtons = isRejected ? (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
      style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5" }}
    >
      Rejected
    </span>
  ) : isTerminal ? (
    <AntButton type="primary" onClick={() => router.push(`/directpay/invoice/${id}/bill-posting`)}>
      Next
    </AntButton>
  ) : (
    <Space>
      {/* Placeholder — intentionally does nothing yet. Inactive by default,
          becoming active only when the Total Amount Before VAT match isn't
          satisfied, since emailing an escalation is only meaningful once this
          invoice genuinely can't clear Matching on its own. */}
      <AntButton
        onClick={() => setEscalateOpen(true)}
        disabled={busy || !totalBeforeVatUnsatisfied}
        title={
          totalBeforeVatUnsatisfied
            ? "Escalate this invoice by email (not yet wired up)"
            : "Available only when the Total Amount Before VAT match can't be satisfied"
        }
      >
        Escalate
      </AntButton>
      <AntButton danger onClick={() => setRejectOpen(true)} disabled={busy}>
        Reject
      </AntButton>
      <AntButton
        type="primary"
        onClick={() => submitAction("approve")}
        loading={busy}
        disabled={busy || !hasContract || blockingCount > 0}
        title={blockingCount > 0 ? "Fix the value or acknowledge each mismatch before proceeding" : undefined}
      >
        Approve
      </AntButton>
    </Space>
  );

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white" style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {busy && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(255,255,255,0.85)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
          }}
        >
          <svg className="animate-spin" width="40" height="40" viewBox="0 0 1024 1024" style={{ color: "#1876FF" }}>
            <path
              fill="currentColor"
              d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 0 0-94.3-139.9 437.71 437.71 0 0 0-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"
            />
          </svg>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#101828" }}>{busyLabel}</p>
        </div>
      )}

      <ComponentHeaderAntd
        title="Matching"
        onBack={() =>
          router.push(
            run.has_faktur_pajak
              ? `/directpay/invoice/${id}/fp-extraction`
              : `/directpay/invoice/${id}/review`
          )
        }
        metaItems={metaItems}
        right={actionButtons}
      />

      {/* Sits where P2P's Metadata/Line Items tab bar would go — DirectPay only
          has one comparison view, so this bar holds the Contract picker instead. */}
      <div
        className="flex items-center justify-end gap-2"
        style={{ padding: "10px 24px", borderBottom: "1px solid #E6E6E6", background: "#ffffff" }}
      >
        <span className="text-xs font-medium text-gray-500">Contract</span>
        <AntSelect
          value={run.contract_id ?? undefined}
          placeholder="Select a contract…"
          style={{ width: 280 }}
          size="small"
          showSearch
          disabled={isTerminal}
          optionFilterProp="label"
          onChange={(v) => handleContractChange(v)}
          options={contracts.map((c) => ({
            value: c.id,
            label: `${c.fields.vendor_name ?? c.file_name} — ${c.fields.contract_type ?? ""}`,
          }))}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {showAiBanner && recommendation && <AiContractBanner rec={recommendation} />}

          {isRejected ? (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 8, marginBottom: 16,
                background: "#FEF2F2", border: "1px dashed #FCA5A5", color: "#B91C1C", fontSize: 14,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 7v6M12 16v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span>
                <strong>Rejected</strong> — decision recorded, this invoice is final.
              </span>
            </div>
          ) : !hasContract ? (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 8, marginBottom: 16,
                background: "#FFFBEB", border: "1px dashed #FCD34D", color: "#92400E", fontSize: 14,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 7v6M12 16v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span><strong>No contract matched yet.</strong> Pick one from the Contract dropdown above to run the comparison.</span>
            </div>
          ) : (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 8, marginBottom: 16,
                background: blockingCount === 0 ? "#F0FDF4" : "#FEF2F2",
                border: `1px dashed ${blockingCount === 0 ? "#86EFAC" : "#FCA5A5"}`,
                color: blockingCount === 0 ? "#15803D" : "#B91C1C", fontSize: 14,
              }}
            >
              {blockingCount === 0 ? (
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
              {blockingCount === 0 ? (
                <><strong>All fields are complete.</strong> You&apos;re good to go!</>
              ) : (
                <span>
                  <strong>
                    {blockingCount} field{blockingCount === 1 ? "" : "s"} need{blockingCount === 1 ? "s" : ""} attention.
                  </strong>{" "}
                  Fix the value or acknowledge each mismatch before proceeding.
                </span>
              )}
            </div>
          )}

          <MatchingTable
            findings={displayFindings}
            // Only a genuine INDEPENDENT supporting document is linked here.
            // Faktur Pajak are deliberately NOT offered as a match source: an
            // FP is derived from the vendor's own billing, so it validates
            // nothing. (fpDocs stays available for viewing, just not as a
            // supporting document.)
            referenceDocs={
              run.has_supporting_document_pdf
                ? [{ label: "Supporting Doc", onOpen: () => setSupportingDocOpen(true) }]
                : undefined
            }
            acknowledgedFindings={run.acknowledged_findings}
            systemAcknowledgedFindings={run.system_acknowledged_findings}
            extracted={run.extracted}
            readonly={isTerminal}
            onToggleAcknowledge={handleToggleAcknowledge}
          />
        </div>
      </div>

      {hasContract && !isRejected && totalBeforeVatFinding && (
        <TotalBeforeVatVarianceBar
          invoiceValue={typeof totalBeforeVatFinding.found_value === "number" ? totalBeforeVatFinding.found_value : null}
          referenceValue={typeof totalBeforeVatFinding.expected_value === "number" ? totalBeforeVatFinding.expected_value : null}
          thresholdEnabled={threshold.enabled}
          thresholdPct={threshold.threshold_pct}
          currency={run.extracted.currency}
          blocking={Boolean(totalBeforeVatFinding.mandatory) && !totalBeforeVatFinding.satisfied}
        />
      )}

      {fpDocIndex !== null && (
        <DocumentPreviewModal
          open
          onClose={() => setFpDocIndex(null)}
          title={fpDocs.find((d) => d.index === fpDocIndex)?.label ?? "Faktur Pajak"}
          pdfUrl={directpayService.fakturPajakDocumentPdfUrl(run.id, fpDocIndex)}
          authToken={pdfToken}
        />
      )}

      {run.has_supporting_document_pdf && (
        <DocumentPreviewModal
          open={supportingDocOpen}
          onClose={() => setSupportingDocOpen(false)}
          title="Supporting Document"
          pdfUrl={directpayService.supportingDocumentPdfUrl(run.id)}
          authToken={pdfToken}
        />
      )}

      {totalBeforeVatFinding && (
        <EscalateModal
          open={escalateOpen}
          onClose={() => setEscalateOpen(false)}
          onSend={() => setEscalateOpen(false)}
          invoiceNumber={run.extracted.invoice_number}
          vendorName={run.extracted.vendor_name}
          invoiceAmount={totalBeforeVatFinding.found}
          referenceAmount={totalBeforeVatFinding.expected}
          referenceLabel={referenceLabel}
          reason={totalBeforeVatFinding.detail}
          thresholdEnabled={threshold.enabled}
          thresholdPct={threshold.threshold_pct}
        />
      )}

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        stage="matching"
      />

      <DocumentPreviewModal
        open={invoicePdfOpen}
        onClose={() => setInvoicePdfOpen(false)}
        title={run.extracted.invoice_number ? `Invoice ${run.extracted.invoice_number}` : "Invoice Preview"}
        pdfUrl={directpayService.invoicePdfUrl(run.id)}
        authToken={pdfToken}
      />
      {run.contract_id && (
        <DocumentPreviewModal
          open={contractPdfOpen}
          onClose={() => setContractPdfOpen(false)}
          title={run.extracted.vendor_name ? `Contract — ${run.extracted.vendor_name}` : "Contract Preview"}
          pdfUrl={directpayService.contractPdfUrl(run.contract_id)}
          authToken={pdfToken}
        />
      )}
      <ContractExtractionModal
        open={contractExtractionOpen}
        onClose={() => setContractExtractionOpen(false)}
        contractId={run.contract_id}
      />
    </div>
  );
}

export default withAuthGuard(InvoiceMatchPage);
