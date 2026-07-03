import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/router";
import { authService } from "@/services/auth";

export type Role = "tenant_admin" | "workspace_admin" | "reviewer" | "member";

export const isManager = (role?: Role | null): boolean =>
  role === "tenant_admin" || role === "workspace_admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  active_tenant_id: string | null;
  active_tenant_name: string | null;
  created_at: string;
  last_login_at: string | null;
  page_access: string[];
  ar_sub_access: string[];
}

const PREVIEW_ROLE_KEY = "preview_role";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  /** The role being previewed (null = real role). tenant_admin only. */
  previewRole: Role | null;
  /** Switch the preview role. Pass null to exit preview mode. */
  setPreviewRole: (role: Role | null) => void;
  /** Effective role = previewRole if set, otherwise user.role */
  effectiveRole: Role | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [previewRole, setPreviewRoleState] = useState<Role | null>(null);
  const router = useRouter();

  // Restore preview role from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(PREVIEW_ROLE_KEY) as Role | null;
      if (stored) setPreviewRoleState(stored);
    }
  }, []);

  const setPreviewRole = useCallback((role: Role | null) => {
    setPreviewRoleState(role);
    if (typeof window !== "undefined") {
      if (role) {
        localStorage.setItem(PREVIEW_ROLE_KEY, role);
      } else {
        localStorage.removeItem(PREVIEW_ROLE_KEY);
      }
    }
  }, []);

  const fetchUser = useCallback(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    authService.me().then(setUser).catch(() => {});
  }, []);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    authService
      .me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("access_token");
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Re-fetch permissions on every page navigation and on tab focus
  useEffect(() => {
    router.events.on("routeChangeComplete", fetchUser);
    window.addEventListener("focus", fetchUser);
    return () => {
      router.events.off("routeChangeComplete", fetchUser);
      window.removeEventListener("focus", fetchUser);
    };
  }, [router.events, fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authService.login(email, password);
    localStorage.setItem("access_token", data.access_token);
    setUser(data.user);
    // Clear any stale preview on fresh login
    setPreviewRole(null);
    // Default nav: show all modules except Freight and Driver Onboarding
    const DEFAULT_NAV_FILTER = [
      "dashboard", "reporting", "arForecast", "cashApplication",
      "claimEngine", "askNeoflo", "vendorOnboarding", "financeOS",
    ];
    localStorage.setItem("nav_module_filter", JSON.stringify(DEFAULT_NAV_FILTER));
  }, [setPreviewRole]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // ignore — clear client side regardless
    }
    localStorage.removeItem("access_token");
    setPreviewRole(null);
    setUser(null);
    router.push("/auth/login");
  }, [router, setPreviewRole]);

  const switchTenant = useCallback(async (tenantId: string) => {
    const data = await authService.switchTenant(tenantId);
    localStorage.setItem("access_token", data.access_token);
    setUser(data.user);
  }, []);

  // Only allow preview if the real role is tenant_admin
  const effectivePreviewRole = user?.role === "tenant_admin" ? previewRole : null;
  const effectiveRole: Role | null = effectivePreviewRole ?? user?.role ?? null;

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      previewRole: effectivePreviewRole,
      setPreviewRole,
      effectiveRole,
      login,
      logout,
      switchTenant,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be inside AuthProvider");
  return ctx;
}
