// app/neoflo-workspace/spend-analytics/maverick/[maverickId]/page.tsx
//
// Maverick detail — the B hero for spend-analytics Phase 1. Renders Neo's
// full switching investigation: vendor + total + severity summary, side-by-
// side off-MSA spend vs preferred-vendor MSA, the switching-analysis card
// with reasoning + confidence + sources, the drafted procurement
// notification email, and an action row (notify procurement / accept
// maverick / investigate further).
//
// Per docs/handoff/spend-analytics/03-screen-specs.md § "Surface 3 detail".
"use client"

import * as React from "react"
import { Link } from "next-view-transitions"
import { notFound, useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle,
  Envelope,
  Lightbulb,
} from "@phosphor-icons/react"

import { MaverickSummaryCard } from "@/components/neoflo-os/spend-analytics/maverick-summary-card"
import { SwitchingAnalysisCard } from "@/components/neoflo-os/spend-analytics/switching-analysis-card"
import { Button } from "@/components/neoflo-os/ui/button"
import { Card } from "@/components/neoflo-os/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/neoflo-os/ui/dialog"
import {
  getMaverick,
  getMSA,
  getVendor,
} from "@/lib/neoflo-os/spend-analytics/derive"
import {
  useHydratedSpendAnalyticsStore,
  useSpendAnalyticsStore,
} from "@/lib/neoflo-os/spend-analytics/spend-analytics-store"
import type { SpendCategory } from "@/lib/neoflo-os/spend-analytics/types"

// ════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════

