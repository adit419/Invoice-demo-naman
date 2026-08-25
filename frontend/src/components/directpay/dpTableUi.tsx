/**
 * DirectPay's shared list-screen primitives — tone palette, stage pill, cell
 * styles, money/date formatters, row action button, loading/empty rows and the
 * filter-pane atoms.
 *
 * Extracted verbatim from pages/directpay/dashboard.tsx when the Tracker screen
 * was added, so the two lists can't drift apart on spacing, tone or number
 * formatting. Definitions are unchanged from the dashboard's own — this file is
 * a move, not a redesign.
 */
import { useState } from "react";

// ── Same tone palette as the Invoice Processing dashboard's StageTag ──────────
export const ANTD_TAG = {
  cyan: { bg: "#E6FFFB", color: "#08979C", border: "#87E8DE" },
  purple: { bg: "#F9F0FF", color: "#722ED1", border: "#D3ADF7" },
  geekblue: { bg: "#F0F5FF", color: "#2F54EB", border: "#ADC6FF" },
  green: { bg: "#F6FFED", color: "#389E0D", border: "#B7EB8F" },
  red: { bg: "#FFF1F0", color: "#CF1322", border: "#FFA39E" },
} as const;

export type AntdTone = keyof typeof ANTD_TAG;

// The invoice pipeline's stages and their tones — the single source for both the
// dashboard's Status column and the Tracker's. Extracted from dashboard.tsx when
// the Tracker started showing in-flight invoices and needed the same vocabulary.
//
// LABELS ARE NOT HERE ON PURPOSE. "posted" is "Posted" on the dashboard and
// "Bill Posted" on the Tracker, and "extracted" covers three distinct pipeline
// moments that only the Tracker bothers to tell apart (see its own
// invoiceStageTag). Sharing the tones keeps the colour language identical
// without forcing one screen's wording onto the other.
export const INVOICE_STAGE_TONE: Record<string, AntdTone> = {
  extraction: "cyan",
  extracted: "cyan",
  fp_extraction: "geekblue",
  matching: "purple",
  bill_posting: "geekblue",
  posted: "green",
  rejected: "red",
};

export function StageTag({ tag }: { tag: { label: string; tone: AntdTone } | undefined }) {
  const tone = tag ? ANTD_TAG[tag.tone] : { bg: "#FAFAFA", color: "#595959", border: "#D9D9D9" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 10px",
        borderRadius: 6,
        fontSize: 12.5,
        lineHeight: "20px",
        fontWeight: 500,
        letterSpacing: "-0.08px",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        color: tone.color,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {tag?.label ?? "—"}
    </span>
  );
}

export const CELL_PRIMARY: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: "#414651",
  fontFamily: "Inter, sans-serif",
};

export const CELL_MUTED: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: "#8D92A6",
  fontFamily: "Inter, sans-serif",
};

export const INPUT_S: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14, height: 44,
  border: "1px solid #E5E7EB", borderRadius: 8, outline: "none", boxSizing: "border-box",
  color: "#414651", background: "#ffffff", fontFamily: "Inter, sans-serif",
};

export function fmtMoney(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return "NA";
  return `${currency ?? ""} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`.trim();
}

export function toIsoDate(iso: string): Date {
  return new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z");
}

