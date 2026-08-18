// Matching-stage control for the Total Amount Before VAT tolerance check —
// on by default per explicit instruction (see
// backend/src/directpay/stp.py's get_dp_total_before_vat_threshold). Lives
// directly on the Matching page (not the admin Workflow Settings page,
// unlike the DP Ack Threshold/STP panels) since it's a per-review-session
// control the person working the invoice should be able to see and adjust
// in place.
import { useEffect, useState } from "react";
import { Switch } from "antd";
import { useToast } from "@/components/ui";
import { ApiError } from "@/services/api";
import { directpayService, DpTotalBeforeVatThreshold } from "@/services/directpay";

export function TotalBeforeVatThresholdControl({ onSaved }: { onSaved?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<DpTotalBeforeVatThreshold>({ enabled: true, threshold_pct: 5 });
  const [enabled, setEnabled] = useState(true);
  const [inputVal, setInputVal] = useState("5");

  useEffect(() => {
    directpayService
      .getTotalBeforeVatThreshold()
      .then((d) => {
        setSaved(d);
        setEnabled(d.enabled);
        setInputVal(String(d.threshold_pct));
      })
      .catch(() => {
        /* fall back to enabled/5% default already in state */
      })
      .finally(() => setLoading(false));
  }, []);

  const parsedInput = parseFloat(inputVal);
  const inputValid = !Number.isNaN(parsedInput) && parsedInput >= 0;
  const dirty = enabled !== saved.enabled || (inputValid && parsedInput !== saved.threshold_pct);

  const handleSave = async () => {
    if (!inputValid) {
      toast("Threshold must be a percentage ≥ 0", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await directpayService.setTotalBeforeVatThreshold(enabled, parsedInput);
      setSaved(result);
      onSaved?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to update threshold", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setEnabled(saved.enabled);
    setInputVal(String(saved.threshold_pct));
  };

  if (loading) return null;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        padding: "12px 16px", borderRadius: 8, marginBottom: 16,
        background: "#F9FAFB", border: "1px solid #E6E6E6", fontFamily: "Inter, sans-serif",
      }}
    >
      <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
        <Switch checked={enabled} onChange={setEnabled} size="small" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#101828" }}>
            Total Amount Before VAT Threshold{" "}
            <span
              style={{
                display: "inline-block", marginLeft: 6, padding: "1px 8px", borderRadius: 9999,
                fontSize: 11, fontWeight: 600,
                background: saved.enabled ? "#ECFDF5" : "#F3F4F6",
                color: saved.enabled ? "#15803D" : "#6B7280",
                border: `1px solid ${saved.enabled ? "#86EFAC" : "#E5E7EB"}`,
              }}
            >
              {saved.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#717680", marginTop: 2 }}>
            {saved.enabled
              ? `Invoice may run up to ${saved.threshold_pct}% above the contract amount before it's flagged as a mismatch.`
              : "Disabled — the invoice amount must match the contract amount exactly."}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        <input
          type="number"
          min={0}
          step={0.5}
          value={inputVal}
          disabled={!enabled}
          onChange={(e) => setInputVal(e.target.value)}
          style={{
            width: 64,
            padding: "5px 8px",
            borderRadius: 6,
            border: `1px solid ${dirty && inputValid ? "#1876FF" : "#D5D5D5"}`,
            background: !enabled ? "#F5F5F5" : "#ffffff",
            color: !enabled ? "#8D92A6" : "#414651",
            fontSize: 13,
            fontWeight: 500,
            textAlign: "center",
            outline: "none",
            cursor: !enabled ? "not-allowed" : "text",
          }}
        />
        <span style={{ fontSize: 13, color: "#717680" }}>%</span>
        {dirty && (
          <>
            <button
              onClick={handleDiscard}
              style={{
                height: 28, padding: "0 10px", fontSize: 12, fontWeight: 500,
                color: "#414651", background: "#ffffff", border: "1px solid #D5D5D5",
                borderRadius: 6, cursor: "pointer", fontFamily: "Inter, sans-serif",
              }}
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !inputValid}
              style={{
                height: 28, padding: "0 12px", fontSize: 12, fontWeight: 500,
                background: "#1876FF", color: "#fff", border: "none", borderRadius: 6,
                cursor: saving || !inputValid ? "not-allowed" : "pointer",
                fontFamily: "Inter, sans-serif",
                opacity: saving || !inputValid ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
