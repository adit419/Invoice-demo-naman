/**
 * Spec-driven version of the DirectPay dashboard's Filter popover — same
 * two-pane layout, same atoms (PaneSearch / FilterPill / CheckRow from
 * dpTableUi), same footer behaviour, but the category list and each pane's
 * widget come from a declarative spec instead of being hardcoded.
 *
 * The dashboard's own panel has exactly four fixed categories, one of each kind.
 * The Tracker needs eight, including THREE independent date ranges (Invoice
 * Date, Invoice Received Date, Payment Due Date), which a single dateFrom/dateTo
 * prop pair can't express — hence the keyed state below rather than one field
 * per filter.
 */
import { useEffect, useRef, useState } from "react";
import { CheckRow, FilterPill, INPUT_S, PaneSearch } from "./dpTableUi";

/** Which quick ranges a date column should offer.
 *
 *  One preset set for every date column doesn't work. "Today / Last 7 days /
 *  Last 30 days" is right for a column holding a SYSTEM timestamp (a received
 *  date is always within days of now), and useless on a column holding a
 *  DOCUMENT date: these vendors' invoices are dated across months, ending weeks
 *  before today, so every now-anchored window matched nothing and the presets
 *  read as broken. A due date wants the opposite direction again — what's
 *  overdue, what's coming up.
 *
 *    recent      Today / Last 7 days / Last 30 days      (received date)
 *    historical  Last 30 days / 3 months / 12 months     (invoice date)
 *    due         Overdue / Next 30 days / Next 12 months (payment due date)
 */
export type DpDatePresetMode = "recent" | "historical" | "due";

export type DpFilterSpec =
  /** Checkbox list with its own search box. */
  | { key: string; label: string; kind: "multi"; options: { value: string; label: string }[]; searchPlaceholder?: string; emptyHint?: string }
  /** Quick-range pills plus a custom from-to pair. */
  | {
      key: string; label: string; kind: "dateRange";
      presetMode?: DpDatePresetMode;
      /** The earliest/latest value actually present in this column (YYYY-MM-DD),
       *  shown in the pane so an empty result is self-explanatory rather than
       *  looking like a filter that does nothing. */
      spanFrom?: string | null;
      spanTo?: string | null;
    }
  /** Min/max numeric pair. */
  | { key: string; label: string; kind: "numberRange"; minPlaceholder?: string; maxPlaceholder?: string };

// ── Local-day arithmetic ──────────────────────────────────────────────────────
// Everything below works in the VIEWER's calendar days. The presets previously
// used toISOString(), which is UTC: east of Greenwich, any evening after
// 18:30 IST put "Today" on yesterday's date while the rows showed today's,
// so the preset filtered out the very rows it was meant to select.

const pad = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

/** Quick ranges for one mode. `from`/`to` are inclusive bounds; "" is unbounded
 *  on that side, which is how "Overdue" expresses "anything up to yesterday". */
function datePresets(mode: DpDatePresetMode, today: Date): { label: string; from: string; to: string }[] {
  const t = isoLocal(today);
  switch (mode) {
    case "recent":
      return [
        { label: "Today", from: t, to: t },
        { label: "Last 7 days", from: isoLocal(addDays(today, -6)), to: t },
        { label: "Last 30 days", from: isoLocal(addDays(today, -29)), to: t },
      ];
    case "due":
      return [
        { label: "Overdue", from: "", to: isoLocal(addDays(today, -1)) },
        { label: "Next 30 days", from: t, to: isoLocal(addDays(today, 30)) },
        { label: "Next 12 months", from: t, to: isoLocal(addMonths(today, 12)) },
      ];
    case "historical":
    default:
      return [
        { label: "Last 30 days", from: isoLocal(addDays(today, -29)), to: t },
        { label: "Last 3 months", from: isoLocal(addMonths(today, -3)), to: t },
        { label: "Last 12 months", from: isoLocal(addMonths(today, -12)), to: t },
      ];
  }
}

/** "01 Feb 2026" for the span hint — same en-GB shape the table's cells use. */
function prettyDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export interface DpFilterValues {
  /** key -> selected option values. Empty set means "no constraint", never "none match". */
  multi: Record<string, Set<string>>;
  /** key -> "YYYY-MM-DD"; "" means unbounded on that side. */
  from: Record<string, string>;
  to: Record<string, string>;
  /** key -> raw input text, parsed by the caller. "" means unbounded. */
  min: Record<string, string>;
  max: Record<string, string>;
}

export const EMPTY_FILTER_VALUES: DpFilterValues = { multi: {}, from: {}, to: {}, min: {}, max: {} };

/** How many filter categories are actually constraining the list — the count in
 *  the Filters button's badge, same meaning as the dashboard's own. */
export function countActiveFilters(specs: DpFilterSpec[], v: DpFilterValues): number {
  return specs.filter(s => {
    if (s.kind === "multi") return (v.multi[s.key]?.size ?? 0) > 0;
    if (s.kind === "dateRange") return !!v.from[s.key] || !!v.to[s.key];
    return !!v.min[s.key] || !!v.max[s.key];
  }).length;
}

