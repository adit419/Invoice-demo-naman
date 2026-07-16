// ── Line Items tab ────────────────────────────────────────────────────────────
//
// Per-line-item matching UI matching the Figma design:
//   LEFT   – invoice line items list with status icons and filter tabs.
//   RIGHT  – GRN candidates for the selected invoice line item; each row shows
//            Matched / AI-Suggests badge and qty / total discrepancy badges.
//   BOTTOM – manual-selection drawer: slide up when a left-panel checkbox is
//            checked so the user can confirm or adjust a mapping.
import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrencyAmount } from "@/utils/currency";
import { stagesService } from "@/services";
import type {
  GrnCandidate,
  InvoiceLinePerItem,
  InvoiceLineStatus,
  LineItemMatchingData,
  VarianceStatus,
} from "./types";

const fmt = formatCurrencyAmount;

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 20 }: { status: InvoiceLineStatus | string; size?: number }) {
  const cfg =
    status === "matched"
      ? { bg: "#22C55E", label: "✓" }
      : status === "probable"
      ? { bg: "#F59E0B", label: "?" }
      : { bg: "#EF4444", label: "✕" };
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: cfg.bg, color: "#fff",
        fontSize: size * 0.5, fontWeight: 700, lineHeight: 1,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Discrepancy badge ─────────────────────────────────────────────────────────

function DiscrepancyBadge({ diff, type }: { diff: number; type: "qty" | "total" }) {
  if (diff === 0) return null;
  const isNeg = diff < 0;
  const arrow = isNeg ? "↓" : "↑";
  const sign = isNeg ? "" : "+";
  const label =
    type === "qty"
      ? `${arrow}${sign}${diff} ${isNeg ? "Less Qty" : "More Qty"}`
      : `${arrow}${sign}${Math.abs(diff).toFixed(2)} ${isNeg ? "Below Line Total" : "Exceeds Line Total"}`;
  return (
    <span
      style={{
        display: "inline-block", fontSize: 11, fontWeight: 600,
        color: "#DC2626", whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── Status badge (Matched / AI Suggests) ─────────────────────────────────────

function StatusBadge({ isAiSuggested }: { isAiSuggested: boolean }) {
  if (isAiSuggested) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
        color: "#7C3AED", background: "#EDE9FE", whiteSpace: "nowrap",
      }}>
        ✦ AI Suggests
      </span>
    );
  }
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      fontSize: 11, fontWeight: 600, color: "#15803D", background: "#DCFCE7",
      whiteSpace: "nowrap",
    }}>
      Matched
    </span>
  );
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({
  checked, indeterminate = false, disabled = false, onChange, green = false,
}: {
  checked: boolean; indeterminate?: boolean; disabled?: boolean;
  onChange?: (v: boolean) => void; green?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const border = checked
    ? green ? "#22C55E" : "#2563EB"
    : "#D1D5DB";
  const bg = checked
    ? green ? "#22C55E" : "#2563EB"
    : "#fff";

  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, borderRadius: 3, border: `2px solid ${border}`,
        background: bg, cursor: disabled ? "default" : "pointer", flexShrink: 0,
        position: "relative", boxSizing: "border-box",
      }}
      onClick={disabled ? undefined : (e) => { e.stopPropagation(); onChange?.(!checked); }}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {indeterminate && !checked && (
        <span style={{ width: 8, height: 2, background: "#6B7280", borderRadius: 1 }} />
      )}
    </span>
  );
}

// ── PO number pill ────────────────────────────────────────────────────────────

function PoPill({ po }: { po: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 5,
      fontSize: 12, fontWeight: 600, color: "#2563EB", background: "#EFF6FF",
      whiteSpace: "nowrap",
    }}>
      {po}
    </span>
  );
}

// ── Left panel ────────────────────────────────────────────────────────────────

type FilterTab = "all" | "matched" | "probable" | "no_match";

