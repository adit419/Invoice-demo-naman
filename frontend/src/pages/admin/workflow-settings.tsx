import { useEffect, useMemo, useState } from "react";
import { withAuthGuard } from "@/components/AuthGuard";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, settingsService } from "@/services";
import { api } from "@/services/api";
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

// ── User Management ───────────────────────────────────────────────────────────

type PageKey = 'dashboard' | 'reporting' | 'arForecast' | 'workflowSettings';
type ARSubKey = 'arDashboard' | 'collectionsWorkbench' | 'customerInsights' | 'arForecastTab';

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  pageAccess: PageKey[];
  arSubAccess: ARSubKey[];
}

const PAGE_OPTIONS: { key: PageKey; label: string }[] = [
  { key: 'dashboard',        label: 'Dashboard' },
  { key: 'reporting',        label: 'Reporting' },
  { key: 'arForecast',       label: 'AR Forecast' },
  { key: 'workflowSettings', label: 'Workflow Settings' },
];

const AR_SUB_OPTIONS: { key: ARSubKey; label: string }[] = [
  { key: 'arDashboard',          label: 'AR Dashboard' },
  { key: 'collectionsWorkbench', label: 'Collections Workbench' },
  { key: 'customerInsights',     label: 'Customer Insights' },
  { key: 'arForecastTab',        label: 'AR Forecast' },
];

const BLANK_FORM: {
  name: string; email: string; password: string; role: 'admin' | 'user';
  pageAccess: PageKey[]; arSubAccess: ARSubKey[];
} = { name: '', email: '', password: '', role: 'user', pageAccess: [], arSubAccess: [] };

interface BackendUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  page_access: string[];
  ar_sub_access: string[];
}

function mapBackendUser(b: BackendUser): ManagedUser {
  return {
    id: b.id,
    name: b.full_name,
    email: b.email,
    role: b.role === 'admin' ? 'admin' : 'user',
    pageAccess: (b.page_access ?? []) as PageKey[],
    arSubAccess: (b.ar_sub_access ?? []) as ARSubKey[],
  };
}

