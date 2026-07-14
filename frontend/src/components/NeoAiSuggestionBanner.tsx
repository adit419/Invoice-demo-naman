/**
 * "Neo AI has filled in some suggestions" banner + sparkle icon, per the
 * P2P-Flow Figma design (AI Suggestion frame): #F7FAFF surface with a
 * #CFE2FF border, #0D388D title, #477DEA subtext, and a blue-gradient
 * four-point sparkle. AI-filled values render inline in the metadata table
 * (sparkle + italic #1F5BD5) — there are no accept/reject controls; the user
 * overrides a suggestion by editing the field directly.
 */

export function AiSparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="ai-sparkle-grad" x1="2" y1="2" x2="14" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7CC1FF" />
          <stop offset="1" stopColor="#3B5BFF" />
        </linearGradient>
      </defs>
      <path
        d="M8 1.5c.5 2.7 1.6 3.9 4.5 4.5-2.9.6-4 1.8-4.5 4.5C7.5 7.8 6.4 6.6 3.5 6c2.9-.6 4-1.8 4.5-4.5Z"
        fill="url(#ai-sparkle-grad)"
      />
      <path
        d="M12.4 9.4c.25 1.4.8 2 2.3 2.3-1.5.3-2.05.9-2.3 2.3-.25-1.4-.8-2-2.3-2.3 1.5-.3 2.05-.9 2.3-2.3Z"
        fill="url(#ai-sparkle-grad)"
      />
    </svg>
  );
}

/** Text treatment for an AI-filled value, per the Figma design. */
export const AI_VALUE_STYLE = {
  color: "#1F5BD5",
  fontStyle: "italic" as const,
};

export default function NeoAiSuggestionBanner() {
  return (
    <div
      className="flex items-center gap-3"
      style={{
        background: "#F7FAFF",
        border: "1px solid #CFE2FF",
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 12,
      }}
    >
      <span
        className="flex items-center justify-center shrink-0"
        style={{ width: 34, height: 34, borderRadius: "50%", background: "#ffffff" }}
      >
        <AiSparkleIcon size={18} />
      </span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0D388D", lineHeight: "18px" }}>
          Neo AI has filled in some suggestions.
        </div>
        <div style={{ fontSize: 12, color: "#477DEA", lineHeight: "16px", marginTop: 2 }}>
          Review before confirming
        </div>
      </div>
    </div>
  );
}
