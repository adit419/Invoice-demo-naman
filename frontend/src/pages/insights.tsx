import { useMemo, useState, useEffect } from "react";
import { withAuthGuard } from "@/components/AuthGuard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type DisplayStatus = "extraction" | "review" | "approved" | "rejected";

interface Invoice {
  day: number;
  dateISO: string;
  userName: string;
  amount: number;
  status: DisplayStatus;
  cycleMinutes: number | null;
  ageDays: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const USERS = [
  { name: "Emily Carter",      level: "Senior",  initials: "EC", ci: 0 },
  { name: "Michael Johnson",   level: "Senior",  initials: "MJ", ci: 1 },
  { name: "Neoflo Admin",      level: "Lead",    initials: "NA", ci: 2 },
  { name: "David Thompson",    level: "Analyst", initials: "DT", ci: 3 },
  { name: "Ashley Robinson",   level: "Analyst", initials: "AR", ci: 4 },
  { name: "Christopher Davis", level: "Manager", initials: "CD", ci: 5 },
  { name: "Olivia Bennett",    level: "Analyst", initials: "OB", ci: 6 },
];

const AVATAR_COLORS = [
  { bg: "#3b82f6",                    fg: "#fff",     border: "none" },
  { bg: "rgba(59,130,246,0.15)",      fg: "#60a5fa",  border: "1px solid rgba(59,130,246,0.3)" },
  { bg: "#818cf8",                    fg: "#fff",     border: "none" },
  { bg: "rgba(129,140,248,0.15)",     fg: "#818cf8",  border: "1px solid rgba(129,140,248,0.3)" },
  { bg: "#34d399",                    fg: "#fff",     border: "none" },
  { bg: "rgba(251,191,36,0.15)",      fg: "#fbbf24",  border: "1px solid rgba(251,191,36,0.3)" },
  { bg: "#F0F0F0",                    fg: "#717680",  border: "1px solid #D5D5D5" },
];

const STATUS_LABEL: Record<DisplayStatus, string> = {
  extraction: "Extraction", review: "In Review", approved: "Approved", rejected: "Rejected",
};
const STATUS_COLOR: Record<DisplayStatus, string> = {
  extraction: "#3b82f6", review: "#818cf8", approved: "#34d399", rejected: "#f87171",
};
const STATUS_BG: Record<DisplayStatus, string> = {
  extraction: "rgba(59,130,246,0.12)", review: "rgba(129,140,248,0.12)",
  approved: "rgba(52,211,153,0.12)",   rejected: "rgba(239,68,68,0.12)",
};

const HEAT: { bg: string; color: string }[] = [
  { bg: "#F5F5F5", color: "#475569" },
  { bg: "rgba(52,211,153,0.08)",  color: "#34d399" },
  { bg: "rgba(129,140,248,0.1)",  color: "#818cf8" },
  { bg: "rgba(251,191,36,0.1)",   color: "#fbbf24" },
  { bg: "rgba(239,68,68,0.15)",   color: "#f87171" },
];

// ── Synthetic dataset (mirrors APDashboard exactly) ────────────────────────────

const TODAY = new Date(2026, 3, 30); // Apr 30 2026
const BASE  = new Date(2026, 0, 1);  // Jan 1 2026
const DAYS  = Math.round((TODAY.getTime() - BASE.getTime()) / 86400000) + 1; // 120

function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function isoDay(i: number): string { return addDays(BASE, i).toISOString().slice(0, 10); }

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = ((s * 1664525 + 1013904223) >>> 0); return s / 4294967296; };
}

function buildInvoices(): Invoice[] {
  const r = lcg(20260430);
  const list: Invoice[] = [];
  for (let day = 0; day < DAYS; day++) {
    const ageDays = DAYS - 1 - day;
    const dow = (day + 4) % 7;
    const weekend = (dow === 5 || dow === 6) ? 0.55 : 1.0;
    const vol = Math.max(6, Math.round((24 + r() * 22) * weekend));
    for (let i = 0; i < vol; i++) {
      const user   = USERS[Math.floor(r() * USERS.length)];
      const amount = Math.round(450 + r() * 19550);
      const u = r();
      let status: DisplayStatus;
      if (ageDays >= 14)      status = u < 0.82 ? "approved" : u < 0.90 ? "rejected" : u < 0.97 ? "review" : "extraction";
      else if (ageDays >= 7)  status = u < 0.55 ? "approved" : u < 0.62 ? "rejected" : u < 0.86 ? "review" : "extraction";
      else if (ageDays >= 3)  status = u < 0.28 ? "approved" : u < 0.32 ? "rejected" : u < 0.66 ? "review" : "extraction";
      else                    status = u < 0.08 ? "approved" : u < 0.10 ? "rejected" : u < 0.42 ? "review" : "extraction";
      const cycleMinutes = (status === "approved" || status === "rejected") ? +(1.2 + r() * 3.6).toFixed(2) : null;
      list.push({ day, dateISO: isoDay(day), userName: user.name, amount, status, cycleMinutes, ageDays });
    }
  }
  return list;
}

