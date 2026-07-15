import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";
import { UploadModal } from "@/components/UploadModal";
import { useAuth } from "@/hooks/useAuth";
import { invoicesService, settingsService } from "@/services";
import { useToast } from "@/components/ui";
import { InvoiceListItem } from "@/types/invoice";

// ── Routing ───────────────────────────────────────────────────────────────────

const STATUS_ROUTE: Record<string, string> = {
  extraction: "review",
  // vendor_validation is no longer a forward stage — folded into Matching ▸ Metadata.
  vendor_validation: "matching?tab=metadata",
  // metadata_validation + line_item_matching both live inside the unified
  // /matching page; we just pick the right tab.
  metadata_validation: "matching?tab=metadata",
  line_item_matching: "matching?tab=line_items",
  bill_posting: "bill-posting",
  // Posted invoices land back on the bill-posting page — it renders the
  // read-only "Bill Posted" view with the Zoho bill link in place.
  posted: "bill-posting",
  rejected: "rejected",
};

function invoiceRoute(id: string, status: string): string {
  return `/invoice/${id}/${STATUS_ROUTE[status] ?? "review"}`;
}

// ── Stage tag (matches invoice-validator-fe's AntD Tag with rounded-full px-3) ─
// Internal stage statuses are grouped into broad labels (Extraction / Matching /
// ERP Posting / Rejected / Error) exactly like validator-fe groups them.

// AntD v5 Tag color palette — matches the P2P-Flow Figma dashboard pills
// (Extraction cyan, Matching purple, ERP Posting geekblue, Error orange).
const ANTD_TAG = {
  cyan:     { bg: "#E6FFFB", color: "#08979C", border: "#87E8DE" },
  purple:   { bg: "#F9F0FF", color: "#722ED1", border: "#D3ADF7" },
  geekblue: { bg: "#F0F5FF", color: "#1D39C4", border: "#ADC6FF" },
  green:    { bg: "#F6FFED", color: "#389E0D", border: "#B7EB8F" },
  orange:   { bg: "#FFF7E6", color: "#D46B08", border: "#FFD591" },
  red:      { bg: "#FFF1F0", color: "#CF1322", border: "#FFA39E" },
} as const;

const STAGE_TAG: Record<string, { label: string; tone: keyof typeof ANTD_TAG; icon?: boolean }> = {
  extraction:          { label: "Extraction",  tone: "cyan" },
  vendor_validation:   { label: "Matching",    tone: "purple" },
  metadata_validation: { label: "Matching",    tone: "purple" },
  line_item_matching:  { label: "Matching",    tone: "purple" },
  bill_posting:        { label: "ERP Posting", tone: "geekblue" },
  posted:              { label: "Completed",   tone: "green" },
  rejected:            { label: "Rejected",    tone: "red", icon: true },
  error:               { label: "Error",       tone: "orange", icon: true },
};

// Figma dashboard pill: rounded-6 tag with tone bg/border, optional ⓘ icon
// for error-like states.
function StageTag({ status, loading }: { status: string; loading?: boolean }) {
  const cfg = STAGE_TAG[status];
  const tone = cfg ? ANTD_TAG[cfg.tone] : { bg: "#FAFAFA", color: "#595959", border: "#D9D9D9" };
  const label = cfg?.label ?? status;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
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
        textAlign: "start",
      }}>
        {cfg?.icon && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 3.5v3M6 8.4h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        )}
        {label}
      </span>
      {loading && (
        <svg
          className="animate-spin"
          width="14" height="14" viewBox="0 0 1024 1024"
          style={{ color: "#1890FF", flexShrink: 0 }}
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 0 0-94.3-139.9 437.71 437.71 0 0 0-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"
          />
        </svg>
      )}
    </div>
  );
}

// ── Source icons (inline SVG mimicking lucide-react Mail / Headset / Upload) ──

type SourceType = "gmail" | "freshdesk" | "manual";

