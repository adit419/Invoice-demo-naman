import { useCallback, useEffect, useState } from "react";
import { withAuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { settingsService, ApiError } from "@/services";
import { useToast } from "@/components/ui";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_PAGES = [
  { key: "dashboard",        label: "Dashboard",             description: "Main invoice dashboard and overview" },
  { key: "reporting",        label: "Reporting",             description: "AR insights and analytics" },
  { key: "arForecast",       label: "AR Forecast",           description: "Accounts receivable forecasting" },
  { key: "cashApplication",  label: "Cash Application",      description: "Cash application module" },
  { key: "cashAppB2B",       label: "Cash App B2B",          description: "B2B cash application module" },
  { key: "financeOS",        label: "Finance OS",            description: "Neoflo Finance OS workspace demo" },
  { key: "askNeoflo",        label: "Ask Neo",               description: "AI-powered invoice knowledge graph chat" },
  { key: "vendorOnboarding", label: "Vendor Onboarding", description: "Vendor onboarding portal" },
  { key: "driverOnboarding", label: "Driver Onboarding",     description: "Driver onboarding portal" },
];

const ROLES = [
  {
    key:         "tenant_admin" as const,
    label:       "Tenant Admin",
    description: "Full access to all features, settings, and user management across the tenant.",
    color:       "#2563EB",
    bg:          "#EFF6FF",
    border:      "#BFDBFE",
    fixed:       true,
    fixedNote:   "Always has full access — cannot be restricted.",
  },
  {
    key:         "workspace_admin" as const,
    label:       "Workspace Admin",
    description: "Can configure workflows, manage team members, and view all invoice stages.",
    color:       "#059669",
    bg:          "#ECFDF5",
    border:      "#A7F3D0",
    fixed:       true,
    fixedNote:   "Always has full access to pages — cannot be restricted.",
  },
  {
    key:         "reviewer" as const,
    label:       "Reviewer",
    description: "Can process invoices through all pipeline stages. Page access is configurable.",
    color:       "#D97706",
    bg:          "#FFFBEB",
    border:      "#FDE68A",
    fixed:       false,
    fixedNote:   null,
  },
  {
    key:         "member" as const,
    label:       "Member",
    description: "Standard user who processes invoices. Page access is configurable.",
    color:       "#6B7280",
    bg:          "#F3F4F6",
    border:      "#E5E7EB",
    fixed:       false,
    fixedNote:   null,
  },
];

// ── Feature capability rows (read-only reference matrix) ─────────────────────

const CAPABILITIES = [
  { label: "Upload & process invoices",         admin: true, wsAdmin: true, reviewer: true, member: true },
  { label: "Approve / reject pipeline stages",  admin: true, wsAdmin: true, reviewer: true, member: true },
  { label: "View workflow settings",            admin: true, wsAdmin: true, reviewer: false, member: false },
  { label: "Edit workflow settings",            admin: true, wsAdmin: true, reviewer: false, member: false },
  { label: "View People settings",              admin: true, wsAdmin: true, reviewer: false, member: false },
  { label: "Invite new team members",           admin: true, wsAdmin: false, reviewer: false, member: false },
  { label: "Change user roles",                 admin: true, wsAdmin: true, reviewer: false, member: false },
  { label: "Remove users",                      admin: true, wsAdmin: false, reviewer: false, member: false },
  { label: "Configure role permissions",        admin: true, wsAdmin: false, reviewer: false, member: false },
  { label: "Switch tenant context",             admin: true, wsAdmin: false, reviewer: false, member: false },
];

// ── Toggle ─────────────────────────────────────────────────────────────────────

function Toggle({ on, onClick, disabled }: { on: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
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
        background: on ? "#2563EB" : "#E2E5EA",
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      <span style={{
        width: 14, height: 14, borderRadius: "50%", background: "#fff",
        display: "block",
        transform: on ? "translateX(19px)" : "translateX(3px)",
        transition: "transform 0.18s",
        boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}

// ── Check / X icon ────────────────────────────────────────────────────────────

function Check({ on, color }: { on: boolean; color?: string }) {
  if (on) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, borderRadius: 10,
        background: color ? `${color}18` : "#DCFCE7",
      }}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M2 5.5l2.5 2.5L9 3" stroke={color ?? "#16A34A"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 20, height: 20, borderRadius: 10, background: "#F3F4F6",
    }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 2l6 6M8 2L2 8" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ConfigurableRole = "reviewer" | "member";

function RolesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isTenantAdmin = user?.role === "tenant_admin";

  // Page access config per role
  const [perms, setPerms] = useState<Record<ConfigurableRole, string[]>>({
    reviewer: ALL_PAGES.map(p => p.key),
    member:   ALL_PAGES.map(p => p.key),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<"permissions" | "matrix">("permissions");

  const load = useCallback(async () => {
    try {
      const res = await settingsService.getRolePermissions();
      const loaded = {
        reviewer: res.reviewer ?? ALL_PAGES.map(p => p.key),
        member:   res.member   ?? ALL_PAGES.map(p => p.key),
      };
      setPerms(loaded);
      // Cache for the nav-sidebar "preview as role" feature
      if (typeof window !== "undefined") {
        localStorage.setItem("role_permissions_cache", JSON.stringify(loaded));
      }
    } catch {
      // fallback to all pages
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePage = (role: ConfigurableRole, pageKey: string) => {
    if (!isTenantAdmin) return;
    setPerms(prev => {
      const current = prev[role];
      const next = current.includes(pageKey)
        ? current.filter(k => k !== pageKey)
        : [...current, pageKey];
      return { ...prev, [role]: next };
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsService.setRolePermissions(perms);
      setDirty(false);
      // Update the local cache so the nav-sidebar preview mode sees the new values immediately
      if (typeof window !== "undefined") {
        localStorage.setItem("role_permissions_cache", JSON.stringify(perms));
      }
      toast("Role permissions saved", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    load();
    setDirty(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F6F9" }}>
        <div className="w-8 h-8 rounded-full border-2 border-blue-200" style={{ borderTopColor: "#2563EB", animation: "spin 0.7s linear infinite" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#F4F6F9" }}>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB" }}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold" style={{ color: "#101828" }}>Roles & Permissions</h1>
              <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                Configure what each role can access. Fixed roles cannot be modified.
              </p>
            </div>
            {isTenantAdmin && dirty && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscard}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB" }}
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: "#2563EB", color: "#fff", border: "none", opacity: saving ? 0.7 : 1, cursor: saving ? "default" : "pointer" }}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0 mt-4" style={{ borderBottom: "2px solid #E5E7EB" }}>
            {([
              ["permissions", "Page Access"],
              ["matrix",      "Capability Matrix"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  color: activeTab === key ? "#2563EB" : "#6B7280",
                  background: "none", border: "none", cursor: "pointer",
                  borderBottom: activeTab === key ? "2px solid #2563EB" : "2px solid transparent",
                  marginBottom: -2,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">

        {/* ── Page Access tab ───────────────────────────────────────────────── */}
        {activeTab === "permissions" && (
          <div className="flex flex-col gap-5">

            {/* Role cards */}
            <div className="grid grid-cols-2 gap-4" style={{ maxWidth: 880 }}>
              {ROLES.map(role => (
                <div
                  key={role.key}
                  className="rounded-xl p-4"
                  style={{ background: "#fff", border: `1px solid ${role.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                >
                  {/* Role header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: role.bg, color: role.color, border: `1px solid ${role.border}` }}
                    >
                      {role.label.split(" ").map(w => w[0]).join("")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold" style={{ color: "#101828" }}>{role.label}</p>
                        {role.fixed && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: role.bg, color: role.color, border: `1px solid ${role.border}` }}>
                            Fixed
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{role.description}</p>
                    </div>
                  </div>

                  {/* Page access rows */}
                  <div className="flex flex-col gap-1 mt-3">
                    <p className="text-xs font-semibold mb-1" style={{ color: "#9CA3AF", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      Page Access
                    </p>
                    {ALL_PAGES.map(page => {
                      const hasAccess = role.fixed
                        ? true
                        : (perms[role.key as ConfigurableRole] ?? []).includes(page.key);

                      return (
                        <div
                          key={page.key}
                          className="flex items-center justify-between px-3 py-2 rounded-lg"
                          style={{ background: "#F9FAFB", border: "1px solid #F3F4F6" }}
                        >
                          <div>
                            <p className="text-xs font-medium" style={{ color: "#374151" }}>{page.label}</p>
                            <p className="text-xs" style={{ color: "#9CA3AF" }}>{page.description}</p>
                          </div>
                          {role.fixed ? (
                            <Check on={true} color={role.color} />
                          ) : (
                            <Toggle
                              on={hasAccess}
                              disabled={!isTenantAdmin}
                              onClick={() => togglePage(role.key as ConfigurableRole, page.key)}
                            />
                          )}
                        </div>
                      );
                    })}

                    {role.fixed && (
                      <p className="text-xs mt-1" style={{ color: "#9CA3AF", fontStyle: "italic" }}>
                        {role.fixedNote}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!isTenantAdmin && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", maxWidth: 880 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" /><path d="M7 6v3M7 4.5v.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                Only Tenant Admins can modify role permissions.
              </div>
            )}
          </div>
        )}

        {/* ── Capability Matrix tab ─────────────────────────────────────────── */}
        {activeTab === "matrix" && (
          <div style={{ maxWidth: 820 }}>
            <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E5E7EB" }}>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: "#6B7280", borderBottom: "1px solid #E5E7EB", width: "40%" }}>
                      Capability
                    </th>
                    {ROLES.map(role => (
                      <th key={role.key} className="text-center px-3 py-3 text-xs font-semibold" style={{ color: role.color, borderBottom: "1px solid #E5E7EB" }}>
                        {role.label.split(" ").join("\n")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CAPABILITIES.map((cap, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td className="px-4 py-2.5 text-xs font-medium" style={{ color: "#374151" }}>
                        {cap.label}
                      </td>
                      <td className="px-3 py-2.5 text-center"><Check on={cap.admin}    color="#2563EB" /></td>
                      <td className="px-3 py-2.5 text-center"><Check on={cap.wsAdmin}  color="#059669" /></td>
                      <td className="px-3 py-2.5 text-center"><Check on={cap.reviewer} color="#D97706" /></td>
                      <td className="px-3 py-2.5 text-center"><Check on={cap.member}   color="#6B7280" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs mt-3" style={{ color: "#9CA3AF" }}>
              This matrix reflects built-in capabilities. Page access for Reviewer and Member can be configured in the Page Access tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default withAuthGuard(RolesPage, { allowedRoles: ["tenant_admin", "workspace_admin"] });
