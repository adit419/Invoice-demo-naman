import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui";
import { StageTransitionOverlay } from "@/components/StageTransitionOverlay";
import { directpayService, DpContractRun, DpInvoiceRun } from "@/services/directpay";
import { invoiceRoute } from "@/utils/directpayRoutes";

// Every upload (invoice or contract, Auto-Process on or off) shows a focused
// extraction loader and then lands the human straight on the review screen —
// there's no reason to make them notice a dashboard row and click in
// themselves once extraction is already done. For an Auto-Process invoice,
// extraction is already running in the background (the upload endpoint kicked
// off stp.py's cascade), so this polls for it rather than re-triggering it;
// for a manual invoice there's no background task, so the dashboard calls
// /extract directly. Poll instead of guessing a fixed delay so this holds
// even if the simulated extraction latency changes.

// Contracts have no separate extract/validate API steps — base_fields are
// already populated at upload — so this is a simulated two-phase pacing
// delay before handing off to the review screen, matching the same
// extract-then-validate feel Invoice Processing shows for real.
const CONTRACT_EXTRACTING_MS = 3000;
const CONTRACT_VALIDATING_MS = 2000;

// Invoices do have a real extract step, but no separate
// validate step of their own at upload time — this is a simulated pacing
// delay for that phase, same idea as the contract side.
const INVOICE_VALIDATING_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Tab = "invoices" | "contracts";

// ── Same tone palette as the Invoice Processing dashboard's StageTag ──────────
const ANTD_TAG = {
  cyan: { bg: "#E6FFFB", color: "#08979C", border: "#87E8DE" },
  purple: { bg: "#F9F0FF", color: "#722ED1", border: "#D3ADF7" },
  geekblue: { bg: "#F0F5FF", color: "#2F54EB", border: "#ADC6FF" },
  green: { bg: "#F6FFED", color: "#389E0D", border: "#B7EB8F" },
  red: { bg: "#FFF1F0", color: "#CF1322", border: "#FFA39E" },
} as const;

const INVOICE_STAGE_TAG: Record<string, { label: string; tone: keyof typeof ANTD_TAG }> = {
  extraction: { label: "Extraction", tone: "cyan" },
  extracted: { label: "Extracted", tone: "cyan" },
  fp_extraction: { label: "Faktur Pajak", tone: "geekblue" },
  matching: { label: "Matching", tone: "purple" },
  bill_posting: { label: "Bill Posting", tone: "geekblue" },
  posted: { label: "Posted", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

const CONTRACT_STAGE_TAG: Record<string, { label: string; tone: keyof typeof ANTD_TAG }> = {
  review: { label: "Review", tone: "cyan" },
  postprocessing: { label: "Postprocessing", tone: "cyan" },
  saved: { label: "Saved", tone: "green" },
};

// An invoice is "completely processed" once it's posted to the ERP or
// rejected — those are the only terminal outcomes. Everything before that
// (extraction/extracted/matching/bill_posting) is still Open, same as
// Invoice Processing's own Open/Closed split.
const INVOICE_CLOSED_STATUSES = new Set(["posted", "rejected"]);

function StageTag({ tag }: { tag: { label: string; tone: keyof typeof ANTD_TAG } | undefined }) {
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

// ── Source icons (mirrors pages/dashboard.tsx's own SourceIcon/getSourceTypes
// — same inline SVGs, same email-vs-manual distinction, minus "freshdesk"
// which DP has no equivalent ingestion path for) ─────────────────────────────

type InvoiceSourceType = "email" | "manual";

function SourceIcon({ type }: { type: InvoiceSourceType }) {
  const color = type === "email" ? "#1876FF" : "#8D92A6";
  if (type === "email") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    );
  }
  // manual upload
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

// DP's own /ingestion/trigger-upload (single or batch) mimics email
// ingestion the same way P2P's does — see service.upload_invoice's `source`.
function getInvoiceSourceType(inv: DpInvoiceRun): InvoiceSourceType {
  return inv.source === "trigger" ? "email" : "manual";
}

const CELL_PRIMARY: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: "#414651",
  fontFamily: "Inter, sans-serif",
};
const CELL_MUTED: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: "#8D92A6",
  fontFamily: "Inter, sans-serif",
};

const INPUT_S: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14, height: 44,
  border: "1px solid #E5E7EB", borderRadius: 8, outline: "none", boxSizing: "border-box",
  color: "#414651", background: "#ffffff", fontFamily: "Inter, sans-serif",
};

function fmtMoney(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return "NA";
  return `${currency ?? ""} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`.trim();
}

function toIsoDate(iso: string): Date {
  return new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z");
}

