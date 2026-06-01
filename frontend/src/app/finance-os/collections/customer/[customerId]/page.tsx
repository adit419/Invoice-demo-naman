// app/neoflo-workspace/collections/customer/[customerId]/page.tsx
//
// Collections customer-detail surface — the puzzle view per customer.
// Selects a render variant from the primary case's `caseFlags`:
//   - quietlyOverdue        → Variant A (Westpoint Mfg)
//   - promiseBroken         → Variant B (Atlantic Logistics) — tier-2 tone-shift
//   - accountHoldCandidate  → Variant C (Pacific Distribution) — hold + Sales notify
//   - default               → simple summary + case list
//
// Per docs/handoff/collections/03-screen-specs.md § "Surface 3 Variants A/B/C".
// Chrome (WorkspaceHeader, CollectionsTabs, ChatThread) lives in the
// collections layout — this page renders only the body.
"use client"

import * as React from "react"
import { Link } from "next-view-transitions"
import { notFound, useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle,
  Lightbulb,
  Shield,
} from "@phosphor-icons/react"

import { AccountHoldCard } from "@/components/neoflo-os/collections/account-hold-card"
import { CaseList } from "@/components/neoflo-os/collections/case-list"
import { CustomerSummaryCard } from "@/components/neoflo-os/collections/customer-summary-card"
import { DraftedEmailCard } from "@/components/neoflo-os/collections/drafted-email-card"
import { PaymentHistoryMiniChart } from "@/components/neoflo-os/collections/payment-history-mini-chart"
import { Button } from "@/components/neoflo-os/ui/button"
import { Card } from "@/components/neoflo-os/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/neoflo-os/ui/dialog"
import { Textarea } from "@/components/neoflo-os/ui/textarea"
import {
  useCollectionsStore,
  useHydratedCollectionsStore,
} from "@/lib/neoflo-os/collections/collections-store"
import { getCustomer } from "@/lib/neoflo-os/collections/seed-customers"
import { getCasesByCustomer } from "@/lib/neoflo-os/collections/seed-cases"
import type { CollectionsCase, Customer, DunningEmail } from "@/lib/neoflo-os/collections/types"

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