/** Filter state plus the setters the panel needs. Kept as one hook so a screen
 *  doesn't need a useState per filter (the Tracker would need seventeen).
 *
 *  `onChange` fires after any mutation — a screen paginating its results uses it
 *  to jump back to page 1, which has to happen from the event that changed the
 *  filter rather than from an effect watching the values. */
export function useDpFilters(onChange?: () => void) {
  const [values, setValues] = useState<DpFilterValues>(EMPTY_FILTER_VALUES);

  const update = (fn: (prev: DpFilterValues) => DpFilterValues) => {
    setValues(fn);
    onChange?.();
  };

  const toggleMulti = (key: string, option: string) =>
    update(prev => {
      const next = new Set(prev.multi[key] ?? []);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return { ...prev, multi: { ...prev.multi, [key]: next } };
    });

  const setMulti = (key: string, options: string[]) =>
    update(prev => ({ ...prev, multi: { ...prev.multi, [key]: new Set(options) } }));

  const setRange = (field: "from" | "to" | "min" | "max", key: string, value: string) =>
    update(prev => ({ ...prev, [field]: { ...prev[field], [key]: value } }));

  const clearAll = () => update(() => EMPTY_FILTER_VALUES);

  const clearOne = (spec: DpFilterSpec) =>
    update(prev => {
      if (spec.kind === "multi") return { ...prev, multi: { ...prev.multi, [spec.key]: new Set<string>() } };
      if (spec.kind === "dateRange") return { ...prev, from: { ...prev.from, [spec.key]: "" }, to: { ...prev.to, [spec.key]: "" } };
      return { ...prev, min: { ...prev.min, [spec.key]: "" }, max: { ...prev.max, [spec.key]: "" } };
    });

  return { values, toggleMulti, setMulti, setRange, clearAll, clearOne };
}

export type DpFilterControls = ReturnType<typeof useDpFilters>;

interface DpFilterPanelProps {
  open: boolean;
  onClose: () => void;
  specs: DpFilterSpec[];
  controls: DpFilterControls;
}