const INVOICES = buildInvoices();

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt    = (n: number) => n.toLocaleString("en-US");
const usdFmt = (n: number) => {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + Math.round(n);
};

function filterInvoices(fi: number, ti: number, status: string, user: string): Invoice[] {
  return INVOICES.filter(i =>
    i.day >= fi && i.day <= ti &&
    (status === "all" || i.status === status) &&
    (user   === "all" || i.userName === user)
  );
}

function heatLevel(count: number, rowMax: number): 0|1|2|3|4 {
  if (count === 0 || rowMax === 0) return 0;
  const r = count / rowMax;
  if (r < 0.2) return 1;
  if (r < 0.4) return 2;
  if (r < 0.7) return 3;
  return 4;
}

// ── Mini-components ───────────────────────────────────────────────────────────

function Delta({ cur, prev, lowerIsBetter = false, isDuration = false, unit = "" }: {
  cur: number | null; prev: number | null;
  lowerIsBetter?: boolean; isDuration?: boolean; unit?: string;
}) {
  if (cur == null || prev == null || prev === 0)
    return <span style={{ fontSize: 11, color: "#475569" }}>— no prior period</span>;
  const diff  = cur - prev;
  const pct   = (diff / Math.abs(prev)) * 100;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const color  = diff === 0 ? "#64748b" : better ? "#34d399" : "#f87171";
  const arrow  = diff > 0 ? "▲" : diff < 0 ? "▼" : "■";
  const txt    = isDuration
    ? `${arrow} ${Math.abs(diff).toFixed(1)}${unit} vs prev period`
    : `${arrow} ${Math.abs(pct).toFixed(1)}% vs prev period`;
  return <span style={{ fontSize: 11, color }}>{txt}</span>;
}

function ApprovalDelta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur == null || prev == null)
    return <span style={{ fontSize: 11, color: "#475569" }}>— no prior period</span>;
  const diff  = cur - prev;
  const color = diff === 0 ? "#64748b" : diff > 0 ? "#34d399" : "#f87171";
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "■";
  return <span style={{ fontSize: 11, color }}>{arrow} {Math.abs(diff).toFixed(1)} pts vs prev period</span>;
}

const CARD: React.CSSProperties = {
 border: "1px solid rgb(229, 231, 235)",borderRadius: "8px"
};
const CARD_HEAD: React.CSSProperties = {
  padding: "14px 18px", borderBottom: "1px solid #E6E6E6",
  display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
};
const CARD_BODY: React.CSSProperties = { padding: "16px 18px" };

function ScopePill({ children, variant = "range" }: { children: React.ReactNode; variant?: "range" | "today" }) {
  const c = variant === "range"
    ? { bg: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)", dot: "#3b82f6" }
    : { bg: "#F0F0F0", color: "#64748b", border: "1px solid #D5D5D5", dot: "#64748b" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999,
      background: c.bg, color: c.color, border: c.border, fontSize: 10.5, fontWeight: 500, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
      {children}
    </span>
  );
}

function BarTooltipContent({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{ background: "#ffffff", border: "1px solid #E6E6E6", borderRadius: 8, padding: "10px 12px", minWidth: 140, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
      <p style={{ color: "#717680", fontSize: 11, marginBottom: 6 }}>{label}</p>
      {payload.map(p => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, display: "inline-block", flexShrink: 0 }} />
          <span style={{ color: "#717680", fontSize: 11 }}>{p.name}:</span>
          <span style={{ color: "#101828", fontSize: 11, fontWeight: 600, marginLeft: "auto", paddingLeft: 8 }}>{p.value}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{ borderTop: "1px solid #E6E6E6", marginTop: 6, paddingTop: 6, color: "#101828", fontSize: 11, fontWeight: 600 }}>
          Total: {total}
        </div>
      )}
    </div>
  );
}