export function formatTimestamp(iso: string): string {
  try {
    return toIsoDate(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function actionButtonStyle(action: { primary: boolean; disabled: boolean }): React.CSSProperties {
  if (action.primary) {
    return {
      background: "#ffffff", border: "1px solid #1876FF", color: "#1876FF",
      borderRadius: 8, fontWeight: 600, fontSize: 12.5,
      height: 30, padding: "0 18px", cursor: "pointer",
      fontFamily: "Inter, sans-serif",
    };
  }
  if (action.disabled) {
    return {
      background: "#F5F5F5", border: "1px solid #E0E0E0", color: "#8D92A6",
      borderRadius: 8, fontWeight: 500, fontSize: 12.5,
      height: 30, padding: "0 14px", cursor: "not-allowed",
      fontFamily: "Inter, sans-serif",
    };
  }
  return {
    background: "#ffffff", border: "1px solid #D5D5D5", color: "#364153",
    borderRadius: 8, fontWeight: 500, fontSize: 12.5,
    height: 30, padding: "0 18px", cursor: "pointer",
    fontFamily: "Inter, sans-serif",
  };
}

// The "loader in the row" for a Processing invoice/contract — mirrors P2P's
// dashboard, whose row action button uses AntD's `loading` prop (a spinning
// icon inline with the label) rather than a plain disabled button with no
// visual feedback that something is actually happening.
export function ButtonSpinner() {
  return (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 1024 1024" style={{ flexShrink: 0 }}>
      <path
        fill="currentColor"
        d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 0 0-94.3-139.9 437.71 437.71 0 0 0-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"
      />
    </svg>
  );
}

export function OpenInNewTab({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      title="Open in new tab"
      disabled={disabled}
      onClick={() => { if (!disabled) onClick(); }}
      style={{
        background: "transparent", border: "none", padding: 2,
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "#D1D5DB" : "#717680",
        display: "inline-flex", alignItems: "center",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = "#1876FF"; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.color = "#717680"; }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </svg>
    </button>
  );
}

export function LoadingRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: "1px solid #E6E6E6" }}>
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} style={{ padding: "10px 16px" }}>
              <div style={{ height: 14, borderRadius: 4, background: "#F0F0F0", width: j === 0 ? 160 : 90 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function EmptyRow({ cols, label, hint, pageSize, heightPx }: {
  cols: number;
  label: string;
  hint: string;
  /** Reserves a ten-row-tall block so the footer doesn't jump — how the
   *  dashboard sizes its empty state. */
  pageSize?: number;
  /** Explicit height instead, for a table whose container already fills the
   *  viewport and so has no page-size-shaped hole to fill. */
  heightPx?: number | string;
}) {
  return (
    <tr>
      <td colSpan={cols} style={{ height: heightPx ?? (pageSize ?? 5) * 56, padding: 24, textAlign: "center", verticalAlign: "middle" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="2" y="2" width="18" height="18" rx="3" stroke="#8D92A6" strokeWidth="1.4" />
              <path d="M6 8h10M6 11h10M6 14h6" stroke="#8D92A6" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "#414651", fontFamily: "Inter, sans-serif" }}>{label}</p>
          <p style={{ margin: 0, fontSize: 12, color: "#717680", fontFamily: "Inter, sans-serif" }}>{hint}</p>
        </div>
      </td>
    </tr>
  );
}

// ── Filter-pane atoms (shared by the dashboard's own FilterPanel and the
//    Tracker's spec-driven DpFilterPanel) ─────────────────────────────────────

export function PaneSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <svg width="15" height="15" viewBox="0 0 14 14" fill="none"
        style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8D92A6" }}>
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...INPUT_S, height: 42, paddingLeft: 38 }}
        onFocus={e => (e.target.style.borderColor = "#1876FF")}
        onBlur={e => (e.target.style.borderColor = "#E5E7EB")}
      />
    </div>
  );
}

export function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        height: 36, padding: "0 16px", borderRadius: 999,
        fontSize: 13.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
        border: `1px solid ${active ? "#1876FF" : "#E5E7EB"}`,
        color: active ? "#1876FF" : "#414651",
        background: active ? "#F0F7FF" : "#ffffff",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {children}
    </button>
  );
}

export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 2px", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={onChange}
        style={{ accentColor: "#1876FF", width: 16, height: 16, flexShrink: 0 }} />
      <span style={{
        fontSize: 14, color: "#414651", fontFamily: "Inter, sans-serif",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{children}</span>
    </label>
  );
}

// ── Sortable column header ────────────────────────────────────────────────────
// The list screens' <th> styling with a click target and a direction caret.
// Purely presentational — the caller owns the sort state and does the sorting.

export function SortHeader({
  label, align = "left", active, direction, onClick, pin, stickyRight, stickyTop,
}: {
  label: string;
  align?: "left" | "right";
  active: boolean;
  direction: "asc" | "desc";
  onClick?: () => void;
  /** Pin to the right edge (equivalent to stickyRight={0}). */
  pin?: boolean;
  /** Pin this far from the right edge, in px — for a second pinned column
   *  sitting inboard of the last one. */
  stickyRight?: number;
  /** Keep the header visible while the row area scrolls vertically. Needed once
   *  a table's own container scrolls rather than the page. */
  stickyTop?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const sortable = !!onClick;
  const pinnedAt = pin ? 0 : stickyRight;
  return (
    <th
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={sortable ? `Sort by ${label}` : undefined}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
      style={{
        padding: "12px 16px",
        textAlign: align,
        fontSize: 14, fontWeight: 600,
        color: active ? "#1876FF" : "#717680",
        background: "#F5F5F5", borderBottom: "1px solid #E0E0E0",
        lineHeight: "22px", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
        cursor: sortable ? "pointer" : "default",
        userSelect: "none",
        // A sticky top and a sticky right can both apply to the same cell; it
        // then needs the higher z-index so it stays above its own row and column.
        ...(stickyTop ? { position: "sticky" as const, top: 0, zIndex: 3 } : {}),
        ...(pinnedAt !== undefined
          ? { position: "sticky" as const, right: pinnedAt, zIndex: stickyTop ? 4 : 2, borderLeft: "1px solid #E0E0E0" }
          : {}),
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {label}
        {sortable && (
          // Reserve the caret's width always, so a column's label doesn't shift
          // sideways the moment it becomes the sorted one.
          <span style={{ width: 10, display: "inline-flex", justifyContent: "center", opacity: active ? 1 : hover ? 0.45 : 0 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
              style={{ transform: active && direction === "asc" ? "rotate(180deg)" : "none", transition: "transform 0.12s" }}>
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </span>
    </th>
  );
}
