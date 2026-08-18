/**
 * Total Amount Before VAT variance bar — the bottom bar of DirectPay's
 * Matching page, replacing that field's row in MatchingTable.
 *
 * Modelled on P2P's own line-item matching bar (components/matching/
 * LineItemsTab.tsx's ManualSelectionDrawer + VarianceCard): a flex-pinned
 * white footer with an upward shadow, and the same three-tier variance stat
 * card (green Balanced / amber Within Tolerance / red Exceeds Tolerance) with
 * P2P's identical palette and type scale.
 *
 * Beyond P2P it adds, because this bar has a whole footer to itself rather
 * than sharing one with a selection UI:
 *   - a state-coloured hairline along the top edge, so the verdict reads
 *     before any number does;
 *   - a centred composition with hairline-separated stat groups;
 *   - a tolerance-headroom track — how much of the allowed N% has been used —
 *     which is the one genuinely useful thing the plain numbers don't say.
 *
 * Two deliberate differences from P2P, both because this field's tolerance is
 * a PERCENTAGE and is ONE-SIDED (backend service.py checks
 * invoice <= reference * (1 + pct/100), i.e. only over-billing is policed):
 *   - tolerance renders as "N%" plus the resulting cap, not a flat allowance;
 *   - an invoice BELOW the reference isn't a problem, so it reads "Under
 *     reference" in the green tier rather than being flagged by magnitude the
 *     way P2P's symmetric card is.
 */
import { AiSparkleIcon } from "@/components/directpay/AiContractBanner";

export interface TotalBeforeVatVarianceBarProps {
  /** Raw invoice-side amount (finding.found_value). */
  invoiceValue: number | null;
  /** Raw reference amount — contract or supporting document (finding.expected_value). */
  referenceValue: number | null;
  /** Pre-formatted display strings from the backend, so the bar's numbers
   *  match every other surface exactly (currency symbol, 2dp, grouping). */
  invoiceFormatted?: string | null;
  referenceFormatted?: string | null;
  /** Where referenceValue came from — drives the "Supporting Doc" callout. */
  expectedSource?: "contract" | "supporting_document";
  /** Threshold config as saved (see TotalBeforeVatThresholdControl). */
  thresholdEnabled: boolean;
  thresholdPct: number;
  currency?: string | null;
  /** Whether this row is still blocking approval, per the backend finding. */
  blocking: boolean;
  /** Opens the supporting document — only offered when one exists. */
  onOpenSupportingDoc?: () => void;
  /** The live threshold control, rendered inline in this bar's header so the
   *  tolerance is adjusted where its effect is shown. Passed in rather than
   *  imported so this component stays presentational. */
  thresholdControl?: React.ReactNode;
}

function fmtAmount(v: number, currency?: string | null): string {
  const n = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}

const HAIRLINE = "#E9EAEC";

