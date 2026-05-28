import { useCallback, useEffect, useState } from "react";
import { withAuthGuard } from "@/components/AuthGuard";
import { Button, Spinner } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { adminService, ApiError, tenantsService } from "@/services";
import { useToast } from "@/components/ui";
import { formatDate } from "@/utils/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TenantOption {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "editor" | "viewer";
  is_active: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  last_login_at: string | null;
  created_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  admin:  { bg: "rgba(96,165,250,0.12)",  color: "#60a5fa",  border: "rgba(96,165,250,0.25)" },
  editor: { bg: "rgba(251,191,36,0.1)",   color: "#fbbf24",  border: "rgba(251,191,36,0.2)" },
  viewer: { bg: "rgba(255,255,255,0.06)", color: "#94a3b8",  border: "rgba(255,255,255,0.1)" },
};

function userInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

const MODAL_STYLE = {
  background: "#0e1424",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
};

const INPUT_STYLE = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#f1f5f9",
  borderRadius: 8,
  outline: "none",
};

const SELECT_STYLE = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#f1f5f9",
  borderRadius: 8,
  outline: "none",
};

// ── Invite Modal ──────────────────────────────────────────────────────────────

interface InviteModalProps {
  open: boolean;
  tenants: TenantOption[];
  onClose: () => void;
  onInvited: (u: UserRecord) => void;
}

