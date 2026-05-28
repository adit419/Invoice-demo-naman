// ── Line Items tab ────────────────────────────────────────────────────────────
//
// Mirrors invoice-validator-fe's Matching ▸ Line Items screen:
//   • LEFT  — the single collapsed invoice row ("Total of invoice"),
//             read-only (all invoice lines are summed by the backend).
//   • RIGHT — the GRN matching dataset, one checkbox per row. Rows the
//             matcher selected (result_data.grn) are pre-checked.
//   • BOTTOM-MIDDLE — a floating variance bar: Invoice ↔ GRN | Variance,
//             with a green / amber / red status dot. It recomputes live as
//             GRN rows are toggled and gates the parent's "Next".
//
// The collapsed total, GRN dataset, tolerance, allowed_range and the initial
// variance are all computed server-side (see backend line_item_matching.py),
// replicating the n8n line-item-computation workflow.
import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "antd";
import { formatCurrencyAmount, getCurrencySymbol } from "@/utils/currency";
import { formatDate } from "@/utils/format";
import type {
  GrnLineItem,
  LineItemMatchingData,
  ToleranceConfig,
  VarianceStatus,
} from "./types";

const formatMoney = formatCurrencyAmount;

// ── Table cell helpers (kept consistent with the previous tab) ────────────────

function panelThStyle(
  align: "left" | "right" | "center",
  width?: number,
): React.CSSProperties {
  return {
    textAlign: align,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 600,
    color: "#6B7280",
    background: "#F9FAFB",
    borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
    width,
  };
}

function panelTdStyle(
  align: "left" | "right" | "center",
  numeric?: "tabular",
): React.CSSProperties {
  return {
    padding: "10px 12px",
    textAlign: align,
    color: "#414651",
    verticalAlign: "middle",
    fontVariantNumeric: numeric === "tabular" ? "tabular-nums" : undefined,
    whiteSpace: numeric === "tabular" ? "nowrap" : undefined,
  };
}

const panelFooterStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 12,
  color: "#6B7280",
  borderTop: "1px solid #E5E7EB",
  background: "#F9FAFB",
};

// ── Variance bar (mirrors invoice-validator-fe VariancePanel) ─────────────────

