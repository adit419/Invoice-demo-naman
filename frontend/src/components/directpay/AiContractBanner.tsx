/**
 * AI contract-recommendation banner + hover breakdown for DirectPay's
 * Matching screen — same visual language as NeoAiSuggestionBanner.tsx
 * (blue-tinted card, gradient sparkle, score pill, per-criterion breakdown)
 * but typed to DpContractCandidate instead of P2P's PoCandidate, kept
 * self-contained here rather than importing the P2P component directly.
 */
import { useState } from "react";
import type { DpContractCandidate, DpContractRecommendation } from "@/services/directpay";

export function AiSparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="dp-ai-sparkle-grad" x1="2" y1="2" x2="14" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7CC1FF" />
          <stop offset="1" stopColor="#3B5BFF" />
        </linearGradient>
      </defs>
      <path
        d="M8 1.5c.5 2.7 1.6 3.9 4.5 4.5-2.9.6-4 1.8-4.5 4.5C7.5 7.8 6.4 6.6 3.5 6c2.9-.6 4-1.8 4.5-4.5Z"
        fill="url(#dp-ai-sparkle-grad)"
      />
      <path
        d="M12.4 9.4c.25 1.4.8 2 2.3 2.3-1.5.3-2.05.9-2.3 2.3-.25-1.4-.8-2-2.3-2.3 1.5-.3 2.05-.9 2.3-2.3Z"
        fill="url(#dp-ai-sparkle-grad)"
      />
    </svg>
  );
}

export function AiAnalysisInfo({ rec }: { rec: DpContractRecommendation }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const c: DpContractCandidate | null | undefined = rec.recommended;
  if (!c) return null;

  const CARD_W = 300;
  const show = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,
      left: Math.max(12, Math.min(r.right - CARD_W, window.innerWidth - CARD_W - 12)),
    });
  };

  return (
    <span
      className="inline-flex items-center shrink-0"
      style={{ position: "relative" }}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        aria-label="Why AI recommended this contract"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, borderRadius: "50%", cursor: "default",
          color: pos ? "#1F5BD5" : "#8FADEA",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7 6.3v3.4M7 4.2h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>

      {pos && (
        <div
          style={{
            position: "fixed", top: pos.top, left: pos.left, width: CARD_W, zIndex: 1000,
            background: "#ffffff", border: "1px solid #DFE5EE", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(16,24,40,0.12)", padding: "12px 14px",
            textAlign: "left", cursor: "default",
          }}
        >
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
            <span className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: "#0D388D" }}>
              <AiSparkleIcon size={14} />
              AI analysis
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: "#1F5BD5",
              background: "#EDF3FF", border: "1px solid #CFE2FF",
              borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap",
            }}>
              {Math.round(c.score * 100)}% match
            </span>
          </div>

          <div style={{ fontSize: 11.5, color: "#585C65", lineHeight: "15px", marginBottom: 4 }}>
            Recommended <strong style={{ color: "#414651" }}>{c.file_name}</strong>
            {c.vendor_name ? <> — {c.vendor_name}</> : null}
          </div>

          <div style={{ fontSize: 11, color: "#8D92A6", lineHeight: "15px", marginBottom: 8 }}>
            Of the {rec.candidates_considered ?? 0} saved contract{(rec.candidates_considered ?? 0) === 1 ? "" : "s"} evaluated,
            AI recommends this one based on the criteria below.
          </div>

          <div className="flex flex-col" style={{ gap: 7 }}>
            {(c.breakdown ?? []).map((b) => (
              <div key={b.criterion}>
                <div className="flex items-center justify-between" style={{ fontSize: 11.5 }}>
                  <span style={{ color: "#414651", fontWeight: 500, textTransform: "capitalize" }}>
                    {b.criterion.replace(/_/g, " ")}
                  </span>
                  <span style={{
                    fontWeight: 600,
                    color: b.score >= 0.8 ? "#047857" : b.score >= 0.5 ? "#B45309" : "#B91C1C",
                  }}>
                    {Math.round(b.score * 100)}%
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: "#8D92A6", lineHeight: "14px" }}>{b.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

export default function AiContractBanner({ rec }: { rec: DpContractRecommendation }) {
  return (
    <div
      className="flex items-center gap-3"
      style={{
        background: "#F7FAFF",
        border: "1px solid #CFE2FF",
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 16,
      }}
    >
      <span
        className="flex items-center justify-center shrink-0"
        style={{ width: 34, height: 34, borderRadius: "50%", background: "#ffffff" }}
      >
        <AiSparkleIcon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0D388D", lineHeight: "18px" }}>
          AI matched this invoice to a contract.
        </div>
        <div style={{ fontSize: 12, color: "#477DEA", lineHeight: "16px", marginTop: 2 }}>
          Review the comparison below before accepting — pick a different contract above if this isn&apos;t right.
        </div>
      </div>
      <AiAnalysisInfo rec={rec} />
    </div>
  );
}
