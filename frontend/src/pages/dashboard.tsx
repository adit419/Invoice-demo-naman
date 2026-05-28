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

// AntD v5 Tag color palette — exact values from antd/lib/tag/style
const ANTD_TAG = {
  cyan:    { bg: "#E6FFFB", color: "#08979C", border: "#87E8DE" },
  blue:    { bg: "#E6F4FF", color: "#0958D9", border: "#91CAFF" },
  green:   { bg: "#F6FFED", color: "#389E0D", border: "#B7EB8F" },
  orange:  { bg: "#FFF7E6", color: "#D46B08", border: "#FFD591" },
  red:     { bg: "#FFF1F0", color: "#CF1322", border: "#FFA39E" },
  volcano: { bg: "#FFF2E8", color: "#D4380D", border: "#FFBB96" },
} as const;

const STAGE_TAG: Record<string, { label: string; tone: keyof typeof ANTD_TAG }> = {
  extraction:          { label: "Extraction",  tone: "cyan" },
  vendor_validation:   { label: "Matching",    tone: "blue" },
  metadata_validation: { label: "Matching",    tone: "blue" },
  line_item_matching:  { label: "Matching",    tone: "blue" },
  bill_posting:        { label: "ERP Posting", tone: "green" },
  posted:              { label: "ERP Posting", tone: "green" },
  rejected:            { label: "Rejected",    tone: "red" },
  error:               { label: "Error",       tone: "volcano" },
};

// Pixel-equivalent to AntD v5 <Tag color="..." className="rounded-full px-3"> with
// validator-fe's global `* { font-family: Inter; letter-spacing: -0.08px }` applied.
function StageTag({ status, loading }: { status: string; loading?: boolean }) {
  const cfg = STAGE_TAG[status];
  const tone = cfg ? ANTD_TAG[cfg.tone] : { bg: "#FAFAFA", color: "#595959", border: "#D9D9D9" };
  const label = cfg?.label ?? status;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        display: "inline-block",
        padding: "0 12px",            // px-3 override of AntD's 0 7px
        borderRadius: 9999,           // rounded-full
        fontSize: 12,                 // AntD Tag default
        lineHeight: "20px",           // AntD Tag default
        fontWeight: 400,              // AntD Tag default
        letterSpacing: "-0.08px",     // validator-fe global * rule
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        color: tone.color,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        whiteSpace: "nowrap",
        textAlign: "start",
      }}>
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