function fmtTimeOfDay(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

function tierLabel(tier: CollectionsCase["recommendedTier"]): string {
  if (tier === "hold") return "account hold"
  if (tier === "investigate") return "investigate dispute"
  return `${tier} (${tier === 1 ? "checking in" : tier === 2 ? "firmer reminder" : tier === 3 ? "escalation" : "final notice"})`
}

// Confidence is implied by ranking.compositePriority — render it as a % so
// the analysis card matches the spec's "Confidence: 92%" line.
function inferConfidence(c: CollectionsCase): number {
  const score = c.ranking.compositePriority
  // Map composite 0–100 to a confidence band 60–95 so the highest-priority
  // cases land near the spec's 92% example without ever showing 100%.
  const min = 60
  const max = 95
  return Math.round(min + (score / 100) * (max - min))
}

// Parse the seed `reasoning` string into bullet points where appropriate.
// The seed uses "Ranked … because: a, b, c." — we split on commas, trim,
// and capitalize. If the source doesn't fit the pattern we return one
// bullet with the whole sentence.
function reasoningBullets(reasoning: string): string[] {
  const cleaned = reasoning.trim().replace(/\.+$/, "")
  const colon = cleaned.indexOf(":")
  const body = colon >= 0 ? cleaned.slice(colon + 1) : cleaned
  return body
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// ════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════

export default function CollectionsCustomerDetailPage() {
  const params = useParams<{ customerId: string }>()
  const customerId = params!.customerId

  const customer = getCustomer(customerId)
  if (!customer) {
    notFound()
    return null
  }

  const cases = getCasesByCustomer(customerId)

  // Pick the primary case — lowest ranking.rank (1 is top).
  const primaryCase = React.useMemo(() => {
    if (cases.length === 0) return undefined
    return cases
      .slice()
      .sort((a, b) => a.ranking.rank - b.ranking.rank)[0]
  }, [cases])

  const totalOverdue = cases.reduce((sum, c) => sum + c.totalOverdue, 0)
  const lastContactAt = customer.crm?.lastConversationAt

  return (
    <div className="flex-1 overflow-auto px-8 py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link
          href="/neoflo-workspace/collections/worklist"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft size={14} weight="regular" />
          <span>Back to Worklist</span>
        </Link>

        <CustomerSummaryCard
          customer={customer}
          totalOverdue={totalOverdue}
          caseCount={cases.length}
          lastContactAt={lastContactAt}
        />

        {/* Variant dispatch */}
        {primaryCase ? (
          primaryCase.caseFlags.quietlyOverdue ? (
            <VariantA
              customer={customer}
              cases={cases}
              primaryCase={primaryCase}
            />
          ) : primaryCase.caseFlags.promiseBroken ? (
            <VariantB
              customer={customer}
              cases={cases}
              primaryCase={primaryCase}
            />
          ) : primaryCase.caseFlags.accountHoldCandidate ? (
            <VariantC
              customer={customer}
              cases={cases}
              primaryCase={primaryCase}
            />
          ) : (
            <DefaultVariant cases={cases} />
          )
        ) : (
          <Card className="bg-card text-muted-foreground p-6 text-sm">
            No open cases for this customer.
          </Card>
        )}

        {/* Audit footer (shared across all variants) */}
        <div className="text-muted-foreground border-border/60 flex items-center gap-2 border-t pt-4 text-xs">
          <Shield size={14} weight="regular" className="text-primary" />
          <span>Audit trail will record: drafted &rarr; reviewed &rarr; sent.</span>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Variant A — Westpoint Mfg (quietly-overdue, tier-1 friendly)
// ════════════════════════════════════════════════════════════════════

function VariantA({
  customer,
  cases,
  primaryCase,
}: {
  customer: Customer
  cases: CollectionsCase[]
  primaryCase: CollectionsCase
}) {
  const router = useRouter()
  const runtime = useHydratedCollectionsStore(
    (s) => s.caseActions[primaryCase.id],
  )

  const [confirmation, setConfirmation] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [draftBody, setDraftBody] = React.useState<string>(
    primaryCase.draftedEmail?.bodyMarkdown ?? "",
  )
  const [showRejectDialog, setShowRejectDialog] = React.useState(false)

  const draftedEmail = primaryCase.draftedEmail
  const status = runtime?.status
  const isClosed =
    status === "approved-and-sent" ||
    status === "edited-and-sent" ||
    status === "rejected"

  const bullets = reasoningBullets(primaryCase.ranking.reasoning)
  const confidence = inferConfidence(primaryCase)

  function handleApprove() {
    useCollectionsStore.getState().approveDunningEmail(primaryCase.id)
    setConfirmation(`Sent at ${fmtTimeOfDay()}. Audit log #abc12 generated.`)
    window.setTimeout(() => {
      router.push("/neoflo-workspace/collections")
    }, 600)
  }

  function handleStartEdit() {
    setEditing(true)
    setDraftBody(
      runtime?.editedEmailBody ?? draftedEmail?.bodyMarkdown ?? "",
    )
  }

  function handleSaveEdit() {
    useCollectionsStore.getState().editDunningEmail(primaryCase.id, draftBody)
    setEditing(false)
    setConfirmation(`Sent with edits at ${fmtTimeOfDay()}.`)
    window.setTimeout(() => {
      router.push("/neoflo-workspace/collections")
    }, 600)
  }

  function handleConfirmReject() {
    useCollectionsStore.getState().rejectCase(primaryCase.id)
    setShowRejectDialog(false)
    router.push("/neoflo-workspace/collections/worklist")
  }

  const sources = buildSourcesLine(customer)

  return (
    <>
      {/* Already-closed banner (e.g., on refresh) */}
      {isClosed && !confirmation ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle
            size={20}
            weight="fill"
            className="shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <span className="font-medium">
            Email {status === "rejected" ? "rejected" : "sent"} —{" "}
            {customer.name} case closed.
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
          <span className="font-medium">
            {confirmation} {customer.name} case closed.
          </span>
        </div>
      ) : null}

      {/* Two-column area */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Left column — open invoices + payment history */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Open invoices
            </span>
            <CaseList cases={cases} />
          </div>
          <PaymentHistoryMiniChart customer={customer} />
        </div>

        {/* Right column — Neo's analysis */}
        <Card className="border-primary/20 bg-primary/[0.03] flex flex-col gap-4 p-6">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} weight="fill" className="text-primary" />
              <h2 className="text-foreground text-sm font-semibold">
                Neo&rsquo;s analysis
              </h2>
            </div>
            <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
              {confidence}% confident
            </span>
          </header>

          <div className="flex flex-col gap-2">
            <div className="text-foreground text-sm font-medium">
              Ranked top because:
            </div>
            <ul className="text-foreground/85 flex flex-col gap-1 text-sm">
              {bullets.map((b, i) => (
                <li key={i}>• {b}</li>
              ))}
            </ul>
          </div>

          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Recommended tier:</dt>
            <dd className="text-foreground font-medium">
              {tierLabel(primaryCase.recommendedTier)}
            </dd>

            <dt className="text-muted-foreground">Tone:</dt>
            <dd className="text-foreground">
              {primaryCase.recommendedToneLabel}
            </dd>

            <dt className="text-muted-foreground">Confidence:</dt>
            <dd className="text-foreground tabular-nums">{confidence}%</dd>
          </dl>

          {sources ? (
            <div className="text-muted-foreground border-border/60 border-t pt-3 text-xs">
              Sources: {sources}
            </div>
          ) : null}
        </Card>
      </div>

      {/* Drafted email + edit-in-place */}
      {draftedEmail ? (
        <>
          <DraftedEmailCard
            email={draftedEmail}
            editedBody={runtime?.editedEmailBody}
          />

          {editing ? (
            <Card className="bg-card flex flex-col gap-3 p-4">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                Edit body
              </span>
              <Textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>Save &amp; Send</Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      {/* Action buttons (hidden once the case is closed) */}
      {!isClosed && !confirmation && !editing ? (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <Button
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={() => setShowRejectDialog(true)}
          >
            Reject and queue
          </Button>
          {draftedEmail ? (
            <>
              <Button variant="outline" onClick={handleStartEdit}>
                Edit &amp; Send
              </Button>
              <Button onClick={handleApprove}>
                <CheckCircle size={14} weight="bold" />
                Approve &amp; Send
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Reject confirmation dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject and queue?</DialogTitle>
            <DialogDescription>
              Move this case to the human-review queue. Neo&rsquo;s draft
              won&rsquo;t be sent.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={handleConfirmReject}
            >
              Reject and queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// Variant B — Atlantic Logistics (broken-promise, tier-2 tone-shifted)
// ════════════════════════════════════════════════════════════════════

function VariantB({
  customer,
  cases,
  primaryCase,
}: {
  customer: Customer
  cases: CollectionsCase[]
  primaryCase: CollectionsCase
}) {
  const router = useRouter()
  const runtime = useHydratedCollectionsStore(
    (s) => s.caseActions[primaryCase.id],
  )

  const [confirmation, setConfirmation] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [draftBody, setDraftBody] = React.useState<string>(
    primaryCase.draftedEmail?.bodyMarkdown ?? "",
  )
  const [showRejectDialog, setShowRejectDialog] = React.useState(false)

  const draftedEmail = primaryCase.draftedEmail
  const status = runtime?.status
  const isClosed =
    status === "approved-and-sent" ||
    status === "edited-and-sent" ||
    status === "rejected"

  function handleApprove() {
    useCollectionsStore.getState().approveDunningEmail(primaryCase.id)
    setConfirmation(`Sent at ${fmtTimeOfDay()}. Audit log #atl-b generated.`)
    window.setTimeout(() => {
      router.push("/neoflo-workspace/collections")
    }, 600)
  }

  function handleStartEdit() {
    setEditing(true)
    setDraftBody(
      runtime?.editedEmailBody ?? draftedEmail?.bodyMarkdown ?? "",
    )
  }

  function handleSaveEdit() {
    useCollectionsStore.getState().editDunningEmail(primaryCase.id, draftBody)
    setEditing(false)
    setConfirmation(`Sent with edits at ${fmtTimeOfDay()}.`)
    window.setTimeout(() => {
      router.push("/neoflo-workspace/collections")
    }, 600)
  }

  function handleConfirmReject() {
    useCollectionsStore.getState().rejectCase(primaryCase.id)
    setShowRejectDialog(false)
    router.push("/neoflo-workspace/collections/worklist")
  }

  return (
    <>
      {/* Already-closed banner */}
      {isClosed && !confirmation ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle
            size={20}
            weight="fill"
            className="shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <span className="font-medium">
            Email {status === "rejected" ? "rejected" : "sent"} —{" "}
            {customer.name} case closed.
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
          <span className="font-medium">
            {confirmation} {customer.name} case closed.
          </span>
        </div>
      ) : null}

      {/* Two-column area */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Left column — invoices + behavior summary */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Open invoices
            </span>
            <CaseList cases={cases} />
          </div>
          <PaymentHistoryMiniChart customer={customer} />
        </div>

        {/* Right column — Neo's analysis */}
        <Card className="border-primary/20 bg-primary/[0.03] flex flex-col gap-4 p-6">
          <header className="flex items-center gap-2">
            <Lightbulb size={16} weight="fill" className="text-primary" />
            <h2 className="text-foreground text-sm font-semibold">
              Neo&rsquo;s analysis
            </h2>
          </header>

          <dl className="grid grid-cols-[6.5rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Promise:</dt>
            <dd className="text-foreground">$48,000 by Friday May 9</dd>

            <dt className="text-muted-foreground">Today:</dt>
            <dd className="text-foreground">
              Tuesday May 13{" "}
              <span className="text-amber-700 dark:text-amber-300">
                (4 days late)
              </span>
            </dd>

            <dt className="text-muted-foreground">Status:</dt>
            <dd className="text-foreground">
              no response to original promise email
            </dd>
          </dl>

          <div className="border-border/60 border-t pt-3">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Recommended tier:</dt>
              <dd className="text-foreground font-medium">
                {tierLabel(primaryCase.recommendedTier)}
              </dd>

              <dt className="text-muted-foreground">Tone:</dt>
              <dd className="text-foreground">
                tone-shifted from broken promise
              </dd>
            </dl>
          </div>

          <div className="text-muted-foreground border-border/60 border-t pt-3 text-xs">
            Sources: payment history &middot; CRM (last call Apr 22) &middot;
            promise tracking
          </div>
        </Card>
      </div>

      {/* Drafted email + edit-in-place */}
      {draftedEmail ? (
        <>
          <DraftedEmailCard
            email={draftedEmail}
            editedBody={runtime?.editedEmailBody}
          />

          {editing ? (
            <Card className="bg-card flex flex-col gap-3 p-4">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                Edit body
              </span>
              <Textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>Save &amp; Send</Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      {/* Action row */}
      {!isClosed && !confirmation && !editing ? (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <Button
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={() => setShowRejectDialog(true)}
          >
            Reject and queue
          </Button>
          {draftedEmail ? (
            <>
              <Button variant="outline" onClick={handleStartEdit}>
                Edit &amp; Send
              </Button>
              <Button onClick={handleApprove}>
                <CheckCircle size={14} weight="bold" />
                Approve &amp; Send
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject and queue?</DialogTitle>
            <DialogDescription>
              Move this case to the human-review queue. Neo&rsquo;s draft
              won&rsquo;t be sent.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={handleConfirmReject}
            >
              Reject and queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// Variant C — Pacific Distribution (account-hold candidate)
// ════════════════════════════════════════════════════════════════════

function VariantC({
  customer,
  cases,
  primaryCase,
}: {
  customer: Customer
  cases: CollectionsCase[]
  primaryCase: CollectionsCase
}) {
  const router = useRouter()
  const runtime = useHydratedCollectionsStore(
    (s) => s.caseActions[primaryCase.id],
  )

  const [confirmation, setConfirmation] = React.useState<string | null>(null)
  const [showApproveDialog, setShowApproveDialog] = React.useState(false)

  const status = runtime?.status
  const isHoldApproved = status === "hold-approved"
  const isClosed = isHoldApproved || status === "rejected"

  // Synthesize the two drafted emails inline since the seed leaves
  // draftedEmail undefined for case-pacific-distribution-hold (the
  // customer-detail page owns the hold-notification emails).
  const internalSalesEmail: DunningEmail = {
    id: "email-pacific-distribution-sales-notify",
    caseId: primaryCase.id,
    customerId: customer.id,
    tier: 3,
    toneLabel: "internal Sales notification",
    to: "james.park@acmeco.com",
    subject: "Pacific Distribution account hold — Sales heads-up",
    bodyMarkdown:
      "Hi James,\n\nPacific Distribution is at 95 days overdue ($120K) with no response to 3 dunning attempts (Mar 28, Apr 12, Apr 27). I'm placing them on account hold and wanted to give you a heads-up before any new orders are blocked.\n\nLast 6 months: $340K order volume. If you have a relationship-side angle, the next 48h is the window before the hold goes into effect.\n\nThanks,\nSasha",
    toneCalibrationNotes:
      "internal · Sales notification · pre-hold 48h window",
    draftedAt: "2026-05-15T06:31:42Z",
  }

  const customerHoldEmail: DunningEmail = {
    id: "email-pacific-distribution-customer-notify",
    caseId: primaryCase.id,
    customerId: customer.id,
    tier: 4,
    toneLabel: "account hold notification",
    to: "rkim@pacific-dist.com",
    subject: "Account update — past due balance",
    bodyMarkdown:
      "Hi Robert,\n\nFollowing up — we have $120,000 past due across 5 invoices, with the oldest at 95 days. We've attempted contact three times since March 28 without response.\n\nEffective Friday May 17, your account will be placed on hold pending resolution of the past-due balance. Once resolved, normal account status resumes immediately.\n\nHappy to discuss before that — please call James Park (Sales) or reply to this email.\n\nThanks,\nSasha",
    toneCalibrationNotes:
      "tier 4 / final notice · references 3 prior contacts · firm but respectful",
    draftedAt: "2026-05-15T06:31:48Z",
  }

  function handleApproveHold() {
    useCollectionsStore.getState().approveAccountHold(primaryCase.id)
    setShowApproveDialog(false)
    setConfirmation(
      `Hold approved at ${fmtTimeOfDay()}. Sales notified. Customer notification queued.`,
    )
    window.setTimeout(() => {
      router.push("/neoflo-workspace/collections")
    }, 600)
  }

  function handleSendAnotherDunning() {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("neo:open-chat", {
        detail: {
          prompt: "Draft another tier-3 dunning email for Pacific Distribution",
        },
      }),
    )
  }

  function handleWait() {
    // Wait = postpone for 48h. V1: return to worklist without changing state.
    router.push("/neoflo-workspace/collections/worklist")
  }

  return (
    <>
      {/* Already-approved banner */}
      {isHoldApproved && !confirmation ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle
            size={20}
            weight="fill"
            className="shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <span className="font-medium">
            Account hold approved at{" "}
            {runtime?.actedAt
              ? new Date(runtime.actedAt).toLocaleTimeString("en-US", {
                  hour12: false,
                })
              : "—"}{" "}
            — Sales notified, customer notification queued.
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

      {/* Two-column area */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Open invoices
            </span>
            <CaseList cases={cases} />
          </div>
          <PaymentHistoryMiniChart customer={customer} />
        </div>

        <Card className="border-primary/20 bg-primary/[0.03] flex flex-col gap-4 p-6">
          <header className="flex items-center gap-2">
            <Lightbulb size={16} weight="fill" className="text-primary" />
            <h2 className="text-foreground text-sm font-semibold">
              Neo&rsquo;s analysis
            </h2>
          </header>

          <ul className="text-foreground/90 flex flex-col gap-1.5 text-sm">
            <li>
              • 95 days overdue,{" "}
              <span className="font-semibold tabular-nums">$120,000</span>
            </li>
            <li>
              • 3 dunning emails ignored (sent Mar 28, Apr 12, Apr 27)
            </li>
            <li>• Last contact: Feb 19 (their AR responded to invoice question)</li>
            <li>
              • Last 6 months order volume:{" "}
              <span className="font-semibold tabular-nums">$340,000</span>
            </li>
          </ul>

          <div className="border-border/60 border-t pt-3">
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Recommended action:</dt>
              <dd className="text-foreground font-medium">
                account hold + Sales notification
              </dd>
            </dl>
          </div>

          <div className="text-muted-foreground border-border/60 border-t pt-3 text-xs">
            Sources: AR ledger &middot; dunning email history &middot; CRM
            (last call Feb 19) &middot; order history
          </div>
        </Card>
      </div>

      {/* Account-hold financial impact card */}
      <AccountHoldCard
        customerName={customer.name}
        overdueAmount={120_000}
        last6MonthsOrderVolume={340_000}
        estimatedHoldImpactPerMonth={56_667}
        recoveryProbabilityWithoutAction={0.3}
        recoveryProbabilityWithAction={0.7}
      />

      {/* Internal Sales notification email */}
      <DraftedEmailCard email={internalSalesEmail} />

      {/* Customer notification email */}
      <DraftedEmailCard email={customerHoldEmail} />

      {/* Action row */}
      {!isClosed && !confirmation ? (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={handleWait} title="Postpone for 48h">
            Wait
          </Button>
          <Button variant="outline" onClick={handleSendAnotherDunning}>
            Send another dunning
          </Button>
          <Button onClick={() => setShowApproveDialog(true)}>
            <CheckCircle size={14} weight="bold" />
            Approve hold + notify Sales
          </Button>
        </div>
      ) : null}

      {/* Approve-hold confirmation dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve account hold?</DialogTitle>
            <DialogDescription>
              Pacific Distribution will be placed on hold effective Friday May
              17. Sales and the customer will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 border-border/60 flex flex-col gap-2 rounded-md border p-4 text-sm">
            <div className="text-foreground/85">
              Financial impact:
            </div>
            <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
              <li>• Overdue: $120,000 (95 days)</li>
              <li>• Holding will block ~$56,667/mo of new orders</li>
              <li>
                • Recovery probability: 30% → 70% with hold + Sales conversation
              </li>
              <li>• Expected uplift: ~$48,000</li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApproveDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleApproveHold}>
              <CheckCircle size={14} weight="bold" />
              Approve hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// Default variant — simple summary + case list, no drafted email
// ════════════════════════════════════════════════════════════════════

function DefaultVariant({ cases }: { cases: CollectionsCase[] }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Open invoices
        </span>
        <CaseList cases={cases} />
      </div>
      <Card className="bg-muted/40 text-muted-foreground p-6 text-sm">
        No action required from Neo at this time. Use the worklist to find a
        case to work.
      </Card>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// Source-line builder — pulls from CRM + behavior for the analysis card
// ════════════════════════════════════════════════════════════════════

function buildSourcesLine(customer: Customer): string {
  const parts: string[] = []
  if (customer.behavior.monthsOnTimeHistory) {
    parts.push(`payment history (${customer.behavior.monthsOnTimeHistory}mo)`)
  }
  if (customer.crm?.lastConversationAt) {
    const d = new Date(customer.crm.lastConversationAt)
    if (!Number.isNaN(d.getTime())) {
      const month = d.toLocaleString("en-US", {
        month: "short",
        timeZone: "UTC",
      })
      parts.push(`CRM (last call ${month} ${d.getUTCDate()})`)
    } else {
      parts.push("CRM")
    }
  }
  if (typeof customer.behavior.last6MonthsOrderVolume === "number") {
    parts.push("order history")
  }
  parts.push("POD records (all good)")
  return parts.join(" · ")
}