function SourceIcon({ type }: { type: SourceType }) {
  const color = type === "gmail" ? "#1876FF" : "#8D92A6";
  if (type === "gmail") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    );
  }
  if (type === "freshdesk") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1zM21 11h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2a1 1 0 0 0 1-1z" />
        <path d="M21 12v-2a9 9 0 0 0-18 0v2" />
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null || amount === undefined) return "-";
  return `${currency || ""} ${amount.toLocaleString()}`.trim();
}

// Figma "Time" format: 14/03/2025 | 11:15
function formatTimestamp(dateStr: string): string {
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(dateStr) ? dateStr : dateStr + "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " | " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function getSourceType(inv: InvoiceListItem): SourceType {
  if (inv.source === "email") return "gmail";
  if (inv.source === "freshdesk") return "freshdesk";
  return "manual";
}

// ── Cell styles (mirroring validator-fe CELL_PRIMARY / CELL_MUTED) ────────────

const CELL_PRIMARY: React.CSSProperties = {
  fontSize: 14, fontWeight: 500, color: "#414651", fontFamily: "Inter, sans-serif",
};
const CELL_MUTED: React.CSSProperties = {
  fontSize: 14, fontWeight: 500, color: "#8D92A6", fontFamily: "Inter, sans-serif",
};

// ── Filter config (mirrors invoice-sprint's Filter popover) ──────────────────

type FilterCategory = "status" | "date" | "vendor" | "amount" | "source" | "invoice";

const FILTER_CATEGORIES: { id: FilterCategory; label: string }[] = [
  { id: "status",   label: "Status" },
  { id: "date",     label: "Date Range" },
  { id: "vendor",   label: "Vendor Name" },
  { id: "amount",   label: "Amount Range" },
  { id: "source",   label: "Source" },
  { id: "invoice",  label: "Invoice Number" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "extraction",   label: "Extraction",   statuses: ["extraction"] },
  { value: "matching",     label: "Matching",     statuses: ["vendor_validation", "metadata_validation", "line_item_matching"] },
  { value: "erp_posting",  label: "ERP Posting",  statuses: ["bill_posting", "posted"] },
  { value: "faktur_pajak", label: "Faktur Pajak", statuses: ["fp_extraction"] },
  { value: "error",        label: "Error",        statuses: ["error"] },
  { value: "rejected",     label: "Rejected",     statuses: ["rejected"] },
];

// Demo ingests via email (Gmail poller) instead of invoice-sprint's Freshdesk.
const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual Upload" },
  { value: "gmail",  label: "Gmail" },
];

const INPUT_S: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14, height: 44,
  border: "1px solid #E5E7EB", borderRadius: 8, outline: "none", boxSizing: "border-box",
  color: "#414651", background: "#ffffff", fontFamily: "Inter, sans-serif",
};

// ── Filter panel ──────────────────────────────────────────────────────────────

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  selectedStatuses: Set<string>;
  onStatusChange: (v: string) => void;
  dateFrom: string; onDateFrom: (v: string) => void;
  dateTo: string; onDateTo: (v: string) => void;
  selectedSources: Set<string>; onSourceChange: (v: string) => void;
  selectedVendors: Set<string>; onVendorChange: (v: string) => void; vendorOptions: string[];
  selectedInvoices: Set<string>; onInvoiceChange: (v: string) => void; invoiceOptions: string[];
  amountMin: string; onAmountMin: (v: string) => void;
  amountMax: string; onAmountMax: (v: string) => void;
  onClear: () => void;
}

// Search box used inside the Status / Vendor / Invoice panes (invoice-sprint style).
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

// Rounded pill toggle (Date Range presets + Source options, invoice-sprint style).
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

