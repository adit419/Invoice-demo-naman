/**
 * Tenant API. Callers (admin/tenants, admin/users, NavSidebar) each model the
 * tenant row slightly differently, so the response shape stays generic.
 */
import { api } from "./api";

export interface TenantPatch {
  name?: string;
  is_active?: boolean;
}

export const tenantsService = {
  list: <T>() => api.get<T[]>("/api/v1/tenants"),

  create: <T>(name: string) =>
    api.post<T>("/api/v1/tenants", { name }),

  update: <T>(tenantId: string, patch: TenantPatch) =>
    api.patch<T>(`/api/v1/tenants/${tenantId}`, patch),
};
