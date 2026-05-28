/**
 * Barrel for the API layer.
 *
 *   import { invoicesService, stagesService, ApiError } from "@/services";
 *
 * `api` (the low-level transport) is still exported for the rare call that
 * doesn't fit a domain service, but prefer the domain services.
 */
export { api, ApiError } from "./api";

export { invoicesService } from "./invoices";
export { stagesService } from "./stages";
export type {
  StageStatus,
  MetadataEdit,
  LineItemEdit,
  ExtractionEditPayload,
  BillPostingEditPayload,
} from "./stages";
export { authService } from "./auth";
export { adminService } from "./admin";
export type { UserPatch } from "./admin";
export { tenantsService } from "./tenants";
export type { TenantPatch } from "./tenants";
export { settingsService } from "./settings";
export { ingestionService } from "./ingestion";
