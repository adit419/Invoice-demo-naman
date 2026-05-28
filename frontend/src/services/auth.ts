/**
 * Authentication / session API. Wraps the raw endpoints used by AuthContext
 * and the signup page so token-bearing requests have one home.
 *
 * `User` stays defined in AuthContext (it's the app-wide session model and is
 * imported widely from there); this module only references its type.
 */
import { api } from "./api";
import type { User } from "@/context/AuthContext";

interface AuthSession {
  access_token: string;
  user: User;
}

export const authService = {
  /** Resolve the current session from the stored bearer token. */
  me: () => api.get<User>("/api/v1/auth/me"),

  login: (email: string, password: string) =>
    api.post<AuthSession>(
      "/api/v1/auth/login",
      { email, password },
      { skipAuth: true },
    ),

  logout: () => api.post("/api/v1/auth/logout"),

  switchTenant: (tenantId: string) =>
    api.post<AuthSession>("/api/v1/auth/switch-tenant", {
      tenant_id: tenantId,
    }),

  signup: (fullName: string, email: string, password: string) =>
    api.post(
      "/api/v1/auth/signup",
      { email, password, full_name: fullName },
      { skipAuth: true },
    ),
};
