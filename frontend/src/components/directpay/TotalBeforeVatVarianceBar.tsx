/**
 * Total Amount Before VAT variance bar — the bottom bar of DirectPay's
 * Matching page. Shows only the **variance** and the **tolerance**: the two
 * amounts being compared live in the Matching table's own row (Invoice vs
 * Contract), so repeating them here was duplication.
 *
 * The variance card mirrors P2P's own (components/matching/LineItemsTab.tsx's
 * VarianceCard) exactly — same three tiers, palette, type scale and copy
 * structure. Two deliberate differences, both because this field's tolerance is
 * a PERCENTAGE and is ONE-SIDED (backend service.py checks
 * invoice <= reference * (1 + pct/100), i.e. only over-billing is policed):
 *   - tolerance renders as "N%" plus the resulting cap, not a flat allowance;
 *   - an invoice BELOW the reference isn't a problem, so it reads "Under
 *     reference" in the green tier rather than being flagged by magnitude.
 *
 * The tolerance itself is configured in the admin Workflow Settings page
 * (DirectPay section) — this bar only displays it.
 */

export interface TotalBeforeVatVarianceBarProps {
  /** Raw invoice-side amount (finding.found_value). */
  invoiceValue: number | null;
  /** Raw reference amount — contract or supporting document (finding.expected_value). */
  referenceValue: number | null;
  /** Threshold as saved in Workflow Settings. */
  thresholdEnabled: boolean;
  thresholdPct: number;
  currency?: string | null;
  /** Whether this row is still blocking approval, per the backend finding. */
  blocking: boolean;
}

function fmtAmount(v: number, currency?: string | null): string {
  const n = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}

const HAIRLINE = "#E9EAEC";

export function TotalBeforeVatVarianceBar({
  invoiceValue,
  referenceValue,
  thresholdEnabled,
  thresholdPct,
  currency,
  blocking,
}: TotalBeforeVatVarianceBarProps) {
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
  const band = maxAllowed != null && referenceValue != null ? maxAllowed - referenceValue : null;
  const showTrack = hasBoth && band != null && band > 0;
  const usedFrac = showTrack ? Math.min(Math.max((diff ?? 0) / band!, 0), 1) : 0;
  const remaining = showTrack ? Math.max(maxAllowed! - invoiceValue!, 0) : null;

  const statLabel: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 600, color: "#8D92A6",
    textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 5,
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

      {/* Right side kept clear of the floating Neo widget. */}
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "12px 24px 14px", paddingRight: 148 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, flexWrap: "wrap" }}>
          {/* Which field this is about */}
          <span
            className="inline-flex items-center"
            style={{ gap: 7 }}
            title={blocking ? "Required — must be within tolerance before this invoice can be approved" : undefined}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: palette.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#101828", letterSpacing: -0.1 }}>
              Total Amount Before VAT
            </span>
          </span>

          <div style={{ width: 1, height: 40, background: HAIRLINE, flexShrink: 0 }} />

          {/* Tolerance — configured in admin Workflow Settings, read-only here */}
          <div style={{ textAlign: "center" }}>
            <div style={statLabel}>Tolerance</div>
            {thresholdEnabled ? (
              <div style={{ fontSize: 15, fontWeight: 600, color: "#101828", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {thresholdPct}%
                {maxAllowed != null && (
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: "#8D92A6", marginLeft: 8 }}>
                    cap {fmtAmount(maxAllowed, currency)}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#8D92A6", whiteSpace: "nowrap" }}>Off — must match exactly</div>
            )}
          </div>

          {/* Tolerance headroom used */}
          {showTrack && (
            <div style={{ textAlign: "center" }}>
              <div style={statLabel}>Tolerance used</div>
              <div style={{ width: 190 }}>
                <div style={{ height: 6, borderRadius: 9999, background: "#EEF0F3", overflow: "hidden", position: "relative" }}>
                  <div
                    style={{
                      position: "absolute", inset: 0, width: `${usedFrac * 100}%`,
                      background: palette.accent, borderRadius: 9999, transition: "width 220ms ease",
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
            </div>
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