function UserManagementTab({ isAdmin }: { isAdmin: boolean }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    api.get<BackendUser[]>('/api/v1/admin/users')
      .then(data => setUsers(data.map(mapBackendUser)))
      .catch(err => toast(err instanceof ApiError ? err.message : 'Failed to load users', 'error'))
      .finally(() => setLoadingUsers(false));
  }, []);

  const openAdd = () => {
    setForm({ ...BLANK_FORM, pageAccess: [], arSubAccess: [] });
    setEditingId(null);
    setShowPassword(false);
    setShowForm(true);
  };

  const openEdit = (u: ManagedUser) => {
    setForm({ name: u.name, email: u.email, password: '', role: u.role, pageAccess: [...u.pageAccess], arSubAccess: [...u.arSubAccess] });
    setEditingId(u.id);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...BLANK_FORM, pageAccess: [], arSubAccess: [] });
  };

  const togglePage = (key: PageKey) => {
    setForm(f => {
      const has = f.pageAccess.includes(key);
      const nextPages = has ? f.pageAccess.filter(k => k !== key) : [...f.pageAccess, key];
      const nextARSub = key === 'arForecast' && has ? [] : f.arSubAccess;
      return { ...f, pageAccess: nextPages, arSubAccess: nextARSub };
    });
  };

  const toggleARSub = (key: ARSubKey) => {
    setForm(f => {
      const has = f.arSubAccess.includes(key);
      return { ...f, arSubAccess: has ? f.arSubAccess.filter(k => k !== key) : [...f.arSubAccess, key] };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    if (!editingId && form.password.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }
    setSaving(true);
    try {
      const backendRole = form.role === 'admin' ? 'admin' : 'editor';
      if (editingId) {
        const updated = await api.patch<BackendUser>(`/api/v1/admin/users/${editingId}`, {
          role: backendRole,
          page_access: form.pageAccess,
          ar_sub_access: form.arSubAccess,
        });
        setUsers(prev => prev.map(u => u.id === editingId ? mapBackendUser(updated) : u));
        toast('User updated', 'success');
      } else {
        const created = await api.post<BackendUser>('/api/v1/admin/users', {
          email: form.email,
          full_name: form.name,
          role: backendRole,
          password: form.password,
          tenant_id: currentUser?.tenant_id ?? null,
          page_access: form.pageAccess,
          ar_sub_access: form.arSubAccess,
        });
        setUsers(prev => [...prev, mapBackendUser(created)]);
        toast('User created successfully', 'success');
      }
      cancelForm();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      await api.delete(`/api/v1/admin/users/${id}`);
      setUsers(prev => prev.filter(u => u.id !== id));
      toast('User removed', 'success');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to remove user';
      if (err instanceof ApiError && (err.status === 401 || err.message.toLowerCase().includes('not found or inactive'))) {
        toast('Session expired — please log out and log back in', 'error');
      } else {
        toast(msg, 'error');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const pageLabel = (key: PageKey)  => PAGE_OPTIONS.find(p => p.key === key)?.label ?? key;
  const arLabel   = (key: ARSubKey) => AR_SUB_OPTIONS.find(p => p.key === key)?.label ?? key;
  const formValid = form.name.trim().length > 0 && form.email.trim().length > 0 &&
    (!!editingId || form.password.length >= 6);

  const F = "Inter, sans-serif";

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid #D5D5D5',
    borderRadius: 6, fontSize: 13, color: '#101828', outline: 'none',
    boxSizing: 'border-box', fontFamily: F, background: '#ffffff',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Role definitions */}
      <div style={{ border: '1px solid #E6E6E6', borderRadius: 8, background: '#ffffff', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E6E6E6' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#101828', fontFamily: F }}>Role Definitions</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#717680', fontFamily: F }}>What each role can access in the application</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {[
            {
              role: 'Admin',
              badge: { bg: '#EFF6FF', color: '#1876FF', border: '#BFDBFE' },
              desc: 'Full access to all pages and features. Can manage users, configure workflow settings, and access all AR functionality.',
              items: ['Dashboard', 'Reporting', 'AR Forecast — all tabs', 'Workflow Settings', 'User Management'],
            },
            {
              role: 'User',
              badge: { bg: '#F0FDF4', color: '#059669', border: '#A7F3D0' },
              desc: 'Custom access configured per user. Can only see the pages and AR Forecast tabs explicitly granted by an admin.',
              items: ['Configurable: Dashboard', 'Configurable: Reporting', 'Configurable: AR Forecast (select tabs)', 'Configurable: Workflow Settings'],
            },
          ].map((r, i) => (
            <div key={r.role} style={{ padding: '16px 20px', borderRight: i === 0 ? '1px solid #E6E6E6' : 'none' }}>
              <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: r.badge.bg, color: r.badge.color, border: `1px solid ${r.badge.border}`, fontFamily: F }}>
                {r.role}
              </span>
              <p style={{ margin: '10px 0', fontSize: 13, color: '#414651', fontFamily: F }}>{r.desc}</p>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#717680', lineHeight: 1.9, fontFamily: F }}>
                {r.items.map(p => <li key={p}>{p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Users header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#101828', fontFamily: F }}>Users</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#717680', fontFamily: F }}>
            {users.length} user{users.length !== 1 ? 's' : ''} in this workspace
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 36, background: '#1876FF', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: F }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Add User
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div style={{ border: '1px solid #BFDBFE', borderRadius: 8, background: '#F8FBFF', padding: 20 }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#101828', fontFamily: F }}>
            {editingId ? 'Edit User' : 'Add New User'}
          </h4>

          {/* Name + Email */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#414651', marginBottom: 4, fontFamily: F }}>Full name</label>
              <input type="text" placeholder="e.g. Jane Smith" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#414651', marginBottom: 4, fontFamily: F }}>Email address</label>
              <input type="email" placeholder="e.g. jane@company.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          {/* Password (new users only) */}
          {!editingId && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#414651', marginBottom: 4, fontFamily: F }}>
                Password
                <span style={{ fontWeight: 400, color: '#717680', marginLeft: 6 }}>min. 6 characters</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ ...inputStyle, paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#717680', padding: 0, display: 'flex', alignItems: 'center' }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {form.password.length > 0 && form.password.length < 6 && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#DC2626', fontFamily: F }}>Password must be at least 6 characters</p>
              )}
            </div>
          )}

          {/* Role */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#414651', marginBottom: 4, fontFamily: F }}>Role</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as 'admin' | 'user' }))}
              style={{ padding: '7px 10px', border: '1px solid #D5D5D5', borderRadius: 6, fontSize: 13, color: '#101828', outline: 'none', fontFamily: F, background: '#ffffff', cursor: 'pointer', minWidth: 160 }}
            >
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </div>

          {/* Page access */}
          <div style={{ marginBottom: form.pageAccess.includes('arForecast') ? 12 : 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#414651', marginBottom: 8, fontFamily: F }}>Page access</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PAGE_OPTIONS.map(p => {
                const checked = form.pageAccess.includes(p.key);
                return (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', border: `1px solid ${checked ? '#1876FF' : '#D5D5D5'}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, color: checked ? '#1876FF' : '#414651', background: checked ? '#EFF6FF' : '#ffffff', fontWeight: checked ? 500 : 400, userSelect: 'none', transition: 'all 0.12s', fontFamily: F }}>
                    <input type="checkbox" checked={checked} onChange={() => togglePage(p.key)} style={{ width: 14, height: 14, accentColor: '#1876FF', cursor: 'pointer' }} />
                    {p.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* AR Forecast sub-access (conditional) */}
          {form.pageAccess.includes('arForecast') && (
            <div style={{ marginBottom: 16, padding: '12px 14px', border: '1px solid #BFDBFE', borderRadius: 6, background: '#EFF6FF' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1D4ED8', marginBottom: 8, fontFamily: F }}>
                AR Forecast — visible tabs
                <span style={{ fontWeight: 400, color: '#3B82F6', marginLeft: 8 }}>Select which tabs this user can see</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {AR_SUB_OPTIONS.map(p => {
                  const checked = form.arSubAccess.includes(p.key);
                  return (
                    <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', border: `1px solid ${checked ? '#1876FF' : '#93C5FD'}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, color: checked ? '#1876FF' : '#414651', background: checked ? '#DBEAFE' : '#ffffff', fontWeight: checked ? 500 : 400, userSelect: 'none', transition: 'all 0.12s', fontFamily: F }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleARSub(p.key)} style={{ width: 14, height: 14, accentColor: '#1876FF', cursor: 'pointer' }} />
                      {p.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Form actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={cancelForm} disabled={saving} style={{ height: 32, padding: '0 16px', fontSize: 13, fontWeight: 500, color: '#414651', background: '#ffffff', border: '1px solid #D5D5D5', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: F, opacity: saving ? 0.6 : 1 }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!formValid || saving}
              style={{ height: 32, padding: '0 18px', fontSize: 13, fontWeight: 500, background: '#1876FF', color: '#fff', border: 'none', borderRadius: 6, cursor: formValid && !saving ? 'pointer' : 'not-allowed', opacity: formValid && !saving ? 1 : 0.5, fontFamily: F }}
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add user'}
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div style={{ border: '1px solid #E6E6E6', borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
        {loadingUsers ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <Spinner size="md" />
          </div>
        ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F5F5F5' }}>
              {(['User', 'Role', 'Page Access', 'AR Forecast Tabs'] as const).map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#717680', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap', fontFamily: F }}>{h}</th>
              ))}
              {isAdmin && <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#717680', borderBottom: '1px solid #E0E0E0', fontFamily: F }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={isAdmin ? 5 : 4} style={{ padding: 28, textAlign: 'center', color: '#717680', fontSize: 13, fontFamily: F }}>No users found.</td></tr>
            ) : users.map((u, i) => (
              <tr key={u.id} style={{ borderTop: i > 0 ? '1px solid #F0F0F0' : 'none' }}>
                {/* User */}
                <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.role === 'admin' ? '#EFF6FF' : '#F0FDF4', color: u.role === 'admin' ? '#1876FF' : '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: `1px solid ${u.role === 'admin' ? '#BFDBFE' : '#A7F3D0'}`, flexShrink: 0 }}>
                      {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 500, color: '#101828', fontFamily: F }}>{u.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#717680', fontFamily: F }}>{u.email}</p>
                    </div>
                  </div>
                </td>
                {/* Role badge */}
                <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                  <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: u.role === 'admin' ? '#EFF6FF' : '#F0FDF4', color: u.role === 'admin' ? '#1876FF' : '#059669', border: `1px solid ${u.role === 'admin' ? '#BFDBFE' : '#A7F3D0'}`, fontFamily: F }}>
                    {u.role === 'admin' ? 'Admin' : 'User'}
                  </span>
                </td>
                {/* Page access */}
                <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                  {u.role === 'admin' ? (
                    <span style={{ fontSize: 12, color: '#717680', fontStyle: 'italic', fontFamily: F }}>All pages</span>
                  ) : u.pageAccess.length === 0 ? (
                    <span style={{ fontSize: 12, color: '#8D92A6', fontFamily: F }}>None</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {u.pageAccess.map(key => (
                        <span key={key} style={{ padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: '#F0F0F0', color: '#414651', fontFamily: F }}>
                          {pageLabel(key)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                {/* AR sub-tabs */}
                <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                  {u.role === 'admin' ? (
                    <span style={{ fontSize: 12, color: '#717680', fontStyle: 'italic', fontFamily: F }}>All tabs</span>
                  ) : !u.pageAccess.includes('arForecast') ? (
                    <span style={{ fontSize: 12, color: '#8D92A6', fontFamily: F }}>—</span>
                  ) : u.arSubAccess.length === 0 ? (
                    <span style={{ fontSize: 12, color: '#8D92A6', fontFamily: F }}>None selected</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {u.arSubAccess.map(key => (
                        <span key={key} style={{ padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: '#EFF6FF', color: '#1876FF', border: '1px solid #BFDBFE', fontFamily: F }}>
                          {arLabel(key)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                {/* Actions */}
                {isAdmin && (
                  <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => openEdit(u)}
                        disabled={!!deletingId}
                        style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #D5D5D5', background: '#ffffff', color: '#414651', cursor: deletingId ? 'not-allowed' : 'pointer', fontFamily: F, opacity: deletingId ? 0.5 : 1 }}
                      >
                        Edit
                      </button>
                      {u.id !== currentUser?.id && (
                        confirmDeleteId === u.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: '#DC2626', fontFamily: F, whiteSpace: 'nowrap' }}>Sure?</span>
                            <button
                              onClick={() => deleteUser(u.id)}
                              disabled={deletingId === u.id}
                              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', background: '#DC2626', color: '#fff', cursor: deletingId === u.id ? 'not-allowed' : 'pointer', fontFamily: F, opacity: deletingId === u.id ? 0.6 : 1 }}
                            >
                              {deletingId === u.id ? '…' : 'Yes'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #D5D5D5', background: '#ffffff', color: '#414651', cursor: 'pointer', fontFamily: F }}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(u.id)}
                            disabled={!!deletingId}
                            style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: deletingId ? 'not-allowed' : 'pointer', fontFamily: F, opacity: deletingId ? 0.5 : 1 }}
                          >
                            Remove
                          </button>
                        )
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        )}
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
  { key: 'dashboard',       label: 'Dashboard'        },
  { key: 'reporting',       label: 'Reporting'        },
  { key: 'arForecast',      label: 'AR Forecast'      },
  { key: 'cashApplication', label: 'Cash Application' },
];

const PAGE_DISPLAY: Record<string, string> = {
  dashboard:       'Dashboard',
  reporting:       'Reporting',
  arForecast:      'AR Forecast',
  cashApplication: 'Cash Application',
};

function loadNavConfig(): NavItemConfig[] {
  if (typeof window === 'undefined') return DEFAULT_NAV_ITEMS;
  try {
    const saved = localStorage.getItem(NAV_CONFIG_KEY);
    if (saved) {
      const parsed: NavItemConfig[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const savedKeys = new Set(parsed.map((i: NavItemConfig) => i.key));
        const missing = DEFAULT_NAV_ITEMS.filter(d => !savedKeys.has(d.key));
        return missing.length > 0 ? [...parsed, ...missing] : parsed;
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
  { id: 'users'    as const, label: 'User Management'   },
  { id: 'view'     as const, label: 'View Management'   },
];

function WorkflowSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<'workflow' | 'users' | 'view'>('workflow');

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
                : activeTab === 'users'
                ? "Manage users and control which pages and features each person can access."
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

      {/* User Management tab */}
      {activeTab === 'users' && (
        <div style={{ padding: "24px 32px", maxWidth: 980 }}>
          <UserManagementTab isAdmin={isAdmin} />
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

export default withAuthGuard(WorkflowSettingsPage, { allowedRoles: ["admin"] });