/** One label-over-value stat, the bar's basic unit. */
function Stat({
  label, children, align = "center",
}: { label: string; children: React.ReactNode; align?: "center" | "left" }) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <div
        style={{
          fontSize: 10.5, fontWeight: 600, color: "#8D92A6",
          textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 5,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export function TotalBeforeVatVarianceBar({
  invoiceValue,
  referenceValue,
  invoiceFormatted,
  referenceFormatted,
  expectedSource,
  thresholdEnabled,
  thresholdPct,
  currency,
  blocking,
  onOpenSupportingDoc,
  thresholdControl,
}: TotalBeforeVatVarianceBarProps) {
  const fromSupportingDoc = expectedSource === "supporting_document";
  const hasBoth = invoiceValue != null && referenceValue != null;

  // diff > 0 means the invoice is ABOVE the reference — the only direction the
  // threshold actually polices.
  const diff = hasBoth ? Math.round((invoiceValue - referenceValue) * 100) / 100 : null;
  const maxAllowed =
    referenceValue != null && thresholdEnabled ? referenceValue * (1 + thresholdPct / 100) : null;

  const balanced = diff != null && Math.abs(diff) < 0.01;
  const under = diff != null && diff < -0.01;
  const withinTol = diff != null && diff > 0.01 && maxAllowed != null && invoiceValue! <= maxAllowed;
  const over = diff != null && diff > 0.01 && !withinTol;

  // Same three palettes as P2P's VarianceCard, plus an `accent` for the top
  // hairline and the headroom fill.
  const palette = balanced || under
    ? { border: "#BBF7D0", bg: "#F0FDF4", label: "#15803D", big: "#15803D", sub: "#15803D", accent: "#22C55E" }
    : withinTol
    ? { border: "#F5D9A8", bg: "#FDF9F0", label: "#B45309", big: "#92400E", sub: "#B45309", accent: "#F59E0B" }
    : { border: "#FECACA", bg: "#FEF2F2", label: "#B91C1C", big: "#991B1B", sub: "#B91C1C", accent: "#EF4444" };

  const bigText = !hasBoth
    ? "—"
    : balanced
    ? "Balanced"
    : `${diff! < 0 ? "-" : "+"}${fmtAmount(Math.abs(diff!), currency)}`;

  const subText = !hasBoth
    ? "Nothing to compare"
    : balanced
    ? "Invoice = Contract"
    : under
    ? "Under reference"
    : withinTol
    ? "Within Tolerance"
    : thresholdEnabled
    ? "Exceeds Tolerance"
    : "Exceeds reference";

  // Headroom = how much of the allowed band above the reference is consumed.
  // Only meaningful with a real band to consume (threshold on, pct > 0).
  const band = maxAllowed != null && referenceValue != null ? maxAllowed - referenceValue : null;
  const showTrack = hasBoth && band != null && band > 0;
  const usedFrac = showTrack ? Math.min(Math.max((diff ?? 0) / band!, 0), 1) : 0;
  const remaining = showTrack ? Math.max(maxAllowed! - invoiceValue!, 0) : null;

  const amountStyle: React.CSSProperties = {
    fontSize: 15, fontWeight: 600, color: "#101828",
    fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        position: "relative", background: "#fff", borderTop: `1px solid ${HAIRLINE}`,
        boxShadow: "0 -4px 16px rgba(16,24,40,0.06)",
        flexShrink: 0, fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Verdict reads before any number does. */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: palette.accent, opacity: 0.85 }} />

      {/* Centred column, with the right side kept clear of the floating Neo widget. */}
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "12px 24px 14px", paddingRight: 148 }}>
        {/* Title + tolerance chip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: palette.accent, flexShrink: 0 }} />
            {/* Mandatory field, but deliberately NO asterisk (explicit
                instruction) — the state dot and variance card carry the
                verdict, so the marker would be redundant noise. */}
            <span
              style={{ fontSize: 13.5, fontWeight: 700, color: "#101828", letterSpacing: -0.1 }}
              title={blocking ? "Required — must be within tolerance before this invoice can be approved" : undefined}
            >
              Total Amount Before VAT
            </span>
          </span>
          {thresholdControl}
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "2px 10px", borderRadius: 9999,
              border: `1px solid ${thresholdEnabled ? "#DDE3EA" : "#E5E7EB"}`,
              background: thresholdEnabled ? "#F4F7FA" : "#F3F4F6",
              fontSize: 11.5, color: "#585C65", whiteSpace: "nowrap",
            }}
          >
            {thresholdEnabled && maxAllowed != null ? (
              <>
                cap <b style={{ color: "#101828", fontVariantNumeric: "tabular-nums" }}>{fmtAmount(maxAllowed, currency)}</b>
              </>
            ) : thresholdEnabled ? (
              <>no cap — nothing to compare</>
            ) : (
              <>must match exactly</>
            )}
          </span>
        </div>

        {/* Centred stat strip */}
        <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
          <Stat label="Invoice">
            <div style={amountStyle}>
              {invoiceFormatted ?? (invoiceValue != null ? fmtAmount(invoiceValue, currency) : "—")}
            </div>
          </Stat>

          {/* Connector — a deliberate element rather than a bare arrow glyph. */}
          <div style={{ display: "flex", alignItems: "center", paddingTop: 14, flexShrink: 0 }}>
            <span
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 24, height: 24, borderRadius: "50%",
                border: `1px solid ${HAIRLINE}`, background: "#F9FAFB", color: "#98A2B3",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h13M13 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>

          <Stat label={fromSupportingDoc ? "Supporting Document" : "Contract"}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {fromSupportingDoc && <AiSparkleIcon size={13} />}
              <span style={fromSupportingDoc ? { ...amountStyle, color: "#1F5BD5", fontStyle: "italic" } : amountStyle}>
                {referenceFormatted ?? (referenceValue != null ? fmtAmount(referenceValue, currency) : "—")}
              </span>
            </div>
            {fromSupportingDoc && (
              <div style={{ fontSize: 10.5, color: "#8D92A6", marginTop: 3, lineHeight: "14px" }}>
                Billed on actuals ·{" "}
                {onOpenSupportingDoc ? (
                  <button
                    type="button"
                    onClick={onOpenSupportingDoc}
                    style={{
                      background: "none", border: "none", padding: 0, font: "inherit",
                      color: "#1F5BD5", fontWeight: 600, textDecoration: "underline", cursor: "pointer",
                    }}
                  >
                    Supporting Doc
                  </button>
                ) : (
                  <span style={{ fontWeight: 600, color: "#585C65" }}>Supporting Doc</span>
                )}
              </div>
            )}
          </Stat>

          <div style={{ width: 1, background: HAIRLINE, alignSelf: "stretch", flexShrink: 0 }} />

          {/* Tolerance headroom — the one thing the raw amounts don't tell you. */}
          {showTrack ? (
            <Stat label="Tolerance used">
              <div style={{ width: 190 }}>
                <div style={{ height: 6, borderRadius: 9999, background: "#EEF0F3", overflow: "hidden", position: "relative" }}>
                  <div
                    style={{
                      position: "absolute", inset: 0, width: `${usedFrac * 100}%`,
                      background: palette.accent, borderRadius: 9999,
                      transition: "width 220ms ease",
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10.5, color: "#8D92A6", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontWeight: 600, color: over ? palette.sub : "#585C65" }}>
                    {Math.round(usedFrac * 100)}%
                  </span>
                  <span>
                    {over
                      ? `over by ${fmtAmount(invoiceValue! - maxAllowed!, currency)}`
                      : `${fmtAmount(remaining!, currency)} left`}
                  </span>
                </div>
              </div>
            </Stat>
          ) : (
            <Stat label="Tolerance used">
              <div style={{ width: 190, fontSize: 12, color: "#98A2B3", paddingTop: 2 }}>
                {thresholdEnabled ? "No headroom configured" : "Tolerance disabled"}
              </div>
            </Stat>
          )}

          {/* Variance stat card — same shape/palette as P2P's VarianceCard */}
          <div
            style={{
              border: `1px solid ${palette.border}`, background: palette.bg,
              borderRadius: 10, padding: "7px 16px", minWidth: 156,
              flexShrink: 0, alignSelf: "center", textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 600, color: palette.label, textTransform: "uppercase", letterSpacing: 0.7 }}>
              Variance
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: palette.big, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>
              {bigText}
            </div>
            <div style={{ fontSize: 11.5, color: palette.sub }}>{subText}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
