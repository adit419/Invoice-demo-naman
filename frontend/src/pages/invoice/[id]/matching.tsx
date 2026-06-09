import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import {
  CalendarOutlined,
  FileTextOutlined,
  TagOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button as AntButton, Modal, Space, Tabs } from "antd";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";

const PdfViewer = dynamic(
  () => import("@/components/PdfViewer").then(m => m.PdfViewer),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-gray-400">Loading…</div> }
);
import { withAuthGuard } from "@/components/AuthGuard";
import { RejectModal } from "@/components/RejectModal";
import { StageTransitionOverlay } from "@/components/StageTransitionOverlay";
import {
  ComponentHeaderAntd,
  MetadataTab,
  LineItemsTab,
} from "@/components/matching";
import type {
  LineItemMatchingData,
  MetadataValidationData,
} from "@/components/matching";
import { useStagesStatus } from "@/hooks/useStagesStatus";
import { Loader } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { usePipelineCompleted } from "@/hooks/usePipelineCompleted";
import { ApiError, invoicesService, settingsService, stagesService } from "@/services";
import { useToast } from "@/components/ui";
import { formatDate } from "@/utils/format";

// ── Page ──────────────────────────────────────────────────────────────────────

function MatchingPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const tabQuery = (router.query.tab as string | undefined) ?? "metadata";
  // Persist the active tab in sessionStorage so a return visit lands on the
  // last-used tab — mirrors invoice-validator-fe (key: `matching-tab-${runId}`).
  const tabStorageKey = id ? `matching-tab-${id}` : null;
  const { user } = useAuth();
  const { toast } = useToast();
  // All authenticated roles can process items per PRD §3.2
  const canEdit = !!user;
  const isCompleted = usePipelineCompleted(id);
  useStagesStatus(id);

  const [activeTab, setActiveTab] = useState<"metadata" | "line_items">(() => {
    // Init priority: explicit URL ?tab= → sessionStorage → "metadata".
    if (typeof window !== "undefined" && tabStorageKey) {
      const saved = window.sessionStorage.getItem(tabStorageKey);
      if (tabQuery === "line_items" || tabQuery === "metadata") return tabQuery;
      if (saved === "line_items" || saved === "metadata") return saved;
    }
    return tabQuery === "line_items" ? "line_items" : "metadata";
  });
  // Mirror tab state into sessionStorage on every change so a return visit
  // (dashboard → matching → back → matching) resumes where the user left off.
  useEffect(() => {
    if (typeof window === "undefined" || !tabStorageKey) return;
    window.sessionStorage.setItem(tabStorageKey, activeTab);
  }, [activeTab, tabStorageKey]);
  useEffect(() => { setPdfToken(localStorage.getItem("access_token")); }, []);
  const [metaData, setMetaData] = useState<MetadataValidationData | null>(null);
  const [liData, setLiData] = useState<LineItemMatchingData | null>(null);
  // Line-items variance gate — set by <LineItemsTab onVarianceChange>. The
  // line_item_matching stage can only be approved when the Invoice↔GRN
  // variance is balanced or within tolerance AND no items are still in
  // "probable" or "no_match" status.
  // Start false so Next stays disabled until LineItemsTab confirms it's OK.
  const [lineOk, setLineOk] = useState(false);
  const [lineStatus, setLineStatus] = useState<string>("balanced");
  const [loading, setLoading] = useState(true);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfPage, setPdfPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [pdfToken, setPdfToken] = useState<string | null>(null);
  const [pdfScale, setPdfScale] = useState(0.8);
  const [pdfRotate, setPdfRotate] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  // Set of field keys configured under `metadata_validation` ∪ `vendor_validation`
  // in workflow settings. The Metadata tab filters its rows by this set so only
  // fields the admin has chosen to show in this stage are rendered.
  const [allowedMetaFields, setAllowedMetaFields] = useState<Set<string> | null>(null);
  // field key → minimum-confidence threshold (workflow-settings Tolerance %,
  // 0–100 → 0–1). When a field's invoice extraction confidence is below it the
  // Metadata row is flagged red.
  const [confThreshold, setConfThreshold] = useState<Record<string, number>>({});
  // `acknowledgedFields` → user clicked Acknowledge on a mismatch; the value is
  // kept as-is but the row is no longer considered a blocker.
  const [acknowledgedFields, setAcknowledgedFields] = useState<Set<string>>(new Set());
  // Pending metadata edits entered inline by the user (field_name → new value).
  const [metaLocalEdits, setMetaLocalEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    settingsService.getWorkflow<Record<string, { fields?: { key: string; mask?: boolean; tolerance?: number | null }[] }>>()
      .then(settings => {
        const meta = settings?.metadata_validation?.fields ?? [];
        const vendor = settings?.vendor_validation?.fields ?? [];
        // Visible = field configured AND its Mask toggle is ON. Mask defaults
        // to true (legacy configs have no `mask` key). If the API returns no
        // config (very early demo seed), fall back to null which renders all.
        const allowed = new Set<string>();
        for (const f of meta) if (f.mask !== false) allowed.add(f.key);
        for (const f of vendor) if (f.mask !== false) allowed.add(f.key);
        setAllowedMetaFields(meta.length + vendor.length > 0 ? allowed : null);
        // Tolerance (%) → confidence threshold (0–1) per configured field.
        const thresh: Record<string, number> = {};
        for (const f of [...meta, ...vendor]) {
          if (f.tolerance != null && f.tolerance > 0) thresh[f.key] = f.tolerance / 100;
        }
        setConfThreshold(thresh);
      })
      .catch(() => { setAllowedMetaFields(null); });
  }, []);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [m, l] = await Promise.all([
        stagesService.get<MetadataValidationData>(id, "metadata_validation").catch(() => null),
        stagesService.get<LineItemMatchingData>(id, "line_item_matching").catch(() => null),
      ]);
      setMetaData(m);
      setLiData(l);
      // Seed local acknowledge set from server-persisted state so badge state
      // survives page reloads. Only seed on initial load (don't clobber in-flight
      // optimistic updates — the effect guard below handles that).
      if (m?.fields) {
        const serverAcked = new Set(
          m.fields
            .filter(f => f.is_acknowledged && f.acknowledged_by !== "system")
            .map(f => f.field_name)
        );
        setAcknowledgedFields(serverAcked);
      }
    } catch {
      toast("Failed to load matching data", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Refresh data when the page is restored from the browser's back-forward cache
  // (bfcache). Without this, the page re-appears with stale pre-approval state:
  // liData.stage_status = "in_review" + lineOk = false → Next button disabled
  // even though both stages were already approved.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) loadData();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [loadData]);

  // Also refresh when Next.js soft-navigates back to this page (router.push).
  useEffect(() => {
    const onRouteChange = () => { if (id) loadData(); };
    router.events.on("routeChangeComplete", onRouteChange);
    return () => router.events.off("routeChangeComplete", onRouteChange);
  }, [router.events, id, loadData]);

  // The "active" stage drives which approve endpoint Next calls.
  const activeStage: "metadata_validation" | "line_item_matching" = (() => {
    if (metaData?.stage_status === "in_review") return "metadata_validation";
    if (liData?.stage_status === "in_review") return "line_item_matching";
    // Both already approved → keep the user on whichever tab they opened.
    return activeTab === "metadata" ? "metadata_validation" : "line_item_matching";
  })();

  /**
   * Cascade Next — single click approves whichever underlying stage(s) are
   * still `in_review` and then moves the user to the next page. Mirrors
   * invoice-validator-fe's "parallel tasks under one stage" pattern.
   */
  const handleApprove = async () => {
    if (!id) return;

    // Gate: block approval while any line item is still probable or no_match.
    const liDataHasUnresolved = (liData?.matching?.per_item_matching ?? []).some(
      (item) => item.match_status === "probable" || item.match_status === "no_match"
    );
    if (liData?.stage_status === "in_review" && liDataHasUnresolved && !lineOk) {
      toast("Confirm all probable and unmatched line items before proceeding.", "error");
      return;
    }

    setConfirming(true);
    try {
      let anyApproved = false;

      // Approve metadata if still in_review — auto-save any inline edits first.
      if (metaData?.stage_status === "in_review") {
        // Only send fields whose value actually changed from the server value.
        const seedMap: Record<string, string> = {};
        for (const f of metaData.fields) seedMap[f.field_name] = String(f.values.invoice?.[0]?.value ?? "");
        const metadata_edits = Object.entries(metaLocalEdits)
          .filter(([k, v]) => v !== seedMap[k])
          .map(([field, value]) => ({ field, value }));
        if (metadata_edits.length > 0) {
          try {
            await stagesService.editExtraction(id, { metadata_edits });
          } catch (saveErr) {
            console.warn("[MatchingPage] auto-save metadata edits before approve failed:", saveErr);
          }
        }
        await stagesService.approve(id, "metadata_validation", {});
        anyApproved = true;
      }

      // Approve line items if still in_review.
      if (liData?.stage_status === "in_review") {
        await stagesService.approve(id, "line_item_matching", {});
        anyApproved = true;
      }

      // Always forward to bill-posting — that's the deterministic next stop
      // from matching. We deliberately ignore the API's `redirect` because
      // when only metadata was in_review it points back to /matching, which
      // is a no-op router.push and leaves the overlay stuck.
      const dest = `/invoice/${id}/bill-posting`;
      if (anyApproved) {
        setTransitioning(true);
        setTimeout(() => router.push(dest), 2000);
      } else {
        router.push(dest);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Approval failed", "error");
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!id) return;
    const slug = activeStage;
    await stagesService.reject(id, slug, reason);
    toast("Invoice rejected", "error");
    setRejectOpen(false);
    router.push("/dashboard");
  };

  // Stable so it doesn't retrigger LineItemsTab's reporting effect each render.
  const handleVarianceChange = useCallback((ok: boolean, status: string) => {
    setLineOk(ok);
    setLineStatus(status);
  }, []);

  // Acknowledge a required mismatch field: optimistic local update first,
  // then persist to the backend so the badge survives a page reload.
  const handleAcknowledge = useCallback(async (fieldName: string) => {
    // Optimistic update — UI responds instantly.
    setAcknowledgedFields((prev) => { const n = new Set(prev); n.add(fieldName); return n; });
    try {
      await stagesService.acknowledgeFields(id, [fieldName]);
    } catch {
      // Roll back optimistic update on failure.
      setAcknowledgedFields((prev) => { const n = new Set(prev); n.delete(fieldName); return n; });
      toast("Could not save acknowledgement", "error");
    }
  }, [id]);

  // Revert an acknowledgement: optimistic local removal, then persist.
  const handleUnacknowledge = useCallback(async (fieldName: string) => {
    setAcknowledgedFields((prev) => { const n = new Set(prev); n.delete(fieldName); return n; });
    try {
      await stagesService.unacknowledgeFields(id, [fieldName]);
    } catch {
      // Roll back.
      setAcknowledgedFields((prev) => { const n = new Set(prev); n.add(fieldName); return n; });
      toast("Could not revert acknowledgement", "error");
    }
  }, [id]);

  // Persist a single metadata field edit immediately when the user presses Enter.
  // Shows a toast on success so the user has clear feedback that the edit was saved.
  const handleSaveMetaField = useCallback(async (fieldName: string, value: string) => {
    if (!id) return;
    try {
      await stagesService.editExtraction(id, { metadata_edits: [{ field: fieldName, value }] });
    } catch {
      // silent — auto-save on Next acts as a safety net
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#ffffff" }}>
        <Loader size="large" />
      </div>
    );
  }

  if (!metaData && !liData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#ffffff" }}>
        <p style={{ color: "#6B7280" }}>Matching data not available.</p>
      </div>
    );
  }

  if (transitioning) {
    return (
      <StageTransitionOverlay
        title="Preparing the bill for ERP posting."
        subtitle="This may take a few minutes. Please keep this page open."
        steps={[
          { label: "Matching metadata against PO", status: "done" },
          { label: "Matching line items 3-way", status: "done" },
          { label: "Preparing bill for ERP", status: "active" },
        ]}
      />
    );
  }

  // hasGrn intentionally not derived here — Matching ▸ Metadata hides GRN.

  // Header meta — pulled from metadata-validation response (it has the freshest)
  const headerNumber = metaData?.invoice_number ?? liData?.invoice_number ?? null;
  const headerVendor = metaData?.vendor_name ?? liData?.vendor_name ?? null;
  const headerDate = metaData?.invoice_date ?? liData?.invoice_date ?? null;

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: "#ffffff", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >

      {/* AntD Tabs don't stretch their tabpane to full height by default. Force
          the cascade so the Line Items panels scroll internally and the
          absolute-positioned variance bar stays pinned to the visible bottom
          (instead of sinking to the bottom of the tall scroll area). */}
      <style>{`
        .matching-tabs { display: flex; flex-direction: column; }
        .matching-tabs > .ant-tabs-content-holder { flex: 1 1 auto; min-height: 0; display: flex; }
        .matching-tabs > .ant-tabs-content-holder > .ant-tabs-content { height: 100%; }
        .matching-tabs .ant-tabs-tabpane { height: 100%; }
      `}</style>

      {/* ── Header (ComponentHeader-style, antd) ───────────────────────────── */}
      <ComponentHeaderAntd
        title="Matching"
        onBack={() => router.push(`/invoice/${id}/review`)}
        metaItems={[
          { icon: <TagOutlined />, text: "Manual Upload" },
          headerNumber ? { icon: <FileTextOutlined />, text: headerNumber, onClick: () => { setPdfPage(1); setPdfOpen(true); } } : null,
          headerVendor ? { icon: <UserOutlined />, text: headerVendor } : null,
          headerDate ? { icon: <CalendarOutlined />, text: formatDate(headerDate) } : null,
        ].filter(Boolean) as { icon: React.ReactNode; text: string }[]}
        right={
          (() => {
            const anyInReview =
              metaData?.stage_status === "in_review" || liData?.stage_status === "in_review";

            // Block Next whenever any line item is still probable or no_match.
            // Use per_item_matching (backend applies confirmed_mappings before serving)
            // so previously-confirmed items already read as "matched".
            // lineOk (from LineItemsTab's onVarianceChange) flips to true once the
            // user confirms all remaining items in the current session.
            const liDataHasUnresolved = (liData?.matching?.per_item_matching ?? []).some(
              (item) => item.match_status === "probable" || item.match_status === "no_match"
            );
            const lineItemsBlocked = liDataHasUnresolved && !lineOk;

            if (!anyInReview) {
              return (
                <AntButton
                  type="primary"
                  disabled={lineItemsBlocked}
                  title={lineItemsBlocked ? "Confirm all probable and unmatched line items before proceeding" : undefined}
                  onClick={() => router.push(`/invoice/${id}/bill-posting`)}
                >
                  Next
                </AntButton>
              );
            }

            const nextTooltip = lineItemsBlocked
              ? lineStatus === "unchecked"
                ? "Select at least one GRN line item to match"
                : "Confirm all probable and unmatched line items before proceeding"
              : undefined;
            return (
              <Space>
                <AntButton danger onClick={() => setRejectOpen(true)} disabled={confirming}>Reject</AntButton>
                <AntButton
                  type="primary"
                  onClick={handleApprove}
                  loading={confirming}
                  disabled={!canEdit || lineItemsBlocked}
                  title={nextTooltip}
                >
                  Next
                </AntButton>
              </Space>
            );
          })()
        }
      />

      {/* ── Tabs + content (antd) ──────────────────────────────────────────── */}
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          const tab = key as "metadata" | "line_items";
          setActiveTab(tab);
          router.replace(`/invoice/${id}/matching?tab=${tab}`, undefined, { shallow: true });
        }}
        className="matching-tabs flex-1 min-h-0"
        tabBarStyle={{ paddingLeft: 24, marginBottom: 0, borderBottom: "1px solid #E6E6E6", background: "#ffffff" }}
        items={[
          {
            key: "metadata",
            label: "Metadata",
            children: (
              <MetadataTab
            data={metaData}
            // GRN column intentionally hidden in Matching ▸ Metadata, mirroring
            // invoice-validator-fe (DOCUMENT_TYPE_LABELS uses match_document only).
            hasGrn={false}
            canEdit={canEdit}
            isCompleted={isCompleted}
            acknowledgedFields={acknowledgedFields}
            onAcknowledge={handleAcknowledge}
            onUnacknowledge={handleUnacknowledge}
            allowedFields={allowedMetaFields}
            confThreshold={confThreshold}
            editMode={canEdit && !isCompleted}
            localEdits={metaLocalEdits}
            setLocalEdits={setMetaLocalEdits}
            onSaveField={canEdit && !isCompleted ? handleSaveMetaField : undefined}
          />
            ),
          },
          {
            key: "line_items",
            label: "Line Items",
            children: (
              <LineItemsTab
                invoiceId={id}
                data={liData}
                // Mirrors invoice-validator-fe: GRN selection stays editable
                // through in_review AND approved — it only locks once the
                // pipeline is completed (the bill has been posted).
                readOnly={!canEdit || isCompleted}
                onVarianceChange={handleVarianceChange}
              />
            ),
          },
        ]}
      />

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        stage={activeStage}
      />

      <Modal
        open={pdfOpen}
        onCancel={() => setPdfOpen(false)}
        title={headerNumber ? `Invoice ${headerNumber}` : "Invoice Preview"}
        width="80vw"
        style={{ top: 24 }}
        styles={{ body: { display: "flex", flexDirection: "column", height: "82vh", padding: 0, overflow: "hidden" } }}
        footer={null}
        destroyOnHidden
      >
        {pdfOpen && id && (
          <>
            <div className="flex-1 overflow-auto py-4 px-5" style={{ background: "#f8fafc" }}>
              <PdfViewer
                pdfUrl={invoicesService.fileUrl(id)}
                authToken={pdfToken}
                page={pdfPage}
                scale={pdfScale}
                rotate={pdfRotate}
                onNumPages={setNumPages}
                activeBbox={null}
              />
            </div>
            <SourceViewerToolbar
              scale={pdfScale}
              onZoomOut={() => setPdfScale(s => Math.max(ZOOM_MIN, parseFloat((s - ZOOM_STEP).toFixed(1))))}
              onZoomIn={() => setPdfScale(s => Math.min(ZOOM_MAX, parseFloat((s + ZOOM_STEP).toFixed(1))))}
              rotate={pdfRotate}
              onRotateLeft={() => setPdfRotate(r => (r - 90 + 360) % 360)}
              onRotateRight={() => setPdfRotate(r => (r + 90) % 360)}
              currentPage={pdfPage}
              totalPages={numPages}
              onPrev={() => setPdfPage(p => Math.max(1, p - 1))}
              onNext={() => setPdfPage(p => Math.min(numPages, p + 1))}
              label={headerNumber ?? "Invoice Preview"}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

export default withAuthGuard(MatchingPage);