function LeftPanel({
  items,
  activeIdx,
  filterTab,
  manualItemId,
  localMatched,
  currency,
  onSelectItem,
  onFilterChange,
  onCheckboxChange,
}: {
  items: InvoiceLinePerItem[];
  activeIdx: number;
  filterTab: FilterTab;
  manualItemId: string | null;
  localMatched: Set<string>;
  currency: string;
  onSelectItem: (idx: number) => void;
  onFilterChange: (tab: FilterTab) => void;
  onCheckboxChange: (itemId: string, checked: boolean) => void;
}) {
  function effectiveStatus(item: InvoiceLinePerItem): InvoiceLineStatus {
    if (localMatched.has(item.id)) return "matched";
    return item.match_status;
  }

  const counts = useMemo(() => ({
    all: items.length,
    matched: items.filter(i => effectiveStatus(i) === "matched").length,
    probable: items.filter(i => effectiveStatus(i) === "probable").length,
    no_match: items.filter(i => effectiveStatus(i) === "no_match").length,
  }), [items, localMatched]);

  const filtered = useMemo(() =>
    filterTab === "all" ? items : items.filter(i => effectiveStatus(i) === filterTab),
    [items, filterTab, localMatched],
  );

  const invoiceTotalQty = items.reduce((s, i) => s + i.quantity, 0);
  const invoiceTotalAmt = items.reduce((s, i) => s + i.line_total, 0);

  const filterLabels: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All ${counts.all}` },
    { key: "matched", label: `Matched ${counts.matched}` },
    { key: "probable", label: `Probable ${counts.probable}` },
    { key: "no_match", label: `No Match ${counts.no_match}` },
  ];

  return (
    <div className="flex flex-col" style={{ flex: 1, minWidth: 0, borderRight: "1px solid #E5E7EB", height: "100%" }}>
      {/* Filter tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", background: "#fff", flexShrink: 0 }}>
        {filterLabels.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            style={{
              padding: "8px 14px", fontSize: 13, fontWeight: filterTab === key ? 600 : 400,
              color: filterTab === key ? "#101828" : "#6B7280",
              borderBottom: filterTab === key ? "2px solid #101828" : "2px solid transparent",
              background: "none", border: "none",
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table: header + rows + total — fills remaining height, rows scroll */}
      <div style={{ margin: "12px", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflowX: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflowY: "auto", minWidth: 450 }}>
          {/* Sticky column header */}
          <div style={{
            display: "grid", gridTemplateColumns: "3px 28px 32px minmax(90px, 1fr) 60px 120px 120px",
            alignItems: "stretch", fontSize: 11, fontWeight: 600, color: "#6B7280",
            background: "#F9FAFB", borderBottom: "1px solid #E5E7EB",
            position: "sticky", top: 0, zIndex: 1,
          }}>
            <div />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 4px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 8px", borderRight: "1px solid #E5E7EB" }} />
            <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderRight: "1px solid #E5E7EB" }}>Description</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 12px", borderRight: "1px solid #E5E7EB" }}>Qty</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 12px", borderRight: "1px solid #E5E7EB" }}>Unit Price</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 12px" }}>Line Total</div>
          </div>

          {/* Item rows */}
          {filtered.map((item) => {
            const realIdx = items.indexOf(item);
            const isActive = realIdx === activeIdx;
            const status = effectiveStatus(item);
            const isChecked = manualItemId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => onSelectItem(realIdx)}
                style={{
                  display: "grid", gridTemplateColumns: "3px 28px 32px minmax(90px, 1fr) 60px 120px 120px",
                  alignItems: "stretch",
                  borderBottom: "1px solid #F0F0F0",
                  background: isActive ? "#F0F6FF" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ background: isActive ? "#2563EB" : "transparent" }} />
                {/* Status icon */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 4px" }}>
                  <StatusIcon status={status} size={18} />
                </div>
                {/* Checkbox */}
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 8px", borderRight: "1px solid #E5E7EB" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox checked={isChecked} onChange={(v) => onCheckboxChange(item.id, v)} />
                </div>
                {/* Description */}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "10px 12px", borderRight: "1px solid #E5E7EB", minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>{item.id}</div>
                  <div style={{ fontSize: 13, color: "#101828" }}>
                    {item.description || item.item_code || "—"}
                  </div>
                </div>
                {/* Qty */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "10px 12px", borderRight: "1px solid #E5E7EB", fontSize: 13, color: "#414651", fontVariantNumeric: "tabular-nums" }}>
                  {item.quantity}
                </div>
                {/* Unit Price */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "10px 12px", borderRight: "1px solid #E5E7EB", fontSize: 13, color: "#414651", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(item.unit_price, currency)}
                </div>
                {/* Line Total */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#101828", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(item.line_total, currency)}
                </div>
              </div>
            );
          })}

          {/* Sticky total row */}
          <div style={{
            display: "grid", gridTemplateColumns: "3px 28px 32px minmax(90px, 1fr) 60px 120px 120px",
            alignItems: "stretch",
            borderTop: "1px solid #E5E7EB", background: "#F9FAFB",
            position: "sticky", bottom: 0,
          }}>
            <div />
            <div style={{ display: "flex", alignItems: "center", padding: "10px 4px" }} />
            <div style={{ display: "flex", alignItems: "center", padding: "10px 8px", borderRight: "1px solid #E5E7EB" }} />
            <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderRight: "1px solid #E5E7EB", fontSize: 12, fontWeight: 700, color: "#6B7280" }}>
              Total Line Items: {items.length}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "10px 12px", borderRight: "1px solid #E5E7EB", fontSize: 13, fontWeight: 700, color: "#101828", fontVariantNumeric: "tabular-nums" }}>
              {invoiceTotalQty}
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderRight: "1px solid #E5E7EB" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "10px 12px", fontSize: 13, fontWeight: 700, color: "#101828", fontVariantNumeric: "tabular-nums" }}>
              {fmt(invoiceTotalAmt, currency)}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Right panel ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function RightPanel({
  item,
  effectiveStatus,
  checkedGrnIds,
  readOnly,
  currency,
  onToggleGrn,
}: {
  item: InvoiceLinePerItem | null;
  effectiveStatus: InvoiceLineStatus;
  checkedGrnIds: Set<string>;
  readOnly: boolean;
  currency: string;
  onToggleGrn: (id: string, checked: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Reset page when item changes
  useEffect(() => { setPage(1); setSearch(""); }, [item?.id]);

  if (!item) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "#9CA3AF", fontSize: 14 }}>
        Select a line item to view GRN candidates.
      </div>
    );
  }

  const candidates = item.grn_candidates;
  const filtered = candidates.filter(g => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (g.grn_number ?? "").toLowerCase().includes(q) ||
      (g.po_number ?? "").toLowerCase().includes(q) ||
      (g.description ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // How many GRN candidates are checked for this item
  const matchedCount = candidates.filter(g => checkedGrnIds.has(g.id)).length;

  // Has multiple distinct POs → show PO column
  const uniquePOs = new Set(candidates.map(g => g.po_number).filter(Boolean));
  const showPoCol = uniquePOs.size > 1;

  // Single PO label (for header when only one PO)
  const singlePo = uniquePOs.size === 1 ? [...uniquePOs][0] : null;

  // Checked GRN totals for this item
  const checkedCandidates = candidates.filter(g => checkedGrnIds.has(g.id));
  const checkedQty = checkedCandidates.reduce((s, g) => s + g.quantity, 0);
  const checkedTotal = checkedCandidates.reduce((s, g) => s + g.line_total, 0);
  const allChecked = filtered.length > 0 && filtered.every(g => checkedGrnIds.has(g.id));
  const someChecked = filtered.some(g => checkedGrnIds.has(g.id));

  // Grid template
  const cols = showPoCol
    ? "44px 100px 100px minmax(160px, 1fr) 80px 110px 110px 110px"
    : "44px 100px minmax(160px, 1fr) 80px 110px 110px 110px";

  return (
    <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: "1px solid #E5E7EB",
        background: "#fff", flexShrink: 0, gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>{item.id}</span>
          <StatusIcon status={effectiveStatus} size={18} />
          {singlePo && (
            <span style={{ fontSize: 12, color: "#6B7280" }}>
              GRN&nbsp;
              <PoPill po={singlePo} />
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {candidates.length > 0 && (
            <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
              {matchedCount} Item{matchedCount !== 1 ? "s" : ""} Matched
            </span>
          )}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", fontSize: 13 }}>
              ⌕
            </span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search…"
              style={{
                height: 30, paddingLeft: 24, paddingRight: 8, fontSize: 12, color: "#414651",
                border: "1px solid #D1D5DB", borderRadius: 6, outline: "none", width: 160,
              }}
            />
          </div>
        </div>
      </div>

      {/* GRN table: fills remaining height, rows scroll */}
      <div style={{ margin: "12px", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column" }}>
        {candidates.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, color: "#9CA3AF", fontSize: 14 }}>
            No GRN candidates found for this line item.
          </div>
        ) : (
          <div style={{ flex: 1, overflowX: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto", minWidth: showPoCol ? 820 : 720 }}>
            {/* Sticky column header */}
            <div style={{
              display: "grid", gridTemplateColumns: cols, alignItems: "stretch",
              fontSize: 11, fontWeight: 600, color: "#6B7280",
              background: "#F9FAFB", borderBottom: "1px solid #E5E7EB",
              position: "sticky", top: 0, zIndex: 1,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 10px" }}>
                <Checkbox
                  checked={allChecked}
                  indeterminate={someChecked && !allChecked}
                  disabled={readOnly || filtered.length === 0}
                  onChange={(v) => filtered.forEach(g => onToggleGrn(g.id, v))}
                  green
                />
              </div>
              {showPoCol && <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRight: "1px solid #E5E7EB" }}>PO No.</div>}
              <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRight: "1px solid #E5E7EB" }}>GRN No.</div>
              <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRight: "1px solid #E5E7EB" }}>Description</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 10px", borderRight: "1px solid #E5E7EB" }}>Quantity</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 10px", borderRight: "1px solid #E5E7EB" }}>Unit Price</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 10px", borderRight: "1px solid #E5E7EB" }}>Line Total</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 10px" }}>Status</div>
            </div>

            {/* Body rows */}
            {paged.map(g => {
              const isChecked = checkedGrnIds.has(g.id);
              return (
                <div
                  key={g.id}
                  onClick={() => !readOnly && onToggleGrn(g.id, !isChecked)}
                  style={{
                    display: "grid", gridTemplateColumns: cols, alignItems: "stretch",
                    borderBottom: "1px solid #F0F0F0",
                    background: isChecked ? "#F0FDF4" : "#fff",
                    cursor: readOnly ? "default" : "pointer",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 10px" }}
                    onClick={e => e.stopPropagation()}
                  >
                    <Checkbox checked={isChecked} disabled={readOnly} onChange={(v) => onToggleGrn(g.id, v)} green />
                  </div>
                  {showPoCol && (
                    <div style={{ display: "flex", alignItems: "center", padding: "10px 10px", borderRight: "1px solid #E5E7EB" }}>
                      {g.po_number ? <PoPill po={g.po_number} /> : <span style={{ color: "#9CA3AF" }}>—</span>}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", padding: "10px 10px", borderRight: "1px solid #E5E7EB", color: "#414651", fontWeight: 500 }}>
                    {g.grn_number || "—"}
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", padding: "10px 10px", borderRight: "1px solid #E5E7EB", color: "#414651", minWidth: 0 }}>
                    {g.description || "—"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", padding: "10px 10px", borderRight: "1px solid #E5E7EB", fontVariantNumeric: "tabular-nums" }}>
                    <div>{g.quantity}</div>
                    {g.qty_diff !== 0 && <div style={{ marginTop: 2 }}><DiscrepancyBadge diff={g.qty_diff} type="qty" /></div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "10px 10px", borderRight: "1px solid #E5E7EB", color: "#414651", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(g.unit_price, currency)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", padding: "10px 10px", borderRight: "1px solid #E5E7EB", fontVariantNumeric: "tabular-nums" }}>
                    <div>{fmt(g.line_total, currency)}</div>
                    {g.total_diff !== 0 && <div style={{ marginTop: 2 }}><DiscrepancyBadge diff={g.total_diff} type="total" /></div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 10px" }}>
                    {isChecked && <StatusBadge isAiSuggested={g.is_ai_suggested} />}
                  </div>
                </div>
              );
            })}

            {/* Sticky matched total row */}
            {checkedCandidates.length > 0 && (
              <div style={{
                display: "grid", gridTemplateColumns: cols, alignItems: "stretch",
                borderTop: "1px solid #E5E7EB", background: "#F0FDF4",
                fontSize: 13, fontWeight: 700,
                position: "sticky", bottom: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", padding: "8px 10px" }} />
                {showPoCol && <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRight: "1px solid #E5E7EB" }} />}
                <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRight: "1px solid #E5E7EB" }} />
                <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRight: "1px solid #E5E7EB", color: "#15803D" }}>Total</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 10px", borderRight: "1px solid #E5E7EB", color: "#15803D", fontVariantNumeric: "tabular-nums" }}>{checkedQty}</div>
                <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRight: "1px solid #E5E7EB" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 10px", borderRight: "1px solid #E5E7EB", color: "#15803D", fontVariantNumeric: "tabular-nums" }}>{fmt(checkedTotal, currency)}</div>
                <div style={{ display: "flex", alignItems: "center", padding: "8px 10px" }} />
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 16px", borderTop: "1px solid #E5E7EB",
          background: "#F9FAFB", flexShrink: 0, fontSize: 12, color: "#6B7280",
        }}>
          <span>Total {filtered.length} items</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: "2px 8px", cursor: page === 1 ? "default" : "pointer", color: page === 1 ? "#D1D5DB" : "#6B7280" }}
            >
              &lsaquo;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                style={{
                  width: 28, height: 28, borderRadius: 4, fontSize: 12,
                  fontWeight: p === page ? 700 : 400,
                  background: p === page ? "#101828" : "transparent",
                  color: p === page ? "#fff" : "#6B7280",
                  border: "none", cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: "2px 8px", cursor: page === totalPages ? "default" : "pointer", color: page === totalPages ? "#D1D5DB" : "#6B7280" }}
            >
              &rsaquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manual selection drawer ───────────────────────────────────────────────────

/** Production-style variance card (VARIANCE / amount / status). */
function VarianceCard({ diff, tolerance, currency }: {
  diff: number;
  tolerance: number | null;
  currency: string;
}) {
  const balanced = Math.abs(diff) < 0.01;
  const withinTol = !balanced && tolerance !== null && Math.abs(diff) <= tolerance;
  const palette = balanced
    ? { border: "#BBF7D0", bg: "#F0FDF4", label: "#15803D", big: "#15803D", sub: "#15803D" }
    : withinTol
    ? { border: "#F5D9A8", bg: "#FDF9F0", label: "#B45309", big: "#92400E", sub: "#B45309" }
    : { border: "#FECACA", bg: "#FEF2F2", label: "#B91C1C", big: "#991B1B", sub: "#B91C1C" };
  const amount = `${diff < 0 ? "-" : "+"}${fmt(Math.abs(diff), currency)}`;
  return (
    <div style={{
      border: `1px solid ${palette.border}`, background: palette.bg,
      borderRadius: 10, padding: "8px 16px", minWidth: 150, flexShrink: 0,
      alignSelf: "flex-start",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: palette.label, textTransform: "uppercase", letterSpacing: 0.6 }}>
        Variance
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: palette.big, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>
        {balanced ? "Balanced" : amount}
      </div>
      <div style={{ fontSize: 12, color: palette.sub }}>
        {balanced ? "Invoice = GRN" : withinTol ? "Within Tolerance" : "Exceeds Tolerance"}
      </div>
    </div>
  );
}

function ManualSelectionDrawer({
  invoiceItem,
  selectedGrnCandidates,
  currency,
  tolerance,
  isPerfect,
  onCancel,
  onConfirm,
}: {
  invoiceItem: InvoiceLinePerItem;
  selectedGrnCandidates: GrnCandidate[];
  currency: string;
  tolerance: number | null;
  isPerfect?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const grnQty = selectedGrnCandidates.reduce((s, g) => s + g.quantity, 0);
  const grnTotal = selectedGrnCandidates.reduce((s, g) => s + g.line_total, 0);
  const qtyDiff = grnQty - invoiceItem.quantity;
  const totalDiff = round2(grnTotal - invoiceItem.line_total);
  const invoiceExceedsGrn = selectedGrnCandidates.length > 0 && round2(invoiceItem.line_total - grnTotal) > 0.01;
  const canConfirm = selectedGrnCandidates.length > 0 && !invoiceExceedsGrn;

  return (
    <div style={{
      background: "#fff", borderTop: "1px solid #E5E7EB",
      boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
      padding: "12px 24px 16px", flexShrink: 0,
    }}>
      {/* Header row: title left, actions top-right (clear of the Neo widget
          pinned to the bottom-right corner). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>
          Manual Selection ({selectedGrnCandidates.length})
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              height: 34, padding: "0 16px", fontSize: 13, fontWeight: 500,
              border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff",
              color: "#374151", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          {!isPerfect && (
            <button
              type="button"
              onClick={canConfirm ? onConfirm : undefined}
              disabled={!canConfirm}
              style={{
                height: 34, padding: "0 16px", fontSize: 13, fontWeight: 600,
                border: "none", borderRadius: 6,
                background: canConfirm ? "#2563EB" : "#BFDBFE",
                color: "#fff", cursor: canConfirm ? "pointer" : "default",
              }}
            >
              ✓ Confirm Mapping
            </button>
          )}
        </div>
      </div>

      {/* Content row: invoice → GRN selection, with the variance card adjacent */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 50 }}>
        {/* Invoice Selected */}
        <div style={{ flexShrink: 0, maxWidth: 340 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Invoice Selected
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 20,
            border: "1px solid #E5E7EB", background: "#F9FAFB",
            fontSize: 13, color: "#101828", marginBottom: 8,
            maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {invoiceItem.description || invoiceItem.id} · {invoiceItem.quantity}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
            Lines: 1&nbsp;&nbsp;Quantity: <b style={{ color: "#101828" }}>{invoiceItem.quantity}</b>&nbsp;&nbsp;
            Line Total: <b style={{ color: "#101828" }}>{fmt(invoiceItem.line_total, currency)}</b>
          </div>
        </div>

        {/* Arrow */}
        <div style={{ paddingTop: 24, fontSize: 20, color: "#9CA3AF", flexShrink: 0 }}>→</div>

        {/* GRN Selected */}
        <div style={{ flexShrink: 1, minWidth: 220, maxWidth: 560 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
            PO + GRN Selected
          </div>
          {selectedGrnCandidates.length === 0 ? (
            <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 8 }}>—</div>
          ) : (
            <div style={{ maxHeight: 56, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
              {selectedGrnCandidates.map(g => (
                <div
                  key={g.id}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", borderRadius: 20,
                    border: "1px solid #E5E7EB", background: "#F9FAFB",
                    fontSize: 12, color: "#374151", whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#2563EB" }}>{g.grn_number}</span>
                  <span style={{ color: "#9CA3AF" }}>·</span>
                  <span>qty {g.quantity}</span>
                </div>
              ))}
            </div>
          )}
          {selectedGrnCandidates.length > 0 && (
            <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
              Lines: {selectedGrnCandidates.length}&nbsp;&nbsp;Quantity: <b style={{ color: "#101828" }}>{grnQty}</b>&nbsp;&nbsp;
              Line Total: <b style={{ color: "#101828" }}>{fmt(grnTotal, currency)}</b>
            </div>
          )}
        </div>

        {/* Variance card — replaces the old "Line Total:" discrepancy pill */}
        {selectedGrnCandidates.length > 0 && (
          <VarianceCard diff={totalDiff} tolerance={tolerance} currency={currency} />
        )}

        {/* Quantity discrepancy pill (kept from the previous design) */}
        {selectedGrnCandidates.length > 0 && qtyDiff !== 0 && (
          <span style={{
            padding: "2px 10px", borderRadius: 20,
            border: "1px solid #FECACA", background: "#FEF2F2",
            fontSize: 12, alignSelf: "center", whiteSpace: "nowrap",
          }}>
            Quantity: <DiscrepancyBadge diff={qtyDiff} type="qty" />
          </span>
        )}
      </div>
    </div>
  );
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// ── Main tab ──────────────────────────────────────────────────────────────────

export function LineItemsTab({
  invoiceId,
  data,
  readOnly = false,
  onVarianceChange,
}: {
  invoiceId: string;
  data: LineItemMatchingData | null;
  readOnly?: boolean;
  onVarianceChange?: (ok: boolean, status: VarianceStatus) => void;
}) {
  const perItem: InvoiceLinePerItem[] = useMemo(
    () => data?.matching?.per_item_matching ?? [],
    [data],
  );
  const currency = data?.currency ?? "USD";

  const [activeIdx, setActiveIdx] = useState(0);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [checkedGrnIds, setCheckedGrnIds] = useState<Set<string>>(new Set());
  const [manualItemId, setManualItemId] = useState<string | null>(null);
  const [localMatched, setLocalMatched] = useState<Set<string>>(new Set());

  // Initialise checked GRN IDs from all pre-matched candidates
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${data?.fixture_key}:${perItem.length}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    const ids = new Set<string>();
    for (const item of perItem) {
      for (const g of item.grn_candidates) {
        if (g.is_matched) ids.add(g.id);
      }
    }
    setCheckedGrnIds(ids);

    // Default focus: jump straight to the first probable match (the item that
    // needs the reviewer's attention). If everything is resolved, stay on the
    // All tab with the first line item selected. Pre-tick the item's checkbox
    // so it starts in manual-selection mode, ready to review/confirm.
    const firstProbable = perItem.findIndex(i => i.match_status === "probable");
    const targetIdx = firstProbable >= 0 ? firstProbable : 0;
    setFilterTab(firstProbable >= 0 ? "probable" : "all");
    setActiveIdx(targetIdx);
    setManualItemId(perItem[targetIdx]?.id ?? null);
  }, [data?.fixture_key, perItem]);

  // Variance gating for parent.
  // Items the user explicitly confirmed via the manual-selection drawer are
  // treated as accepted: their shortfall no longer blocks the Next button.
  const tolerance = data?.matching?.tolerance ?? null;
  const varianceStatus: VarianceStatus = useMemo(() => {
    if (checkedGrnIds.size === 0) return "unchecked";
    // Sum variance only for items NOT yet manually confirmed.
    // Skip items in localMatched (confirmed this session) AND items the backend
    // already marked "matched" via saved confirmed_mappings (restored after nav).
    const unconfirmedVariance = round2(
      perItem.reduce((total, item) => {
        if (localMatched.has(item.id)) return total; // confirmed this session
        if (item.match_status === "matched") return total; // confirmed in prior session (backend-restored)
        const itemGrnTotal = item.grn_candidates
          .filter(g => checkedGrnIds.has(g.id))
          .reduce((s, g) => s + g.line_total, 0);
        return total + (item.line_total - itemGrnTotal);
      }, 0),
    );
    if (Math.abs(unconfirmedVariance) < 0.01) return "balanced";
    if (tolerance && Math.abs(unconfirmedVariance) <= tolerance.value) return "within_tolerance";
    return "exceeds_tolerance";
  }, [checkedGrnIds, perItem, localMatched, tolerance]);

  const hasUnresolved = useMemo(() => {
    return perItem.some(item => {
      const eff: InvoiceLineStatus = localMatched.has(item.id) ? "matched" : item.match_status;
      return eff === "no_match" || eff === "probable";
    });
  }, [perItem, localMatched]);

  useEffect(() => {
    const varianceOk = varianceStatus === "balanced" || varianceStatus === "within_tolerance";
    const ok = varianceOk && !hasUnresolved;
    onVarianceChange?.(ok, varianceStatus);
  }, [varianceStatus, hasUnresolved, onVarianceChange]);

  function effectiveStatus(item: InvoiceLinePerItem): InvoiceLineStatus {
    if (localMatched.has(item.id)) return "matched";
    return item.match_status;
  }

  // Toggle a single GRN row
  const toggleGrn = (id: string, checked: boolean) => {
    if (readOnly) return;
    setCheckedGrnIds(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  // Left panel checkbox toggle (manual selection mode)
  const handleCheckbox = (itemId: string, checked: boolean) => {
    setManualItemId(checked ? itemId : null);
    // Jump right panel to that item
    const idx = perItem.findIndex(i => i.id === itemId);
    if (idx >= 0) setActiveIdx(idx);
  };

  // Confirm manual mapping and persist to backend
  const handleConfirm = () => {
    if (!manualItemId) return;
    const newLocalMatched = new Set([...localMatched, manualItemId]);
    setLocalMatched(newLocalMatched);
    setManualItemId(null);
    stagesService.saveLineMappings(invoiceId, {
      checked_grn_ids: [...checkedGrnIds],
      confirmed_item_ids: [...newLocalMatched],
    }).catch(() => {});
  };

  const activeItem = perItem[activeIdx] ?? null;
  const activeEffectiveStatus = activeItem ? effectiveStatus(activeItem) : "no_match";

  // GRN candidates currently checked for the active item (for manual drawer)
  const activeCheckedCandidates = useMemo(() => {
    if (!activeItem || !manualItemId) return [];
    return activeItem.grn_candidates.filter(g => checkedGrnIds.has(g.id));
  }, [activeItem, manualItemId, checkedGrnIds]);

  if (!data || perItem.length === 0) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "#6B7280" }}>
        Line item matching data not available.
      </div>
    );
  }

  const showDrawer = manualItemId !== null;
  const drawerItem = perItem.find(i => i.id === manualItemId) ?? null;

  return (
    <div className="h-full flex flex-col" style={{ position: "relative" }}>
      <div
        className="flex-1 flex overflow-hidden"
      >
        <LeftPanel
          items={perItem}
          activeIdx={activeIdx}
          filterTab={filterTab}
          manualItemId={manualItemId}
          localMatched={localMatched}
          currency={currency}
          onSelectItem={setActiveIdx}
          onFilterChange={(tab) => {
            setFilterTab(tab);
            // Select the first item visible under the new filter
            const idx = tab === "all" ? 0 : perItem.findIndex(i => effectiveStatus(i) === tab);
            setActiveIdx(Math.max(0, idx));
          }}
          onCheckboxChange={handleCheckbox}
        />
        <RightPanel
          item={activeItem}
          effectiveStatus={activeEffectiveStatus}
          checkedGrnIds={checkedGrnIds}
          readOnly={readOnly}
          currency={currency}
          onToggleGrn={toggleGrn}
        />
      </div>

      {showDrawer && drawerItem && (
        <ManualSelectionDrawer
          invoiceItem={drawerItem}
          selectedGrnCandidates={activeCheckedCandidates}
          currency={currency}
          tolerance={tolerance?.value ?? null}
          isPerfect={drawerItem.match_status === "matched" && !drawerItem.grn_candidates.some(g => g.is_ai_suggested)}
          onCancel={() => setManualItemId(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