function FilterPanel(p: FilterPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("status");
  const [paneSearch, setPaneSearch] = useState("");

  useEffect(() => {
    if (!p.open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) p.onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [p.open]);

  if (!p.open) return null;

  const switchCategory = (c: FilterCategory) => { setActiveCategory(c); setPaneSearch(""); };

  const paneLabelS: React.CSSProperties = {
    fontSize: 14, fontWeight: 600, color: "#181D27", marginBottom: 12,
    display: "block", fontFamily: "Inter, sans-serif",
  };

  // Date presets (derived from the from/to values, invoice-sprint style pills)
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todayStr = iso(new Date());
  const last7Str = iso(new Date(Date.now() - 6 * 86400000));
  const isAllTime = !p.dateFrom && !p.dateTo;
  const isToday = p.dateFrom === todayStr && p.dateTo === todayStr;
  const isLast7 = p.dateFrom === last7Str && p.dateTo === todayStr;

  const q = paneSearch.toLowerCase();

  // Select-all / clear-all for the checkbox panes
  const paneSelection: { options: string[]; selected: Set<string>; toggle: (v: string) => void } | null =
    activeCategory === "status" ? { options: STATUS_FILTER_OPTIONS.map(o => o.value), selected: p.selectedStatuses, toggle: p.onStatusChange } :
    activeCategory === "vendor" ? { options: p.vendorOptions, selected: p.selectedVendors, toggle: p.onVendorChange } :
    activeCategory === "invoice" ? { options: p.invoiceOptions, selected: p.selectedInvoices, toggle: p.onInvoiceChange } :
    activeCategory === "source" ? { options: SOURCE_OPTIONS.map(o => o.value), selected: p.selectedSources, toggle: p.onSourceChange } :
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
              {STATUS_FILTER_OPTIONS.filter(f => f.label.toLowerCase().includes(q)).map(f => (
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
      case "source":
        return (
          <>
            <span style={paneLabelS}>Select Invoice Source</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {SOURCE_OPTIONS.map(s => (
                <FilterPill key={s.value} active={p.selectedSources.has(s.value)} onClick={() => p.onSourceChange(s.value)}>
                  <SourceIcon type={s.value as SourceType} />
                  {s.label}
                </FilterPill>
              ))}
            </div>
          </>
        );
      case "invoice":
        return (
          <>
            <PaneSearch value={paneSearch} onChange={setPaneSearch} placeholder="Search Invoice Number" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1, minHeight: 0 }}>
              {p.invoiceOptions.filter(v => v.toLowerCase().includes(q)).map(v => (
                <CheckRow key={v} checked={p.selectedInvoices.has(v)} onChange={() => p.onInvoiceChange(v)}>{v}</CheckRow>
              ))}
              {p.invoiceOptions.length === 0 && (
                <span style={{ fontSize: 13, color: "#8D92A6", fontFamily: "Inter, sans-serif" }}>No invoice numbers yet</span>
              )}
            </div>
          </>
        );
    }
  };

  const showSelectAll = paneSelection !== null;
  const showFooter = showSelectAll || activeCategory === "amount";

  return (
    <div ref={ref}
      style={{
        position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
        width: 594, maxWidth: "calc(100vw - 300px)", height: 428, background: "#ffffff",
        border: "1px solid #EBEDF0", borderRadius: 12,
        boxShadow: "0 12px 32px rgba(16,24,40,0.12)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Header — "Filter" + "Clear all filter" (invoice-sprint) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 10px" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#181D27", fontFamily: "Inter, sans-serif" }}>Filter</span>
        <button onClick={p.onClear}
          style={{ fontSize: 14, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
          Clear all filter
        </button>
      </div>

      {/* Body — category rail + content pane */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 180, borderRight: "1px solid #F0F0F0", flexShrink: 0, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {FILTER_CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <button key={cat.id} onClick={() => switchCategory(cat.id)}
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
                {cat.label}
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

// ── Dashboard Page ────────────────────────────────────────────────────────────

function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "tenant_admin" || user?.role === "workspace_admin";
  // All authenticated roles can process items per PRD §3.2
  const canUpload = !!user;

  // ── STP toggle ────────────────────────────────────────────────────────────
  const [stpEnabled, setStpEnabled] = useState(false);
  const [stpLoading, setStpLoading] = useState(true);
  const [stpSaving, setStpSaving] = useState(false);

  useEffect(() => {
    settingsService.getStp()
      .then(d => setStpEnabled(d.stp_enabled))
      .catch(() => {})
      .finally(() => setStpLoading(false));
  }, []);

  const toggleStp = async () => {
    if (!isAdmin || stpSaving) return;
    const next = !stpEnabled;
    setStpSaving(true);
    setStpEnabled(next);
    try {
      await settingsService.setStp(next);
    } catch {
      setStpEnabled(!next);
      toast("Failed to update Auto-Process", "error");
    } finally {
      setStpSaving(false);
    }
  };

  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());

  // Invoices uploaded while Auto-Process (STP) is ON stay in this set until
  // their status reaches a terminal stage (ERP Posting / posted / rejected / error).
  // While in this set: Review button is disabled + spinner shows next to the stage tag.
  const [stpProcessingIds, setStpProcessingIds] = useState<Set<string>>(new Set());

  // Statuses that release the STP lock:
  //   • bill_posting / posted / rejected / error  → STP ran to completion (or failed)
  //   • extraction                                → STP couldn't advance the invoice
  //     (e.g. Yellow Brick fixture doesn't support full pipeline); let the user review.
  const STP_TERMINAL = new Set(["extraction", "bill_posting", "posted", "rejected", "error"]);

  // Open = still being processed (incl. rejected/error); Closed = completely
  // processed (posted to ERP) — per the Figma dashboard tabs.
  const [activeTab, setActiveTab] = useState<"open" | "closed">("open");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  // Filters
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Horizontal-scroll indicator for the table: the scrollbar is visible only
  // while the user is actively scrolling left/right, then fades out quickly.
  const [tableScrolling, setTableScrolling] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTableScroll = () => {
    setTableScrolling(true);
    if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    scrollHideTimer.current = setTimeout(() => setTableScrolling(false), 600);
  };
  useEffect(() => () => { if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current); }, []);

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await invoicesService.list();
      setInvoices(data.items);

      // Auto-clear STP processing state once an invoice reaches a terminal status.
      setStpProcessingIds(prev => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        data.items.forEach(inv => {
          if (next.has(inv.id) && STP_TERMINAL.has(inv.status)) {
            next.delete(inv.id);
          }
        });
        return next.size === prev.size ? prev : next;
      });
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { setLoading(true); fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { const t = setInterval(fetchInvoices, 8000); return () => clearInterval(t); }, [fetchInvoices]);

  const vendorOptions = Array.from(new Set(invoices.map(i => i.vendor_name).filter(Boolean) as string[])).sort();
  const invoiceOptions = Array.from(new Set(invoices.map(i => i.invoice_number).filter(Boolean) as string[])).sort();

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    setter(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const clearFilters = () => {
    setSelectedStatuses(new Set()); setDateFrom(""); setDateTo("");
    setSelectedSources(new Set()); setSelectedVendors(new Set());
    setSelectedInvoices(new Set()); setAmountMin(""); setAmountMax("");
  };

  const filteredInvoices = invoices.filter(inv => {
    // Tab scoping: Closed = completely processed (posted); Open = the rest.
    const matchesTab = activeTab === "closed" ? inv.status === "posted" : inv.status !== "posted";
    if (!matchesTab) return false;

    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      inv.id.toLowerCase().includes(q) ||
      inv.file_name.toLowerCase().includes(q) ||
      (inv.vendor_name ?? "").toLowerCase().includes(q) ||
      (inv.invoice_number ?? "").toLowerCase().includes(q);

    const matchesStatus = selectedStatuses.size === 0 || (() => {
      const activeStatuses = new Set(
        STATUS_FILTER_OPTIONS.filter(f => selectedStatuses.has(f.value)).flatMap(f => f.statuses)
      );
      return activeStatuses.has(inv.status);
    })();

    const invDate = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(inv.created_at) ? inv.created_at : inv.created_at + "Z");
    const matchesDateFrom = !dateFrom || invDate >= new Date(dateFrom + "T00:00:00Z");
    const matchesDateTo   = !dateTo   || invDate <= new Date(dateTo + "T23:59:59Z");

    const matchesSource = selectedSources.size === 0 || selectedSources.has(getSourceType(inv));
    const matchesVendor  = selectedVendors.size === 0  || selectedVendors.has(inv.vendor_name ?? "");
    const matchesInvoice = selectedInvoices.size === 0 || selectedInvoices.has(inv.invoice_number ?? "");
    const matchesAmountMin = !amountMin || (inv.total_amount ?? 0) >= parseFloat(amountMin);
    const matchesAmountMax = !amountMax || (inv.total_amount ?? 0) <= parseFloat(amountMax);

    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo &&
      matchesSource && matchesVendor && matchesInvoice && matchesAmountMin && matchesAmountMax;
  });

  const activeFilterCount =
    (selectedStatuses.size > 0 ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) +
    (selectedSources.size > 0 ? 1 : 0) + (selectedVendors.size > 0 ? 1 : 0) +
    (selectedInvoices.size > 0 ? 1 : 0) + (amountMin || amountMax ? 1 : 0);

  useEffect(() => { setPage(1); }, [activeTab, pageSize, searchQuery, selectedStatuses, dateFrom, dateTo, selectedSources, selectedVendors, selectedInvoices, amountMin, amountMax]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const paginatedInvoices = filteredInvoices.slice((page - 1) * pageSize, page * pageSize);

  // Determine action label for an invoice (mirrors validator-fe's getActionButton)
  const getAction = (inv: InvoiceListItem): { label: string; primary: boolean; disabled: boolean } => {
    if (extractingIds.has(inv.id)) return { label: "Processing", primary: false, disabled: true };
    // STP-uploaded invoice: keep button disabled until ERP Posting / terminal status
    if (stpProcessingIds.has(inv.id)) return { label: "Processing", primary: false, disabled: true };
    if (inv.status === "posted") return { label: "View", primary: false, disabled: false };
    if (inv.status === "rejected") return { label: "View", primary: false, disabled: false };
    if (inv.status === "error") return { label: "View", primary: false, disabled: true };
    return { label: "Review", primary: true, disabled: false };
  };

  const greeting = user?.full_name || user?.email || "there";

  return (
    <div style={{
      minHeight: "100vh", background: "#ffffff", display: "flex", flexDirection: "column",
      fontFamily: "Inter, sans-serif",
    }}>
      {/* Horizontal scrollbar shows only while actively scrolling, then fades. */}
      <style jsx>{`
        .dash-scroll {
          scrollbar-width: thin;               /* Firefox */
          scrollbar-color: transparent transparent;
        }
        .dash-scroll.scrolling {
          scrollbar-color: #c5c8ce transparent;
        }
        .dash-scroll::-webkit-scrollbar {
          height: 8px;
        }
        .dash-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .dash-scroll::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 4px;
          transition: background 0.25s ease;
        }
        .dash-scroll.scrolling::-webkit-scrollbar-thumb {
          background: #c5c8ce;
        }
      `}</style>

      {/* ── Greeting bar ───────────────────────────────────────────────────── */}
      <div style={{
        padding: "12px 32px", borderBottom: "1px solid #E6E6E6", background: "#ffffff",
      }}>
        <p style={{
          margin: 0, fontSize: 14, color: "#414651",
          fontFamily: "Inter, sans-serif", fontWeight: 500,
        }}>
          Hello, {greeting}
        </p>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "20px 32px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Title row ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 600, color: "#101828",
            letterSpacing: "-0.5px", fontFamily: "Inter, sans-serif",
          }}>Invoice Dashboard</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {/* STP toggle — visible to all, editable by admin only */}
            {!stpLoading && (
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
            {canUpload && (
              <button
                onClick={() => setUploadOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "0 16px", height: 32, borderRadius: 6,
                  fontSize: 14, fontWeight: 500,
                  background: "#1876FF", color: "#ffffff", border: "none", cursor: "pointer",
                  fontFamily: "Inter, sans-serif",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#0F65E3")}
                onMouseLeave={e => (e.currentTarget.style.background = "#1876FF")}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1.5v8M3.5 5l3.5-3.5L10.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M1.5 11.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Add Invoice
              </button>
            )}
          </div>
        </div>

        {/* ── Open / Closed tabs (Figma dashboard) ── */}
        <div style={{ display: "flex", gap: 24, borderBottom: "1px solid #EBEDF0", marginTop: -6 }}>
          {([["open", "Open"], ["closed", "Closed"]] as const).map(([key, label]) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
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

        {/* ── Search + Filter row ── */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          {/* Search — compact width per Figma, Filters pinned right */}
          <div style={{ position: "relative", width: 320 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8D92A6" }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search Invoices..."
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

          {/* Filter button */}
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
              selectedStatuses={selectedStatuses} onStatusChange={v => toggleSet(setSelectedStatuses, v)}
              dateFrom={dateFrom} onDateFrom={setDateFrom}
              dateTo={dateTo} onDateTo={setDateTo}
              selectedSources={selectedSources} onSourceChange={v => toggleSet(setSelectedSources, v)}
              selectedVendors={selectedVendors} onVendorChange={v => toggleSet(setSelectedVendors, v)} vendorOptions={vendorOptions}
              selectedInvoices={selectedInvoices} onInvoiceChange={v => toggleSet(setSelectedInvoices, v)} invoiceOptions={invoiceOptions}
              amountMin={amountMin} onAmountMin={setAmountMin}
              amountMax={amountMax} onAmountMax={setAmountMax}
              onClear={clearFilters}
            />
          </div>
        </div>

        {/* ── Table — fixed height for a full page of rows (56px each + 47px
            header) so the layout doesn't shrink when fewer invoices are shown;
            footer attaches below ── */}
        <div style={{
          background: "#ffffff", border: "1px solid #E6E6E6", borderRadius: 8,
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <div
            className={`dash-scroll${tableScrolling ? " scrolling" : ""}`}
            onScroll={handleTableScroll}
            style={{ overflowX: "auto", minHeight: 47 + pageSize * 56 }}
          >
            <table style={{
              width: "100%", minWidth: 1150, borderCollapse: "collapse", fontSize: 14,
              fontFamily: "Inter, sans-serif", tableLayout: "fixed",
            }}>
              <colgroup>
                {[200, 195, 130, 165, 190, 125, 145].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {[
                    { label: "File Name / Time",   align: "left" as const },
                    { label: "Vendor / Invoice #", align: "left" as const },
                    { label: "Status",             align: "left" as const },
                    { label: "Assignee",           align: "left" as const },
                    { label: "Invoice attachment", align: "left" as const },
                    { label: "Amount",             align: "right" as const, pin: false, pad: "12px 20px 12px 16px" },
                    { label: "Action",             align: "left" as const, pin: true },
                  ].map(col => (
                    <th key={col.label} style={{
                      padding: (col as { pad?: string }).pad ?? "12px 16px",
                      textAlign: col.align, fontSize: 14, fontWeight: 600,
                      color: "#717680", background: "#F5F5F5", borderBottom: "1px solid #E0E0E0",
                      lineHeight: "22px", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
                      // Action column stays pinned while the table scrolls,
                      // separated by the Figma demarcation line.
                      ...((col as { pin?: boolean }).pin ? {
                        position: "sticky" as const, right: 0, zIndex: 2,
                        borderLeft: "1px solid #E0E0E0",
                      } : {}),
                    }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #E6E6E6" }}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} style={{ padding: "8px 16px" }}>
                          <div style={{ height: 14, borderRadius: 4, background: "#F0F0F0", width: j === 0 ? 160 : j === 6 ? 60 : 90 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    {/* Empty state keeps the table's full-page height (56px/row)
                        so the layout doesn't collapse when there's no data. */}
                    <td colSpan={7} style={{ height: pageSize * 56, padding: "24px", textAlign: "center", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                            <rect x="2" y="2" width="18" height="18" rx="3" stroke="#8D92A6" strokeWidth="1.4" />
                            <path d="M6 8h10M6 11h10M6 14h6" stroke="#8D92A6" strokeWidth="1.4" strokeLinecap="round" />
                          </svg>
                        </div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "#414651", fontFamily: "Inter, sans-serif" }}>No invoices found</p>
                        <p style={{ margin: 0, fontSize: 12, color: "#717680", fontFamily: "Inter, sans-serif" }}>
                          {searchQuery || activeFilterCount > 0 ? "No invoices match your search or filters." : canUpload ? "Upload your first invoice to get started." : "No invoices uploaded yet."}
                        </p>
                        {(searchQuery || activeFilterCount > 0) && (
                          <button onClick={() => { setSearchQuery(""); clearFilters(); }}
                            style={{ fontSize: 12, color: "#1876FF", background: "none", border: "none", cursor: "pointer", marginTop: 4, fontFamily: "Inter, sans-serif" }}>
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedInvoices.map(inv => {
                    const action = getAction(inv);
                    const sourceType = getSourceType(inv);
                    return (
                      <tr key={inv.id}
                        style={{ borderBottom: "1px solid #E6E6E6" }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = "#F9F9F9";
                          // The sticky Action cell paints its own background —
                          // keep it in sync with the row hover.
                          (e.currentTarget.lastElementChild as HTMLElement | null)?.style.setProperty("background", "#F9F9F9");
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = "transparent";
                          (e.currentTarget.lastElementChild as HTMLElement | null)?.style.setProperty("background", "#ffffff");
                        }}
                      >
                        {/* File Name / Time (with source icon) */}
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, overflow: "hidden" }}>
                            <span style={{ marginTop: 2 }}><SourceIcon type={sourceType} /></span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <span
                                title={inv.file_name}
                                style={{
                                  ...CELL_PRIMARY, fontWeight: 600, display: "block",
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}
                              >
                                {inv.file_name}
                              </span>
                              <span style={{ ...CELL_MUTED, fontSize: 12.5, whiteSpace: "nowrap" }}>
                                {formatTimestamp(inv.created_at)}
                              </span>
                            </div>
                          </div>
                        </td>
                        {/* Vendor / Invoice # */}
                        <td style={{ padding: "10px 16px" }}>
                          <span
                            title={inv.vendor_name ?? undefined}
                            style={{
                              ...CELL_PRIMARY, display: "block",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                          >
                            {inv.vendor_name ?? "-"}
                          </span>
                          <span style={{ ...CELL_MUTED, fontSize: 12.5 }}>{inv.invoice_number ?? "-"}</span>
                        </td>
                        {/* Status */}
                        <td style={{ padding: "10px 16px" }}>
                          <StageTag
                            status={inv.status}
                            loading={extractingIds.has(inv.id) || stpProcessingIds.has(inv.id)}
                          />
                        </td>
                        {/* Assignee */}
                        <td style={{ padding: "10px 16px" }}>
                          <span
                            title={inv.assignee ?? undefined}
                            style={{
                              ...CELL_PRIMARY, fontWeight: 400, display: "block",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                          >
                            {inv.assignee ?? "-"}
                          </span>
                        </td>
                        {/* Invoice attachment */}
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8D92A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            <span
                              title={inv.file_name}
                              style={{
                                ...CELL_MUTED, fontSize: 13,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}
                            >
                              {inv.file_name}
                            </span>
                          </div>
                        </td>
                        {/* Amount */}
                        <td style={{ padding: "10px 20px 10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={CELL_PRIMARY}>{formatAmount(inv.total_amount, inv.currency)}</span>
                        </td>
                        {/* Action — pinned right, separated by the demarcation line */}
                        <td style={{
                          padding: "10px 16px",
                          position: "sticky", right: 0, zIndex: 1,
                          background: "#ffffff", borderLeft: "1px solid #EBEDF0",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <button
                              disabled={action.disabled}
                              onClick={() => { if (!action.disabled) router.push(invoiceRoute(inv.id, inv.status)); }}
                              style={
                                action.primary
                                  ? {
                                      background: "#ffffff", border: "1px solid #1876FF", color: "#1876FF",
                                      borderRadius: 8, fontWeight: 600, fontSize: 12.5,
                                      height: 30, padding: "0 18px", cursor: "pointer",
                                      fontFamily: "Inter, sans-serif",
                                    }
                                  : action.disabled
                                  ? {
                                      background: "#F5F5F5", border: "1px solid #E0E0E0", color: "#8D92A6",
                                      borderRadius: 8, fontWeight: 500, fontSize: 12.5,
                                      height: 30, padding: "0 14px", cursor: "not-allowed",
                                      fontFamily: "Inter, sans-serif",
                                    }
                                  : {
                                      background: "#ffffff", border: "1px solid #D5D5D5", color: "#364153",
                                      borderRadius: 8, fontWeight: 500, fontSize: 12.5,
                                      height: 30, padding: "0 18px", cursor: "pointer",
                                      fontFamily: "Inter, sans-serif",
                                    }
                              }
                            >
                              {action.label}
                            </button>
                            {/* Open in new tab (Figma external-link action) */}
                            <button
                              title="Open in new tab"
                              disabled={action.disabled}
                              onClick={() => { if (!action.disabled) window.open(invoiceRoute(inv.id, inv.status), "_blank", "noopener"); }}
                              style={{
                                background: "transparent", border: "none", padding: 2,
                                cursor: action.disabled ? "not-allowed" : "pointer",
                                color: action.disabled ? "#D1D5DB" : "#717680",
                                display: "inline-flex", alignItems: "center",
                              }}
                              onMouseEnter={e => { if (!action.disabled) e.currentTarget.style.color = "#1876FF"; }}
                              onMouseLeave={e => { if (!action.disabled) e.currentTarget.style.color = "#717680"; }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 3h6v6" />
                                <path d="M10 14 21 3" />
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Footer: total + pagination ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderTop: "1px solid #E6E6E6", background: "#ffffff",
          }}>
            <span style={{ fontSize: 12, color: "#717680", fontFamily: "Inter, sans-serif" }}>
              Total {filteredInvoices.length} item{filteredInvoices.length !== 1 ? "s" : ""}
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
                {/* Prev */}
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

                {/* Next */}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ width: 28, height: 28, borderRadius: 6, border: "none", cursor: page === totalPages ? "default" : "pointer", background: "transparent", color: page === totalPages ? "#D1D5DB" : "#414651", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2.5L9 7l-4 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => { setUploadOpen(false); fetchInvoices(); }}
        onUploaded={(invoiceId) => {
          if (stpEnabled) {
            // STP mode: keep disabled + spinner until status reaches ERP Posting.
            // The polling loop (every 8 s) will clear this automatically.
            setStpProcessingIds(prev => new Set([...prev, invoiceId]));
          } else {
            // Non-STP: show a brief "Processing" state while extraction runs (~5 s).
            setExtractingIds(prev => new Set([...prev, invoiceId]));
            setTimeout(() => {
              setExtractingIds(prev => { const n = new Set(prev); n.delete(invoiceId); return n; });
            }, 5000);
          }
          fetchInvoices();
        }}
      />
    </div>
  );
}

export default withAuthGuard(DashboardPage);