function InviteModal({ open, tenants, onClose, onInvited }: InviteModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({ full_name: "", email: "", role: "viewer", password: "", tenant_id: "" });
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const isAdmin = form.role === "admin";

  const handleSubmit = async () => {
    if (!form.full_name || !form.email || !form.password) {
      toast("All fields are required", "error");
      return;
    }
    if (isAdmin && !form.tenant_id) {
      toast("Tenant is required for admin users", "error");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, string> = {
        full_name: form.full_name,
        email: form.email,
        role: form.role,
        password: form.password,
      };
      if (form.tenant_id) payload.tenant_id = form.tenant_id;
      const result = await adminService.createUser<UserRecord>(payload);
      toast(`${form.full_name} invited successfully`, "success");
      onInvited(result);
      onClose();
      setForm({ full_name: "", email: "", role: "viewer", password: "", tenant_id: "" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Invite failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="rounded-2xl flex flex-col gap-5 p-7" style={{ ...MODAL_STYLE, width: 440 }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: "#f1f5f9" }}>Invite User</h2>
          <button onClick={onClose} style={{ color: "#64748b" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {[
            { label: "Full Name", key: "full_name", type: "text", placeholder: "Jane Smith" },
            { label: "Email", key: "email", type: "email", placeholder: "jane@company.com" },
            { label: "Temporary Password", key: "password", type: "password", placeholder: "Min. 6 characters" },
          ].map(f => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>{f.label}</label>
              <input
                type={f.type}
                placeholder={f.placeholder}
                className="w-full px-3 py-2.5 text-sm"
                style={INPUT_STYLE}
                value={form[f.key as keyof typeof form]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>Role</label>
            <select
              className="w-full px-3 py-2.5 text-sm"
              style={SELECT_STYLE}
              value={form.role}
              onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
            >
              <option value="viewer">Viewer — read-only</option>
              <option value="editor">Editor — process invoices</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>
              Tenant
              {isAdmin
                ? <span className="ml-1" style={{ color: "#f87171" }}>*</span>
                : <span style={{ color: "#64748b", fontWeight: 400 }}> (optional for non-admin)</span>
              }
            </label>
            <select
              className="w-full px-3 py-2.5 text-sm"
              style={{
                ...SELECT_STYLE,
                borderColor: isAdmin && !form.tenant_id ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.1)",
              }}
              value={form.tenant_id}
              onChange={e => setForm(prev => ({ ...prev, tenant_id: e.target.value }))}
            >
              <option value="">— Select a tenant —</option>
              {tenants.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {isAdmin && !form.tenant_id && (
              <p className="text-xs mt-0.5" style={{ color: "#f87171" }}>Admin users must be assigned to a tenant</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Cancel
          </button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={loading}>
            Invite User
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Assign Tenant Modal ───────────────────────────────────────────────────────

interface AssignModalProps {
  user: UserRecord;
  tenants: TenantOption[];
  onClose: () => void;
  onAssigned: (u: UserRecord) => void;
}

function AssignModal({ user: target, tenants, onClose, onAssigned }: AssignModalProps) {
  const { toast } = useToast();
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!tenantId) { toast("Please select a tenant", "error"); return; }
    setLoading(true);
    try {
      const result = await adminService.assignUser<UserRecord>(target.id, tenantId, role);
      toast(`${target.full_name} assigned to tenant as ${role}`, "success");
      onAssigned(result);
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Assignment failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="rounded-2xl flex flex-col gap-5 p-7" style={{ ...MODAL_STYLE, width: 420 }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold" style={{ color: "#f1f5f9" }}>Assign Tenant Access</h2>
            <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>{target.full_name} · {target.email}</p>
          </div>
          <button onClick={onClose} style={{ color: "#64748b" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>
              Tenant <span style={{ color: "#f87171" }}>*</span>
            </label>
            <select className="w-full px-3 py-2.5 text-sm" style={SELECT_STYLE} value={tenantId} onChange={e => setTenantId(e.target.value)}>
              <option value="">— Select a tenant —</option>
              {tenants.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>Role</label>
            <select className="w-full px-3 py-2.5 text-sm" style={SELECT_STYLE} value={role} onChange={e => setRole(e.target.value as "viewer" | "editor")}>
              <option value="viewer">Viewer — read-only</option>
              <option value="editor">Editor — process invoices</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Cancel
          </button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={loading}>
            Grant Access
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userList, setUserList] = useState<UserRecord[]>([]);
  const [tenantList, setTenantList] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<UserRecord | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [usersResult, tenantsResult] = await Promise.all([
        adminService.listUsers<UserRecord>(),
        tenantsService.list<TenantOption>(),
      ]);
      setUserList(usersResult);
      setTenantList(tenantsResult);
    } catch {
      toast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRoleChange = async (u: UserRecord, newRole: string) => {
    setUpdatingId(u.id);
    try {
      const updated = await adminService.updateUser<UserRecord>(u.id, { role: newRole });
      setUserList(prev => prev.map(x => x.id === u.id ? updated : x));
      toast(`${u.full_name}'s role updated to ${newRole}`, "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Update failed", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleTenantChange = async (u: UserRecord, tenantId: string) => {
    setUpdatingId(u.id);
    try {
      const updated = await adminService.updateUser<UserRecord>(u.id, { tenant_id: tenantId });
      setUserList(prev => prev.map(x => x.id === u.id ? updated : x));
      toast(`Tenant updated for ${u.full_name}`, "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Update failed", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleActive = async (u: UserRecord) => {
    if (u.id === user?.id) { toast("Cannot deactivate your own account", "error"); return; }
    setUpdatingId(u.id);
    try {
      const updated = await adminService.updateUser<UserRecord>(u.id, { is_active: !u.is_active });
      setUserList(prev => prev.map(x => x.id === u.id ? updated : x));
      toast(`${u.full_name} ${updated.is_active ? "activated" : "deactivated"}`, "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Update failed", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#080c18" }}><Spinner size="lg" /></div>;
  }

  const pending = userList.filter(u => !u.tenant_id);

  return (
    <div className="min-h-screen" style={{ background: "#080c18" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b px-6 py-4" style={{ background: "#0a0e1a", borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold" style={{ color: "#f1f5f9" }}>User Management</h1>
            <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
              {userList.length} user{userList.length !== 1 ? "s" : ""}
              {pending.length > 0 && (
                <span className="ml-2 font-semibold" style={{ color: "#fbbf24" }}>
                  · {pending.length} pending assignment
                </span>
              )}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
            + Invite User
          </Button>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-5">

        {/* ── Pending users banner ──────────────────────────────────────────── */}
        {pending.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
            <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: "rgba(251,191,36,0.15)" }}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <circle cx="7.5" cy="7.5" r="6" stroke="#fbbf24" strokeWidth="1.3" />
                <path d="M7.5 4.5v4" stroke="#fbbf24" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="7.5" cy="10.5" r="0.7" fill="#fbbf24" />
              </svg>
              <span className="text-xs font-semibold" style={{ color: "#fbbf24" }}>
                {pending.length} user{pending.length !== 1 ? "s" : ""} awaiting tenant assignment
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "rgba(251,191,36,0.1)" }}>
              {pending.map(u => (
                <div key={u.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}
                    >
                      {userInitials(u.full_name)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "#f1f5f9" }}>{u.full_name}</p>
                      <p className="text-xs" style={{ color: "#64748b" }}>{u.email}</p>
                    </div>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => setAssignTarget(u)}>
                    Assign Access
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Users table ───────────────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ background: "#0e1424", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  {["User", "Email", "Tenant", "Role", "Last Login", "Status", "Actions"].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold"
                      style={{ color: "#64748b", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userList.map(u => {
                  const roleStyle = ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer;
                  const isUpdating = updatingId === u.id;
                  const isSelf = u.id === user?.id;
                  const isPending = !u.tenant_id;

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: isPending ? "rgba(251,191,36,0.03)" : "transparent",
                      }}
                    >
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              background: isPending ? "rgba(251,191,36,0.15)" : `${roleStyle.color}20`,
                              color: isPending ? "#fbbf24" : roleStyle.color,
                            }}
                          >
                            {userInitials(u.full_name)}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium" style={{ color: "#f1f5f9" }}>{u.full_name}</span>
                            {isSelf && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>You</span>
                            )}
                            {isPending && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>Pending</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-xs" style={{ color: "#64748b" }}>{u.email}</td>

                      {/* Tenant */}
                      <td className="px-4 py-3">
                        {isPending ? (
                          <button
                            onClick={() => setAssignTarget(u)}
                            className="text-xs font-medium px-2.5 py-1 rounded-lg"
                            style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
                          >
                            Assign tenant →
                          </button>
                        ) : (
                          <select
                            value={u.tenant_id ?? ""}
                            disabled={isUpdating || isSelf}
                            onChange={e => handleTenantChange(u, e.target.value)}
                            className="text-xs px-2 py-1.5"
                            style={{
                              ...SELECT_STYLE,
                              minWidth: 130,
                              fontSize: 12,
                              cursor: isSelf ? "default" : "pointer",
                            }}
                          >
                            <option value="">— None —</option>
                            {tenantList.filter(t => t.is_active).map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={isUpdating || isSelf || isPending}
                          onChange={e => handleRoleChange(u, e.target.value)}
                          className="text-xs px-2.5 py-1 rounded-full font-semibold"
                          style={{
                            background: roleStyle.bg,
                            color: roleStyle.color,
                            border: `1px solid ${roleStyle.border}`,
                            outline: "none",
                            cursor: (isSelf || isPending) ? "default" : "pointer",
                            opacity: isPending ? 0.5 : 1,
                          }}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>

                      {/* Last Login */}
                      <td className="px-4 py-3 text-xs" style={{ color: "#64748b" }}>{formatDate(u.last_login_at, "Never")}</td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={u.is_active
                            ? { background: "rgba(52,211,153,0.12)", color: "#34d399" }
                            : { background: "rgba(255,255,255,0.06)", color: "#64748b" }
                          }
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: u.is_active ? "#34d399" : "#64748b" }} />
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={isUpdating || isSelf}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                          style={{
                            background: u.is_active ? "rgba(239,68,68,0.08)" : "rgba(52,211,153,0.08)",
                            color: u.is_active ? "#f87171" : "#34d399",
                            border: `1px solid ${u.is_active ? "rgba(239,68,68,0.15)" : "rgba(52,211,153,0.15)"}`,
                            opacity: isSelf ? 0.35 : 1,
                            cursor: isSelf ? "default" : "pointer",
                          }}
                        >
                          {isUpdating ? "…" : u.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {userList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "#64748b" }}>
                      No users yet — invite someone to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <InviteModal
        open={inviteOpen}
        tenants={tenantList}
        onClose={() => setInviteOpen(false)}
        onInvited={u => setUserList(prev => [...prev, u])}
      />

      {assignTarget && (
        <AssignModal
          user={assignTarget}
          tenants={tenantList}
          onClose={() => setAssignTarget(null)}
          onAssigned={u => {
            setUserList(prev => prev.map(x => x.id === u.id ? u : x));
            setAssignTarget(null);
          }}
        />
      )}
    </div>
  );
}

export default withAuthGuard(UsersPage, { allowedRoles: ["admin"] });
