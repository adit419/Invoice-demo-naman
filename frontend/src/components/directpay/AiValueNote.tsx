/**
 * Hover ⓘ explaining a value that Neo AI DERIVED rather than transcribed, and
 * the neutral `SourceNote` variant for a value that was simply read from a
 * known source document.
 *
 * Same card chrome as P2P's AiAnalysisInfo (NeoAiSuggestionBanner.tsx). Open
 * and close behaviour comes from useHoverCard, so the card stays open while the
 * pointer is over it and links inside it are clickable.
 */
import { AiSparkleIcon } from "@/components/directpay/AiContractBanner";
import { useHoverCard } from "@/components/directpay/useHoverCard";

export interface CardLink {
  label: string;
  onOpen: () => void;
}

function InfoIcon({ active, tint }: { active: boolean; tint: string }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18, borderRadius: "50%", cursor: "default",
        color: active ? tint : "#98A2B3",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M7 6.3v3.4M7 4.2h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function CardLinks({ heading, links }: { heading: string; links: CardLink[] }) {
  if (!links.length) return null;
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #EEF0F3" }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "#8D92A6", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
        {heading}
      </div>
      {links.map((l) => (
        <div key={l.label} style={{ marginTop: 2 }}>
          <button
            type="button"
            onClick={l.onOpen}
            style={{
              background: "none", border: "none", padding: 0, font: "inherit", textAlign: "left",
              fontSize: 11.5, color: "#1F5BD5", fontWeight: 600, textDecoration: "underline", cursor: "pointer",
            }}
          >
            {l.label}
          </button>
        </div>
      ))}
    </div>
  );
}

const CARD_STYLE: React.CSSProperties = {
  position: "fixed", zIndex: 1000,
  background: "#ffffff", border: "1px solid #DFE5EE", borderRadius: 8,
  boxShadow: "0 8px 24px rgba(16,24,40,0.12)", padding: "12px 14px",
  textAlign: "left", cursor: "default", fontFamily: "Inter, sans-serif",
};

/** For a value Neo AI derived (reasoned) rather than read off the document. */
export function AiValueNote({
  text, pill, links, linksHeading = "Source",
}: { text: string; pill?: string; links?: CardLink[]; linksHeading?: string }) {
  const { pos, width, triggerHandlers, cardHandlers } = useHoverCard({ estHeight: 210 });
  return (
    <span className="inline-flex items-center shrink-0" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <span aria-label="Why Neo AI derived this value" {...triggerHandlers}>
        <InfoIcon active={!!pos} tint="#1F5BD5" />
      </span>
      {pos && (
        <div style={{ ...CARD_STYLE, top: pos.top, bottom: pos.bottom, left: pos.left, width }} {...cardHandlers}>
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
          <CardLinks heading={linksHeading} links={links ?? []} />
        </div>
      )}
    </span>
  );
}

/**
 * Neutral variant: the value was simply READ from a known source, so it carries
 * no AI framing. Deliberately slate rather than the AI blue, so the two are
 * distinguishable at a glance.
 */
export function SourceNote({
  title, text, links, linksHeading = "Open source",
}: { title: string; text: string; links?: CardLink[]; linksHeading?: string }) {
  const { pos, width, triggerHandlers, cardHandlers } = useHoverCard({ estHeight: 200 });
  return (
    <span className="inline-flex items-center shrink-0" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <span aria-label="Where this value came from" {...triggerHandlers}>
        <InfoIcon active={!!pos} tint="#475467" />
      </span>
      {pos && (
        <div style={{ ...CARD_STYLE, top: pos.top, bottom: pos.bottom, left: pos.left, width }} {...cardHandlers}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: "#101828", marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M4 1.75h5L12.25 5v9.25H4V1.75Z" stroke="#475467" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M8.75 1.75V5h3.5M5.75 8.5h4.5M5.75 11h4.5" stroke="#475467" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {title}
          </div>
          <div style={{ fontSize: 11.5, color: "#585C65", lineHeight: "16px" }}>{text}</div>
          <CardLinks heading={linksHeading} links={links ?? []} />
        </div>
      )}
    </span>
  );
}
