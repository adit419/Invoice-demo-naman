/**
 * Hook + helpers for navigating between approved/incomplete stages.
 *
 * The backend `/api/v1/invoices/{id}/stages-status` endpoint returns each
 * visible stage with its current status. The "next forward" stage is the first
 * one in the visible sequence whose status is *not* `approved` / `completed`
 * (excluding the current page's slug so we never just bounce in place).
 *
 * Stage slug → FE route mapping mirrors `StageNavStrip.SLUG_TO_ROUTE`.
 */
import { useCallback, useEffect, useState } from "react";
import { stagesService } from "@/services";
import type { StageStatus } from "@/services";

// Re-exported so existing `import { StageStatus } from "@/hooks/useStagesStatus"`
// callers keep working; the canonical definition lives in services/stages.
export type { StageStatus };

const SLUG_TO_ROUTE: Record<string, string> = {
  extraction: "review",
  // vendor_validation was folded into the Matching page (metadata tab)
  vendor_validation: "matching?tab=metadata",
  metadata_validation: "matching?tab=metadata",
  line_item_matching: "matching?tab=line_items",
  bill_posting: "bill-posting",
  // Completed/posted invoices stay on the bill-posting page — the read-only
  // "Bill Posted" view with source-file + Zoho bill-link attachments is the
  // terminal screen for the happy path.
  posted: "bill-posting",
  rejected: "rejected",
  erp_post: "bill-posting",
};

export interface UseStagesStatusReturn {
  stages: StageStatus[];
  loading: boolean;
  /**
   * Resolve the next forward stage that is *not* approved/completed. If every
   * stage past `currentSlug` is approved, returns the last one. Returns null
   * only when the run has no visible stages or the API errored.
   */
  resolveForwardRoute: (currentSlug: string) => string | null;
  refetch: () => Promise<void>;
}

export function useStagesStatus(invoiceId: string | undefined): UseStagesStatusReturn {
  const [stages, setStages] = useState<StageStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const res = await stagesService.status(invoiceId);
      setStages(res.stages ?? []);
    } catch {
      setStages([]);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { fetch(); }, [fetch]);

  const resolveForwardRoute = useCallback(
    (currentSlug: string): string | null => {
      if (!invoiceId || stages.length === 0) return null;
      const currentIdx = stages.findIndex(s => s.slug === currentSlug);
      // Search slugs after the current one.
      const tail = currentIdx >= 0 ? stages.slice(currentIdx + 1) : stages;
      const next =
        tail.find(s => s.status !== "approved" && s.status !== "completed" && s.status !== "rejected")
        ?? tail[tail.length - 1]
        ?? null;
      if (!next) return null;
      const route = SLUG_TO_ROUTE[next.slug];
      if (!route) return null;
      return `/invoice/${invoiceId}/${route}`;
    },
    [invoiceId, stages],
  );

  return { stages, loading, resolveForwardRoute, refetch: fetch };
}
