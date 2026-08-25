/**
 * DirectPay → Tracker.
 *
 * A centralized, read-only view of EVERY invoice — one row from the moment of
 * upload, filling in as the invoice moves Extraction → Faktur Pajak → Matching →
 * Bill Posting → Bill Posted/Rejected. It listed only finished invoices until
 * this became a live pipeline view, which is why so much of the rendering below
 * turns on `has_extraction`.
 *
 * Deliberately NOT a third variant of the dashboard's table: the dashboard is a
 * work queue (what needs my attention, what's the next action, with per-row
 * buttons), whereas this is a payment ledger (what do we owe, to which account,
 * by when) that happens to fill in live. Same components and styling throughout —
 * the tone palette, cell styles, pagination footer, filter popover and
 * loading/empty rows all come from the shared DirectPay list primitives
 * (components/directpay/dpTableUi.tsx), extracted from the dashboard for exactly
 * this reason.
 *
 * Two things worth knowing before editing:
 *
 *  - Every figure comes from GET /dp-api/tracker, which builds its rows through
 *    the same _bill_posting_out the Bill Posting page uses, so a tracker row and
 *    that invoice's own posting screen can never disagree. A reviewer's edits
 *    ride along for free: the backend merges edited_extracted over
 *    base_extracted, so a corrected field shows up on the next poll.
 *  - "—" and "NA" are NOT interchangeable here. See UNKNOWN_YET.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";
import { useToast } from "@/components/ui";
import { directpayService, DpTrackerRow } from "@/services/directpay";
import { invoiceRoute } from "@/utils/directpayRoutes";
import { formatDate } from "@/utils/format";
import {
  AntdTone,
  CELL_MUTED,
  CELL_PRIMARY,
  EmptyRow,
  INVOICE_STAGE_TONE,
  LoadingRows,
  SortHeader,
  StageTag,
  formatTimestamp,
} from "@/components/directpay/dpTableUi";
import {
  DpFilterPanel,
  DpFilterSpec,
  countActiveFilters,
  useDpFilters,
} from "@/components/directpay/DpFilterPanel";
import { buildTrackerCsv, trackerCsvFilename, trackerStatusLabel } from "@/components/directpay/trackerCsv";

// The pill for one row's pipeline position. Labels come from the CSV module so
// the screen and the export can't disagree about what a stage is called; tones
// come from the shared INVOICE_STAGE_TONE so the dashboard colours the same
// stage identically.
function invoiceStageTag(r: DpTrackerRow): { label: string; tone: AntdTone } {
  return { label: trackerStatusLabel(r), tone: INVOICE_STAGE_TONE[r.status] ?? "cyan" };
}

// Terminal = nothing further happens on its own. Drives the poll cadence: a list
// with in-flight work has to keep up with the cascade, a settled one doesn't.
const TERMINAL_STATUSES = new Set(["posted", "rejected"]);

// Pipeline order, for the Status filter's option list — Object.keys order on a
// status map is not a promise, and a filter pane listing stages out of order
// reads as arbitrary.
// Typed as the status union rather than string[], so adding a stage to the
// pipeline without listing it here is a compile error instead of a stage that
// silently never appears in the filter.
const STAGE_ORDER: DpTrackerRow["status"][] = [
  "extraction", "extracted", "fp_extraction", "matching", "bill_posting", "posted", "rejected",
];

const IN_FLIGHT_POLL_MS = 4000;
const SETTLED_POLL_MS = 20000;

// Rows with no matched contract (an invoice rejected before Matching) still have
// to be findable in the Contract filter, so they group under this sentinel
// rather than silently dropping out of every contract selection.
const NO_CONTRACT = "__none__";
const NO_CONTRACT_LABEL = "— Not matched —";

const FILTER_KEYS = {
  status: "status",
  vendor: "vendor",
  contract: "contract",
  invoiceDate: "invoice_date",
  receivedDate: "received_date",
  dueDate: "due_date",
  payable: "payable",
  wht: "wht",
} as const;

type SortKey =
  | "invoice_received_date" | "vendor_name" | "invoice_number" | "invoice_date"
  | "taxable_amount" | "vat_amount" | "wht_amount" | "payable_amount"
  | "payment_due_date" | "status";

type SortDir = "asc" | "desc";

// Which value each sortable column actually sorts on. The two printed dates sort
// on their normalized ISO twin (see DpTrackerRow.invoice_date_iso) — sorting the
// printed strings would interleave "2026-07-01", "25 June 2026" and "30 Juli
// 2026" alphabetically, which is nonsense.
const SORT_VALUE: Record<SortKey, (r: DpTrackerRow) => string | number | null | undefined> = {
  invoice_received_date: r => r.invoice_received_date,
  vendor_name: r => r.vendor_name,
  invoice_number: r => r.invoice_number,
  invoice_date: r => r.invoice_date_iso,
  taxable_amount: r => r.taxable_amount,
  vat_amount: r => r.vat_amount,
  wht_amount: r => r.wht_amount,
  payable_amount: r => r.payable_amount,
  payment_due_date: r => r.payment_due_date_iso,
  status: r => trackerStatusLabel(r),
};

function compareRows(a: DpTrackerRow, b: DpTrackerRow, key: SortKey, dir: SortDir): number {
  const av = SORT_VALUE[key](a);
  const bv = SORT_VALUE[key](b);
  // Missing values always sort last, in BOTH directions — a blank cell is an
  // absence, not a value smaller than every other one, so flipping the
  // direction shouldn't drag every "NA" row to the top.
  const aEmpty = av === null || av === undefined || av === "";
  const bEmpty = bv === null || bv === undefined || bv === "";
  if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;
  const sign = dir === "asc" ? 1 : -1;
  if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * sign;
}

/** The LOCAL calendar day of an ISO timestamp, as YYYY-MM-DD.
 *
 *  Invoice Received Date is the run's own created_at — a UTC instant, unlike the
 *  two printed dates, which are already calendar days. The column renders it in
 *  the viewer's timezone (formatDate → toLocaleDateString), so its date filter
 *  has to compare the same local day: slicing "…T23:30:00+00:00" to its UTC date
 *  would put a row filed at 06:30 Jakarta time on the previous day, and the
 *  filter would then disagree with the date printed right next to it. */
function localDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Two DIFFERENT kinds of empty, deliberately shown differently:
//
//   —   not known YET. Extraction hasn't run (or produced nothing), so the app
//       has no opinion about this value.
//   NA  known to be absent. Extraction ran and the document genuinely does not
//       state it — the codebase's own "NA" convention (see _strip_na), e.g.
//       DEBORA_KEMANG's invoices carry no payment due date.
//
// Collapsing them would tell a reviewer an invoice has no due date when the
// truth is nobody has looked yet.
const UNKNOWN_YET = "—";

function fmtAmount(n: number | null | undefined, known = true): string {
  if (n == null) return known ? "NA" : UNKNOWN_YET;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DirectPayTracker() {
  const router = useRouter();
  const { toast } = useToast();

  const [rows, setRows] = useState<DpTrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("invoice_received_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // Anything that changes WHICH rows are listed sends you back to page 1 — done
  // from the event handlers rather than an effect watching the values, so there's
  // no render-then-correct pass. Sorting resets too: page 3 of a re-sorted list
  // is a different set of rows than the one you were looking at.
  const filters = useDpFilters(() => setPage(1));
  const changeSearch = (v: string) => { setSearchQuery(v); setPage(1); };
  const changePageSize = (n: number) => { setPageSize(n); setPage(1); };

  const load = useCallback(async () => {
    try {
      const res = await directpayService.listTracker();
      setRows(res.items);
    } catch {
      toast("Could not load the tracker", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Anything still in flight? Drives the poll cadence below.
  const hasInFlight = useMemo(() => rows.some(r => !TERMINAL_STATUSES.has(r.status)), [rows]);

  // Load on mount, then poll at a cadence matched to what's actually happening.
  // The Tracker is now a live view of the pipeline, so while work is in flight it
  // has to keep up with a cascade whose own stage pauses are ~2s; once every row
  // is terminal there is nothing left to observe and polling hard would be pure
  // waste. (It was a flat 15s when this screen only ever listed finished work.)
  useEffect(() => {
    load();
    const t = setInterval(load, hasInFlight ? IN_FLIGHT_POLL_MS : SETTLED_POLL_MS);
    return () => clearInterval(t);
  }, [load, hasInFlight]);

  // ── Filter options, derived from the data actually present ──────────────────
  const vendorOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.vendor_name).filter(Boolean) as string[])).sort()
      .map(v => ({ value: v, label: v })),
    [rows],
  );

  const contractOptions = useMemo(() => {
    const named = Array.from(new Set(rows.map(r => r.contract_name).filter(Boolean) as string[])).sort()
      .map(v => ({ value: v, label: v }));
    const hasUnmatched = rows.some(r => !r.contract_name);
    return hasUnmatched ? [...named, { value: NO_CONTRACT, label: NO_CONTRACT_LABEL }] : named;
  }, [rows]);

  // Earliest/latest value actually present in each date column, so its pane can
  // say so — the fix for a preset that returns nothing looking like a preset
  // that does nothing. Computed off the WHOLE result set, not the filtered view,
  // so the hint doesn't shift as you narrow things down.
  const dateSpans = useMemo(() => {
    const span = (values: (string | null | undefined)[]) => {
      const days = values.filter(Boolean).map(v => (v as string).slice(0, 10)).sort();
      return days.length ? { spanFrom: days[0], spanTo: days[days.length - 1] } : { spanFrom: null, spanTo: null };
    };
    return {
      invoiceDate: span(rows.map(r => r.invoice_date_iso)),
      dueDate: span(rows.map(r => r.payment_due_date_iso)),
      // Received date is a UTC instant; its span has to be in local days to
      // match both the column and the "Today" preset.
      receivedDate: span(rows.map(r => localDay(r.invoice_received_date))),
    };
  }, [rows]);

  // Only stages actually present, so the pane never offers a stage that would
  // return nothing — and always in pipeline order.
  const statusOptions = useMemo(() => {
    const present = new Set(rows.map(r => r.status));
    return STAGE_ORDER.filter(st => present.has(st)).map(st => ({
      value: st,
      // A representative row, so "extracted" gets the label its own
      // extraction_confirmed implies rather than a guess.
      label: trackerStatusLabel(rows.find(r => r.status === st)!),
    }));
  }, [rows]);

  const specs: DpFilterSpec[] = useMemo(() => [
    {
      // Every stage present in the data, in pipeline order — so ticking
      // "Bill Posted" + "Rejected" reproduces the old terminal-only Tracker.
      key: FILTER_KEYS.status, label: "Status", kind: "multi", options: statusOptions,
    },
    { key: FILTER_KEYS.vendor, label: "Vendor", kind: "multi", options: vendorOptions, emptyHint: "No vendors yet" },
    { key: FILTER_KEYS.contract, label: "Contract", kind: "multi", options: contractOptions, emptyHint: "No contracts yet" },
    // Each date column gets the preset set that suits what it holds, and the
    // span of values actually present — see DpDatePresetMode. Invoice and due
    // dates are DOCUMENT dates spread over months, so now-anchored day windows
    // are useless on them; received date is a system timestamp, so they're right.
    {
      key: FILTER_KEYS.invoiceDate, label: "Invoice Date", kind: "dateRange",
      presetMode: "historical", ...dateSpans.invoiceDate,
    },
    {
      key: FILTER_KEYS.receivedDate, label: "Received Date", kind: "dateRange",
      presetMode: "recent", ...dateSpans.receivedDate,
    },
    {
      key: FILTER_KEYS.dueDate, label: "Payment Due Date", kind: "dateRange",
      presetMode: "due", ...dateSpans.dueDate,
    },
    {
      key: FILTER_KEYS.payable, label: "Payable Amount", kind: "numberRange",
      minPlaceholder: "Min Payable Amount", maxPlaceholder: "Max Payable Amount",
    },
    {
      // Genuinely useful on a tax tracker and free from the data model: WHT
      // applies to some of these vendors and not others, and "show me only the
      // ones I withheld on" is the question a finance reviewer actually asks.
      key: FILTER_KEYS.wht, label: "Withholding", kind: "multi",
      options: [{ value: "yes", label: "WHT applicable" }, { value: "no", label: "No WHT" }],
    },
  ], [vendorOptions, contractOptions, dateSpans, statusOptions]);

  const activeFilterCount = countActiveFilters(specs, filters.values);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const v = filters.values;
    const q = searchQuery.trim().toLowerCase();
    const sel = (key: string) => v.multi[key] ?? new Set<string>();

    /** A YYYY-MM-DD calendar day against one filter's from/to bounds. A row whose
     *  printed date couldn't be normalized (see DpTrackerRow.invoice_date_iso)
     *  has no comparable value, so it drops out of any bounded range rather than
     *  being silently kept in it. */
    const inDateRange = (key: string, day: string | null | undefined) => {
      const from = v.from[key] ?? "";
      const to = v.to[key] ?? "";
      if (!from && !to) return true;
      if (!day) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    };

    return rows.filter(r => {
      if (q) {
        const haystack = [
          r.vendor_name, r.invoice_number, r.description, r.bank_account_name,
          r.bank_account_number, r.contract_name, r.erp_bill_number, r.file_name,
        ];
        if (!haystack.some(s => (s ?? "").toLowerCase().includes(q))) return false;
      }

      const statuses = sel(FILTER_KEYS.status);
      if (statuses.size > 0 && !statuses.has(r.status)) return false;

      const vendors = sel(FILTER_KEYS.vendor);
      if (vendors.size > 0 && !vendors.has(r.vendor_name ?? "")) return false;

      const contracts = sel(FILTER_KEYS.contract);
      if (contracts.size > 0 && !contracts.has(r.contract_name || NO_CONTRACT)) return false;

      const wht = sel(FILTER_KEYS.wht);
      if (wht.size > 0 && !wht.has(r.wht_applicable ? "yes" : "no")) return false;

      // The two printed dates are already calendar days (normalized server-side);
      // received date is a UTC instant that has to be reduced to its local day.
      if (!inDateRange(FILTER_KEYS.invoiceDate, r.invoice_date_iso)) return false;
      if (!inDateRange(FILTER_KEYS.receivedDate, localDay(r.invoice_received_date))) return false;
      if (!inDateRange(FILTER_KEYS.dueDate, r.payment_due_date_iso)) return false;

      const min = v.min[FILTER_KEYS.payable] ?? "";
      const max = v.max[FILTER_KEYS.payable] ?? "";
      if (min || max) {
        if (r.payable_amount == null) return false;
        if (min && r.payable_amount < parseFloat(min)) return false;
        if (max && r.payable_amount > parseFloat(max)) return false;
      }

      return true;
    });
  }, [rows, filters.values, searchQuery]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [filtered, sortKey, sortDir],
  );

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamped rather than trusted: the 15s poll can shrink the list under the
  // current page (a filtered set losing rows), and a page past the end should
  // show the last page rather than an empty table.
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Currency is stated ONCE beside the title when every visible row shares one
  // (the normal case — these vendors all bill in IDR). It was briefly suffixed
  // onto each amount header instead, which produced "VAT Amount (PPN) (IDR)" —
  // two sets of parentheses, and wide enough to collide with the next header.
  // A mixed-currency result set drops the note and prefixes each cell instead,
  // because then the number alone would be ambiguous.
  const currencies = useMemo(
    () => Array.from(new Set(sorted.map(r => r.currency).filter(Boolean) as string[])),
    [sorted],
  );
  const uniformCurrency = currencies.length === 1 ? currencies[0] : null;
  const amountCell = (r: DpTrackerRow, n: number | null | undefined) => (
    <span style={{
      ...(n == null && !r.has_extraction ? CELL_MUTED : CELL_PRIMARY),
      fontVariantNumeric: "tabular-nums",
    }}>
      {n != null && !uniformCurrency && r.currency ? (
        <span style={{ ...CELL_MUTED, fontSize: 12, marginRight: 4 }}>{r.currency}</span>
      ) : null}
      {fmtAmount(n, r.has_extraction)}
    </span>
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) { setSortDir(d => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(key);
    // Dates and amounts are far more useful newest/largest-first on the first
    // click; names read better A-Z.
    setSortDir(key === "vendor_name" || key === "invoice_number" || key === "status" ? "asc" : "desc");
  };

  const handleDownloadCsv = () => {
    if (sorted.length === 0) {
      toast("Nothing to export — no rows match the current filters", "warning");
      return;
    }
    // Exports the FILTERED and SORTED set, every row of it — not just the
    // current page. What you filtered to is what you get.
    const blob = new Blob([buildTrackerCsv(sorted)], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = trackerCsvFilename(new Date());
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Back to the invoice's own processing record. Routed through the SAME
  // invoiceRoute the dashboard uses, so a posted invoice lands on its Bill
  // Posting page and a rejected one on the stage that holds its Rejected state —
  // the Tracker never invents its own idea of where an invoice lives.
  const openRow = (r: DpTrackerRow) => router.push(invoiceRoute(r));

  // One truncating text cell, the shape most columns use. `known` false renders
  // the em-dash instead of "NA" — see UNKNOWN_YET.
  const textCell = (value: string | null | undefined, muted?: string | null, known = true) => (
    <>
      <span
        title={value ?? undefined}
        style={{
          ...(value == null && !known ? CELL_MUTED : CELL_PRIMARY),
          display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {value ?? (known ? "NA" : UNKNOWN_YET)}
      </span>
      {muted && (
        <span title={muted} style={{ ...CELL_MUTED, fontSize: 12.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {muted}
        </span>
      )}
    </>
  );

  // Every column carries its own cell renderer, so the header order below IS the
  // cell order — reordering is moving one entry, and the two can't drift apart.
  // Values are all left-aligned and every column is the same width, per the
  // requested layout; the amounts keep tabular-nums so their digits still line
  // up column-wise despite being left-aligned rather than right.
  const COLUMNS: { key: SortKey | null; label: string; cell: (r: DpTrackerRow) => React.ReactNode }[] = [
    {
      key: "invoice_number", label: "Invoice Number",
      // The row's only navigation affordance now that the Action column is gone.
      // A real Link (not a click handler on a span) so ⌘/middle-click still opens
      // a new tab — that's what replaces the removed open-in-new-tab button.
      // Extracted data ONLY. The uploaded file name is deliberately NOT used as
      // a stand-in before extraction produces a number: this column reports what
      // the pipeline has extracted, and a file name is not that. Until then the
      // cell reads "—" and the row is reached by clicking anywhere on it.
      cell: r => (r.invoice_number ? (
        <Link
          href={invoiceRoute(r)}
          onClick={e => e.stopPropagation()}
          title={`Open ${r.invoice_number}`}
          style={{
            fontSize: 14, fontWeight: 600, color: "#1876FF",
            fontFamily: "Inter, sans-serif", textDecoration: "none",
            display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
        >
          {r.invoice_number}
        </Link>
      ) : (
        // Not a link: a blue "—" reads as a value you could click into. The row
        // itself still navigates.
        <span style={{ ...CELL_MUTED, display: "block" }}>
          {r.has_extraction ? "NA" : UNKNOWN_YET}
        </span>
      )),
    },
    { key: "invoice_date", label: "Invoice Date", cell: r => textCell(r.invoice_date ? formatDate(r.invoice_date, "NA") : null, null, r.has_extraction) },
    {
      key: "invoice_received_date", label: "Invoice Received Date",
      cell: r => textCell(
        r.invoice_received_date ? formatDate(r.invoice_received_date, "NA") : "NA",
        r.invoice_received_date ? formatTimestamp(r.invoice_received_date) : null,
      ),
    },
    { key: "vendor_name", label: "Vendor Name", cell: r => textCell(r.vendor_name, r.contract_name, r.has_extraction) },
    { key: null, label: "Description", cell: r => textCell(r.description, null, r.has_extraction) },
    { key: "taxable_amount", label: "Taxable Amount", cell: r => amountCell(r, r.taxable_amount) },
    { key: "vat_amount", label: "VAT Amount (PPN)", cell: r => amountCell(r, r.vat_amount) },
    {
      key: "wht_amount", label: "WHT Amount (PPh)",
      // "if applicable": a vendor with no withholding shows NA rather than 0.00,
      // which would read as a real zero-rupiah withholding.
      cell: r => (r.wht_applicable
        ? amountCell(r, r.wht_amount)
        : <span style={{ ...CELL_MUTED, fontVariantNumeric: "tabular-nums" }}>
            {r.has_extraction ? "NA" : UNKNOWN_YET}
          </span>),
    },
    {
      key: "payable_amount", label: "Payable Amount",
      cell: r => (
        <span style={{
          ...(r.payable_amount == null && !r.has_extraction ? CELL_MUTED : CELL_PRIMARY),
          fontWeight: 600, fontVariantNumeric: "tabular-nums",
        }}>
          {fmtAmount(r.payable_amount, r.has_extraction)}
        </span>
      ),
    },
    { key: "payment_due_date", label: "Payment Due Date", cell: r => textCell(r.payment_due_date ? formatDate(r.payment_due_date, "NA") : null, null, r.has_extraction) },
    { key: null, label: "Bank Account Name", cell: r => textCell(r.bank_account_name, null, r.has_extraction) },
    {
      key: null, label: "Bank Account Number",
      cell: r => (
        <span style={{
          ...(r.bank_account_number == null && !r.has_extraction ? CELL_MUTED : CELL_PRIMARY),
          fontVariantNumeric: "tabular-nums", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {r.bank_account_number ?? (r.has_extraction ? "NA" : UNKNOWN_YET)}
        </span>
      ),
    },
    {
      key: "status", label: "Status",
      cell: r => (
        <>
          <StageTag tag={invoiceStageTag(r)} />
          {/* Auto-Process context, so an in-flight row says whether anything is
              actually driving it. "processing" = the cascade holds this run;
              "waiting_review" = it stopped and named what it's waiting on. */}
          {r.stp_state === "processing" && (
            <span style={{ ...CELL_MUTED, fontSize: 12.5, display: "block", marginTop: 3, whiteSpace: "nowrap" }}>
              Auto-processing…
            </span>
          )}
          {r.stp_state === "waiting_review" && r.stp_failure_reason && !TERMINAL_STATUSES.has(r.status) && (
            <span
              title={r.stp_failure_reason}
              style={{ ...CELL_MUTED, fontSize: 12.5, display: "block", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {r.stp_failure_reason.replace(/_/g, " ")}
            </span>
          )}
          {r.status === "rejected" && r.rejection_reason && (
            <span title={r.rejection_reason} style={{ ...CELL_MUTED, fontSize: 12.5, display: "block", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.rejection_reason}
            </span>
          )}
          {r.status === "posted" && r.erp_bill_number && (
            <span style={{ ...CELL_MUTED, fontSize: 12.5, display: "block", marginTop: 3, whiteSpace: "nowrap" }}>
              {r.erp_bill_number}
            </span>
          )}
        </>
      ),
    },
  ];
  // Uniform width — "evenly spaced". The table is wider than the viewport, which
  // is what the always-visible horizontal scrollbar under it is for.
  const COLUMN_WIDTH = 190;
  const COL_COUNT = COLUMNS.length;

  return (
    // A DEFINITE height, not minHeight: 100vh. `min-height` doesn't give flex
    // children a height to resolve `flex: 1` against, so the table card sized
    // itself to its content and grew ~100px past the viewport, taking the footer
    // and the horizontal scrollbar off-screen with it. With a definite height and
    // overflow hidden, the card gets exactly the leftover space and its own row
    // area does the scrolling.
    <div style={{ height: "100vh", overflow: "hidden", background: "#ffffff", display: "flex", flexDirection: "column", fontFamily: "Inter, sans-serif" }}>
      <style jsx>{`
        /* The scrollbar stays VISIBLE rather than fading in on scroll (which is
           what the dashboard does): thirteen columns don't fit any viewport, so
           the bar is the only thing telling you there is more to the right. It
           sits at the bottom of the row area, directly above the footer. */
        .dp-track-scroll { scrollbar-width: thin; scrollbar-color: #c5c8ce transparent; }
        .dp-track-scroll::-webkit-scrollbar { height: 10px; width: 10px; }
        .dp-track-scroll::-webkit-scrollbar-track { background: #F5F5F5; }
        .dp-track-scroll::-webkit-scrollbar-thumb { background: #c5c8ce; border-radius: 5px; border: 2px solid #F5F5F5; }
        .dp-track-scroll::-webkit-scrollbar-thumb:hover { background: #a8acb3; }

        /* Row hover in CSS, not inline handlers — a sticky header sits over these
           cells, so each one paints an opaque background of its own. */
        .dp-track-row > td { background: #ffffff; transition: background 0.1s; }
        .dp-track-row:hover > td { background: #F9F9F9; }
      `}</style>

      <div style={{ flex: 1, minHeight: 0, padding: "20px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* ── Title row ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#101828", letterSpacing: "-0.5px", fontFamily: "Inter, sans-serif" }}>
              Tracker
            </h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#717680", fontFamily: "Inter, sans-serif" }}>
              Every invoice in the pipeline, updating as it moves through processing.
              {uniformCurrency && <> All amounts in <strong style={{ fontWeight: 600 }}>{uniformCurrency}</strong>.</>}
            </p>
          </div>
          <button
            onClick={handleDownloadCsv}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "0 16px", height: 32, borderRadius: 6,
              fontSize: 14, fontWeight: 500,
              background: "#1876FF", color: "#ffffff", border: "none",
              cursor: "pointer", flexShrink: 0,
              fontFamily: "Inter, sans-serif",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#0F65E3")}
            onMouseLeave={e => (e.currentTarget.style.background = "#1876FF")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5v8M3.5 6L7 9.5 10.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1.5 11.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Download CSV
          </button>
        </div>

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
              placeholder="Search vendor, invoice #, description..."
              value={searchQuery}
              onChange={e => changeSearch(e.target.value)}
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
            <DpFilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} specs={specs} controls={filters} />
          </div>
        </div>

        {/* ── Table ──
             The card FILLS the remaining viewport height (flex: 1 + minHeight: 0)
             rather than sizing itself to a fixed ten-row block. Before, a
             one-row result left the card short with dead white space under it and
             the footer floating mid-page; now the footer — and the horizontal
             scrollbar immediately above it — sit at the bottom of the screen, and
             the row area takes everything in between. */}
        <div style={{
          flex: 1, minHeight: 0,
          background: "#ffffff", border: "1px solid #E6E6E6", borderRadius: 8,
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <div className="dp-track-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <table style={{
              width: "100%", minWidth: COLUMNS.length * COLUMN_WIDTH,
              borderCollapse: "separate", borderSpacing: 0,
              fontSize: 14, fontFamily: "Inter, sans-serif", tableLayout: "fixed",
            }}>
              <colgroup>
                {COLUMNS.map(c => <col key={c.label} style={{ width: COLUMN_WIDTH }} />)}
              </colgroup>
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <SortHeader
                      key={col.label}
                      label={col.label}
                      active={col.key === sortKey}
                      direction={sortDir}
                      onClick={col.key ? () => toggleSort(col.key as SortKey) : undefined}
                      stickyTop
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows cols={COL_COUNT} />
                ) : total === 0 ? (
                  <EmptyRow
                    cols={COL_COUNT}
                    label={rows.length === 0 ? "No invoices yet" : "No invoices found"}
                    hint={
                      rows.length === 0
                        ? "Every invoice appears here from the moment it's uploaded."
                        : "No invoices match your search or filters."
                    }
                    heightPx={300}
                  />
                ) : (
                  paged.map(r => (
                    // Whole row navigates; the Invoice Number link stops
                    // propagation so it isn't handled twice.
                    <tr key={r.id} className="dp-track-row" onClick={() => openRow(r)} style={{ cursor: "pointer" }}>
                      {COLUMNS.map(col => (
                        <td key={col.label} style={{ padding: "10px 16px", textAlign: "left", borderBottom: "1px solid #E6E6E6" }}>
                          {col.cell(r)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Footer: total + pagination ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid #E6E6E6", background: "#ffffff" }}>
            <span style={{ fontSize: 12, color: "#717680", fontFamily: "Inter, sans-serif" }}>
              Total {total} item{total === 1 ? "" : "s"}
              {(searchQuery || activeFilterCount > 0) && rows.length !== total ? ` of ${rows.length}` : ""}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#717680", fontFamily: "Inter, sans-serif" }}>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => changePageSize(Number(e.target.value))}
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
                <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}
                  style={{ width: 28, height: 28, borderRadius: 6, border: "none", cursor: safePage === 1 ? "default" : "pointer", background: "transparent", color: safePage === 1 ? "#D1D5DB" : "#414651", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2.5L5 7l4 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
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
                          background: safePage === item ? "#D1D5DB" : "transparent",
                          color: safePage === item ? "#1F1F1F" : "#414651",
                          fontFamily: "Inter, sans-serif",
                        }}
                        onMouseEnter={e => { if (safePage !== item) e.currentTarget.style.background = "#F3F4F6"; }}
                        onMouseLeave={e => { if (safePage !== item) e.currentTarget.style.background = "transparent"; }}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}
                  style={{ width: 28, height: 28, borderRadius: 6, border: "none", cursor: safePage === totalPages ? "default" : "pointer", background: "transparent", color: safePage === totalPages ? "#D1D5DB" : "#414651", display: "flex", alignItems: "center", justifyContent: "center" }}>
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

export default withAuthGuard(DirectPayTracker);
