// Matching-stage control for the Total Amount Before VAT tolerance check —
// on by default (see backend/src/directpay/stp.py's
// get_dp_total_before_vat_threshold). Rendered inline in the variance bar's
// header (TotalBeforeVatVarianceBar's thresholdControl prop), so the tolerance
// is adjusted right where its effect is shown.
//
// Deliberately has NO Save/Discard step: the switch commits immediately and the
// percentage commits on blur or Enter. There are only two values here and the
// variance bar re-renders with the result straight away, so an explicit save
// button was just one more thing to forget to press.
import { useEffect, useState } from "react";
import { Switch } from "antd";
import { useToast } from "@/components/ui";
import { ApiError } from "@/services/api";
import { directpayService, DpTotalBeforeVatThreshold } from "@/services/directpay";

export function TotalBeforeVatThresholdControl({ onSaved }: { onSaved?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // `saved` is the single source of truth for what's stored; `inputVal` is just
  // the in-progress text of the % box.
  const [saved, setSaved] = useState<DpTotalBeforeVatThreshold>({ enabled: true, threshold_pct: 5 });
  const [inputVal, setInputVal] = useState("5");

  useEffect(() => {
    directpayService
      .getTotalBeforeVatThreshold()
      .then((d) => {
        setSaved(d);
        setInputVal(String(d.threshold_pct));
      })
      .catch(() => {
        /* fall back to the enabled/5% default already in state */
      })
      .finally(() => setLoading(false));
  }, []);

  /** The one write path for both controls. Reverts the box to the stored value
   *  on a bad number or a failed request, so what's shown is always what's
   *  actually saved. */
  const commit = async (enabled: boolean, pct: number) => {
    if (Number.isNaN(pct) || pct < 0) {
      setInputVal(String(saved.threshold_pct));
      toast("Threshold must be a percentage ≥ 0", "error");
      return;
    }
    if (enabled === saved.enabled && pct === saved.threshold_pct) return; // no-op
    setSaving(true);
    try {
      const result = await directpayService.setTotalBeforeVatThreshold(enabled, pct);
      setSaved(result);
      setInputVal(String(result.threshold_pct));
      onSaved?.();
    } catch (err) {
      setInputVal(String(saved.threshold_pct));
      toast(err instanceof ApiError ? err.message : "Failed to update threshold", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "3px 10px", borderRadius: 9999,
        background: "#F9FAFB", border: "1px solid #E6E6E6", fontFamily: "Inter, sans-serif",
        opacity: saving ? 0.65 : 1, transition: "opacity 120ms ease",
      }}
    >
      <Switch
        checked={saved.enabled}
        onChange={(next) => void commit(next, parseFloat(inputVal))}
        size="small"
        disabled={saving}
      />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#101828", whiteSpace: "nowrap" }}>
        Tolerance
      </span>
      <input
        type="number"
        min={0}
        step={0.5}
        value={inputVal}
        disabled={!saved.enabled || saving}
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={() => void commit(saved.enabled, parseFloat(inputVal))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        style={{
          width: 50, padding: "2px 6px", borderRadius: 6,
          border: "1px solid #D5D5D5",
          background: !saved.enabled || saving ? "#F5F5F5" : "#ffffff",
          color: !saved.enabled ? "#8D92A6" : "#414651",
          fontSize: 12, fontWeight: 600, textAlign: "center", outline: "none",
          fontVariantNumeric: "tabular-nums",
          cursor: !saved.enabled ? "not-allowed" : "text",
        }}
      />
      <span style={{ fontSize: 12, color: "#717680" }}>%</span>
    </div>
  );
}