function DonutTooltipContent({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const total = INVOICES.filter(i => i.status === "extraction" || i.status === "review" || (i.status === "approved" && i.ageDays <= 30)).length;
  return (
    <div style={{ background: "#ffffff", border: "1px solid #E6E6E6", borderRadius: 8, padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
      <p style={{ color: "#101828", fontSize: 12, fontWeight: 600 }}>{p.name}</p>
      <p style={{ color: "#717680", fontSize: 11 }}>{fmt(p.value)} ({(p.value / total * 100).toFixed(1)}%)</p>
    </div>
  );
}

type AgingRow = { label: string; status: string; buckets: number[] };

function AgingSection({ title, tag, rows, colHeaders }: {
  title: string; tag: string; rows: AgingRow[]; colHeaders: string[];
}) {
  const colTotals = Array(colHeaders.length).fill(0);
  rows.forEach(row => row.buckets.forEach((c, i) => { colTotals[i] += c; }));
  const grand = colTotals.reduce((s, n) => s + n, 0);

  const hStyle: React.CSSProperties = {
    fontSize: 11, color: "#64748b", fontWeight: 500,
    padding: "8px 10px", borderBottom: "1px solid #E6E6E6",
    background: "#F5F5F5",
  };
  const cStyle: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #F0F0F0" };
  const tStyle: React.CSSProperties = { padding: "10px", background: "#F5F5F5", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" };
  const cols = `160px repeat(${colHeaders.length}, 1fr) 64px`;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#F0F0F0", color: "#64748b", fontSize: 10, fontWeight: 500 }}>{tag}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 0, alignItems: "stretch" }}>
        <div style={hStyle}>Status</div>
        {colHeaders.map(h => <div key={h} style={hStyle}>{h}</div>)}
        <div style={{ ...hStyle, textAlign: "right" }}>Total</div>
        {rows.map(row => {
          const rowMax = Math.max(...row.buckets, 1);
          const rowTotal = row.buckets.reduce((s, n) => s + n, 0);
          return [
            <div key={row.label + "-l"} style={{ ...cStyle, fontSize: 12, fontWeight: 500, color: "#94a3b8", display: "flex", alignItems: "center" }}>{row.label}</div>,
            ...row.buckets.map((count, i) => {
              const hl = heatLevel(count, rowMax);
              return (
                <div key={row.label + i} style={{ ...cStyle, padding: "8px" }}>
                  <div style={{ height: 28, borderRadius: 6, display: "flex", alignItems: "center",
                    fontSize: 11, fontWeight: 500, ...HEAT[hl] }}>
                    {count > 0 ? count : "—"}
                  </div>
                </div>
              );
            }),
            <div key={row.label + "-t"} style={{ ...cStyle, textAlign: "right", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{rowTotal}</div>,
          ];
        })}
        <div style={{ ...tStyle, color: "#64748b", fontSize: 11, fontWeight: 500 }}>Total</div>
        {colTotals.map((t, i) => (
          <div key={i} style={{ ...tStyle}}>{t || "—"}</div>
        ))}
        <div style={{ ...tStyle, textAlign: "right" }}>{grand}</div>
      </div>
    </div>
  );
}

// ── Select helper ─────────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "0 12px", height: 36,
      border: "1px solid rgb(229, 231, 235)", borderRadius: 10, background: "#f1f5f9", fontSize: 13, color: "#0e1424 " }}>
      <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ border: "none", outline: "none", background: "transparent", font: "inherit", color: "inherit", cursor: "pointer" }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "0 12px", height: 36,
      border: "1px solid rgb(229, 231, 235)", borderRadius: 10, background: "#f1f5f9", fontSize: 13, color: "#0e1424" }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        style={{ border: "none", outline: "none", background: "transparent", font: "inherit", color: "inherit", cursor: "pointer" }}
        min="2026-01-01" max="2026-04-30" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const USER_OPTIONS = [{ value: "all", label: "All users" }, ...USERS.map(u => ({ value: u.name, label: u.name }))];
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "extraction", label: "Extraction" },
  { value: "review",     label: "In Review" },
  { value: "approved",   label: "Approved" },
  { value: "rejected",   label: "Rejected" },
];
const SORT_OPTIONS = [
  { value: "total",    label: "Total volume" },
  { value: "approved", label: "Approved" },
  { value: "review",   label: "In review" },
  { value: "rejected", label: "Rejected" },
];

