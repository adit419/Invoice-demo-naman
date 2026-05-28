import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";
import { Button, Spinner } from "@/components/ui";
import { invoicesService } from "@/services";
import { useToast } from "@/components/ui";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDateTime } from "@/utils/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimelineEntry {
  slug: string;
  display_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}

interface RejectionInfo {
  reason: string;
  stage: string;
  stage_display: string;
  actor_name: string;
  actor_role: string;
  rejected_at: string | null;
}

interface RejectedData {
  invoice_number: string | null;
  vendor_name: string | null;
  file_name: string;
  status: string;
  rejection: RejectionInfo;
  timeline: TimelineEntry[];
}

// ── Timeline stepper ──────────────────────────────────────────────────────────

function TimelineStepper({ timeline }: { timeline: TimelineEntry[] }) {
  const statusColor = (status: string) => {
    if (status === "completed" || status === "approved") return "#34d399";
    if (status === "active" || status === "in_progress") return "#fbbf24";
    if (status === "rejected") return "#f87171";
    return "rgba(255,255,255,0.2)";
  };

  return (
    <div className="flex flex-col">
      {timeline.map((entry, i) => {
        const color = statusColor(entry.status);
        const isLast = i === timeline.length - 1;
        return (
          <div key={entry.slug} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                style={{ background: color, border: `2px solid ${color}` }}
              />
              {!isLast && (
                <div className="w-0.5 flex-1 my-1" style={{ background: "rgba(255,255,255,0.08)", minHeight: 20 }} />
              )}
            </div>
            <div className="pb-4 min-w-0">
              <span className="text-sm font-semibold" style={{ color: "#f1f5f9" }}>{entry.display_name}</span>
              {(entry.completed_at || entry.started_at) && (
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  {formatDateTime(entry.completed_at ?? entry.started_at)}
                </p>
              )}
              {entry.status === "rejected" && (
                <span
                  className="inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
                >
                  Rejected here
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function RejectedPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const { toast } = useToast();

  const { data, loading } = useAsyncData<RejectedData>(
    useCallback(
      () => (id ? invoicesService.rejected<RejectedData>(id) : null),
      [id],
    ),
    useCallback(
      () => toast("Failed to load rejection data", "error"),
      [toast],
    ),
  );

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

  const rej = data.rejection;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080c18" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 border-b px-6 py-3"
        style={{ background: "#0a0e1a", borderColor: "rgba(239,68,68,0.15)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="hover:opacity-70 transition-opacity shrink-0" style={{ color: "#64748b" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L6 8l4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold" style={{ color: "#f1f5f9" }}>Rejected Invoice</h1>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#64748b" }}
                >
                  View Only
                </span>
              </div>
              <div className="flex items-center mt-0.5 gap-1.5 flex-wrap text-xs" style={{ color: "#64748b" }}>
                {data.invoice_number && <span>{data.invoice_number}</span>}
                {data.vendor_name && <><span>|</span><span>{data.vendor_name}</span></>}
              </div>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: "#dc2626", color: "#fff" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="#fff" strokeWidth="1.4" />
              <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Rejected
          </span>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">

        {/* Rejection reason banner */}
        <div
          className="rounded-xl px-5 py-4 mb-6 flex gap-4"
          style={{ background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.25)" }}
        >
          <div className="shrink-0 mt-0.5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" fill="#ef4444" />
              <path d="M7 7l6 6M13 7l-6 6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-sm font-semibold" style={{ color: "#fca5a5" }}>Invoice Rejection Reason</span>
            <p className="text-sm" style={{ color: "#f87171" }}>{rej.reason}</p>
            <div className="flex flex-wrap gap-3 mt-1 text-xs" style={{ color: "rgba(248,113,113,0.7)" }}>
              {rej.stage_display && (
                <span>Stage: <strong>{rej.stage_display}</strong></span>
              )}
              {rej.actor_name && (
                <span>By: <strong>{rej.actor_name}</strong>{rej.actor_role ? ` (${rej.actor_role})` : ""}</span>
              )}
              {rej.rejected_at && (
                <span>At: <strong>{formatDateTime(rej.rejected_at)}</strong></span>
              )}
            </div>
          </div>
        </div>

        {/* Two-column: left (invoice info), right (timeline) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: invoice summary card */}
          <div className="lg:col-span-2">
            <div className="rounded-xl overflow-hidden" style={{ background: "#0e1424", border: "1px solid rgba(239,68,68,0.15)" }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(239,68,68,0.1)" }}>
                <span className="text-sm font-semibold" style={{ color: "#f1f5f9" }}>Invoice Information</span>
              </div>
              <div className="px-5 py-5 grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-3">
                {[
                  { label: "Invoice Number", value: data.invoice_number },
                  { label: "Vendor", value: data.vendor_name },
                  { label: "File Name", value: data.file_name },
                  { label: "Current Status", value: "Rejected" },
                  { label: "Rejected Stage", value: rej.stage_display || "—" },
                  { label: "Rejected By", value: rej.actor_name || "—" },
                ].map(f => (
                  <div key={f.label} className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium" style={{ color: "#64748b" }}>{f.label}</span>
                    <span
                      className="text-sm font-medium"
                      style={{ color: f.label === "Current Status" ? "#f87171" : "#f1f5f9" }}
                    >
                      {f.value || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: timeline */}
          <div className="rounded-xl" style={{ background: "#0e1424", border: "1px solid rgba(239,68,68,0.15)" }}>
            <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "rgba(239,68,68,0.1)" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="#64748b" strokeWidth="1.3" />
                <path d="M8 5v3.5l2.5 1.5" stroke="#64748b" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-semibold" style={{ color: "#f1f5f9" }}>Processing Timeline</span>
            </div>
            <div className="px-5 py-5">
              {data.timeline.length > 0 ? (
                <TimelineStepper timeline={data.timeline} />
              ) : (
                <p className="text-sm" style={{ color: "#64748b" }}>No timeline data.</p>
              )}
            </div>
          </div>
        </div>

        {/* Return to Dashboard */}
        <div className="flex justify-center pt-8">
          <Link href="/dashboard">
            <Button variant="secondary" size="md">
              ← Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default withAuthGuard(RejectedPage);
