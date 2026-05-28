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

export type Role = "admin" | "editor" | "viewer";

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

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

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
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // ignore — clear client side regardless
    }
    localStorage.removeItem("access_token");
    setUser(null);
    router.push("/auth/login");
  }, [router]);

  const switchTenant = useCallback(async (tenantId: string) => {
    const data = await authService.switchTenant(tenantId);
    localStorage.setItem("access_token", data.access_token);
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, switchTenant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be inside AuthProvider");
  return ctx;
}
