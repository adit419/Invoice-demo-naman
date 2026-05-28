// Stage navigation strip — clickable pill row showing all visible stages for an
// invoice. Pills are clickable when the stage has been approved/completed (or is
// the current stage), grayed out otherwise. Designed for inline embedding at the
// top of any stage page (review / matching / bill-posting).
import { useEffect, useState } from "react";
import Link from "next/link";
import { stagesService } from "@/services";
import type { StageStatus } from "@/services";

// Re-exported for callers that imported it from this module.
export type { StageStatus };

interface StageNavStripProps {
  invoiceId: string;
  /** Which stage this page represents. For Matching, distinguish by sub-slug. */
  currentSlug: "extraction" | "metadata_validation" | "line_item_matching" | "bill_posting";
}

// Map backend stage slug → FE route path (relative to /invoice/{id}).
const SLUG_TO_ROUTE: Record<string, string> = {
  extraction: "review",
  metadata_validation: "matching?tab=metadata",
  line_item_matching: "matching?tab=line_items",
  bill_posting: "bill-posting",
};

export function StageNavStrip({ invoiceId, currentSlug }: StageNavStripProps) {
  const [stages, setStages] = useState<StageStatus[]>([]);

  useEffect(() => {
    if (!invoiceId) return;
    stagesService.status(invoiceId)
      .then(res => setStages(res.stages ?? []))
      .catch(() => setStages([]));
  }, [invoiceId]);

  if (stages.length === 0) return null;

  return (
    <div
      className="shrink-0 flex items-center gap-1 px-6 py-2"
      style={{
        borderBottom: "1px solid #E5E7EB",
        background: "#FAFBFC",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {stages.map((s, i) => {
        // `approved` = user has approved this stage but the pipeline is still
        //              running (intermediate state).
        // `completed` = the last stage finished, so all upstream approved stages
        //               get cascade-promoted to `completed` (final / locked).
        const isApproved = s.status === "approved";
        const isCompleted = s.status === "completed";
        const isVisited = isApproved || isCompleted;
        const isCurrent = s.slug === currentSlug;
        const isRejected = s.status === "rejected";
        const isClickable = (isVisited || isCurrent) && !isRejected;
        const route = SLUG_TO_ROUTE[s.slug];
        const dest = route ? `/invoice/${invoiceId}/${route}` : null;

        // Visual tone — approved vs completed share the "green" family but
        // completed (final) is muted/darker so users can tell the run is locked.
        const tone: { bg: string; color: string; border: string; dot: string; suffix?: string } =
          isCurrent
            ? { bg: "#E6F4FF", color: "#0958D9", border: "#91CAFF", dot: "#1876FF" }
            : isCompleted
              ? { bg: "#E0F2E5", color: "#166534", border: "#86EFAC", dot: "#15803D", suffix: "Confirmed" }
              : isApproved
                ? { bg: "#F6FFED", color: "#389E0D", border: "#B7EB8F", dot: "#22C55E", suffix: "Approved" }
                : isRejected
                  ? { bg: "#FFF1F0", color: "#CF1322", border: "#FFA39E", dot: "#CF1322" }
                  : { bg: "#F3F4F6", color: "#9CA3AF", border: "#E5E7EB", dot: "#D1D5DB" };

        const pill = (
          <span
            title={tone.suffix ? `${s.display_name} — ${tone.suffix}` : s.display_name}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 9999,
              fontSize: 12, fontWeight: 500, lineHeight: "18px",
              color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`,
              cursor: isClickable && !isCurrent && dest ? "pointer" : "default",
              opacity: isClickable ? 1 : 0.7,
              whiteSpace: "nowrap",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => {
              if (isClickable && !isCurrent) {
                (e.currentTarget as HTMLElement).style.background = isVisited ? "#DCFCE7" : "#DBEAFE";
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = tone.bg;
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone.dot, flexShrink: 0 }} />
            {s.display_name}
            {tone.suffix && (
              <span
                style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
                  textTransform: "uppercase",
                  padding: "0 6px",
                  borderRadius: 9999,
                  // Slightly stronger contrast on the chip itself
                  background: isCompleted ? "#BBF7D0" : "#DCFCE7",
                  color: isCompleted ? "#14532D" : "#166534",
                  flexShrink: 0,
                }}
              >
                {tone.suffix}
              </span>
            )}
          </span>
        );

        return (
          <div key={s.slug} className="flex items-center gap-1">
            {isClickable && !isCurrent && dest ? (
              <Link href={dest} legacyBehavior>{pill}</Link>
            ) : (
              pill
            )}
            {i < stages.length - 1 && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "#D1D5DB" }}>
                <path d="M4 2.5L7.5 6 4 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