function formatTimestamp(dateStr: string): string {
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(dateStr) ? dateStr : dateStr + "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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

// ── Filter config ─────────────────────────────────────────────────────────────

type FilterCategory = "status" | "date" | "source" | "vendor" | "invoice" | "amount";

const FILTER_CATEGORIES: { id: FilterCategory; label: string }[] = [
  { id: "status",   label: "Status" },
  { id: "date",     label: "Date" },
  { id: "source",   label: "Source" },
  { id: "vendor",   label: "Vendor Name" },
  { id: "invoice",  label: "Invoice Number" },
  { id: "amount",   label: "Amount" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "extraction",    label: "Extraction",          statuses: ["extraction"] },
  { value: "matching",      label: "Matching",            statuses: ["vendor_validation", "metadata_validation", "line_item_matching"] },
  { value: "erp_posting",   label: "ERP Posting",         statuses: ["bill_posting", "posted"] },
  { value: "rejected",      label: "Rejected",            statuses: ["rejected"] },
  { value: "error",         label: "Error",               statuses: ["error"] },
];

const SOURCE_OPTIONS = [
  { value: "manual",    label: "Manual Upload" },
  { value: "gmail",     label: "Gmail" },
  { value: "freshdesk", label: "Freshdesk" },
];

const INPUT_S: React.CSSProperties = {
  width: "100%", padding: "6px 10px", fontSize: 14,
  border: "1px solid #D5D5D5", borderRadius: 6, outline: "none",
  color: "#414651", background: "#ffffff", fontFamily: "Inter, sans-serif",
};

// ── Multi-select dropdown ─────────────────────────────────────────────────────

function MultiSelect({ options, selected, onChange, placeholder }: {
  options: string[];
  selected: Set<string>;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const label = selected.size === 0 ? placeholder : `${selected.size} selected`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          ...INPUT_S, display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ color: selected.size > 0 ? "#414651" : "#8D92A6" }}>{label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" stroke="#8D92A6" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          background: "#ffffff", border: "1px solid #E6E6E6", borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)", maxHeight: 200, display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid #E6E6E6" }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{ ...INPUT_S, padding: "4px 8px", fontSize: 12 }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 ? (
              <p style={{ padding: "8px 10px", fontSize: 12, color: "#8D92A6", margin: 0 }}>No options</p>
            ) : filtered.map(o => (
              <label key={o} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                cursor: "pointer", fontSize: 14, color: "#414651", fontFamily: "Inter, sans-serif",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9F9F9")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <input type="checkbox" checked={selected.has(o)} onChange={() => onChange(o)}
                  style={{ accentColor: "#1876FF", width: 14, height: 14, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o}</span>
              </label>
            ))}
          </div>
          {selected.size > 0 && (
            <div style={{ padding: "6px 10px", borderTop: "1px solid #E6E6E6" }}>
              <button onClick={() => { options.forEach(o => selected.has(o) && onChange(o)); }}
                style={{ fontSize: 11, color: "#1876FF", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

function FilterPanel(p: FilterPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("status");

  useEffect(() => {
    if (!p.open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) p.onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [p.open]);

  if (!p.open) return null;

  const labelS: React.CSSProperties = { fontSize: 12, color: "#717680", fontWeight: 500, marginBottom: 6, display: "block", fontFamily: "Inter, sans-serif" };

  const renderContent = () => {
    switch (activeCategory) {
      case "status":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {STATUS_FILTER_OPTIONS.map(f => (
              <label key={f.value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", borderRadius: 6, cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9F9F9")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <input type="checkbox" checked={p.selectedStatuses.has(f.value)} onChange={() => p.onStatusChange(f.value)}
                  style={{ accentColor: "#1876FF", width: 15, height: 15 }} />
                <span style={{ fontSize: 14, color: "#414651", fontFamily: "Inter, sans-serif" }}>{f.label}</span>
              </label>
            ))}
          </div>
        );
      case "date":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <span style={labelS}>From</span>
              <input type="date" value={p.dateFrom} onChange={e => p.onDateFrom(e.target.value)} style={INPUT_S} />
            </div>
            <div>
              <span style={labelS}>To</span>
              <input type="date" value={p.dateTo} onChange={e => p.onDateTo(e.target.value)} style={INPUT_S} />
            </div>
          </div>
        );
      case "source":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {SOURCE_OPTIONS.map(s => (
              <label key={s.value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", borderRadius: 6, cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9F9F9")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <input type="checkbox" checked={p.selectedSources.has(s.value)} onChange={() => p.onSourceChange(s.value)}
                  style={{ accentColor: "#1876FF", width: 15, height: 15 }} />
                <SourceIcon type={s.value as SourceType} />
                <span style={{ fontSize: 14, color: "#414651", fontFamily: "Inter, sans-serif" }}>{s.label}</span>
              </label>
            ))}
          </div>
        );
      case "vendor":
        return (
          <div>
            <span style={labelS}>Select vendors</span>
            <MultiSelect
              options={p.vendorOptions}
              selected={p.selectedVendors}
              onChange={p.onVendorChange}
              placeholder="All vendors"
            />
          </div>
        );
      case "invoice":
        return (
          <div>
            <span style={labelS}>Select invoice numbers</span>
            <MultiSelect
              options={p.invoiceOptions}
              selected={p.selectedInvoices}
              onChange={p.onInvoiceChange}
              placeholder="All invoice numbers"
            />
          </div>
        );
      case "amount":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <span style={labelS}>Minimum</span>
              <input type="number" value={p.amountMin} onChange={e => p.onAmountMin(e.target.value)} placeholder="0.00" style={INPUT_S} />
            </div>
            <div>
              <span style={labelS}>Maximum</span>
              <input type="number" value={p.amountMax} onChange={e => p.onAmountMax(e.target.value)} placeholder="0.00" style={INPUT_S} />
            </div>
          </div>
        );
    }
  };

  return (
    <div ref={ref}
      style={{
        position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
        width: 360, background: "#ffffff",
        border: "1px solid #E6E6E6", borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.10)", overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #E6E6E6" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#101828", fontFamily: "Inter, sans-serif" }}>Filters</span>
        <button onClick={p.onClear} style={{ fontSize: 12, color: "#717680", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>Clear all</button>
      </div>

      {/* Body */}
      <div style={{ display: "flex", minHeight: 260 }}>
        {/* Category list */}
        <div style={{ width: 144, borderRight: "1px solid #E6E6E6", flexShrink: 0, padding: "6px 0", background: "#F5F5F5" }}>
          {FILTER_CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              style={{
                width: "100%", textAlign: "left", padding: "8px 14px", fontSize: 14, fontWeight: 500,
                background: activeCategory === cat.id ? "#ffffff" : "transparent",
                color: activeCategory === cat.id ? "#1876FF" : "#414651",
                border: "none", cursor: "pointer", transition: "background 0.1s",
                fontFamily: "Inter, sans-serif",
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
        {/* Content */}
        <div style={{ flex: 1, padding: "12px 14px", overflowY: "auto", background: "#ffffff" }}>
          {renderContent()}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 16px", borderTop: "1px solid #E6E6E6" }}>
        <button onClick={p.onClose}
          style={{ fontSize: 13, fontWeight: 600, color: "#1876FF", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
          Done
        </button>
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────

function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const canUpload = user?.role === "admin" || user?.role === "editor";

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
  const PAGE_SIZE = 10;

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await invoicesService.list();
      setInvoices(data.items);
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

  useEffect(() => { setPage(1); }, [searchQuery, selectedStatuses, dateFrom, dateTo, selectedSources, selectedVendors, selectedInvoices, amountMin, amountMax]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const paginatedInvoices = filteredInvoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Determine action label for an invoice (mirrors validator-fe's getActionButton)
  const getAction = (inv: InvoiceListItem): { label: string; primary: boolean; disabled: boolean } => {
    if (extractingIds.has(inv.id)) return { label: "Processing", primary: false, disabled: true };
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
      <div style={{ flex: 1, padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Title row ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 20, fontWeight: 600, color: "#101828",
              letterSpacing: "-0.5px", fontFamily: "Inter, sans-serif",
            }}>Invoice Dashboard</h1>
            <p style={{
              margin: "4px 0 0", fontSize: 14, color: "#717680",
              fontFamily: "Inter, sans-serif",
            }}>Manage and track all your invoice processing workflows</p>
          </div>
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
                Upload Invoice
              </button>
            )}
          </div>
        </div>

        {/* ── Search + Filter row ── */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8D92A6" }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search by unique identifier, file name, vendor, or invoice #..."
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

        {/* ── Table ── */}
        <div style={{
          flex: 1, background: "#ffffff", border: "1px solid #E6E6E6", borderRadius: 8,
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <div style={{ overflowX: "hidden", flex: 1 }}>
            <table style={{
              width: "100%", borderCollapse: "collapse", fontSize: 14,
              fontFamily: "Inter, sans-serif", tableLayout: "fixed",
            }}>
              <colgroup>
                {Array.from({ length: 7 }).map((_, i) => (
                  <col key={i} style={{ width: `${100 / 7}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {[
                    { label: "File Name",     align: "left" as const },
                    { label: "Timestamp",     align: "left" as const },
                    { label: "Vendor Name",   align: "left" as const },
                    { label: "Invoice #",     align: "left" as const },
                    { label: "Amount",        align: "left" as const },
                    { label: "Current Stage", align: "left" as const },
                    { label: "Action",        align: "left" as const },
                  ].map(col => (
                    <th key={col.label} style={{
                      padding: "12px 16px", textAlign: col.align, fontSize: 14, fontWeight: 600,
                      color: "#717680", background: "#F5F5F5", borderBottom: "1px solid #E0E0E0",
                      lineHeight: "22px", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
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
                    <td colSpan={7} style={{ padding: "60px 24px", textAlign: "center" }}>
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
                        onMouseEnter={e => (e.currentTarget.style.background = "#F9F9F9")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        {/* File Name (with source icon) */}
                        <td style={{ padding: "8px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                            <SourceIcon type={sourceType} />
                            <span
                              title={inv.file_name}
                              style={{
                                ...CELL_PRIMARY,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                minWidth: 0, flex: 1,
                              }}
                            >
                              {inv.file_name}
                            </span>
                          </div>
                        </td>
                        {/* Timestamp */}
                        <td style={{ padding: "8px 16px", whiteSpace: "nowrap" }}>
                          <span style={CELL_MUTED}>{formatTimestamp(inv.created_at)}</span>
                        </td>
                        {/* Vendor Name */}
                        <td style={{ padding: "8px 16px" }}>
                          {inv.vendor_name ? (
                            <span
                              title={inv.vendor_name}
                              style={{
                                ...CELL_PRIMARY,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                display: "block",
                              }}
                            >
                              {inv.vendor_name}
                            </span>
                          ) : (
                            <span style={CELL_MUTED}>-</span>
                          )}
                        </td>
                        {/* Invoice # */}
                        <td style={{ padding: "8px 16px" }}>
                          <span style={CELL_MUTED}>{inv.invoice_number ?? "-"}</span>
                        </td>
                        {/* Amount */}
                        <td style={{ padding: "8px 16px", textAlign: "left", whiteSpace: "nowrap" }}>
                          <span style={CELL_PRIMARY}>{formatAmount(inv.total_amount, inv.currency)}</span>
                        </td>
                        {/* Current Stage */}
                        <td style={{ padding: "8px 16px" }}>
                          <StageTag status={inv.status} loading={extractingIds.has(inv.id)} />
                        </td>
                        {/* Action */}
                        <td style={{ padding: "8px 16px" }}>
                          <button
                            disabled={action.disabled}
                            onClick={() => { if (!action.disabled) router.push(invoiceRoute(inv.id, inv.status)); }}
                            style={
                              action.primary
                                ? {
                                    background: "#1876FF", border: "none", color: "#FFFFFF",
                                    borderRadius: 6, fontWeight: 500, fontSize: 12,
                                    height: 28, padding: "0 12px", cursor: "pointer",
                                    fontFamily: "Inter, sans-serif",
                                  }
                                : action.disabled
                                ? {
                                    background: "transparent", border: "1px solid #D5D5D5", color: "#8D92A6",
                                    borderRadius: 6, fontWeight: 500, fontSize: 12,
                                    height: 28, padding: "0 12px", cursor: "not-allowed",
                                    fontFamily: "Inter, sans-serif", opacity: 0.7,
                                  }
                                : {
                                    background: "transparent", border: "1px solid #D5D5D5", color: "#364153",
                                    borderRadius: 6, fontWeight: 500, fontSize: 12,
                                    height: 28, padding: "0 12px", cursor: "pointer",
                                    fontFamily: "Inter, sans-serif",
                                  }
                            }
                          >
                            {action.label}
                          </button>
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
          setExtractingIds(prev => new Set([...prev, invoiceId]));
          fetchInvoices();
          setTimeout(() => {
            setExtractingIds(prev => { const n = new Set(prev); n.delete(invoiceId); return n; });
          }, 5000);
        }}
      />
    </div>
  );
}

export default withAuthGuard(DashboardPage);
