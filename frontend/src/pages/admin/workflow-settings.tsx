import { useEffect, useMemo, useState } from "react";
import { withAuthGuard } from "@/components/AuthGuard";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, settingsService } from "@/services";
import { useToast } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldConfig {
  key: string;
  label: string;
  /** Field is displayed on its page when true. mandatory⇒mask invariant holds. */
  mask: boolean;
  mandatory: boolean;
  tolerance: number | null;
}

interface SectionConfig {
  label: string;
  stage: string;
  fields: FieldConfig[];
}

type WorkflowSettings = Record<string, SectionConfig>;

// ── Shared toggle (matches the Dashboard's blue accent) ───────────────────────

function Toggle({
  on,
  onClick,
  disabled,
  title,
  color = "#1876FF",
}: {
  on: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      aria-pressed={on}
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.18s",
        background: on ? color : "#E2E5EA",
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#ffffff",
          display: "block",
          transform: on ? "translateX(19px)" : "translateX(3px)",
          transition: "transform 0.18s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}

// ── Section component ─────────────────────────────────────────────────────────

interface SectionPanelProps {
  sectionKey: string;
  section: SectionConfig;
  isAdmin: boolean;
  onSave: (key: string, fields: FieldConfig[]) => Promise<void>;
}

const stageLabel: Record<string, string> = {
  extraction: "Extraction",
  vendor_validation: "Vendor Validation",
  metadata_validation: "Metadata Validation",
  line_item_matching: "Line Item Matching",
  bill_posting: "Bill Posting",
};

function SectionPanel({ sectionKey, section, isAdmin, onSave }: SectionPanelProps) {
  const [open, setOpen] = useState(true);
  const [fields, setFields] = useState<FieldConfig[]>(section.fields);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setFields(section.fields);
    setDirty(false);
  }, [section.fields]);

  // Whether a field is *tolerance-capable* is a stable attribute — derived from
  // the ORIGINAL section data, never the live edited value. Otherwise clearing
  // the input (backspace → empty → null) would flip this and unmount the box
  // mid-edit. ERP Fields are always tolerance-capable; other sections only when
  // a field actually ships with a tolerance (no empty "N/A" inputs elsewhere).
  const toleranceCapable = useMemo(() => {
    if (sectionKey === "erp_fields") return null; // null = every field capable
    return new Set(
      section.fields.filter(f => f.tolerance !== null).map(f => f.key),
    );
  }, [sectionKey, section.fields]);

  const isToleranceCapable = (key: string) =>
    toleranceCapable === null || toleranceCapable.has(key);

  const hasTolerance =
    sectionKey === "erp_fields" || (toleranceCapable?.size ?? 0) > 0;

  // Mask drives visibility. Turning Mask OFF also clears Mandatory (a hidden
  // field can't be required) — this is the single source of the invariant.
  const toggleMask = (idx: number) => {
    if (!isAdmin) return;
    setFields(prev => {
      const next = [...prev];
      const masked = !next[idx].mask;
      next[idx] = {
        ...next[idx],
        mask: masked,
        mandatory: masked ? next[idx].mandatory : false,
      };
      return next;
    });
    setDirty(true);
  };

  // Mandatory can only be turned ON when Mask is ON.
  const toggleMandatory = (idx: number) => {
    if (!isAdmin || !fields[idx].mask) return;
    setFields(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], mandatory: !next[idx].mandatory };
      return next;
    });
    setDirty(true);
  };

  const setTolerance = (idx: number, val: string) => {
    if (!isAdmin) return;
    const num = val === "" ? null : parseFloat(val);
    setFields(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], tolerance: Number.isNaN(num as number) ? null : num };
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(sectionKey, fields);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const TH: React.CSSProperties = {
    padding: "10px 20px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "#717680",
    background: "#F5F5F5",
    borderBottom: "1px solid #E0E0E0",
    fontFamily: "Inter, sans-serif",
    whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "12px 20px",
    fontSize: 13,
    color: "#414651",
    fontFamily: "Inter, sans-serif",
  };

  const visibleCount = fields.filter(f => f.mask).length;
  const mandatoryCount = fields.filter(f => f.mandatory).length;

  return (
    <div style={{ border: "1px solid #E6E6E6", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "14px 20px", borderBottom: open ? "1px solid #E6E6E6" : "none" }}
      >
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-3 text-left"
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, minWidth: 0 }}
        >
          <svg
            width="14" height="14" viewBox="0 0 16 16" fill="none"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0, color: "#8D92A6" }}
          >
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#101828", fontFamily: "Inter, sans-serif" }}>
              {section.label}
            </h3>
            <p style={{ color: "#717680", fontSize: 12, margin: "2px 0 0", fontFamily: "Inter, sans-serif" }}>
              Stage: {stageLabel[section.stage] ?? section.stage}
              {" · "}{visibleCount}/{fields.length} shown · {mandatoryCount} mandatory
            </p>
          </div>
        </button>

        {isAdmin && dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              height: 30, padding: "0 14px", fontSize: 13, fontWeight: 500,
              background: "#1876FF", color: "#fff", border: "none", borderRadius: 6,
              cursor: "pointer", flexShrink: 0, fontFamily: "Inter, sans-serif",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {/* Table */}
      {open && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: "46%" }}>Field</th>
              <th style={{ ...TH, textAlign: "center", width: "16%" }}>Mask</th>
              <th style={{ ...TH, textAlign: "center", width: "16%" }}>Mandatory</th>
              {hasTolerance && (
                <th style={{ ...TH, textAlign: "center", width: "22%" }}>Tolerance (%)</th>
              )}
            </tr>
          </thead>
          <tbody>
            {fields.map((field, idx) => {
              const toleranceApplicable = isToleranceCapable(field.key);
              return (
                <tr key={field.key} style={{ borderTop: "1px solid #E6E6E6" }}>
                  <td style={TD}>
                    <span style={{ color: "#414651", fontWeight: 500 }}>{field.label}</span>
                    <span style={{ color: "#8D92A6", fontSize: 11, marginLeft: 8 }}>{field.key}</span>
                  </td>
                  <td style={{ ...TD, textAlign: "center" }}>
                    <Toggle
                      on={field.mask}
                      onClick={() => toggleMask(idx)}
                      disabled={!isAdmin}
                      title={!isAdmin ? "Viewers cannot edit settings" : field.mask ? "Field is shown on its page" : "Field is hidden on its page"}
                    />
                  </td>
                  <td style={{ ...TD, textAlign: "center" }}>
                    <Toggle
                      on={field.mandatory}
                      onClick={() => toggleMandatory(idx)}
                      disabled={!isAdmin || !field.mask}
                      title={
                        !isAdmin
                          ? "Viewers cannot edit settings"
                          : !field.mask
                            ? "Enable Mask first — a hidden field can't be mandatory"
                            : field.mandatory ? "Required on this page" : "Optional on this page"
                      }
                    />
                  </td>
                  {hasTolerance && (
                    <td style={{ ...TD, textAlign: "center" }}>
                      {toleranceApplicable ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={field.tolerance ?? ""}
                          placeholder="N/A"
                          disabled={!isAdmin || !field.mask}
                          onChange={e => setTolerance(idx, e.target.value)}
                          style={{
                            width: 70,
                            padding: "5px 8px",
                            borderRadius: 6,
                            border: "1px solid #D5D5D5",
                            background: !isAdmin || !field.mask ? "#F5F5F5" : "#ffffff",
                            color: !isAdmin || !field.mask ? "#8D92A6" : "#414651",
                            fontSize: 12,
                            textAlign: "center",
                            outline: "none",
                            fontFamily: "Inter, sans-serif",
                            cursor: !isAdmin || !field.mask ? "not-allowed" : "text",
                          }}
                        />
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Footer save bar when dirty */}
      {open && isAdmin && dirty && (
        <div
          className="flex items-center justify-between"
          style={{ padding: "12px 20px", borderTop: "1px solid #E6E6E6", background: "#F8FAFF" }}
        >
          <span style={{ color: "#717680", fontSize: 12, fontFamily: "Inter, sans-serif" }}>Unsaved changes</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setFields(section.fields); setDirty(false); }}
              style={{
                height: 30, padding: "0 14px", fontSize: 13, fontWeight: 500,
                color: "#414651", background: "#ffffff", border: "1px solid #D5D5D5",
                borderRadius: 6, cursor: "pointer", fontFamily: "Inter, sans-serif",
              }}
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                height: 30, padding: "0 16px", fontSize: 13, fontWeight: 500,
                background: "#1876FF", color: "#fff", border: "none", borderRadius: 6,
                cursor: "pointer", fontFamily: "Inter, sans-serif", opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Auto-Process (STP) panel ──────────────────────────────────────────────────

function StpPanel({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsService.getStp()
      .then(d => setEnabled(d.stp_enabled))
      .catch(() => { /* fall back to off */ })
      .finally(() => setLoading(false));
  }, []);

  const toggle = async () => {
    if (!isAdmin || saving) return;
    const next = !enabled;
    setSaving(true);
    setEnabled(next); // optimistic
    try {
      await settingsService.setStp(next);
    } catch (err) {
      setEnabled(!next);
      toast(err instanceof ApiError ? err.message : "Failed to update Auto-Process", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: "1px solid #E6E6E6", borderRadius: 8, background: "#ffffff" }}>
      <div className="flex items-center justify-between" style={{ padding: "16px 20px" }}>
        <div className="flex items-start gap-3 min-w-0">
          <div
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: enabled ? "#ECFDF5" : "#F5F5F5",
              border: `1px solid ${enabled ? "#A7F3D0" : "#E6E6E6"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: enabled ? "#059669" : "#8D92A6", transition: "all 0.2s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 8l-2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#101828", fontFamily: "Inter, sans-serif" }}>
              Auto-Process (STP)
            </h3>
            <p style={{ color: "#717680", fontSize: 12, margin: "2px 0 0", maxWidth: 560, fontFamily: "Inter, sans-serif" }}>
              When enabled, newly uploaded invoices run end-to-end automatically — extraction → vendor
              → metadata → matching → bill posting — and are auto-approved at each stage as long as
              the mandatory fields and tolerances defined below are satisfied.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ width: 36, height: 20, borderRadius: 10, background: "#F0F0F0" }} />
        ) : (
          <Toggle
            on={enabled}
            onClick={toggle}
            disabled={!isAdmin || saving}
            color="#059669"
            title={!isAdmin ? "Viewers cannot edit settings" : enabled ? "Disable Auto-Process" : "Enable Auto-Process"}
          />
        )}
      </div>
    </div>
  );
}

// ── Acknowledge Threshold panel ───────────────────────────────────────────────

function AckThresholdPanel({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [value, setValue] = useState<number>(3);
  const [inputVal, setInputVal] = useState<string>("3");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    settingsService.getAckThreshold()
      .then(d => {
        setValue(d.ack_threshold);
        setInputVal(String(d.ack_threshold));
      })
      .catch(() => { /* fall back to default 3 */ })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) return;
    setInputVal(e.target.value);
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      setDirty(parsed !== value);
    }
  };

  const handleSave = async () => {
    const parsed = parseInt(inputVal, 10);
    if (isNaN(parsed) || parsed < 1) {
      toast("Threshold must be a whole number ≥ 1", "error");
      return;
    }
    setSaving(true);
    try {
      await settingsService.setAckThreshold(parsed);
      setValue(parsed);
      setDirty(false);
      toast("Acknowledge threshold saved", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to update threshold", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setInputVal(String(value));
    setDirty(false);
  };

  const parsedInput = parseInt(inputVal, 10);
  const inputValid = !isNaN(parsedInput) && parsedInput >= 1;

  return (
    <div style={{ border: "1px solid #E6E6E6", borderRadius: 8, background: "#ffffff" }}>
      <div className="flex items-center justify-between" style={{ padding: "16px 20px" }}>
        <div className="flex items-start gap-3 min-w-0">
          <div
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: "#F0F4FF",
              border: "1px solid #C7D7FD",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#3B5BDB",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2a6 6 0 100 12A6 6 0 008 2z" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5.5 8l1.8 1.8L10.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#101828", fontFamily: "Inter, sans-serif" }}>
              Acknowledge Threshold
            </h3>
            <p style={{ color: "#717680", fontSize: 12, margin: "2px 0 0", maxWidth: 560, fontFamily: "Inter, sans-serif" }}>
              Number of times a reviewer must manually acknowledge a mismatch field before the system
              auto-approves it on future invoices with the same value pair (shown as purple
              &ldquo;Auto-approved&rdquo; badge). Default is 3.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3" style={{ flexShrink: 0, marginLeft: 24 }}>
          {loading ? (
            <div style={{ width: 56, height: 32, borderRadius: 6, background: "#F0F0F0" }} />
          ) : (
            <input
              type="number"
              min={1}
              step={1}
              value={inputVal}
              disabled={!isAdmin}
              onChange={handleChange}
              style={{
                width: 56,
                padding: "5px 8px",
                borderRadius: 6,
                border: `1px solid ${dirty && inputValid ? "#1876FF" : "#D5D5D5"}`,
                background: !isAdmin ? "#F5F5F5" : "#ffffff",
                color: !isAdmin ? "#8D92A6" : "#414651",
                fontSize: 14,
                fontWeight: 500,
                textAlign: "center",
                outline: "none",
                fontFamily: "Inter, sans-serif",
                cursor: !isAdmin ? "not-allowed" : "text",
              }}
            />
          )}
          {isAdmin && dirty && (
            <>
              <button
                onClick={handleDiscard}
                style={{
                  height: 30, padding: "0 12px", fontSize: 13, fontWeight: 500,
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
                  height: 30, padding: "0 14px", fontSize: 13, fontWeight: 500,
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
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SECTION_ORDER = [
  "extraction_metadata",
  "extraction_line_items",
  // vendor_validation is hidden — the stage is skipped in the forward pipeline.
  "metadata_validation",
  "line_item_validation",
  "erp_fields",
];

// ── View Management ───────────────────────────────────────────────────────────

const NAV_CONFIG_KEY = 'nav_view_config';

interface NavItemConfig { key: string; label: string; }

const DEFAULT_NAV_ITEMS: NavItemConfig[] = [
  { key: 'dashboard',        label: 'Dashboard'            },
  { key: 'reporting',        label: 'Reporting'            },
  { key: 'arForecast',       label: 'AR Forecast'          },
  { key: 'cashApplication',  label: 'Cash Application'     },
  { key: 'cashAppB2B',       label: 'Cash App B2B'         },
  { key: 'freight',          label: 'Freight Recon'        },
  { key: 'askNeoflo',        label: 'Ask Neo'              },
  { key: 'vendorOnboarding', label: 'Vendor Onboarding'},
  { key: 'driverOnboarding', label: 'Driver Onboarding'   },
  { key: 'financeOS',        label: 'Finance OS'           },
];

const PAGE_DISPLAY: Record<string, string> = {
  dashboard:        'Dashboard',
  reporting:        'Reporting',
  arForecast:       'AR Forecast',
  cashApplication:  'Cash Application',
  cashAppB2B:       'Cash App B2B',
  freight:          'Freight Recon',
  askNeoflo:        'Ask Neo',
  vendorOnboarding: 'Vendor Onboarding',
  driverOnboarding: 'Driver Onboarding',
  financeOS:        'Finance OS',
};

function loadNavConfig(): NavItemConfig[] {
  if (typeof window === 'undefined') return DEFAULT_NAV_ITEMS;
  try {
    const saved = localStorage.getItem(NAV_CONFIG_KEY);
    if (saved) {
      const parsed: NavItemConfig[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Return saved order as-is so View Management matches the sidebar.
        // Append any new DEFAULT_NAV_ITEMS keys that aren't in the saved config.
        const savedKeys = new Set(parsed.map((i: NavItemConfig) => i.key));
        const missing = DEFAULT_NAV_ITEMS.filter(d => !savedKeys.has(d.key));
        if (missing.length > 0) {
          // Insert missing items before financeOS to keep sidebar consistent
          const result = [...parsed];
          const fosIdx = result.findIndex(i => i.key === 'financeOS');
          if (fosIdx > -1) result.splice(fosIdx, 0, ...missing);
          else result.push(...missing);
          return result;
        }
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_NAV_ITEMS;
}

function ViewManagementTab() {
  const { toast } = useToast();
  const FV = "Inter, sans-serif";
  const [items, setItems] = useState<NavItemConfig[]>(() => loadNavConfig());

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setItems(prev => { const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n; });
  };

  const moveDown = (idx: number) => {
    setItems(prev => {
      if (idx === prev.length - 1) return prev;
      const n = [...prev]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n;
    });
  };

  const rename = (idx: number, label: string) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, label } : item));
  };

  const handleSave = () => {
    localStorage.setItem(NAV_CONFIG_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('nav_config_update'));
    toast('View settings saved', 'success');
  };

  const handleReset = () => {
    setItems([...DEFAULT_NAV_ITEMS]);
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#717680', marginBottom: 24, fontFamily: FV, margin: '0 0 24px' }}>
        Reorder and rename the navigation items in the left sidebar. Changes apply to all users.
      </p>

      <div style={{ border: '1px solid #E6E6E6', borderRadius: 8, overflow: 'hidden', background: '#fff', marginBottom: 24 }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '52px 180px 1fr', padding: '10px 20px', background: '#F9FAFB', borderBottom: '1px solid #E6E6E6' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#717680', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FV }}>Order</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#717680', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FV }}>Page</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#717680', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FV }}>Display Name</span>
        </div>

        {items.map((item, idx) => (
          <div
            key={item.key}
            style={{
              display: 'grid', gridTemplateColumns: '52px 180px 1fr',
              padding: '14px 20px', alignItems: 'center',
              borderBottom: idx < items.length - 1 ? '1px solid #F0F0F0' : 'none',
              background: '#ffffff',
            }}
          >
            {/* Up / Down arrows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                title="Move up"
                style={{ background: 'none', border: 'none', padding: 3, cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.25 : 0.7, lineHeight: 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                  <path d="M2 8l4-4 4 4" stroke="#414651" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={() => moveDown(idx)}
                disabled={idx === items.length - 1}
                title="Move down"
                style={{ background: 'none', border: 'none', padding: 3, cursor: idx === items.length - 1 ? 'default' : 'pointer', opacity: idx === items.length - 1 ? 0.25 : 0.7, lineHeight: 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                  <path d="M2 4l4 4 4-4" stroke="#414651" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Fixed page name */}
            <span style={{ fontSize: 13, color: '#414651', fontFamily: FV }}>{PAGE_DISPLAY[item.key] ?? item.key}</span>

            {/* Editable label */}
            <input
              value={item.label}
              onChange={e => rename(idx, e.target.value)}
              style={{
                fontSize: 13, color: '#101828', fontFamily: FV,
                padding: '6px 10px', border: '1px solid #D5D5D5', borderRadius: 6,
                outline: 'none', width: '100%', maxWidth: 260,
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#1876FF')}
              onBlur={e => (e.currentTarget.style.borderColor = '#D5D5D5')}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={handleReset}
          style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 500, color: '#414651', background: '#ffffff', border: '1px solid #D5D5D5', borderRadius: 6, cursor: 'pointer', fontFamily: FV }}
        >
          Reset to default
        </button>
        <button
          onClick={handleSave}
          style={{ height: 34, padding: '0 18px', fontSize: 13, fontWeight: 500, background: '#1876FF', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: FV }}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

// ── Page tabs ─────────────────────────────────────────────────────────────────

const SETTINGS_TABS = [
  { id: 'workflow' as const, label: 'Workflow Settings' },
  { id: 'view'     as const, label: 'View Management'   },
];

function WorkflowSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "tenant_admin" || user?.role === "workspace_admin";
  const [activeTab, setActiveTab] = useState<'workflow' | 'view'>('workflow');

  const [settings, setSettings] = useState<WorkflowSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsService.getWorkflow<WorkflowSettings>()
      .then(d => setSettings(d))
      .catch(() => toast("Failed to load workflow settings", "error"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (sectionKey: string, fields: FieldConfig[]) => {
    try {
      const updated = await settingsService.saveWorkflow<WorkflowSettings>([
        { section: sectionKey, fields },
      ]);
      setSettings(updated);
      toast("Settings saved", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to save settings", "error");
      throw err;
    }
  };

  const orderedSections = SECTION_ORDER.filter(k => settings?.[k]);

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "Inter, sans-serif" }}>

      {/* Sticky header + tab bar */}
      <div className="sticky top-0 z-10" style={{ background: "#ffffff" }}>
        <div style={{ padding: "16px 32px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#101828", letterSpacing: "-0.5px", fontFamily: "Inter, sans-serif" }}>
              Settings
            </h1>
            <p style={{ color: "#717680", fontSize: 14, margin: "4px 0 0", fontFamily: "Inter, sans-serif" }}>
              {activeTab === 'workflow'
                ? <>Configure field visibility, mandatory rules, and match tolerances for each pipeline stage.{!isAdmin && " Contact an admin to modify these settings."}</>
                : "Reorder and rename the left navigation items visible to your users."
              }
            </p>
          </div>
          {!isAdmin && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 9999, fontSize: 12, fontWeight: 500,
                background: "#FFF7E6", color: "#D46B08", border: "1px solid #FFD591", flexShrink: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M6 5v3M6 4v.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              View only
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ padding: "0 32px", display: "flex", borderBottom: "1px solid #E6E6E6" }}>
          {SETTINGS_TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex", alignItems: "center", padding: "9px 16px",
                  fontSize: 14, fontWeight: active ? 600 : 400,
                  color: active ? "#1876FF" : "#717680",
                  background: "transparent", border: "none", cursor: "pointer",
                  borderBottom: active ? "2px solid #1876FF" : "2px solid transparent",
                  marginBottom: -1, fontFamily: "Inter, sans-serif",
                  transition: "color 0.15s", whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Workflow Settings tab */}
      {activeTab === 'workflow' && (
        <div style={{ padding: "24px 32px", maxWidth: 980 }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
              <Spinner size="lg" />
            </div>
          ) : (
            <>
              {/* Info banner */}
              <div
                style={{
                  display: "flex", gap: 12, padding: "12px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13,
                  background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1D4ED8",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8 7v4M8 5.5v.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <span>
                  <strong>Mask</strong> controls whether a field is shown on its page. <strong>Mandatory</strong> (only
                  available when Mask is ON) blocks STP auto-approval until the field is present and matched.
                  {" "}<strong>Tolerance (%)</strong> is the minimum extraction confidence for a field — when a field&apos;s
                  confidence is below it, that row is flagged red on its page. Blank disables the check.
                </span>
              </div>

              {/* Panels */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <StpPanel isAdmin={isAdmin} />
                <AckThresholdPanel isAdmin={isAdmin} />
                {settings && orderedSections.map(key => (
                  <SectionPanel
                    key={key}
                    sectionKey={key}
                    section={settings[key]}
                    isAdmin={isAdmin}
                    onSave={handleSave}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* View Management tab */}
      {activeTab === 'view' && (
        <div style={{ padding: "24px 32px", maxWidth: 720 }}>
          <ViewManagementTab />
        </div>
      )}
    </div>
  );
}

export default withAuthGuard(WorkflowSettingsPage, { allowedRoles: ["tenant_admin", "workspace_admin"] });