export function DpFilterPanel({ open, onClose, specs, controls }: DpFilterPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeKey, setActiveKey] = useState<string>(specs[0]?.key ?? "");
  const [paneSearch, setPaneSearch] = useState("");
  const { values, toggleMulti, setMulti, setRange, clearAll, clearOne } = controls;
  // Resolved once per mount rather than on every render — reading the clock
  // during render is impure, and a popover doesn't stay open across midnight.
  // Midnight-LOCAL, so every preset lands on the viewer's calendar days.
  const [today] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  });

  // Dismiss on a click outside — where "outside" is outside the panel's own
  // POSITIONING PARENT, not just the panel.
  //
  // Testing the panel alone makes the trigger button unable to close it: its
  // mousedown counts as outside and closes the panel, then the button's own
  // onClick toggles false -> true and it reopens in the same gesture, so the
  // panel reads as stuck open and only an unrelated click dismisses it. The
  // parent wrapper holds both the button and the panel, so a mousedown on the
  // trigger is "inside" here and the button's toggle is left to do its job.
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const container = ref.current?.parentElement;
      if (container && !container.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  if (!open) return null;

  // Resolved rather than synchronized: if the spec list changes shape while a
  // pane is selected (the Vendor/Contract option lists are derived from the
  // data, so they do), falling back to the first spec here is enough — no effect
  // needs to write activeKey back.
  const active = specs.find(s => s.key === activeKey) ?? specs[0];
  if (!active) return null;

  const paneLabelS: React.CSSProperties = {
    fontSize: 14, fontWeight: 600, color: "#181D27", marginBottom: 12,
    display: "block", fontFamily: "Inter, sans-serif",
  };

  const q = paneSearch.toLowerCase();

  const renderContent = () => {
    if (active.kind === "multi") {
      const selected = values.multi[active.key] ?? new Set<string>();
      const shown = active.options.filter(o => o.label.toLowerCase().includes(q));
      return (
        <>
          <PaneSearch value={paneSearch} onChange={setPaneSearch} placeholder={active.searchPlaceholder ?? `Search ${active.label}`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1, minHeight: 0 }}>
            {shown.map(o => (
              <CheckRow key={o.value} checked={selected.has(o.value)} onChange={() => toggleMulti(active.key, o.value)}>
                {o.label}
              </CheckRow>
            ))}
            {active.options.length === 0 && (
              <span style={{ fontSize: 13, color: "#8D92A6", fontFamily: "Inter, sans-serif" }}>
                {active.emptyHint ?? "Nothing to filter on yet"}
              </span>
            )}
          </div>
        </>
      );
    }

    if (active.kind === "dateRange") {
      const from = values.from[active.key] ?? "";
      const to = values.to[active.key] ?? "";
      const set = (f: string, t: string) => { setRange("from", active.key, f); setRange("to", active.key, t); };
      const presets = datePresets(active.presetMode ?? "historical", today);
      // Clamped to the values actually present, so a preset can't be offered
      // when nothing in the column could ever fall inside it.
      const span = active.spanFrom && active.spanTo
        ? `${prettyDay(active.spanFrom)} – ${prettyDay(active.spanTo)}`
        : null;
      return (
        <>
          <span style={paneLabelS}>Filter by {active.label}</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <FilterPill active={!from && !to} onClick={() => set("", "")}>All Time</FilterPill>
            {presets.map(p => {
              // A preset whose window can't overlap the data is shown but marked
              // empty, rather than silently returning nothing when clicked.
              const empty = !!active.spanFrom && !!active.spanTo &&
                ((!!p.to && p.to < active.spanFrom) || (!!p.from && p.from > active.spanTo));
              return (
                <FilterPill key={p.label} active={from === p.from && to === p.to} onClick={() => set(p.from, p.to)}>
                  {p.label}
                  {empty && <span style={{ color: "#9CA3AF", fontWeight: 400 }}>· 0</span>}
                </FilterPill>
              );
            })}
          </div>
          {span && (
            <span style={{ fontSize: 12.5, color: "#717680", fontFamily: "Inter, sans-serif", display: "block", marginBottom: 16 }}>
              Data spans <strong style={{ fontWeight: 600, color: "#414651" }}>{span}</strong>
            </span>
          )}
          <span style={paneLabelS}>Custom Date Range</span>
          {/* minWidth: 0 lets the two inputs actually shrink — INPUT_S carries
              width: 100%, which with flex: 1 and the "to" label between them
              overflowed the pane and put a horizontal scrollbar inside it. */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="date" value={from} max={to || undefined}
              onChange={e => setRange("from", active.key, e.target.value)}
              style={{ ...INPUT_S, flex: 1, minWidth: 0, width: "auto" }}
            />
            <span style={{ fontSize: 13, color: "#8D92A6", fontFamily: "Inter, sans-serif", flexShrink: 0 }}>to</span>
            <input
              type="date" value={to} min={from || undefined}
              onChange={e => setRange("to", active.key, e.target.value)}
              style={{ ...INPUT_S, flex: 1, minWidth: 0, width: "auto" }}
            />
          </div>
        </>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <input
          type="number" value={values.min[active.key] ?? ""}
          onChange={e => setRange("min", active.key, e.target.value)}
          placeholder={active.minPlaceholder ?? "Min Amount"} style={INPUT_S}
        />
        <input
          type="number" value={values.max[active.key] ?? ""}
          onChange={e => setRange("max", active.key, e.target.value)}
          placeholder={active.maxPlaceholder ?? "Max Amount"} style={INPUT_S}
        />
      </div>
    );
  };

  const showSelectAll = active.kind === "multi";

  return (
    <div ref={ref}
      style={{
        position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
        // Wider and a little taller than the dashboard's own panel: the date
        // panes carry four quick-range pills, a span hint AND a custom from-to
        // pair, which at 480×400 pushed the date inputs out of sight entirely.
        width: 580, maxWidth: "calc(100vw - 300px)", height: 440, background: "#ffffff",
        border: "1px solid #EBEDF0", borderRadius: 12,
        boxShadow: "0 12px 32px rgba(16,24,40,0.12)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 10px" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#181D27", fontFamily: "Inter, sans-serif" }}>Filter</span>
        <button onClick={clearAll}
          style={{ fontSize: 14, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
          Clear all filter
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 176, borderRight: "1px solid #F0F0F0", flexShrink: 0, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {specs.map(spec => {
            const isActive = spec.key === active.key;
            // A dot on a category the user has already constrained, so an
            // active filter buried in another pane is still discoverable.
            const constrained = countActiveFilters([spec], values) > 0;
            return (
              <button key={spec.key} onClick={() => { setActiveKey(spec.key); setPaneSearch(""); }}
                style={{
                  width: "100%", textAlign: "left", padding: "0 12px", height: 41,
                  fontSize: 14, fontWeight: 500, borderRadius: 8,
                  background: isActive ? "#EEF4FF" : "transparent",
                  color: isActive ? "#1876FF" : "#414651",
                  border: "none", cursor: "pointer", transition: "background 0.1s",
                  fontFamily: "Inter, sans-serif",
                  display: "flex", alignItems: "center", gap: 7,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F9F9F9"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{spec.label}</span>
                {constrained && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1876FF", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, padding: "14px 18px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {renderContent()}
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 18px", borderTop: "1px solid #F0F0F0", flexShrink: 0,
          }}>
            {showSelectAll && active.kind === "multi" ? (
              <button onClick={() => setMulti(active.key, active.options.map(o => o.value))}
                style={{ fontSize: 14, color: "#414651", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", padding: 0 }}>
                Select all
              </button>
            ) : <span />}
            <button onClick={() => clearOne(active)}
              style={{ fontSize: 14, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", padding: 0 }}>
              Clear all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