function fmtDollars(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`
}

function fmtTimeOfDay(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

const CATEGORY_LABEL: Record<SpendCategory, string> = {
  "industrial-tools": "Industrial tools",
  "professional-services": "Professional services",
  IT: "IT",
  facilities: "Facilities",
  marketing: "Marketing",
  logistics: "Logistics",
  "office-supplies": "Office supplies",
  travel: "Travel",
  legal: "Legal",
  other: "Other",
}

// ════════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════════

export default function MaverickDetailPage() {
  const params = useParams<{ maverickId: string }>()
  const router = useRouter()

  const maybeMaverick = getMaverick(params!.maverickId)
  if (!maybeMaverick) {
    notFound()
    return null
  }
  const maverick = maybeMaverick

  const vendor = getVendor(maverick.vendorId)
  const preferredVendor = getVendor(maverick.preferredVendorId)
  const preferredMsa = getMSA(maverick.preferredVendorMsaId)

  // Runtime status — once user notifies procurement or accepts the maverick,
  // swap actions for a banner.
  const flagged = useHydratedSpendAnalyticsStore(
    (s) => s.maverickFlagged[maverick.id],
  )
  const isNotified = flagged === "notified"
  const isOverrideAccepted = flagged === "override-accepted"
  const isResolved = isNotified || isOverrideAccepted

  const [confirmation, setConfirmation] = React.useState<string | null>(null)
  const [overrideOpen, setOverrideOpen] = React.useState(false)

  function showToastAndRedirect(message: string, path: string) {
    setConfirmation(message)
    window.setTimeout(() => router.push(path), 600)
  }

  function handleNotify() {
    useSpendAnalyticsStore.getState().notifyProcurementOnMaverick(maverick.id)
    showToastAndRedirect(
      `Procurement notified at ${fmtTimeOfDay()}. Westpoint POs flagged. Will surface in invoice-processing next.`,
      "/neoflo-workspace/spend-analytics",
    )
  }

  function handleConfirmOverride() {
    useSpendAnalyticsStore
      .getState()
      .markMaverickOverrideAccepted(maverick.id)
    setOverrideOpen(false)
    showToastAndRedirect(
      `Maverick accepted at ${fmtTimeOfDay()}. ${vendor?.name ?? "Vendor"} will continue as the active supplier.`,
      "/neoflo-workspace/spend-analytics",
    )
  }

  function handleInvestigate() {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("neo:open-chat", {
        detail: {
          prompt: `What else should I check on the ${vendor?.name ?? "this"} maverick?`,
        },
      }),
    )
  }

  const switching = maverick.switchingAnalysis
  const confidencePct = Math.round(switching.confidence * 100)
  const savingsPct = Math.round(switching.savingsPercent * 100)
  const email = maverick.draftedProcurementEmail

  return (
    <div className="flex-1 overflow-auto px-8 py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link
          href="/neoflo-workspace/spend-analytics/maverick"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft size={14} weight="regular" />
          <span>Back to maverick list</span>
        </Link>

        {/* Summary */}
        <MaverickSummaryCard
          maverick={maverick}
          vendor={vendor}
          categoryLabel={CATEGORY_LABEL[maverick.category]}
        />

        {/* Closed banner (post-action or on reload) — placed above the
            switching analysis so the resolved state reads first. Actions
            are hidden once the maverick is resolved. */}
        {isResolved && !confirmation ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle
              size={20}
              weight="fill"
              className="shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            <span className="font-medium">
              {isNotified
                ? "Procurement notified. POs flagged; switch will surface in invoice-processing."
                : "Maverick accepted. Vendor remains the active supplier; flagged in the audit trail."}
            </span>
          </div>
        ) : null}

        {/* Approve pulse */}
        {confirmation ? (
          <div className="animate-in fade-in slide-in-from-top-2 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 duration-300 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle
              size={20}
              weight="fill"
              className="shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            <span className="font-medium">{confirmation}</span>
          </div>
        ) : null}

        {/* Side-by-side comparison */}
        <SwitchingAnalysisCard
          maverick={maverick}
          preferredVendor={preferredVendor}
          preferredMsa={preferredMsa}
        />

        {/* Neo's switching analysis */}
        <Card className="border-primary/20 bg-primary/[0.03] flex flex-col gap-4 p-6">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} weight="fill" className="text-primary" />
              <h2 className="text-foreground text-sm font-semibold">
                Neo&rsquo;s switching analysis
              </h2>
            </div>
            <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
              {confidencePct}% confident
            </span>
          </header>

          <dl className="grid grid-cols-[12rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Current pace:</dt>
            <dd className="text-foreground tabular-nums">
              {switching.currentPaceUnits.toLocaleString("en-US")} units &times;{" "}
              ${switching.currentPaceCostPerUnit} ={" "}
              {fmtDollars(switching.currentPaceTotal)} / 90 days
            </dd>

            <dt className="text-muted-foreground">Preferred MSA:</dt>
            <dd className="text-foreground tabular-nums">
              {switching.currentPaceUnits.toLocaleString("en-US")} units &times;{" "}
              ${switching.preferredCostPerUnit} ={" "}
              {fmtDollars(switching.preferredPaceTotal)} / 90 days
            </dd>

            <dt className="text-muted-foreground">Annualized savings:</dt>
            <dd className="text-foreground font-semibold tabular-nums">
              {fmtDollars(switching.annualizedSavings)} (~{savingsPct}%
              reduction)
            </dd>

            <dt className="text-muted-foreground">Process control:</dt>
            <dd className="text-foreground/85">
              Brings spend back into the managed channel for{" "}
              {CATEGORY_LABEL[maverick.category].toLowerCase()}.
            </dd>
          </dl>

          <blockquote className="text-foreground/85 border-primary/30 border-l-2 pl-4 text-sm italic leading-relaxed">
            {switching.reasoning}
          </blockquote>

          <div className="text-muted-foreground border-border/60 border-t pt-3 text-xs">
            Sources: {switching.sources.join(" · ")}
          </div>
        </Card>

        {/* Drafted procurement notification email */}
        <Card className="bg-card flex flex-col gap-4 p-6">
          <header className="flex items-center gap-2">
            <Envelope size={16} weight="fill" className="text-primary" />
            <h2 className="text-foreground text-sm font-semibold">
              Drafted procurement notification
            </h2>
          </header>

          <dl className="border-border/60 grid grid-cols-[5rem_1fr] gap-y-1 border-b pb-3 text-sm">
            <dt className="text-muted-foreground">To:</dt>
            <dd className="text-foreground font-mono text-xs">{email.to}</dd>
            {email.cc ? (
              <>
                <dt className="text-muted-foreground">Cc:</dt>
                <dd className="text-foreground font-mono text-xs">
                  {email.cc}
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Subject:</dt>
            <dd className="text-foreground">{email.subject}</dd>
          </dl>

          <div className="text-foreground/90 whitespace-pre-wrap text-sm leading-relaxed">
            {email.bodyMarkdown}
          </div>
        </Card>

        {/* Action row — hidden once the maverick is resolved. */}
        {!isResolved && !confirmation ? (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleInvestigate}>
              Investigate further
            </Button>
            <Button variant="outline" onClick={() => setOverrideOpen(true)}>
              Override (accept maverick)
            </Button>
            <Button onClick={handleNotify}>
              <CheckCircle size={14} weight="bold" />
              Notify procurement
            </Button>
          </div>
        ) : null}

        {/* Override confirmation dialog */}
        <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Accept the maverick spend?</DialogTitle>
              <DialogDescription>
                {vendor?.name ?? "Vendor"} will continue as the active
                supplier. The acceptance is logged in the audit trail.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted/50 border-border/60 rounded-md border p-4 text-sm">
              <div className="text-foreground font-semibold">
                {vendor?.name ?? maverick.vendorId}
              </div>
              <div className="text-foreground tabular-nums">
                {fmtDollars(maverick.totalSpend)} &middot;{" "}
                {maverick.timePeriod} &middot; {maverick.pos.length} POs
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button variant="outline" onClick={handleConfirmOverride}>
                Accept maverick
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