function formatTimestamp(iso: string): string {
  try {
    return toIsoDate(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}


function contractRoute(c: DpContractRun): string {
  if (c.status === "postprocessing") {
    return `/directpay/contract/${c.id}/extraction-postprocessing`;
  }
  return `/directpay/contract/${c.id}/review`;
}

// Statuses at which an Auto-Process run is definitely no longer mid-cascade —
// the fallback for releasing the local lock when no stp_state was published.
const STP_TERMINAL = new Set(["bill_posting", "posted", "rejected"]);

function invoiceAction(
  inv: DpInvoiceRun,
  locallyProcessing = false,
): { label: string; primary: boolean; disabled: boolean } {
  // With Auto-Process on, the upload stays on this page, so the row itself is
  // what reports progress — from the server's stp_state, or from this tab's own
  // lock during the moment before the first state is published.
  if (locallyProcessing || inv.stp_state === "processing") {
    return { label: "Processing", primary: false, disabled: true };
  }
  if (inv.status === "extraction") return { label: "Review", primary: true, disabled: false };
  if (INVOICE_CLOSED_STATUSES.has(inv.status)) return { label: "View", primary: false, disabled: false };
  return { label: "Continue", primary: false, disabled: false };
}

function contractAction(c: DpContractRun): { label: string; primary: boolean; disabled: boolean } {
  if (c.status === "review") return { label: "Review", primary: true, disabled: false };
  if (c.status === "postprocessing") return { label: "Continue", primary: true, disabled: false };
  return { label: "View", primary: false, disabled: false };
}

// ── Filter categories (mirrors Invoice Processing's Filter popover, scoped to
//    the fields DirectPay actually has for each entity) ──────────────────────

type FilterCategory = "status" | "date" | "vendor" | "amount";

const FILTER_LABEL: Record<FilterCategory, string> = {
  status: "Status",
  date: "Date Range",
  vendor: "Vendor Name",
  amount: "Amount Range",
};

function PaneSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
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

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
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

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  categories: FilterCategory[];
  statusOptions: { value: string; label: string }[];
  selectedStatuses: Set<string>; onStatusChange: (v: string) => void;
  dateFrom: string; onDateFrom: (v: string) => void;
  dateTo: string; onDateTo: (v: string) => void;
  selectedVendors: Set<string>; onVendorChange: (v: string) => void; vendorOptions: string[];
  amountMin: string; onAmountMin: (v: string) => void;
  amountMax: string; onAmountMax: (v: string) => void;
  onClear: () => void;
}

function FilterPanel(p: FilterPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>(p.categories[0]);
  const [paneSearch, setPaneSearch] = useState("");

  useEffect(() => {
    if (!p.open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) p.onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [p.open]);

  useEffect(() => {
    if (!p.categories.includes(activeCategory)) setActiveCategory(p.categories[0]);
  }, [p.categories, activeCategory]);

  if (!p.open) return null;

  const switchCategory = (c: FilterCategory) => { setActiveCategory(c); setPaneSearch(""); };

  const paneLabelS: React.CSSProperties = {
    fontSize: 14, fontWeight: 600, color: "#181D27", marginBottom: 12,
    display: "block", fontFamily: "Inter, sans-serif",
  };

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todayStr = iso(new Date());
  const last7Str = iso(new Date(Date.now() - 6 * 86400000));
  const isAllTime = !p.dateFrom && !p.dateTo;
  const isToday = p.dateFrom === todayStr && p.dateTo === todayStr;
  const isLast7 = p.dateFrom === last7Str && p.dateTo === todayStr;

  const q = paneSearch.toLowerCase();

  const paneSelection: { options: string[]; selected: Set<string>; toggle: (v: string) => void } | null =
    activeCategory === "status" ? { options: p.statusOptions.map(o => o.value), selected: p.selectedStatuses, toggle: p.onStatusChange } :
    activeCategory === "vendor" ? { options: p.vendorOptions, selected: p.selectedVendors, toggle: p.onVendorChange } :
    null;
  const selectAll = () => paneSelection?.options.forEach(o => { if (!paneSelection.selected.has(o)) paneSelection.toggle(o); });
  const clearPane = () => {
    if (paneSelection) { paneSelection.options.forEach(o => { if (paneSelection.selected.has(o)) paneSelection.toggle(o); }); return; }
    if (activeCategory === "amount") { p.onAmountMin(""); p.onAmountMax(""); }
  };

  const renderContent = () => {
    switch (activeCategory) {
      case "status":
        return (
          <>
            <PaneSearch value={paneSearch} onChange={setPaneSearch} placeholder="Search Status" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {p.statusOptions.filter(f => f.label.toLowerCase().includes(q)).map(f => (
                <CheckRow key={f.value} checked={p.selectedStatuses.has(f.value)} onChange={() => p.onStatusChange(f.value)}>
                  {f.label}
                </CheckRow>
              ))}
            </div>
          </>
        );
      case "date":
        return (
          <>
            <span style={paneLabelS}>Filter by Date Range</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              <FilterPill active={isAllTime} onClick={() => { p.onDateFrom(""); p.onDateTo(""); }}>All Time</FilterPill>
              <FilterPill active={isToday} onClick={() => { p.onDateFrom(todayStr); p.onDateTo(todayStr); }}>Today</FilterPill>
              <FilterPill active={isLast7} onClick={() => { p.onDateFrom(last7Str); p.onDateTo(todayStr); }}>Last 7 days</FilterPill>
            </div>
            <span style={paneLabelS}>Custom Date Range</span>
            <div style={{ display: "flex", gap: 12 }}>
              <input type="date" value={p.dateFrom} onChange={e => p.onDateFrom(e.target.value)} style={{ ...INPUT_S, flex: 1 }} />
              <input type="date" value={p.dateTo} onChange={e => p.onDateTo(e.target.value)} style={{ ...INPUT_S, flex: 1 }} />
            </div>
          </>
        );
      case "vendor":
        return (
          <>
            <PaneSearch value={paneSearch} onChange={setPaneSearch} placeholder="Search Vendor Name" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1, minHeight: 0 }}>
              {p.vendorOptions.filter(v => v.toLowerCase().includes(q)).map(v => (
                <CheckRow key={v} checked={p.selectedVendors.has(v)} onChange={() => p.onVendorChange(v)}>{v}</CheckRow>
              ))}
              {p.vendorOptions.length === 0 && (
                <span style={{ fontSize: 13, color: "#8D92A6", fontFamily: "Inter, sans-serif" }}>No vendors yet</span>
              )}
            </div>
          </>
        );
      case "amount":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <input type="number" value={p.amountMin} onChange={e => p.onAmountMin(e.target.value)} placeholder="Min Amount" style={INPUT_S} />
            <input type="number" value={p.amountMax} onChange={e => p.onAmountMax(e.target.value)} placeholder="Max Amount" style={INPUT_S} />
          </div>
        );
    }
  };

  const showSelectAll = paneSelection !== null;
  const showFooter = showSelectAll || activeCategory === "amount";

  return (
    <div ref={ref}
      style={{
        position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
        width: 460, maxWidth: "calc(100vw - 300px)", height: 400, background: "#ffffff",
        border: "1px solid #EBEDF0", borderRadius: 12,
        boxShadow: "0 12px 32px rgba(16,24,40,0.12)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 10px" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#181D27", fontFamily: "Inter, sans-serif" }}>Filter</span>
        <button onClick={p.onClear}
          style={{ fontSize: 14, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
          Clear all filter
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 150, borderRight: "1px solid #F0F0F0", flexShrink: 0, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {p.categories.map(cat => {
            const isActive = activeCategory === cat;
            return (
              <button key={cat} onClick={() => switchCategory(cat)}
                style={{
                  width: "100%", textAlign: "left", padding: "0 14px", height: 41,
                  fontSize: 14, fontWeight: 500, borderRadius: 8,
                  background: isActive ? "#EEF4FF" : "transparent",
                  color: isActive ? "#1876FF" : "#414651",
                  border: "none", cursor: "pointer", transition: "background 0.1s",
                  fontFamily: "Inter, sans-serif",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F9F9F9"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                {FILTER_LABEL[cat]}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, padding: "14px 18px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {renderContent()}
          </div>
          {showFooter && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 18px", borderTop: "1px solid #F0F0F0", flexShrink: 0,
            }}>
              {showSelectAll ? (
                <button onClick={selectAll}
                  style={{ fontSize: 14, color: "#414651", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", padding: 0 }}>
                  Select all
                </button>
              ) : <span />}
              <button onClick={clearPane}
                style={{ fontSize: 14, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", padding: 0 }}>
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

function DirectPayDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "tenant_admin" || user?.role === "workspace_admin";
  // The Invoices/Contracts switcher lives in the global NavSidebar (under the
  // DirectPay group) — this page just renders whichever tab the URL asks for.
  const tab: Tab = router.query.tab === "contracts" ? "contracts" : "invoices";
  const [invoices, setInvoices] = useState<DpInvoiceRun[]>([]);
  const [contracts, setContracts] = useState<DpContractRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  // Every upload (invoice or contract) replaces the dashboard with a focused
  // full-page loader while extraction runs, then hands off straight to the
  // review screen — "the user should not be taken through individual
  // processing stages" applies regardless of Auto-Process being on or off.
  const [autoExtracting, setAutoExtracting] = useState<"invoice" | "contract" | null>(null);
  // Runs this tab just handed to Auto-Process. Holds the row disabled from the
  // instant of upload, covering the gap before the server publishes its first
  // stp_state — without it the row is briefly clickable as "Review" while the
  // cascade is already running. Same mechanism, and same auto-clear, as P2P's
  // own dashboard (stpProcessingIds / STP_TERMINAL).
  const [stpProcessingIds, setStpProcessingIds] = useState<Set<string>>(new Set());
  const [contractPhase, setContractPhase] = useState<"extracting" | "validating">("extracting");
  const [invoicePhase, setInvoicePhase] = useState<"extracting" | "validating">("extracting");
  const fileRef = useRef<HTMLInputElement>(null);

  // DirectPay's own Auto-Process toggle — independent of Invoice Processing's,
  // and applies to invoices only (contracts always require a manual Approve).
  const [stpEnabled, setStpEnabled] = useState(false);
  const [stpLoading, setStpLoading] = useState(true);
  const [stpSaving, setStpSaving] = useState(false);

  useEffect(() => {
    directpayService.getStp()
      .then((d) => setStpEnabled(d.stp_enabled))
      .catch(() => {})
      .finally(() => setStpLoading(false));
  }, []);

  const toggleStp = async () => {
    if (!isAdmin || stpSaving) return;
    const next = !stpEnabled;
    setStpSaving(true);
    setStpEnabled(next);
    try {
      await directpayService.setStp(next);
    } catch {
      setStpEnabled(!next);
      toast("Failed to update Auto-Process", "error");
    } finally {
      setStpSaving(false);
    }
  };

  // Open = still moving through extraction/matching; Closed = fully reviewed
  // (accepted/validated/rejected). Invoices only — contracts have no such split.
  const [invoiceSubTab, setInvoiceSubTab] = useState<"open" | "closed">("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set());
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [tableScrolling, setTableScrolling] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTableScroll = () => {
    setTableScrolling(true);
    if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    scrollHideTimer.current = setTimeout(() => setTableScrolling(false), 600);
  };
  useEffect(() => () => { if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current); }, []);

  const load = useCallback(async () => {
    try {
      const [inv, con] = await Promise.all([directpayService.listInvoices(), directpayService.listContracts()]);
      setInvoices(inv.items);
      setContracts(con.items);
      // Release the local lock as soon as the server publishes a settled state:
      // "done" (the cascade posted the bill) or "waiting_review" (it stopped for
      // a person). A terminal status is the fallback for a run with no state.
      setStpProcessingIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const i of inv.items) {
          const settled = !!i.stp_state && i.stp_state !== "processing";
          if (next.has(i.id) && (settled || STP_TERMINAL.has(i.status))) next.delete(i.id);
        }
        return next.size === prev.size ? prev : next;
      });
    } catch {
      toast("Could not load DirectPay dashboard", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll so an Auto-Process cascade running in the background (upload ->
  // extraction -> AI contract match -> accept) shows up without a manual
  // refresh — mirrors Invoice Processing's own dashboard polling.
  useEffect(() => {
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const clearFilters = useCallback(() => {
    setSelectedStatuses(new Set()); setDateFrom(""); setDateTo("");
    setSelectedVendors(new Set()); setAmountMin(""); setAmountMax("");
  }, []);

  // Switching Invoices/Contracts in the left panel is a fresh list — drop any
  // search/filter state scoped to the previous entity.
  useEffect(() => {
    setSearchQuery("");
    clearFilters();
    setInvoiceSubTab("open");
    setPage(1);
  }, [tab, clearFilters]);

  useEffect(() => { setPage(1); }, [pageSize, searchQuery, selectedStatuses, dateFrom, dateTo, selectedVendors, amountMin, amountMax, invoiceSubTab]);

  // Batch invoice upload — selecting multiple files at once (e.g. Palladium's
  // rent/electricity/water invoices for the same vendor) shouldn't force the
  // user through one upload dialog per document. Each file still goes through
  // the exact same upload+extract calls as the single-file path below; this
  // just loops them and shows one combined progress list instead of routing
  // to a single review screen (there's no single "the" invoice to land on
  // once more than one run has been created).
  type BatchFileStatus = { name: string; status: "pending" | "uploading" | "done" | "error" };
  const [batchFiles, setBatchFiles] = useState<BatchFileStatus[] | null>(null);

  const handleUploadInvoices = async (files: File[]) => {
    const local: BatchFileStatus[] = files.map(f => ({ name: f.name, status: "pending" }));
    setBatchFiles([...local]);
    const runIds: string[] = [];
    for (let i = 0; i < files.length; i++) {
      local[i] = { ...local[i], status: "uploading" };
      setBatchFiles([...local]);
      try {
        // One file can resolve to SEVERAL runs (a combined multi-invoice PDF —
        // see uploadInvoice), so handle each of them.
        const runs = await directpayService.uploadInvoice(files[i]);
        for (const run of runs) {
          runIds.push(run.id);
          // With Auto-Process on, the server-side cascade owns the whole
          // pipeline — extraction included. Waiting on it here would just stall
          // the uploader for something already in hand.
          if (stpEnabled) setStpProcessingIds((prev) => new Set([...prev, run.id]));
          else await directpayService.extractInvoice(run.id);
        }
        local[i] = { ...local[i], status: "done" };
      } catch {
        local[i] = { ...local[i], status: "error" };
      }
      setBatchFiles([...local]);
    }
    const failed = local.filter(l => l.status === "error").length;
    const uniqueRunIds = Array.from(new Set(runIds));
    // All selected files resolved to the SAME run — e.g. an invoice and its
    // separately-uploaded Faktur Pajak (Palladium's case: upload_invoice
    // dedupes a second upload with the same document_key onto the first
    // run's own id, see service.py). That's the same single-result outcome
    // as the one-file upload path below, so it gets the same "resolve
    // straight to Extraction" treatment instead of leaving the user on the
    // dashboard to go find and click the row themselves.
    if (uniqueRunIds.length === 1 && failed === 0 && !stpEnabled) {
      setBatchFiles(null);
      setAutoExtracting("invoice");
      setInvoicePhase("validating");
      await sleep(INVOICE_VALIDATING_MS);
      setAutoExtracting(null);
      router.push(`/directpay/invoice/${uniqueRunIds[0]}/review`);
      return;
    }
    await sleep(500);
    setBatchFiles(null);
    await load();
    if (failed > 0) {
      toast(`${files.length - failed} of ${files.length} invoices uploaded — ${failed} failed`, failed === files.length ? "error" : "warning");
    } else {
      toast(`${files.length} invoices uploaded`, "success");
    }
  };

  const handleUpload = async (file: File | File[]) => {
    setUploading(true);
    try {
      if (tab === "invoices") {
        // A single file can be several invoices — GRAHA_MEGARIA's 6-page PDF
        // holds four, each of which becomes its own run (see uploadInvoice).
        // Multi-file invoice selections go through handleUploadInvoices instead,
        // so this branch always has exactly one.
        const single = Array.isArray(file) ? file[0] : file;
        const runs = await directpayService.uploadInvoice(single);
        setUploading(false);

        // Auto-Process on: the whole pipeline is driven server-side, so there is
        // nothing for the uploader to wait on and nowhere to hand the user off
        // to. Stay on the dashboard — no extraction loader, no jump to the
        // Extraction screen — and let the row report progress from its own
        // stp_state while the 8s poll follows it. Mirrors P2P's own dashboard,
        // which likewise never navigates on upload while STP is on. The cascade
        // runs until it either posts the bill or stops at something that
        // genuinely needs a person (an unacknowledged mismatch, an unmatched
        // contract), which the row then shows.
        if (stpEnabled) {
          setStpProcessingIds((prev) => new Set([...prev, ...runs.map((r) => r.id)]));
          await load();
          toast(
            runs.length > 1
              ? `${runs.length} invoices uploaded — Auto-Process is running them`
              : "Invoice uploaded — Auto-Process is running it",
            "success",
          );
          return;
        }

        setAutoExtracting("invoice");
        setInvoicePhase("extracting");
        try {
          for (const run of runs) {
            // Manual: no background task runs extraction for us — call it
            // directly. The Extraction screen would otherwise do this same
            // call on load; doing it here just means it's already done by
            // the time we land there.
            await directpayService.extractInvoice(run.id);
          }
          setInvoicePhase("validating");
          await sleep(INVOICE_VALIDATING_MS);
        } finally {
          setAutoExtracting(null);
        }
        // Several invoices came out of the one file — there is no single "the"
        // invoice to land on, so reload the dashboard and say what happened,
        // mirroring the multi-run outcome of the batch path above.
        if (runs.length > 1) {
          await load();
          toast(`${runs.length} invoices found in ${single.name} — each is now processing separately`, "success");
          return;
        }
        router.push(`/directpay/invoice/${runs[0].id}/review`);
        return;
      }
      const runs = await directpayService.uploadContract(file);
      setUploading(false);
      setAutoExtracting("contract");
      setContractPhase("extracting");
      await sleep(CONTRACT_EXTRACTING_MS);
      setContractPhase("validating");
      await sleep(CONTRACT_VALIDATING_MS);
      setAutoExtracting(null);
      // Several contracts came in at once — each is its own run, so there is no
      // single "the" contract to land on. Same treatment as the invoice batch
      // path: reload the list and say what happened.
      if (runs.length > 1) {
        await load();
        toast(`${runs.length} contracts uploaded — each extracted separately`, "success");
        return;
      }
      router.push(`/directpay/contract/${runs[0].id}/review`);
    } catch {
      toast(tab === "invoices" ? "Invoice upload failed" : "Contract upload failed", "error");
      setUploading(false);
      setAutoExtracting(null);
    }
  };

  const greeting = user?.full_name || user?.email || "there";

  // ── Filtering (scoped to the active tab's entity) ──────────────────────────
  const filterCategories: FilterCategory[] = tab === "invoices" ? ["status", "date", "vendor", "amount"] : ["status", "date", "vendor"];

  const statusOptions = (tab === "invoices" ? INVOICE_STAGE_TAG : CONTRACT_STAGE_TAG);
  const statusOptionList = Object.entries(statusOptions).map(([value, cfg]) => ({ value, label: cfg.label }));

  const vendorOptions = tab === "invoices"
    ? Array.from(new Set(invoices.map(i => i.extracted?.vendor_name).filter(Boolean) as string[])).sort()
    : Array.from(new Set(contracts.map(c => c.fields.vendor_name).filter(Boolean) as string[])).sort();

  const q = searchQuery.toLowerCase();

  const filteredInvoices = invoices.filter(inv => {
    const matchesTab = invoiceSubTab === "closed" ? INVOICE_CLOSED_STATUSES.has(inv.status) : !INVOICE_CLOSED_STATUSES.has(inv.status);
    if (!matchesTab) return false;
    const matchesSearch = !q ||
      inv.file_name.toLowerCase().includes(q) ||
      (inv.extracted?.vendor_name ?? "").toLowerCase().includes(q) ||
      (inv.extracted?.invoice_number ?? "").toLowerCase().includes(q);
    const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(inv.status);
    const d = toIsoDate(inv.created_at);
    const matchesDateFrom = !dateFrom || d >= new Date(dateFrom + "T00:00:00Z");
    const matchesDateTo = !dateTo || d <= new Date(dateTo + "T23:59:59Z");
    const matchesVendor = selectedVendors.size === 0 || selectedVendors.has(inv.extracted?.vendor_name ?? "");
    const matchesAmountMin = !amountMin || (inv.extracted?.total_amount ?? 0) >= parseFloat(amountMin);
    const matchesAmountMax = !amountMax || (inv.extracted?.total_amount ?? 0) <= parseFloat(amountMax);
    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesVendor && matchesAmountMin && matchesAmountMax;
  });

  const filteredContracts = contracts.filter(c => {
    const matchesSearch = !q ||
      c.file_name.toLowerCase().includes(q) ||
      (c.fields.vendor_name ?? "").toLowerCase().includes(q) ||
      (c.fields.customer_name ?? "").toLowerCase().includes(q);
    const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(c.status);
    const d = toIsoDate(c.created_at);
    const matchesDateFrom = !dateFrom || d >= new Date(dateFrom + "T00:00:00Z");
    const matchesDateTo = !dateTo || d <= new Date(dateTo + "T23:59:59Z");
    const matchesVendor = selectedVendors.size === 0 || selectedVendors.has(c.fields.vendor_name ?? "");
    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesVendor;
  });

  const activeFilterCount =
    (selectedStatuses.size > 0 ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) +
    (selectedVendors.size > 0 ? 1 : 0) + (amountMin || amountMax ? 1 : 0);

  const rows = tab === "invoices" ? filteredInvoices.length : filteredContracts.length;
  const totalPages = Math.max(1, Math.ceil(rows / pageSize));
  const pagedInvoices = filteredInvoices.slice((page - 1) * pageSize, page * pageSize);
  const pagedContracts = filteredContracts.slice((page - 1) * pageSize, page * pageSize);

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    setter(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });

  if (autoExtracting === "contract") {
    return (
      <StageTransitionOverlay
        title={
          contractPhase === "extracting"
            ? "We're extracting the contract details."
            : "We're validating the contract details."
        }
        subtitle="This may take a few minutes. Please keep this page open."
        steps={
          contractPhase === "extracting"
            ? [
                { label: "Uploading document", status: "done" },
                { label: "Extracting contract data", status: "active" },
              ]
            : [
                { label: "Uploading document", status: "done" },
                { label: "Extracting contract data", status: "done" },
                { label: "Validating contract terms", status: "active" },
              ]
        }
      />
    );
  }

  if (batchFiles) {
    const doneCount = batchFiles.filter(f => f.status === "done" || f.status === "error").length;
    return (
      <StageTransitionOverlay
        title={`We're processing ${batchFiles.length} invoices.`}
        subtitle={`${doneCount} of ${batchFiles.length} complete — please keep this page open.`}
        steps={batchFiles.map(f => ({
          label: f.name,
          status: f.status === "done" || f.status === "error" ? "done" : f.status === "uploading" ? "active" : "pending",
        }))}
      />
    );
  }

  if (autoExtracting === "invoice") {
    return (
      <StageTransitionOverlay
        title={
          invoicePhase === "extracting"
            ? "We're extracting the invoice data."
            : "We're validating the invoice data."
        }
        subtitle="This may take a few minutes. Please keep this page open."
        steps={
          invoicePhase === "extracting"
            ? [
                { label: "Uploading document", status: "done" },
                { label: "Extracting data from document", status: "active" },
              ]
            : [
                { label: "Uploading document", status: "done" },
                { label: "Extracting data from document", status: "done" },
                { label: "Validating invoice data", status: "active" },
              ]
        }
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", display: "flex", flexDirection: "column", fontFamily: "Inter, sans-serif" }}>
      <style jsx>{`
        .dp-dash-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }
        .dp-dash-scroll.scrolling { scrollbar-color: #c5c8ce transparent; }
        .dp-dash-scroll::-webkit-scrollbar { height: 8px; }
        .dp-dash-scroll::-webkit-scrollbar-track { background: transparent; }
        .dp-dash-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; transition: background 0.25s ease; }
        .dp-dash-scroll.scrolling::-webkit-scrollbar-thumb { background: #c5c8ce; }
      `}</style>

      {/* ── Greeting bar ── */}
      <div style={{ padding: "12px 32px", borderBottom: "1px solid #E6E6E6", background: "#ffffff" }}>
        <p style={{ margin: 0, fontSize: 14, color: "#414651", fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
          Hello, {greeting}
        </p>
      </div>

      {/* Invoices/Contracts switching lives in the global sidebar's DirectPay
          group now — this page just renders the tab the URL asks for. */}
      <div style={{ flex: 1, padding: "20px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ── Title row ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#101828", letterSpacing: "-0.5px", fontFamily: "Inter, sans-serif" }}>
              {tab === "invoices" ? "Invoices" : "Contracts"}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              {/* Auto-Process (STP) — invoices only; contracts always need a
                  manual Approve, so the toggle is hidden on the Contracts tab. */}
              {tab === "invoices" && !stpLoading && (
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "0 12px", height: 32, borderRadius: 6,
                    border: `1px solid ${stpEnabled ? "#A7F3D0" : "#D5D5D5"}`,
                    background: stpEnabled ? "#ECFDF5" : "#ffffff",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: stpEnabled ? "#059669" : "#717680", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap" }}>
                    Auto-Process
                  </span>
                  <button
                    type="button"
                    onClick={isAdmin ? toggleStp : undefined}
                    disabled={!isAdmin || stpSaving}
                    title={!isAdmin ? "Admins only" : stpEnabled ? "Disable Auto-Process (STP)" : "Enable Auto-Process (STP)"}
                    aria-pressed={stpEnabled}
                    style={{
                      display: "inline-flex", alignItems: "center",
                      width: 36, height: 20, borderRadius: 10,
                      border: "none", padding: 0,
                      cursor: !isAdmin ? "default" : "pointer",
                      background: stpEnabled ? "#059669" : "#D1D5DB",
                      opacity: stpSaving ? 0.6 : 1,
                      transition: "background 0.18s",
                      flexShrink: 0,
                    }}
                  >
                    <span style={{
                      width: 14, height: 14, borderRadius: "50%", background: "#ffffff",
                      display: "block",
                      transform: stpEnabled ? "translateX(19px)" : "translateX(3px)",
                      transition: "transform 0.18s",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                    }} />
                  </button>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  if (tab === "invoices") {
                    // Invoices keep their own per-file progress list, because one
                    // file can itself fan out into several runs.
                    if (files.length > 1) handleUploadInvoices(files);
                    else handleUpload(files[0]);
                  } else {
                    // Contracts: one run per file, uploaded in a single call.
                    handleUpload(files);
                  }
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !!batchFiles}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "0 16px", height: 32, borderRadius: 6,
                  fontSize: 14, fontWeight: 500,
                  background: "#1876FF", color: "#ffffff", border: "none",
                  cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.7 : 1,
                  fontFamily: "Inter, sans-serif",
                }}
                onMouseEnter={(e) => !uploading && (e.currentTarget.style.background = "#0F65E3")}
                onMouseLeave={(e) => !uploading && (e.currentTarget.style.background = "#1876FF")}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1.5v8M3.5 5l3.5-3.5L10.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M1.5 11.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {uploading ? "Uploading…" : tab === "invoices" ? "Add Invoice(s)" : "Add Contract"}
              </button>
            </div>
          </div>

          {/* ── Open / Closed tabs (invoices only — a completed review is Closed) ── */}
          {tab === "invoices" && (
            <div style={{ display: "flex", gap: 24, borderBottom: "1px solid #EBEDF0", marginTop: -6 }}>
              {([["open", "Open"], ["closed", "Closed"]] as const).map(([key, label]) => {
                const isActive = invoiceSubTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setInvoiceSubTab(key)}
                    style={{
                      padding: "8px 2px 10px",
                      fontSize: 14,
                      fontWeight: 600,
                      color: isActive ? "#1876FF" : "#585C65",
                      marginBottom: -1,
                      background: "transparent",
                      border: "none",
                      borderBottom: `2px solid ${isActive ? "#1876FF" : "transparent"}`,
                      cursor: "pointer",
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Search + Filter row ── */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ position: "relative", width: 320 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8D92A6" }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder={tab === "invoices" ? "Search Invoices..." : "Search Contracts..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                  height: 32, fontSize: 14, borderRadius: 6, outline: "none", boxSizing: "border-box",
                  border: "1px solid #D5D5D5", background: "#ffffff", color: "#414651",
                  fontFamily: "Inter, sans-serif",
                }}
                onFocus={e => (e.target.style.borderColor = "#1876FF")}
                onBlur={e => (e.target.style.borderColor = "#D5D5D5")}
              />
            </div>

            <div style={{ position: "relative" }}>
              <button
                onClick={() => setFilterOpen(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "0 14px", height: 32,
                  fontSize: 14, fontWeight: 500, borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${activeFilterCount > 0 ? "#1876FF" : "#D5D5D5"}`,
                  background: activeFilterCount > 0 ? "#E6F2FF" : "#ffffff",
                  color: activeFilterCount > 0 ? "#1876FF" : "#414651",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 17, height: 17, borderRadius: "50%", fontSize: 10, fontWeight: 700,
                    background: "#1876FF", color: "#fff",
                  }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <FilterPanel
                open={filterOpen} onClose={() => setFilterOpen(false)}
                categories={filterCategories}
                statusOptions={statusOptionList}
                selectedStatuses={selectedStatuses} onStatusChange={v => toggleSet(setSelectedStatuses, v)}
                dateFrom={dateFrom} onDateFrom={setDateFrom}
                dateTo={dateTo} onDateTo={setDateTo}
                selectedVendors={selectedVendors} onVendorChange={v => toggleSet(setSelectedVendors, v)} vendorOptions={vendorOptions}
                amountMin={amountMin} onAmountMin={setAmountMin}
                amountMax={amountMax} onAmountMax={setAmountMax}
                onClear={clearFilters}
              />
            </div>
          </div>

          {/* ── Table ── */}
          <div style={{ background: "#ffffff", border: "1px solid #E6E6E6", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div
              className={`dp-dash-scroll${tableScrolling ? " scrolling" : ""}`}
              onScroll={handleTableScroll}
              style={{ overflowX: "auto", minHeight: 47 + pageSize * 56 }}
            >
              <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 14, fontFamily: "Inter, sans-serif", tableLayout: "fixed" }}>
                {tab === "invoices" ? (
                  <>
                    <colgroup>
                      {[200, 200, 200, 130, 120, 140].map((w, i) => (
                        <col key={i} style={{ width: w }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {[
                          { label: "File Name / Time", align: "left" as const },
                          { label: "Vendor / Invoice #", align: "left" as const },
                          { label: "Matched Contract", align: "left" as const },
                          { label: "Amount", align: "right" as const },
                          { label: "Status", align: "left" as const },
                          { label: "Action", align: "left" as const, pin: true },
                        ].map((col) => (
                          <th
                            key={col.label}
                            style={{
                              padding: "12px 16px",
                              textAlign: col.align,
                              fontSize: 14, fontWeight: 600, color: "#717680",
                              background: "#F5F5F5", borderBottom: "1px solid #E0E0E0",
                              lineHeight: "22px", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
                              ...(col.pin ? { position: "sticky" as const, right: 0, zIndex: 2, borderLeft: "1px solid #E0E0E0" } : {}),
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <LoadingRows cols={6} />
                      ) : filteredInvoices.length === 0 ? (
                        <EmptyRow
                          cols={6}
                          label="No invoices found"
                          hint={
                            searchQuery || activeFilterCount > 0
                              ? "No invoices match your search or filters."
                              : invoiceSubTab === "closed"
                              ? "No invoices have been fully processed yet."
                              : "Upload your first invoice to get started."
                          }
                          pageSize={pageSize}
                        />
                      ) : (
                        pagedInvoices.map((inv) => {
                          const action = invoiceAction(inv, stpProcessingIds.has(inv.id));
                          const sourceType = getInvoiceSourceType(inv);
                          return (
                            <tr
                              key={inv.id}
                              style={{ borderBottom: "1px solid #E6E6E6" }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#F9F9F9";
                                (e.currentTarget.lastElementChild as HTMLElement | null)?.style.setProperty("background", "#F9F9F9");
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                                (e.currentTarget.lastElementChild as HTMLElement | null)?.style.setProperty("background", "#ffffff");
                              }}
                            >
                              <td style={{ padding: "10px 16px", cursor: "pointer" }} onClick={() => router.push(invoiceRoute(inv))}>
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, overflow: "hidden" }}>
                                  <span style={{ marginTop: 2 }}>
                                    <SourceIcon type={sourceType} />
                                  </span>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <span title={inv.file_name} style={{ ...CELL_PRIMARY, fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {inv.file_name}
                                    </span>
                                    <span style={{ ...CELL_MUTED, fontSize: 12.5, whiteSpace: "nowrap" }}>{formatTimestamp(inv.created_at)}</span>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: "10px 16px", cursor: "pointer" }} onClick={() => router.push(invoiceRoute(inv))}>
                                <span style={{ ...CELL_PRIMARY, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {inv.extracted?.vendor_name ?? "NA"}
                                </span>
                                <span style={{ ...CELL_MUTED, fontSize: 12.5, whiteSpace: "nowrap" }}>{inv.extracted?.invoice_number ?? "NA"}</span>
                              </td>
                              <td style={{ padding: "10px 16px", cursor: "pointer" }} onClick={() => router.push(invoiceRoute(inv))}>
                                <span style={CELL_PRIMARY}>
                                  {contracts.find((c) => c.id === inv.contract_id)?.fields.vendor_name ?? "NA"}
                                </span>
                              </td>
                              <td style={{ padding: "10px 16px", textAlign: "right", cursor: "pointer" }} onClick={() => router.push(invoiceRoute(inv))}>
                                <span style={{ ...CELL_PRIMARY, fontVariantNumeric: "tabular-nums" }}>
                                  {fmtMoney(inv.extracted?.total_amount, inv.extracted?.currency)}
                                </span>
                              </td>
                              <td style={{ padding: "10px 16px", cursor: "pointer" }} onClick={() => router.push(invoiceRoute(inv))}>
                                <StageTag tag={INVOICE_STAGE_TAG[inv.status]} />
                              </td>
                              <td style={{ padding: "10px 16px", position: "sticky", right: 0, zIndex: 1, background: "#ffffff", borderLeft: "1px solid #EBEDF0" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <button
                                    disabled={action.disabled}
                                    onClick={() => { if (!action.disabled) router.push(invoiceRoute(inv)); }}
                                    style={{ ...actionButtonStyle(action), display: "inline-flex", alignItems: "center", gap: 6 }}
                                  >
                                    {action.label === "Processing" && <ButtonSpinner />}
                                    {action.label}
                                  </button>
                                  <OpenInNewTab disabled={action.disabled} onClick={() => window.open(invoiceRoute(inv), "_blank", "noopener")} />
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </>
                ) : (
                  <>
                    <colgroup>
                      {[220, 200, 200, 120, 140].map((w, i) => (
                        <col key={i} style={{ width: w }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {[
                          { label: "File Name", pin: false },
                          { label: "Vendor", pin: false },
                          { label: "Customer", pin: false },
                          { label: "Status", pin: false },
                          { label: "Action", pin: true },
                        ].map((col) => (
                          <th
                            key={col.label}
                            style={{
                              padding: "12px 16px", textAlign: "left",
                              fontSize: 14, fontWeight: 600, color: "#717680",
                              background: "#F5F5F5", borderBottom: "1px solid #E0E0E0",
                              lineHeight: "22px", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
                              ...(col.pin ? { position: "sticky" as const, right: 0, zIndex: 2, borderLeft: "1px solid #E0E0E0" } : {}),
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <LoadingRows cols={5} />
                      ) : filteredContracts.length === 0 ? (
                        <EmptyRow cols={5} label="No contracts found" hint={searchQuery || activeFilterCount > 0 ? "No contracts match your search or filters." : "Upload your first contract to get started."} pageSize={pageSize} />
                      ) : (
                        pagedContracts.map((c) => {
                          const action = contractAction(c);
                          return (
                            <tr
                              key={c.id}
                              style={{ borderBottom: "1px solid #E6E6E6" }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#F9F9F9";
                                (e.currentTarget.lastElementChild as HTMLElement | null)?.style.setProperty("background", "#F9F9F9");
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                                (e.currentTarget.lastElementChild as HTMLElement | null)?.style.setProperty("background", "#ffffff");
                              }}
                            >
                              <td style={{ padding: "10px 16px", cursor: "pointer" }} onClick={() => router.push(contractRoute(c))}>
                                <span style={{ ...CELL_PRIMARY, fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {c.file_name}
                                </span>
                              </td>
                              <td style={{ padding: "10px 16px", cursor: "pointer" }} onClick={() => router.push(contractRoute(c))}>
                                <span style={CELL_PRIMARY}>{c.fields.vendor_name ?? "NA"}</span>
                              </td>
                              <td style={{ padding: "10px 16px", cursor: "pointer" }} onClick={() => router.push(contractRoute(c))}>
                                <span style={CELL_PRIMARY}>{c.fields.customer_name ?? "NA"}</span>
                              </td>
                              <td style={{ padding: "10px 16px", cursor: "pointer" }} onClick={() => router.push(contractRoute(c))}>
                                <StageTag tag={CONTRACT_STAGE_TAG[c.status]} />
                              </td>
                              <td style={{ padding: "10px 16px", position: "sticky", right: 0, zIndex: 1, background: "#ffffff", borderLeft: "1px solid #EBEDF0" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <button
                                    disabled={action.disabled}
                                    onClick={() => { if (!action.disabled) router.push(contractRoute(c)); }}
                                    style={{ ...actionButtonStyle(action), display: "inline-flex", alignItems: "center", gap: 6 }}
                                  >
                                    {action.label === "Processing" && <ButtonSpinner />}
                                    {action.label}
                                  </button>
                                  <OpenInNewTab disabled={action.disabled} onClick={() => window.open(contractRoute(c), "_blank", "noopener")} />
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </>
                )}
              </table>
            </div>

            {/* ── Footer: total + pagination ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid #E6E6E6", background: "#ffffff" }}>
              <span style={{ fontSize: 12, color: "#717680", fontFamily: "Inter, sans-serif" }}>
                Total {rows} item{rows === 1 ? "" : "s"}
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#717680", fontFamily: "Inter, sans-serif" }}>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  style={{
                    fontSize: 12, color: "#414651", fontFamily: "Inter, sans-serif",
                    border: "1px solid #D5D5D5", borderRadius: 6, padding: "3px 6px",
                    background: "#ffffff", cursor: "pointer", outline: "none",
                  }}
                >
                  {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ width: 28, height: 28, borderRadius: 6, border: "none", cursor: page === 1 ? "default" : "pointer", background: "transparent", color: page === 1 ? "#D1D5DB" : "#414651", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2.5L5 7l4 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "…" ? (
                        <span key={`e${idx}`} style={{ width: 28, textAlign: "center", fontSize: 12, color: "#8D92A6", fontFamily: "Inter, sans-serif" }}>…</span>
                      ) : (
                        <button key={item} onClick={() => setPage(item as number)}
                          style={{
                            width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                            background: page === item ? "#D1D5DB" : "transparent",
                            color: page === item ? "#1F1F1F" : "#414651",
                            fontFamily: "Inter, sans-serif",
                          }}
                          onMouseEnter={e => { if (page !== item) e.currentTarget.style.background = "#F3F4F6"; }}
                          onMouseLeave={e => { if (page !== item) e.currentTarget.style.background = "transparent"; }}
                        >
                          {item}
                        </button>
                      )
                    )}

                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ width: 28, height: 28, borderRadius: 6, border: "none", cursor: page === totalPages ? "default" : "pointer", background: "transparent", color: page === totalPages ? "#D1D5DB" : "#414651", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2.5L9 7l-4 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
function actionButtonStyle(action: { primary: boolean; disabled: boolean }): React.CSSProperties {
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
function ButtonSpinner() {
  return (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 1024 1024" style={{ flexShrink: 0 }}>
      <path
        fill="currentColor"
        d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 0 0-94.3-139.9 437.71 437.71 0 0 0-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"
      />
    </svg>
  );
}

function OpenInNewTab({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
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

function LoadingRows({ cols }: { cols: number }) {
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

function EmptyRow({ cols, label, hint, pageSize }: { cols: number; label: string; hint: string; pageSize: number }) {
  return (
    <tr>
      <td colSpan={cols} style={{ height: pageSize * 56, padding: 24, textAlign: "center", verticalAlign: "middle" }}>
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

export default withAuthGuard(DirectPayDashboard);
