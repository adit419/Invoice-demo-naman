import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/hooks/useAuth";
import { tenantsService } from "@/services";

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 16c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M14 7a2.5 2.5 0 0 1 0 5M17 16c0-2.5-1.5-4.5-3-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconTenants() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="8" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="6.5" y="4" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="6" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconInsights() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <polyline points="2,14 6,9 10,12 16,5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="2" cy="14" r="1.2" fill="currentColor" />
      <circle cx="6" cy="9" r="1.2" fill="currentColor" />
      <circle cx="10" cy="12" r="1.2" fill="currentColor" />
      <circle cx="16" cy="5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M7 16H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 13l4-4-4-4M16 9H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconForecast() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <polyline points="2,13 6,8 10,10 16,4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 4h3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="2" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconWorkflow() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="6.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4.5h2.5a1.5 1.5 0 0 1 1.5 1.5v2M7 13.5h2.5a1.5 1.5 0 0 0 1.5-1.5V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconCash() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="4" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 9h.5M13.5 9h.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconSwitch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 4h10M9 2l3 2-3 2M12 10H2M5 8l-3 2 3 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}




// ── TenantSwitcher ────────────────────────────────────────────────────────────

interface TenantOption {
  id: string;
  name: string;
  is_active: boolean;
}

interface TenantSwitcherProps {
  collapsed: boolean;
}

