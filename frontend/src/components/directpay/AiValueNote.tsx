/**
 * Hover ⓘ explaining a value that Neo AI DERIVED rather than transcribed —
 * the same affordance P2P uses for an AI-filled metadata field (see
 * NeoAiSuggestionBanner.tsx's AiAnalysisInfo): same icon geometry, same white
 * card chrome, same viewport-clamped fixed positioning so it's never clipped by
 * a table's overflow container, and it flips above when there's no room below.
 *
 * Pair it with the value itself rendered in AI_VALUE_STYLE (sparkle + italic
 * #1F5BD5) — that combination is what signals "derived, not read off the page".
 */
import { useState } from "react";
import { AiSparkleIcon } from "@/components/directpay/AiContractBanner";

export function AiValueNote({ text, pill }: { text: string; pill?: string }) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const CARD_W = 300;
  // Only used to DECIDE whether to flip; a flipped card is anchored by `bottom`
  // so an imprecise estimate here can't misalign it.
  const CARD_H_ESTIMATE = 200;
  const show = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const left = Math.max(12, Math.min(r.right - CARD_W, window.innerWidth - CARD_W - 12));
    if (window.innerHeight - r.bottom < CARD_H_ESTIMATE) {
      setPos({ left, bottom: window.innerHeight - r.top + 8 });
    } else {
      setPos({ left, top: r.bottom + 8 });
    }
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
        aria-label="Why Neo AI derived this value"
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
            position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left,
            width: CARD_W, zIndex: 1000,
            background: "#ffffff", border: "1px solid #DFE5EE", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(16,24,40,0.12)", padding: "12px 14px",
            textAlign: "left", cursor: "default", fontFamily: "Inter, sans-serif",
          }}
        >
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
            <span className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: "#0D388D" }}>
              <AiSparkleIcon size={14} />
              Neo AI analysis
            </span>
            {pill && (
              <span
                style={{
                  fontSize: 11, fontWeight: 600, color: "#1F5BD5",
                  background: "#EDF3FF", border: "1px solid #CFE2FF",
                  borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap",
                }}
              >
                {pill}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "#585C65", lineHeight: "16px" }}>{text}</div>
        </div>
      )}
    </span>
  );
}
