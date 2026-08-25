/**
 * DirectPay's top-centre notice — the popup shown when an upload is refused.
 *
 * Not the shared ui/Toast: that one is styled from the platform's semantic
 * tokens (solid `surface-warning` fill, `text-on-color` label) and sits
 * bottom-right, which reads as a heavy coloured block against DirectPay's white,
 * Ant-flavoured screens. This matches the visual language the DP lists already
 * use — the tinted-surface / coloured-border / coloured-text triplet from
 * dpTableUi's ANTD_TAG, Inter, 6px radii, inline styles — so a refused upload
 * looks like part of the same product as the Status pills beside it.
 *
 * Placement is top-centre because the dashboard underneath is UNCHANGED when an
 * upload is refused: no new row appears, nothing moves, so a message tucked into
 * a corner is easy to miss entirely and the user is left thinking the click did
 * nothing.
 */
import { useEffect } from "react";

export type DpNoticeTone = "warning" | "error" | "success";

export interface DpNoticeState {
  tone: DpNoticeTone;
  title: string;
  /** The specifics — which file, and why. Optional: some notices are one line. */
  detail?: string;
}

// Same construction as ANTD_TAG (tinted surface, mid border, dark text), in the
// two tones a notice needs. Kept here rather than added to ANTD_TAG so the stage
// palette stays exactly the set of stage colours.
const TONES: Record<DpNoticeTone, { bg: string; border: string; fg: string; icon: string }> = {
  warning: { bg: "#FFFBE6", border: "#FFE58F", fg: "#D48806", icon: "!" },
  error: { bg: "#FFF1F0", border: "#FFA39E", fg: "#CF1322", icon: "✕" },
  success: { bg: "#F6FFED", border: "#B7EB8F", fg: "#389E0D", icon: "✓" },
};

const AUTO_DISMISS_MS = 6000;

export function DpNotice({ notice, onClose }: { notice: DpNoticeState | null; onClose: () => void }) {
  // Re-armed per notice (the key is title+detail), so a second refused upload
  // gets its own full dwell rather than inheriting the tail of the first one's.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [notice, onClose]);

  if (!notice) return null;
  const tone = TONES[notice.tone];

  return (
    // Centring lives on the wrapper, not the card: the card's entrance animates
    // translateY, and a transform on the card itself (translateX(-50%)) would be
    // replaced by the keyframe's rather than combined with it, throwing it off
    // to the left for the duration. pointer-events: none so the full-width strip
    // can't intercept clicks on the header beneath it.
    <div
      style={{
        position: "fixed", top: 20, left: 0, right: 0, zIndex: 9999,
        display: "flex", justifyContent: "center", pointerEvents: "none",
      }}
    >
    <div
      role="alert"
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, pointerEvents: "auto",
        minWidth: 380, maxWidth: "min(560px, calc(100vw - 48px))",
        padding: "12px 14px", borderRadius: 6,
        background: tone.bg, border: `1px solid ${tone.border}`,
        boxShadow: "0 6px 16px rgba(0,0,0,0.08), 0 3px 6px rgba(0,0,0,0.06)",
        fontFamily: "Inter, sans-serif",
        animation: "slide-down 160ms ease-out",
      }}
    >
      <span
        aria-hidden
        style={{
          flex: "0 0 auto", width: 18, height: 18, marginTop: 1, borderRadius: "50%",
          background: tone.fg, color: "#ffffff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, lineHeight: 1,
        }}
      >
        {tone.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: tone.fg, lineHeight: "20px" }}>
          {notice.title}
        </div>
        {notice.detail && (
          // Neutral grey, not the tone colour: the tone is already carried by the
          // title, icon and border, and repeating it makes the specifics — the
          // file name, the part worth reading — harder to read, not easier.
          <div style={{ fontSize: 13, color: "#595959", lineHeight: "20px", marginTop: 2, wordBreak: "break-word" }}>
            {notice.detail}
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        style={{
          flex: "0 0 auto", background: "none", border: "none", cursor: "pointer",
          color: "#8C8C8C", fontSize: 14, lineHeight: 1, padding: "2px 0 0 4px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        ✕
      </button>
    </div>
    </div>
  );
}
