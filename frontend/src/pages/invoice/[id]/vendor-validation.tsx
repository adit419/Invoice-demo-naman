// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED — vendor_validation has been removed from the forward pipeline.
// After extraction, the flow now jumps straight to metadata-validation, and
// the fields previously shown here (vendor_name, vendor_vat_id, vendor_address,
// vendor_bank_*) are merged into the Metadata tab of the matching page.
//
// This file is kept on disk so:
//   • previously-uploaded invoices that are mid-flight at vendor_validation
//     can still finish via direct URL, and
//   • we can re-introduce the stage without re-writing the screen.
// No router/menu entry points to it any more.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";
import { RejectModal } from "@/components/RejectModal";
import { StageTransitionOverlay } from "@/components/StageTransitionOverlay";
import { Button, Spinner } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { usePipelineCompleted } from "@/hooks/usePipelineCompleted";
import { useAsyncData } from "@/hooks/useAsyncData";
import { ApiError, stagesService } from "@/services";
import { useToast } from "@/components/ui";
import { formatDate, formatValue } from "@/utils/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldValue {
  document_id: string;
  value: string | number | null;
}

interface ValidationField {
  field_name: string;
  display_name: string;
  type: string;
  required: boolean;
  match_status: "match" | "mismatch";
  values: {
    invoice: FieldValue[];
    po: FieldValue[];
  };
  is_acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

interface ValidationSummary {
  total_fields: number;
  matched: number;
  mismatched: number;
  match_percentage: number;
  validation_result: "pass" | "fail";
  document_types: string[];
}

interface VendorValidationData {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  po_number: string | null;
  file_name: string;
  fixture_key: string;
  status: string;
  fields: ValidationField[];
  summary: ValidationSummary;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function BreadcrumbPill({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-text-caption">{children}</span>;
}

function Sep() {
  return <span className="text-text-placeholder text-xs mx-1">|</span>;
}

// ── Swap button ───────────────────────────────────────────────────────────────

function getInvoiceCellBg(invoiceVal: string, matchStatus: string): string {
  if (!invoiceVal || invoiceVal === "-") return "rgb(254, 243, 199)";
  if (matchStatus === "mismatch") return "#fee2e2";
  return "transparent";
}

function SwapButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center justify-center rounded border transition-colors shrink-0"
      style={{
        width: 22, height: 22,
        border: "1px solid #cbd5e1",
        background: "#f4f6f9",
        color: "#64748b",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.color = "#2563eb";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#3b82f6";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#cbd5e1";
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 4h8M2 4l2-2M2 4l2 2M10 8H2M10 8l-2-2M10 8l-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function VendorValidationPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const isCompleted = usePipelineCompleted(id);

  const [confirming, setConfirming] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  // Fields where user clicked swap: field_name → true (using PO value)
  const [poOverrides, setPoOverrides] = useState<Record<string, boolean>>({});

  const { data, loading } = useAsyncData<VendorValidationData>(
    useCallback(
      () =>
        id ? stagesService.get<VendorValidationData>(id, "vendor_validation") : null,
      [id],
    ),
    useCallback(
      () => toast("Failed to load vendor validation data", "error"),
      [toast],
    ),
  );

  const handleConfirm = async () => {
    if (!id || !data) return;
    if (data.status === "approved" || data.status === "completed") {
      // Matching page is the new home for metadata validation.
      router.push(`/invoice/${id}/matching?tab=metadata`);
      return;
    }
    setConfirming(true);
    try {
      // Back-populate any PO overrides to extraction stage
      const overriddenFields = data.fields.filter(f => poOverrides[f.field_name]);
      if (overriddenFields.length > 0) {
        const metadata_edits = overriddenFields.map(f => ({
          field: f.field_name,
          value: formatValue(f.values.po?.[0]?.value),
        }));
        await stagesService.editExtraction(id, { metadata_edits });
      }

      const res = await stagesService.approve(id, "vendor_validation", {});
      setTransitioning(true);
      setTimeout(() => router.push(res.redirect), 2500);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Approval failed", "error");
      setConfirming(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!id) return;
    await stagesService.reject(id, "vendor_validation", reason);
    toast("Invoice rejected", "error");
    setRejectOpen(false);
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <p className="text-text-caption">Invoice not found.</p>
      </div>
    );
  }

  if (transitioning) {
    return (
      <StageTransitionOverlay
        title="Retrieving PO/GRN data for 3-way matching."
        subtitle="This may take a few minutes. Please keep this page open."
        steps={[
          { label: "Extracting data from document", status: "done" },
          { label: "Validating vendor information", status: "done" },
          { label: "Retrieving PO/GRN data for 3-way matching", status: "active" },
        ]}
      />
    );
  }

  // Banner shows pass if all MANDATORY fields match (non-mandatory mismatches are acceptable)
  const hasMandatoryMismatches = data.fields.some(
    f => f.required && f.match_status === "mismatch" && !poOverrides[f.field_name]
  );

  return (
    <div className="flex flex-col h-screen bg-surface-page overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-surface-card-1 border-b border-border-default px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="text-text-caption hover:text-text-body transition-colors shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L6 8l4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-text-heading leading-tight">Vendor Validation</h1>
              <div className="flex items-center mt-0.5 flex-wrap">
                <BreadcrumbPill>Manual Upload</BreadcrumbPill>
                {data.invoice_number && <><Sep /><BreadcrumbPill>{data.invoice_number}</BreadcrumbPill></>}
                {data.vendor_name && <><Sep /><BreadcrumbPill>{data.vendor_name}</BreadcrumbPill></>}
                {data.invoice_date && <><Sep /><BreadcrumbPill>{formatDate(data.invoice_date)}</BreadcrumbPill></>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {isCompleted ? (
              <Button variant="primary" size="sm" onClick={handleConfirm}>
                Next
              </Button>
            ) : (
              <>
                <Button variant="danger" size="sm" onClick={() => setRejectOpen(true)} disabled={confirming}>
                  Reject
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirm}
                  loading={confirming}
                  disabled={!canEdit}
                >
                  Next
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-5">

          {/* Mandatory fields banner */}
          <div
            className="px-4 py-3 rounded-lg flex items-center gap-2 text-sm"
            style={
              hasMandatoryMismatches
                ? { background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", color: "#f87171" }
                : { background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", color: "#34d399" }
            }
          >
            {hasMandatoryMismatches ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 5v3.5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5 8l2.5 2.5L11 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span className="font-medium">
              {hasMandatoryMismatches
                ? "Mandatory field mismatch detected. Review before approving."
                : "All mandatory fields are complete. You're good to go!"}
            </span>
          </div>

          {/* Comparison table */}
          <div className="bg-surface-card-1 rounded-xl border border-border-default overflow-hidden">
            <div className="px-5 py-3 border-b border-border-default bg-surface-card-2 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="#64748b" strokeWidth="1.2" />
                <path d="M7 6v4M7 4.5v.5" stroke="#64748b" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span className="text-xs text-text-caption">
                Click <span className="font-medium text-text-body">⇄</span> on mismatched fields to copy PO value to the invoice.
              </span>
            </div>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "#64748b", borderBottom: "1px solid #e2e8f0", width: "26%" }}>
                    Field
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: "#64748b", borderBottom: "1px solid #e2e8f0", width: "37%" }}>
                    Extracted from Invoice
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: "#64748b", borderBottom: "1px solid #e2e8f0", width: "37%" }}>
                    PO Data
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.fields.map((field) => {
                  const rawInvoiceVal = formatValue(field.values.invoice?.[0]?.value);
                  const poVal = formatValue(field.values.po?.[0]?.value);
                  const usingPo = !!poOverrides[field.field_name];
                  const invoiceVal = usingPo ? poVal : rawInvoiceVal;
                  const matchStatus = usingPo ? "match" : field.match_status;
                  const isMandatory = field.required;
                  const showSwap = matchStatus !== "match" && poVal !== "-" && canEdit && !isCompleted;
                  const cellBg = usingPo ? "transparent" : getInvoiceCellBg(invoiceVal, matchStatus);

                  return (
                    <tr
                      key={field.field_name}
                      style={{ borderBottom: "1px solid #f0f2f5" }}
                    >
                      <td className="px-5 py-3 align-top">
                        <span className="font-medium" style={{ color: "#475569", fontSize: 13 }}>
                          {field.display_name}
                        </span>
                        {isMandatory && (
                          <span className="ml-1 text-xs" style={{ color: "#ef4444" }}>*</span>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <div
                          className="flex items-center gap-2 px-2 py-1.5 rounded"
                          style={{ background: cellBg }}
                        >
                          <span
                            style={{
                              color: invoiceVal === "-" ? "#94a3b8" : usingPo ? "#2563eb" : "#1e293b",
                              fontSize: 13,
                              wordBreak: "break-word",
                              fontStyle: usingPo ? "italic" : undefined,
                              flex: 1,
                            }}
                          >
                            {invoiceVal}
                          </span>
                          {usingPo && (
                            <span className="text-[10px] shrink-0" style={{ color: "#2563eb" }}>from PO</span>
                          )}
                          {showSwap && (
                            <SwapButton
                              onClick={() => setPoOverrides(prev => ({ ...prev, [field.field_name]: true }))}
                              title={`Copy from PO: "${poVal}"`}
                            />
                          )}
                          {usingPo && (
                            <button
                              type="button"
                              onClick={() => setPoOverrides(prev => ({ ...prev, [field.field_name]: false }))}
                              title="Revert to original value"
                              className="text-[10px] shrink-0 underline"
                              style={{ color: "#64748b" }}
                            >
                              revert
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          style={{
                            color: poVal === "-" ? "#94a3b8" : "#1e293b",
                            fontSize: 13,
                            wordBreak: "break-word",
                          }}
                        >
                          {poVal}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {data.fields.length === 0 && (
              <div className="flex items-center justify-center h-32 text-sm" style={{ color: "#64748b" }}>
                No validation data available.
              </div>
            )}
          </div>
        </div>
      </div>

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        stage="vendor_validation"
      />
    </div>
  );
}

export default withAuthGuard(VendorValidationPage);
