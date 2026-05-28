/**
 * Invoice-level (non-stage) API: the dashboard list, the rejected-view
 * payload, and the source-PDF URL helper.
 */
import { api } from "./api";
import { envConfig } from "@/config/envConfig";
import type { InvoiceListResponse } from "@/types/invoice";

export const invoicesService = {
  /** Dashboard list + KPI counts. */
  list: () => api.get<InvoiceListResponse>("/api/v1/invoices"),

  /** Rejected-invoice detail (reason + timeline). Caller supplies the shape. */
  rejected: <T>(invoiceId: string) =>
    api.get<T>(`/api/v1/invoices/${invoiceId}/rejected`),

  /**
   * Absolute URL of the original uploaded PDF. Not an XHR — it's fed straight
   * to the PDF viewer, which attaches the bearer token itself.
   */
  fileUrl: (invoiceId: string) =>
    `${envConfig.BE_BASE_URL}/api/v1/invoices/${invoiceId}/file`,
};
