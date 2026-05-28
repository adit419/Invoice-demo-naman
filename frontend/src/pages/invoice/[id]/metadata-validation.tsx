// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED — the standalone metadata-validation page has been merged into
// the unified Matching page (`/invoice/{id}/matching?tab=metadata`).
//
// This file now does a single client-side redirect so any pre-existing links
// (dashboard rows, bookmarks, stage-nav strip, etc.) still resolve to the
// right place. Nothing else here — the actual table lives in matching.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";
import { Loader } from "@/components/ui";

function MetadataValidationRedirect() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  useEffect(() => {
    if (!router.isReady || !id) return;
    router.replace(`/invoice/${id}/matching?tab=metadata`);
  }, [router.isReady, id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#ffffff" }}>
      <Loader size="large" />
    </div>
  );
}

export default withAuthGuard(MetadataValidationRedirect);
