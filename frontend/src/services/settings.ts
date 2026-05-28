/**
 * Workflow / STP settings API. The workflow document is consumed with
 * different projections by several pages (admin/workflow-settings, review,
 * matching), so its shape stays generic per caller.
 */
import { api } from "./api";

export const settingsService = {
  /** Straight-through-processing toggle state. */
  getStp: () => api.get<{ stp_enabled: boolean }>("/api/v1/settings/stp"),

  setStp: (enabled: boolean) =>
    api.patch("/api/v1/settings/stp", { enabled }),

  /** Acknowledge threshold — number of manual acks before system auto-approves. */
  getAckThreshold: () =>
    api.get<{ ack_threshold: number }>("/api/v1/settings/ack-threshold"),

  setAckThreshold: (value: number) =>
    api.patch("/api/v1/settings/ack-threshold", { value }),

  /** Full workflow-settings document. Caller supplies its projection. */
  getWorkflow: <T>() => api.get<T>("/api/v1/settings/workflow"),

  /** Persist one or more workflow sections. */
  saveWorkflow: <T>(
    sections: Array<{ section: string; fields: unknown[] }>,
  ) => api.put<T>("/api/v1/settings/workflow", { sections }),
};