function VariancePanel({
  invoiceTotal,
  grnTotal,
  variance,
  varianceStatus,
  tolerance,
  invoiceLineCount,
  grnCheckedCount,
  grnCheckedQty,
}: {
  invoiceTotal: number;
  grnTotal: number;
  variance: number;
  varianceStatus: VarianceStatus;
  tolerance: ToleranceConfig | null;
  invoiceLineCount: number;
  grnCheckedCount: number;
  grnCheckedQty: number;
}) {
  const dotInner =
    varianceStatus === "balanced" ? "#22C55E" :
    varianceStatus === "within_tolerance" ? "#FB923C" : "#EF4444";
  const dotOuter =
    varianceStatus === "balanced" ? "#DCFCE7" :
    varianceStatus === "within_tolerance" ? "#FFEDD5" : "#FEE2E2";
  const varColor =
    varianceStatus === "balanced" ? "#15803D" :
    varianceStatus === "within_tolerance" ? "#EA580C" : "#DC2626";
  const varLabel =
    varianceStatus === "balanced" ? "Invoice = GRN" :
    varianceStatus === "within_tolerance" ? "Within Tolerance" :
    varianceStatus === "exceeds_tolerance" ? "Exceeds Tolerance" : "-";

  const currency = tolerance?.currency;
  const toleranceDisplay = tolerance
    ? `±${getCurrencySymbol(currency)}${tolerance.value}`
    : null;

  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 32,
        background: "#ffffff", border: "1px solid #E5E7EB", borderRadius: 16,
        boxShadow: "0 10px 25px rgba(0,0,0,0.12)", padding: "16px 32px",
      }}
    >
      {/* Invoice side */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={{
          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: dotOuter,
        }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: dotInner }} />
        </span>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#6B7280", letterSpacing: 0.5 }}>Invoice</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#101828" }}>{formatMoney(invoiceTotal, currency)}</div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>
            {invoiceLineCount} {invoiceLineCount === 1 ? "Line" : "Lines"}
          </div>
        </div>
      </div>

      {/* Arrow + tolerance */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <span style={{ color: "#9CA3AF", fontSize: 18 }}>↔</span>
        {toleranceDisplay && (
          <span style={{
            fontSize: 11, color: "#6B7280", whiteSpace: "nowrap",
            background: "#F3F4F6", borderRadius: 9999, padding: "2px 10px",
          }}>Tolerance: {toleranceDisplay}</span>
        )}
      </div>

      {/* GRN side */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#6B7280", letterSpacing: 0.5 }}>GRN</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#101828" }}>{formatMoney(grnTotal, currency)}</div>
        <div style={{ fontSize: 11, color: "#6B7280" }}>
          {grnCheckedCount} {grnCheckedCount === 1 ? "Line" : "Lines"}
          {grnCheckedQty > 0 ? ` • ${grnCheckedQty} Qty` : ""}
        </div>
      </div>

      <div style={{ width: 1, height: 48, background: "#E5E7EB", flexShrink: 0 }} />

      {/* Variance */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#6B7280", letterSpacing: 0.5 }}>Variance</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: varColor }}>
          {varianceStatus === "balanced" ? "Balanced" : formatMoney(variance, currency)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: varColor }}>{varLabel}</div>
      </div>
    </div>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export function LineItemsTab({
  data,
  readOnly = false,
  onVarianceChange,
}: {
  data: LineItemMatchingData | null;
  readOnly?: boolean;
  /** Reports gating state up so the page can enable/disable "Next". */
  onVarianceChange?: (ok: boolean, status: VarianceStatus) => void;
}) {
  const matching = data?.matching;
  const collapsed = matching?.invoice_line_items?.[0] ?? null;
  const grnItems: GrnLineItem[] = useMemo(
    () => matching?.grn_line_items ?? [],
    [matching],
  );
  const tolerance = matching?.tolerance ?? null;
  const allowedRange = matching?.allowed_range ?? null;
  const currency = data?.currency ?? tolerance?.currency ?? "USD";

  // GRN ids the matcher selected → the initial checked set.
  const serverMatchedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of matching?.results ?? []) {
      for (const g of r.result_data?.grn ?? []) ids.add(String(g));
    }
    return ids;
  }, [matching]);

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [grnSearch, setGrnSearch] = useState("");

  // Re-seed whenever the underlying server data changes (load / refetch).
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${data?.fixture_key}:${grnItems.length}:${serverMatchedIds.size}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    setCheckedIds(new Set(serverMatchedIds));
  }, [data?.fixture_key, grnItems.length, serverMatchedIds]);

  const invoiceTotal = collapsed ? Number(collapsed.line_total) || 0 : 0;

  const grnTotal = useMemo(
    () =>
      Math.round(
        grnItems
          .filter((g) => checkedIds.has(String(g.id)))
          .reduce((s, g) => s + (Number(g.amount) || 0), 0) * 100,
      ) / 100,
    [grnItems, checkedIds],
  );

  const grnCheckedQty = useMemo(
    () =>
      grnItems
        .filter((g) => checkedIds.has(String(g.id)))
        .reduce((s, g) => s + (Number(g.quantity) || 0), 0),
    [grnItems, checkedIds],
  );

  const variance = useMemo(
    () => Math.round((invoiceTotal - grnTotal) * 100) / 100,
    [invoiceTotal, grnTotal],
  );

  const varianceStatus: VarianceStatus = useMemo(() => {
    if (checkedIds.size === 0) return "unchecked";
    if (variance === 0) return "balanced";
    if (tolerance != null && Math.abs(variance) <= tolerance.value)
      return "within_tolerance";
    if (
      allowedRange != null &&
      grnTotal >= Math.min(allowedRange.min, allowedRange.max) &&
      grnTotal <= Math.max(allowedRange.min, allowedRange.max)
    )
      return "within_tolerance";
    return "exceeds_tolerance";
  }, [checkedIds.size, variance, tolerance, allowedRange, grnTotal]);

  const varianceOk =
    varianceStatus === "balanced" || varianceStatus === "within_tolerance";

  // Report gating state to the parent (matching.tsx) so it can gate "Next".
  useEffect(() => {
    onVarianceChange?.(varianceOk, varianceStatus);
  }, [varianceOk, varianceStatus, onVarianceChange]);

  if (!data || !collapsed) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "#6B7280" }}>
        Line item matching data not available.
      </div>
    );
  }

  const filteredGrn = grnItems.filter((g) => {
    if (!grnSearch) return true;
    const q = grnSearch.toLowerCase();
    return (
      (g.po_number ?? "").toLowerCase().includes(q) ||
      (g.grn_number ?? "").toLowerCase().includes(q) ||
      (g.description ?? "").toLowerCase().includes(q)
    );
  });

  const filteredIds = filteredGrn.map((g) => String(g.id));
  const allFilteredChecked =
    filteredIds.length > 0 && filteredIds.every((id) => checkedIds.has(id));
  const someFilteredChecked = filteredIds.some((id) => checkedIds.has(id));

  const toggleOne = (id: string) => {
    if (readOnly) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (readOnly) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) filteredIds.forEach((id) => next.add(id));
      else filteredIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col" style={{ position: "relative" }}>
      {/* Checked GRN checkboxes turn green — replicates invoice-validator-fe's
          GRNMappingPanel `!bg-green-500 !border-green-500` override (Tailwind v4
          here can't reuse the main app's v3 `!`-prefixed arbitrary variants, so
          this scoped block does the same thing). */}
      <style>{`
        .grn-cb-green .ant-checkbox-checked .ant-checkbox-inner,
        .grn-cb-green .ant-checkbox-checked:hover .ant-checkbox-inner,
        .grn-cb-green:hover .ant-checkbox-checked .ant-checkbox-inner {
          background-color: #22C55E;
          border-color: #22C55E;
        }
        .grn-cb-green .ant-checkbox-checked .ant-checkbox-inner::after {
          border-color: #ffffff;
        }
        .grn-cb-green .ant-checkbox-checked::after {
          border-color: #22C55E;
        }
      `}</style>
      <div
        className="flex-1 flex overflow-hidden"
        style={{ paddingBottom: checkedIds.size > 0 ? 140 : 0 }}
      >
        {/* ── LEFT: collapsed invoice line (read-only) ──────────────────────── */}
        <div
          className="flex flex-col"
          style={{ width: "44%", minWidth: 0, borderRight: "1px solid #E5E7EB" }}
        >
          <div
            className="shrink-0"
            style={{
              padding: "10px 16px", borderBottom: "1px solid #E5E7EB",
              background: "#F9FAFB", fontSize: 12, fontWeight: 700,
              letterSpacing: 0.6, color: "#6B7280",
            }}
          >
            INVOICE LINE ITEMS
          </div>
          <div className="flex-1 overflow-auto">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  <th style={panelThStyle("center", 44)}>
                    <Checkbox checked disabled />
                  </th>
                  <th style={panelThStyle("left", 110)}>Item No.</th>
                  <th style={panelThStyle("left")}>Description</th>
                  <th style={panelThStyle("right", 70)}>Qty</th>
                  <th style={panelThStyle("right", 130)}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #F0F0F0", background: "#ffffff" }}>
                  <td style={{ ...panelTdStyle("center"), width: 44 }}>
                    <Checkbox checked disabled />
                  </td>
                  <td style={panelTdStyle("left")}>
                    <span style={{ color: "#414651", fontWeight: 500 }}>
                      ILI-0001
                    </span>
                  </td>
                  <td style={panelTdStyle("left")} title={collapsed.description}>
                    <span style={{ color: "#414651", fontWeight: 500 }}>
                      {collapsed.description}
                    </span>
                  </td>
                  <td style={panelTdStyle("right", "tabular")}>{collapsed.quantity}</td>
                  <td style={panelTdStyle("right", "tabular")}>
                    {formatMoney(invoiceTotal, currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={panelFooterStyle}>
            All invoice lines collapsed into one total row.
          </div>
        </div>

        {/* ── RIGHT: GRN dataset with checkboxes ────────────────────────────── */}
        <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
          <div
            className="shrink-0 flex items-center justify-between"
            style={{
              padding: "10px 16px", borderBottom: "1px solid #E5E7EB",
              background: "#F9FAFB",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: "#6B7280" }}>
              PO/GRN
            </span>
            <input
              value={grnSearch}
              placeholder="Search…"
              onChange={(e) => setGrnSearch(e.target.value)}
              style={{
                height: 28, padding: "0 8px", fontSize: 12, color: "#414651",
                border: "1px solid #D1D5DB", borderRadius: 4, outline: "none", width: 160,
              }}
            />
          </div>
          <div className="flex-1 overflow-auto">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  <th style={panelThStyle("center", 44)}>
                    <Checkbox
                      checked={allFilteredChecked}
                      indeterminate={someFilteredChecked && !allFilteredChecked}
                      disabled={readOnly || filteredIds.length === 0}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th style={panelThStyle("left", 120)}>PO No.</th>
                  <th style={panelThStyle("left", 120)}>GRN No.</th>
                  <th style={panelThStyle("left", 130)}>Document Date</th>
                  <th style={panelThStyle("left")}>Description</th>
                  <th style={panelThStyle("right", 90)}>Quantity</th>
                  <th style={panelThStyle("right", 130)}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredGrn.map((g) => {
                  const id = String(g.id);
                  const isChecked = checkedIds.has(id);
                  return (
                    <tr
                      key={id}
                      onClick={() => toggleOne(id)}
                      style={{
                        borderBottom: "1px solid #F0F0F0",
                        // Checked rows turn light-green (matches invoice-validator-fe
                        // GRNMappingPanel's bg-green-50 + green-500 checkbox).
                        background: isChecked ? "#F0FDF4" : "#ffffff",
                        cursor: readOnly ? "default" : "pointer",
                      }}
                    >
                      <td style={{ ...panelTdStyle("center"), width: 44 }}>
                        <span className={isChecked ? "grn-cb grn-cb-green" : "grn-cb"}>
                          <Checkbox
                            checked={isChecked}
                            disabled={readOnly}
                            onChange={() => toggleOne(id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </span>
                      </td>
                      <td style={panelTdStyle("left")}>
                        {g.po_number && String(g.po_number).trim() !== "" ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center",
                            padding: "1px 8px", borderRadius: 6, fontSize: 12,
                            fontWeight: 600, color: "#2563EB", background: "#EFF6FF",
                          }}>
                            {g.po_number}
                          </span>
                        ) : (
                          <span style={{ color: "#9CA3AF" }}>-</span>
                        )}
                      </td>
                      <td style={panelTdStyle("left")}>
                        <span style={{ color: "#414651", fontWeight: 500 }}>
                          {g.grn_number || "-"}
                        </span>
                      </td>
                      <td style={panelTdStyle("left")}>
                        <span style={{ color: "#414651" }}>
                          {formatDate(g.document_date)}
                        </span>
                      </td>
                      <td style={panelTdStyle("left")} title={g.description}>
                        <span style={{
                          color: "#414651", display: "inline-block", maxWidth: 280,
                          overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", verticalAlign: "middle",
                        }}>
                          {g.description || "-"}
                        </span>
                      </td>
                      <td style={panelTdStyle("right", "tabular")}>{g.quantity ?? "-"}</td>
                      <td style={panelTdStyle("right", "tabular")}>
                        {formatMoney(g.amount, currency)}
                      </td>
                    </tr>
                  );
                })}
                {filteredGrn.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...panelTdStyle("center"), color: "#9CA3AF", padding: 32 }}>
                      {grnSearch ? "No GRN lines match the search." : "No GRN lines to match against."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={panelFooterStyle}>
            {filteredGrn.length} GRN line item{filteredGrn.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* ── Variance bar — floats centered just above the page footer ──────── */}
      {checkedIds.size > 0 && (
        <div
          style={{
            position: "absolute", bottom: 24, left: "50%",
            transform: "translateX(-50%)", zIndex: 10, pointerEvents: "none",
          }}
        >
          <VariancePanel
            invoiceTotal={invoiceTotal}
            grnTotal={grnTotal}
            variance={variance}
            varianceStatus={varianceStatus}
            tolerance={tolerance}
            invoiceLineCount={1}
            grnCheckedCount={checkedIds.size}
            grnCheckedQty={grnCheckedQty}
          />
        </div>
      )}
    </div>
  );
}
