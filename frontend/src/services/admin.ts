/**
 * Admin user-management API (admin/users page). Response shape is generic so
 * the page keeps owning its `UserRecord` model.
 */
import { api } from "./api";

export interface UserPatch {
  role?: string;
  tenant_id?: string;
  is_active?: boolean;
}

export const adminService = {
  listUsers: <T>() => api.get<T[]>("/api/v1/admin/users"),

  createUser: <T>(payload: Record<string, string>) =>
    api.post<T>("/api/v1/admin/users", payload),

  updateUser: <T>(userId: string, patch: UserPatch) =>
    api.patch<T>(`/api/v1/admin/users/${userId}`, patch),

  assignUser: <T>(userId: string, tenantId: string, role: string) =>
    api.post<T>(`/api/v1/admin/users/${userId}/assign`, {
      tenant_id: tenantId,
      role,
    }),
};