function InsightsPage() {
  const [fromDate, setFromDate]       = useState("2026-04-01");
  const [toDate,   setToDate]         = useState("2026-04-30");
  const [statusFilter, setStatus]     = useState("all");
  const [userFilter,   setUser]       = useState("all");
  const [userSort,     setUserSort]   = useState("total");
  const [agingUser,    setAgingUser]  = useState("all");
  const [mounted,      setMounted]    = useState(false);

  useEffect(() => setMounted(true), []);

  // ── Date → day indices
  const { fi, ti } = useMemo(() => {
    const f = Math.max(0, Math.round((new Date(fromDate).getTime() - BASE.getTime()) / 86400000));
    const t = Math.min(DAYS - 1, Math.round((new Date(toDate).getTime() - BASE.getTime()) / 86400000));
    return { fi: Math.min(f, t), ti: Math.max(f, t) };
  }, [fromDate, toDate]);

  // ── Filtered sets
  const filtered    = useMemo(() => filterInvoices(fi, ti, statusFilter, userFilter), [fi, ti, statusFilter, userFilter]);
  const filteredAll = useMemo(() => filterInvoices(fi, ti, "all",        userFilter), [fi, ti, userFilter]);

  const { prevFi, prevTi } = useMemo(() => {
    const len = ti - fi + 1;
    return { prevFi: Math.max(0, fi - len), prevTi: fi - 1 };
  }, [fi, ti]);
  const hasPrev      = prevTi >= 0;
  const prevFiltered    = useMemo(() => hasPrev ? filterInvoices(prevFi, prevTi, statusFilter, userFilter) : [], [prevFi, prevTi, statusFilter, userFilter, hasPrev]);
  const prevFilteredAll = useMemo(() => hasPrev ? filterInvoices(prevFi, prevTi, "all",        userFilter) : [], [prevFi, prevTi, userFilter, hasPrev]);

  // ── KPIs
  const kpis = useMemo(() => {
    const value     = filtered.reduce((s, i) => s + i.amount, 0);
    const prevValue = prevFiltered.reduce((s, i) => s + i.amount, 0);

    const comp     = filtered.filter(i => i.cycleMinutes != null);
    const prevComp = prevFiltered.filter(i => i.cycleMinutes != null);
    const avgMin     = comp.length     ? comp.reduce((s, i) => s + i.cycleMinutes!, 0) / comp.length : null;
    const prevAvgMin = prevComp.length ? prevComp.reduce((s, i) => s + i.cycleMinutes!, 0) / prevComp.length : null;

    const fin      = filteredAll.filter(i => i.status === "approved" || i.status === "rejected");
    const prevFin  = prevFilteredAll.filter(i => i.status === "approved" || i.status === "rejected");
    const apprRate     = fin.length     ? fin.filter(i => i.status === "approved").length     / fin.length * 100     : null;
    const prevApprRate = prevFin.length ? prevFin.filter(i => i.status === "approved").length / prevFin.length * 100 : null;

    const rejected     = filteredAll.filter(i => i.status === "rejected").length;
    const prevRejected = prevFilteredAll.filter(i => i.status === "rejected").length;

    return {
      total: filtered.length, prevTotal: prevFiltered.length,
      value, prevValue,
      avgMin, prevAvgMin,
      apprRate, prevApprRate,
      rejected, prevRejected,
    };
  }, [filtered, filteredAll, prevFiltered, prevFilteredAll]);

  // ── Outstanding (stock — no date filter)
  const outstanding = useMemo(() => {
    const open = INVOICES.filter(i => (i.status === "extraction" || i.status === "review") && (userFilter === "all" || i.userName === userFilter));
    const ext  = open.filter(i => i.status === "extraction").length;
    const rev  = open.filter(i => i.status === "review").length;
    return { total: open.length, ext, rev, aged: open.filter(i => i.ageDays > 7).length, value: open.reduce((s, i) => s + i.amount, 0) };
  }, [userFilter]);

  // ── Bar chart
  const { chartData, granLabel } = useMemo(() => {
    const days       = ti - fi + 1;
    const gran       = days >= 60 ? "month" : days >= 21 ? "week" : "day";
    const granLabel  = { day: "By day", week: "By week", month: "By month" }[gran];
    const startDate  = addDays(BASE, fi);
    const endDate    = addDays(BASE, ti);

    let bucketCount: number;
    const labels: string[] = [];

    if (gran === "day") {
      bucketCount = days;
      for (let i = 0; i < days; i++) labels.push(addDays(BASE, fi + i).toLocaleDateString("en-US", { day: "2-digit", month: "short" }));
    } else if (gran === "week") {
      bucketCount = Math.ceil(days / 7);
      for (let b = 0; b < bucketCount; b++) {
        const sd = addDays(BASE, fi + b * 7);
        const ed = addDays(BASE, Math.min(fi + (b + 1) * 7 - 1, ti));
        labels.push(`${sd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${ed.getDate()}`);
      }
    } else {
      bucketCount = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
      for (let b = 0; b < bucketCount; b++) {
        const d = new Date(startDate.getFullYear(), startDate.getMonth() + b, 1);
        labels.push(d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }));
      }
    }

    const bIdx = (inv: Invoice): number => {
      if (gran === "day")  return inv.day - fi;
      if (gran === "week") return Math.floor((inv.day - fi) / 7);
      const d = addDays(BASE, inv.day);
      return (d.getFullYear() - startDate.getFullYear()) * 12 + (d.getMonth() - startDate.getMonth());
    };

    const b: Record<DisplayStatus, number[]> = {
      extraction: new Array(bucketCount).fill(0),
      review:     new Array(bucketCount).fill(0),
      approved:   new Array(bucketCount).fill(0),
      rejected:   new Array(bucketCount).fill(0),
    };

    INVOICES.filter(i => i.day >= fi && i.day <= ti && (userFilter === "all" || i.userName === userFilter)).forEach(i => {
      const idx = bIdx(i);
      if (idx >= 0 && idx < bucketCount) b[i.status][idx]++;
    });

    const vis = (s: DisplayStatus) => statusFilter === "all" || statusFilter === s;
    const chartData = labels.map((label, idx) => ({
      label,
      Extraction: vis("extraction") ? b.extraction[idx] : 0,
      "In Review": vis("review")    ? b.review[idx]     : 0,
      Approved:    vis("approved")  ? b.approved[idx]   : 0,
      Rejected:    vis("rejected")  ? b.rejected[idx]   : 0,
    }));
    return { chartData, granLabel };
  }, [fi, ti, statusFilter, userFilter]);

  // ── Donut (stock, excludes rejected, user-filtered only)
  const { donutData, donutTotal, donutCounts } = useMemo(() => {
    const inScope = INVOICES.filter(i => {
      if (userFilter !== "all" && i.userName !== userFilter) return false;
      if (i.status === "extraction" || i.status === "review") return true;
      if (i.status === "approved") return i.ageDays <= 30;
      return false;
    });
    const c = { extraction: 0, review: 0, approved: 0 };
    inScope.forEach(i => { c[i.status as keyof typeof c]++; });
    const total = c.extraction + c.review + c.approved;
    const donutData = [
      { name: "Extraction", value: c.extraction, color: STATUS_COLOR.extraction },
      { name: "In Review",  value: c.review,     color: STATUS_COLOR.review },
      { name: "Approved",   value: c.approved,   color: STATUS_COLOR.approved },
    ].filter(d => d.value > 0);
    return { donutData, donutTotal: total, donutCounts: c };
  }, [userFilter]);

  // ── User performance table
  const userTableData = useMemo(() => {
    return USERS
      .filter(u => userFilter === "all" || u.name === userFilter)
      .map(u => {
        const mine = filtered.filter(i => i.userName === u.name);
        const c    = { extraction: 0, review: 0, approved: 0, rejected: 0 };
        mine.forEach(i => c[i.status]++);
        const comp  = mine.filter(i => i.cycleMinutes != null);
        const cycle = comp.length ? (comp.reduce((s, i) => s + i.cycleMinutes!, 0) / comp.length).toFixed(1) + " min" : "—";
        return { ...u, ext: c.extraction, rev: c.review, apr: c.approved, rej: c.rejected,
          total: mine.length, value: mine.reduce((s, i) => s + i.amount, 0), cycle };
      })
      .sort((a, b) => {
        const k: Record<string, keyof typeof a> = { total: "total", approved: "apr", review: "rev", rejected: "rej" };
        return (b[k[userSort]] as number) - (a[k[userSort]] as number);
      });
  }, [filtered, userFilter, userSort]);

  // ── Live workload
  const workloadData = useMemo(() => {
    const open = INVOICES.filter(i => i.status === "extraction" || i.status === "review");
    return USERS
      .filter(u => userFilter === "all" || u.name === userFilter)
      .map(u => {
        const mine  = open.filter(i => i.userName === u.name);
        const oldest = mine.length ? Math.max(...mine.map(i => i.ageDays)) : 0;
        return { ...u, total: mine.length,
          ext:   mine.filter(i => i.status === "extraction").length,
          rev:   mine.filter(i => i.status === "review").length,
          aged:  mine.filter(i => i.ageDays > 7).length,
          oldest, value: mine.reduce((s, i) => s + i.amount, 0) };
      })
      .sort((a, b) => b.aged - a.aged || b.oldest - a.oldest || b.total - a.total);
  }, [userFilter]);

  // ── Aging grids
  const agingData = useMemo(() => {
    const match = (i: Invoice) => agingUser === "all" || i.userName === agingUser;

    const openQ = INVOICES.filter(i => (i.status === "extraction" || i.status === "review") && match(i));
    const ageB  = (i: Invoice) => i.ageDays <= 1 ? 0 : i.ageDays <= 3 ? 1 : i.ageDays <= 7 ? 2 : i.ageDays <= 14 ? 3 : 4;
    const openRows: AgingRow[] = [
      { label: "Extraction", status: "extraction", buckets: new Array(5).fill(0) },
      { label: "In Review",  status: "review",     buckets: new Array(5).fill(0) },
    ];
    openQ.forEach(i => { const row = openRows.find(r => r.status === i.status); if (row) row.buckets[ageB(i)]++; });

    const doneQ = INVOICES.filter(i => (i.status === "approved" || i.status === "rejected") && i.ageDays <= 30 && match(i));
    const cycB  = (i: Invoice) => { const m = i.cycleMinutes ?? 0; return m < 1 ? 0 : m < 3 ? 1 : m < 5 ? 2 : m < 10 ? 3 : 4; };
    const doneRows: AgingRow[] = [
      { label: "Approved", status: "approved", buckets: new Array(5).fill(0) },
      { label: "Rejected", status: "rejected", buckets: new Array(5).fill(0) },
    ];
    doneQ.forEach(i => { const row = doneRows.find(r => r.status === i.status); if (row) row.buckets[cycB(i)]++; });

    return { openRows, doneRows };
  }, [agingUser]);

  const chartHasData = chartData.some(d => (d.Extraction + d["In Review"] + d.Approved + d.Rejected) > 0);

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "4px 8px", display: "flex", flexDirection: "column", gap: 24 ,}}>

        {/* Header */}
       <div
        className="sticky top-0 z-10 px-8 py-5"
        style={{borderBottom: "1px solid rgb(229, 231, 235)" ,background:"white"}}
      >   
        <div className="flex items-center justify-between">
          <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#101828", margin: 0 }}>Reporting</h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Performance, throughput, and aging across your invoice processing workflows
          </p>
        </div>
        </div>
        </div>

        {/* Filters */}
        <div style={{ ...CARD, padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <DateInput    label="From"   value={fromDate}     onChange={setFromDate} />
          <DateInput    label="To"     value={toDate}       onChange={setToDate} />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatus}  options={STATUS_OPTIONS} />
          <FilterSelect label="User"   value={userFilter}   onChange={setUser}    options={USER_OPTIONS} />
          <div style={{ flex: 1 }} />
          <button onClick={() => { setFromDate("2026-04-01"); setToDate("2026-04-30"); setStatus("all"); setUser("all"); }}
            style={{ background: "transparent", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer", padding: "4px 8px" }}>
            Reset filters
          </button>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          {[
            {
              label: "Total invoices processed", scope: "range",
              value: kpis.total ? fmt(kpis.total) : "0",
              delta: <Delta cur={kpis.total} prev={hasPrev ? kpis.prevTotal : null} />,
            },
            {
              label: "Total value processed", scope: "range",
              value: kpis.value ? usdFmt(kpis.value) : "$0",
              delta: <Delta cur={kpis.value} prev={hasPrev ? kpis.prevValue : null} />,
            },
            {
              label: "Avg. processing time", scope: "range",
              value: kpis.avgMin != null ? kpis.avgMin.toFixed(1) + " min" : "—",
              delta: <Delta cur={kpis.avgMin} prev={hasPrev ? kpis.prevAvgMin : null} lowerIsBetter isDuration unit=" min" />,
            },
            {
              label: "Approval rate", scope: "range",
              value: kpis.apprRate != null ? kpis.apprRate.toFixed(1) + "%" : "—",
              delta: <ApprovalDelta cur={kpis.apprRate} prev={hasPrev ? kpis.prevApprRate : null} />,
            },
            {
              label: "Rejected invoices", scope: "range",
              value: fmt(kpis.rejected),
              delta: <Delta cur={kpis.rejected} prev={hasPrev ? kpis.prevRejected : null} lowerIsBetter />,
            },
          ].map((kpi, i) => (
            <div key={i} style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, minHeight: 104 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#64748b", fontWeight: 500 }}>
                <ScopePill variant="range">Selected period</ScopePill>
              </div>
              <p style={{ fontSize: 12, color: "#64748b", fontWeight: 500, margin: 0 }}>{kpi.label}</p>
              <p style={{ fontSize: 26, fontWeight: 600, color: "rgb(59, 130, 246)", letterSpacing: "-0.01em", margin: 0, fontVariantNumeric: "tabular-nums" }}>{kpi.value}</p>
              <div>{kpi.delta}</div>
            </div>
          ))}
        </div>

        {/* Outstanding pipeline */}
        <div style={CARD}>
          <div style={CARD_HEAD}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Outstanding pipeline</h3>
                <ScopePill variant="today">As of today</ScopePill>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                <strong style={{ color: "#94a3b8" }}>Stock view:</strong> all open tickets currently in process (Extraction + In Review), regardless of ingestion date. Date range does not apply; only the User filter does.
              </p>
            </div>
          </div>
          <div style={{ ...CARD_BODY, display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
            {[
              { label: "Total outstanding",   value: fmt(outstanding.total), sub: "tickets in process", color: "#34d399" },
              { label: "In Extraction",        value: fmt(outstanding.ext),   sub: "being captured",    color: "#3b82f6" },
              { label: "In Review",            value: fmt(outstanding.rev),   sub: "awaiting action",   color: "#818cf8" },
              { label: "Outstanding value",    value: usdFmt(outstanding.value), sub: "in pipeline",    color: "#34d399" },
              { label: "Aged > 7 days",        value: fmt(outstanding.aged),  sub: "at risk",           color: "#f87171" },
            ].map((m, i, arr) => (
              <div key={i} style={{ padding: "4px 18px", borderRight: i < arr.length - 1 ? "1px solid #E6E6E6" : "none", display: "flex", flexDirection: "column", gap: 4 }}>
                <p style={{ fontSize: 11, color: "#64748b", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>{m.label}</p>
                <p style={{ fontSize: 24, fontWeight: 600, color: m.color, letterSpacing: "-0.01em", margin: 0, fontVariantNumeric: "tabular-nums" }}>{m.value}</p>
                <p style={{ fontSize: 11.5, color: "#475569", margin: 0 }}>{m.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Charts row */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>

          {/* Stacked bar */}
          <div style={CARD}>
            <div style={CARD_HEAD}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600}}>Total invoices processed</h3>
                  <ScopePill variant="range">Selected period</ScopePill>
                  <ScopePill variant="today">{granLabel}</ScopePill>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                  <strong style={{ color: "#94a3b8" }}>Cohort view:</strong> invoices ingested in the selected period, colored by current status
                </p>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
                {(["extraction", "review", "approved", "rejected"] as DisplayStatus[]).map(s => (
                  <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_COLOR[s], display: "inline-block" }} />
                    {STATUS_LABEL[s]}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ ...CARD_BODY, height: 300 }}>
              {mounted && chartHasData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barCategoryGap="20%" barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E6E6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                    <Tooltip content={<BarTooltipContent />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                    {(statusFilter === "all" || statusFilter === "extraction") && <Bar dataKey="Extraction" stackId="a" fill={STATUS_COLOR.extraction} maxBarSize={24} />}
                    {(statusFilter === "all" || statusFilter === "review")     && <Bar dataKey="In Review"  stackId="a" fill={STATUS_COLOR.review}     maxBarSize={24} />}
                    {(statusFilter === "all" || statusFilter === "approved")   && <Bar dataKey="Approved"   stackId="a" fill={STATUS_COLOR.approved}   maxBarSize={24} />}
                    {(statusFilter === "all" || statusFilter === "rejected")   && <Bar dataKey="Rejected"   stackId="a" fill={STATUS_COLOR.rejected}   maxBarSize={24} radius={[3,3,0,0]} />}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#94a3b8" }}>No data for selected filters</p>
                  <p style={{ fontSize: 12, color: "#64748b" }}>Try widening the date range or clearing the status filter.</p>
                </div>
              )}
            </div>
          </div>

          {/* Donut */}
          <div style={CARD}>
            <div style={CARD_HEAD}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600}}>Status distribution</h3>
                  <ScopePill variant="today">As of today</ScopePill>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                  <strong style={{ color: "#94a3b8" }}>Stock view:</strong> open tickets + approvals in last 30 days. Rejected excluded.
                </p>
              </div>
            </div>
            <div style={CARD_BODY}>
              {mounted && donutTotal > 0 ? (
                <>
                  <div style={{ position: "relative", height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={donutData} cx="50%" cy="50%" innerRadius="60%" outerRadius="80%" dataKey="value" strokeWidth={0}>
                          {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip content={<DonutTooltipContent />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                      <p style={{ fontSize: 10,fontWeight: 500, letterSpacing: "0.08em", margin: 0 }}>TOTAL</p>
                      <p style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmt(donutTotal)}</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px", paddingTop: 8 }}>
                    {(["extraction", "review", "approved"] as const).map(s => {
                      const count = donutCounts[s];
                      const pct   = donutTotal ? (count / donutTotal * 100).toFixed(1) : "0.0";
                      return (
                        <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#94a3b8", padding: "6px 0" }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_COLOR[s], flexShrink: 0 }} />
                          <span style={{ color: "#64748b", flex: 1 }}>{STATUS_LABEL[s]}</span>
                          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(count)}</span>
                          <span style={{ color: "#475569", fontSize: 11.5, minWidth: 38, textAlign: "right" }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#94a3b8" }}>No invoices in scope</p>
                  <p style={{ fontSize: 12, color: "#64748b" }}>Adjust the user filter.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* User performance table */}
        <div style={CARD}>
          <div style={CARD_HEAD}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600}}>User performance</h3>
                <ScopePill variant="range">Selected period</ScopePill>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                <strong style={{ color: "#94a3b8" }}>Cohort view:</strong> per-user volume of invoices ingested in the selected period, broken down by current status
              </p>
            </div>
            <FilterSelect label="Sort" value={userSort} onChange={setUserSort} options={SORT_OPTIONS} />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F5F5F5", borderBottom: "1px solid #E0E0E0" }}>
                  {["User", "Total", "Extraction", "In Review", "Approved", "Rejected", "Status mix", "Value (USD)", "Avg. cycle"].map(h => (
                    <th key={h} style={{ textAlign: h === "User" ? "left" : "right", fontSize: 11, fontWeight: 500, color: "#64748b",
                      padding: "10px 14px", borderBottom: "1px solid #E6E6E6" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userTableData.filter(u => u.total > 0).length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: "#64748b", fontSize: 13 }}>No invoices match the current filters.</td></tr>
                ) : userTableData.map(u => {
                  const mix   = u.ext + u.rev + u.apr + u.rej;
                  const w     = (n: number) => mix === 0 ? "0%" : (n / mix * 100).toFixed(1) + "%";
                  const av    = AVATAR_COLORS[u.ci];
                  return (
                    <tr key={u.name} style={{ borderBottom: "1px solid rgb(229, 231, 235) "}}>
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: av.bg, color: av.fg, border: av.border,
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                            {u.initials}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 500 }}>{u.name}</p>
                            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{u.level}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right",fontSize:"14px"}}>{fmt(u.total)}</td>
                      {([
                        { v: u.ext, s: "extraction" },
                        { v: u.rev, s: "review" },
                        { v: u.apr, s: "approved" },
                        { v: u.rej, s: "rejected" },
                      ] as { v: number; s: DisplayStatus }[]).map(({ v, s }) => (
                        <td key={s} style={{ padding: "12px 14px", textAlign: "right" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999,
                            background: STATUS_BG[s], color: STATUS_COLOR[s], fontSize: 11.5, fontWeight: 500 }}>{v}</span>
                        </td>
                      ))}
                      <td style={{ padding: "12px 14px", minWidth: 130 }}>
                        <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "#E6E6E6" }}>
                          {[{ v: u.ext, s: "extraction" }, { v: u.rev, s: "review" }, { v: u.apr, s: "approved" }, { v: u.rej, s: "rejected" }].map(({ v, s }) => (
                            <span key={s} style={{ width: w(v), background: STATUS_COLOR[s as DisplayStatus], display: "block" }} />
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}><strong>{usdFmt(u.value)}</strong></td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "#64748b" }}>{u.cycle}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live workload */}
        <div style={CARD}>
          <div style={CARD_HEAD}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600}}>Live workload by user</h3>
                <ScopePill variant="today">As of today</ScopePill>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                <strong style={{ color: "#94a3b8" }}>Stock view:</strong> currently open invoices in each user&apos;s queue, with the oldest waiting item
              </p>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F5F5F5" }}>
                  {["User", "Open", "Extraction", "In Review", "Aged > 7d", "Oldest item", "Open value (USD)"].map(h => (
                    <th key={h} style={{ textAlign: h === "User" ? "left" : "right", fontSize: 11, fontWeight: 500, color: "#64748b",
                      padding: "10px 14px",borderBottom: "1px solid rgb(229, 231, 235) "}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workloadData.every(u => u.total === 0) ? (
                  <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "#64748b", fontSize: 13 }}>No open invoices in any queue.</td></tr>
                ) : workloadData.map(u => {
                  const oldestColor = u.oldest > 7 ? "#f87171" : u.oldest > 3 ? "#fbbf24" : "#64748b";
                  const oldestBg    = u.oldest > 7 ? "rgba(239,68,68,0.1)" : u.oldest > 3 ? "rgba(251,191,36,0.1)" : "rgba(0,0,0,0.05)";
                  const av = AVATAR_COLORS[u.ci];
                  return (
                    <tr key={u.name} style={{  borderBottom: "1px solid rgb(229, 231, 235) " }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: av.bg, color: av.fg, border: av.border,
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                            {u.initials}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 500 }}>{u.name}</p>
                            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{u.level}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>{u.total}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 999, background: STATUS_BG.extraction, color: STATUS_COLOR.extraction, fontSize: 11.5, fontWeight: 500 }}>{u.ext}</span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 999, background: STATUS_BG.review, color: STATUS_COLOR.review, fontSize: 11.5, fontWeight: 500 }}>{u.rev}</span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {u.aged > 0
                          ? <span style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: 11.5, fontWeight: 500 }}>{u.aged}</span>
                          : <span style={{ color: "#475569", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {u.total === 0
                          ? <span style={{ color: "#475569" }}>—</span>
                          : <span style={{ padding: "3px 10px", borderRadius: 999, background: oldestBg, color: oldestColor, fontSize: 11.5, fontWeight: 500 }}>{u.oldest}d</span>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}><strong style={{ color: "#101828" }}>{u.total > 0 ? usdFmt(u.value) : "$0"}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Aging grids */}
        <div style={CARD}>
          <div style={CARD_HEAD}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Aging of tickets</h3>
                <ScopePill variant="today">As of 30 Apr 2026</ScopePill>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                Top grid: time-since-ingestion for open tickets (days). Bottom grid: cycle time to completion for last 30 days (minutes).
              </p>
            </div>
            <FilterSelect label="User" value={agingUser} onChange={setAgingUser} options={USER_OPTIONS} />
          </div>
          <div style={CARD_BODY}>
            <AgingSection
              title="Open queue" tag="time since ingestion"
              rows={agingData.openRows}
              colHeaders={["0–1d", "2–3d", "4–7d", "8–14d", "15d+"]}
            />
            <AgingSection
              title="Completed" tag="cycle time to completion · last 30 days"
              rows={agingData.doneRows}
              colHeaders={["< 1 min", "1–3 min", "3–5 min", "5–10 min", "10+ min"]}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {[
                  { label: "None",     style: HEAT[0] },
                  { label: "Low",      style: HEAT[1] },
                  { label: "Watch",    style: HEAT[2] },
                  { label: "Risk",     style: HEAT[3] },
                  { label: "Critical", style: HEAT[4] },
                ].map(({ label, style }) => (
                  <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: style.bg, border: "1px solid #E6E6E6", display: "inline-block" }} />
                    {label}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 12, color: "#64748b" }}>Color encodes the count relative to the row.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default withAuthGuard(InsightsPage);