function TenantSwitcher({ collapsed }: TenantSwitcherProps) {
  const { user, switchTenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeName = user?.active_tenant_name ?? user?.tenant_name ?? "My Tenant";
  const activeId = user?.active_tenant_id ?? user?.tenant_id;

  useEffect(() => {
    if (open && tenants.length === 0) {
      tenantsService.list<TenantOption>().then(setTenants).catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSwitch = useCallback(async (id: string) => {
    if (id === activeId || switching) return;
    setSwitching(true);
    try {
      await switchTenant(id);
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }, [activeId, switching, switchTenant]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title={collapsed ? `Viewing: ${activeName}` : undefined}
        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors text-left"
        style={{ color: "rgba(255,255,255,0.45)", background: open ? "rgba(255,255,255,0.06)" : "transparent" }}
      >
        <span className="shrink-0" style={{ color: "#60a5fa" }}><IconSwitch /></span>
        {!collapsed && (
          <span className="text-xs font-medium truncate flex-1" style={{ color: "#e2e8f0" }}>
            {activeName}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 rounded-xl py-1 shadow-xl overflow-hidden"
          style={{
            background: "#131a2e",
            border: "1px solid rgba(255,255,255,0.1)",
            bottom: "100%",
            left: collapsed ? "calc(100% + 8px)" : 0,
            right: collapsed ? "auto" : 0,
            minWidth: 180,
            marginBottom: 4,
          }}
        >
          <p className="px-3 py-1.5 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>Switch tenant</p>
          {tenants.filter(t => t.is_active).map(t => (
            <button
              key={t.id}
              onClick={() => handleSwitch(t.id)}
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors"
              style={{
                color: t.id === activeId ? "#60a5fa" : "#94a3b8",
                background: t.id === activeId ? "rgba(59,130,246,0.12)" : "transparent",
                fontWeight: t.id === activeId ? 600 : 400,
              }}
            >
              {t.id === activeId && <span>✓</span>}
              {t.name}
            </button>
          ))}
          {tenants.length === 0 && (
            <p className="px-3 py-2 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface NavSidebarProps {
  collapsed: boolean;
  onCollapse: (val: boolean) => void;
}

const NAV_CONFIG_KEY = 'nav_view_config';

interface NavItemConfig { key: string; label: string; }

const DEFAULT_NAV_CONFIG: NavItemConfig[] = [
  { key: 'dashboard',        label: 'Dashboard'         },
  { key: 'reporting',        label: 'Reporting'         },
  { key: 'arForecast',       label: 'AR Forecast'       },
  { key: 'cashApplication',  label: 'Cash Application'  },
];

const NAV_HREF: Record<string, string> = {
  dashboard:       '/dashboard',
  reporting:       '/insights',
  arForecast:      '/forecasting',
  cashApplication: '/cash-application',
};

const NAV_ICON: Record<string, React.ReactNode> = {
  dashboard:       <IconDashboard />,
  reporting:       <IconInsights />,
  arForecast:      <IconForecast />,
  cashApplication: <IconCash />,
};

function readNavConfig(): NavItemConfig[] {
  if (typeof window === 'undefined') return DEFAULT_NAV_CONFIG;
  try {
    const saved = localStorage.getItem(NAV_CONFIG_KEY);
    if (saved) {
      const parsed: NavItemConfig[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Append any new default keys that aren't in the saved config
        const savedKeys = new Set(parsed.map(i => i.key));
        const missing = DEFAULT_NAV_CONFIG.filter(d => !savedKeys.has(d.key));
        return missing.length > 0 ? [...parsed, ...missing] : parsed;
      }
    }
  } catch {}
  return DEFAULT_NAV_CONFIG;
}

export function NavSidebar({ collapsed, onCollapse }: NavSidebarProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  // Always start with DEFAULT so SSR and first client render match, then
  // apply localStorage value after hydration to avoid hydration mismatch.
  const [navConfig, setNavConfig] = useState<NavItemConfig[]>(DEFAULT_NAV_CONFIG);

  useEffect(() => {
    setNavConfig(readNavConfig());
    const sync = () => setNavConfig(readNavConfig());
    window.addEventListener('nav_config_update', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('nav_config_update', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isActive = (path: string) => router.pathname === path || router.pathname.startsWith(path + "/");

  const SIDEBAR_W = collapsed ? 64 : 240;
  const SIDEBAR_BG = "#041C4C";
  const ACTIVE_BG = "#274B95";
  const SEP = "rgba(255,255,255,0.08)";

  const navItems = useMemo(() => {
    // Build base items from saved config (custom labels + order)
    const base = navConfig.map(cfg => ({
      href:    NAV_HREF[cfg.key] ?? '/',
      label:   cfg.label,
      icon:    NAV_ICON[cfg.key] ?? <IconDashboard />,
      pageKey: cfg.key,
    }));

    let visible = base;

    // Non-admins: filter by page_access if explicitly configured
    if (user && user.role !== "admin") {
      const allowed = user.page_access ?? [];
      if (allowed.length > 0) {
        visible = base.filter(item => allowed.includes(item.pageKey));
      }
    }

    // Admins always see Settings (Workflow Settings page)
    if (user?.role === "admin") {
      return [...visible, { href: "/admin/workflow-settings", label: "Settings", icon: <IconWorkflow />, pageKey: "workflowSettings" }];
    }

    return visible;
  }, [user, navConfig]);

  return (
    <div
      className="fixed left-0 top-0 bottom-0 z-30 flex flex-col"
      style={{
        width: SIDEBAR_W,
        background: SIDEBAR_BG,
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}
    >
      {/* Logo / Brand */}
      <div
        className="flex items-center shrink-0"
        style={{
          height: 56,
          padding: collapsed ? 0 : "0 12px 0 16px",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 8,
          borderBottom: `1px solid ${SEP}`,
        }}
      >
        {collapsed ? (
          <button
            onClick={() => onCollapse(false)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#fff", fontSize: 18, padding: 6, display: "flex", alignItems: "center", borderRadius: 4 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <>
            <img src="/neoflo-logo.svg" alt="Neoflo" style={{ height: 26, width: "auto", flexShrink: 0 }} />
            <span style={{ flex: 1 }} />
            <button
              onClick={() => onCollapse(true)}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#fff", fontSize: 15, padding: 4, display: "flex", alignItems: "center", borderRadius: 4, flexShrink: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L6 8l4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 overflow-hidden" style={{ padding: "8px 0" }}>
        {navItems.map(item => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: collapsed ? 40 : "calc(100% - 16px)",
                height: collapsed ? 40 : "auto",
                margin: collapsed ? "2px auto" : "2px 8px",
                padding: collapsed ? 0 : "10px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: active ? ACTIVE_BG : "transparent",
                borderRadius: 8,
                color: "#fff",
                fontSize: 14,
                fontWeight: 400,
                textDecoration: "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
            >
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
            </Link>
          );
        })}
        {/* {user?.role === "admin" && (
          <TenantSwitcher collapsed={collapsed} />
        )} */}
      </nav>

      {/* Bottom: user profile */}
      <div style={{ borderTop: `1px solid ${SEP}` }}>
        {/* User profile — click to open logout dropdown */}
        {user && (
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen(o => !o)}
              title={collapsed ? (user.full_name || user.email) : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: collapsed ? "12px 0" : "12px 16px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: profileOpen ? "rgba(255,255,255,0.08)" : "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { if (!profileOpen) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={e => { if (!profileOpen) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {collapsed ? (
                <div style={{ width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FEF0D0", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 600, fontSize: 13 }}>
                    {(user.full_name || user.email).split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FEF0D0", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                    {(user.full_name || user.email).split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{user.full_name || user.email}</p>
                    <p style={{ color: "#7A8FA6", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                      {user.active_tenant_name ? `Viewing: ${user.active_tenant_name}` : (user.tenant_name ?? user.role)}
                    </p>
                  </div>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M2 4l3 3 3-3" stroke="#7A8FA6" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>

            {profileOpen && (
              <div
                className="absolute z-50 rounded-xl py-1 shadow-xl"
                style={{
                  background: "#0e1a35",
                  border: "1px solid rgba(255,255,255,0.1)",
                  bottom: "calc(100% + 4px)",
                  left: collapsed ? "calc(100% + 8px)" : 0,
                  right: collapsed ? "auto" : 0,
                  minWidth: 160,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
                }}
              >
                <button
                  onClick={() => { setProfileOpen(false); logout().then(() => router.push("/auth/login")); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors rounded-lg"
                  style={{ color: "#f87171" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(248,113,113,0.08)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <IconLogout />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
