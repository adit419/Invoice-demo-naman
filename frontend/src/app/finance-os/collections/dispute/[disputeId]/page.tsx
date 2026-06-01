// app/neoflo-workspace/collections/dispute/[disputeId]/page.tsx
//
// Collections dispute-detail surface — the C hero for the Phase 1 demo.
// Renders Neo's full investigation: dispute summary, customer-stated reason,
// side-by-side invoice + 4-source evidence panel, recommendation card with
// reasoning, drafted credit memo, and the apology email.
//
// Per docs/handoff/collections/03-screen-specs.md § "Surface 4 — Dispute detail".
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

import { CreditMemoCard } from "@/components/neoflo-os/collections/credit-memo-card"
import { DisputeSummaryCard } from "@/components/neoflo-os/collections/dispute-summary-card"
import { DraftedEmailCard } from "@/components/neoflo-os/collections/drafted-email-card"
import { EvidencePanel } from "@/components/neoflo-os/collections/evidence-panel"
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
import { Input } from "@/components/neoflo-os/ui/input"
import {
  useCollectionsStore,
  useHydratedCollectionsStore,
} from "@/lib/neoflo-os/collections/collections-store"
import { getCustomer } from "@/lib/neoflo-os/collections/seed-customers"
import { getDispute } from "@/lib/neoflo-os/collections/seed-disputes"
import { getOpenInvoice } from "@/lib/neoflo-os/collections/seed-open-invoices"
import type { DunningEmail } from "@/lib/neoflo-os/collections/types"

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

function fmtDollars(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function fmtDate(iso?: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
  return `${month} ${d.getUTCDate()}`
}

function fmtTimeOfDay(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

// ════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════

export default function CollectionsDisputeDetailPage() {
  const params = useParams<{ disputeId: string }>()
  const router = useRouter()
  const maybeDispute = getDispute(params!.disputeId)
  if (!maybeDispute) {
    notFound()
    return null
  }
  const dispute = maybeDispute

  const customer = getCustomer(dispute.customerId)
  const invoice = getOpenInvoice(dispute.invoiceId)
  const recommendation = dispute.recommendation
  const creditMemo = recommendation?.draftedCreditMemo

  const runtimeStatus = useHydratedCollectionsStore(
    (s) => s.disputeReviews[dispute.id],
  )
  const isCreditMemoApproved = runtimeStatus === "credit-memo-approved"
  const isRefused = runtimeStatus === "refused"
  const isClosed = isCreditMemoApproved || isRefused

  const [confirmation, setConfirmation] = React.useState<string | null>(null)
  const [showRefuseDialog, setShowRefuseDialog] = React.useState(false)
  const [editingAmount, setEditingAmount] = React.useState(false)
  const [editedAmount, setEditedAmount] = React.useState<string>(
    creditMemo ? String(creditMemo.amount) : "",
  )

  // Approve credit memo + send apology email — store status mutation, toast,
  // then redirect to dashboard 600ms later.
  function handleApprove() {
    useCollectionsStore.getState().approveCreditMemo(dispute.id)
    const memoId = creditMemo?.id ?? "CM"
    setConfirmation(
      `Credit memo ${memoId} issued at ${fmtTimeOfDay()}. Apology email sent.`,
    )
    window.setTimeout(() => {
      router.push("/neoflo-workspace/collections")
    }, 600)
  }

  function handleConfirmRefuse() {
    useCollectionsStore.getState().refuseDispute(dispute.id)
    setShowRefuseDialog(false)
    router.push("/neoflo-workspace/collections/worklist")
  }

  function handleInvestigate() {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("neo:open-chat", {
        detail: {
          prompt: `What else should I check on the ${customer?.name ?? "this"} dispute?`,
        },
      }),
    )
  }

  // Synthesize a DunningEmail shape from the dispute's draftedEmail (no tier
  // in seed → mark tier 1 / "apology" so the existing card renders correctly).
  const apologyEmail: DunningEmail | undefined =
    recommendation?.draftedEmail
      ? {
          id: `email-apology-${dispute.id}`,
          caseId: "",
          customerId: dispute.customerId,
          tier: 1,
          toneLabel: "apology",
          to: recommendation.draftedEmail.to,
          cc: recommendation.draftedEmail.cc,
          subject: recommendation.draftedEmail.subject,
          bodyMarkdown: recommendation.draftedEmail.bodyMarkdown,
          paymentLink: "stripe.com/pay/atlantic-9912",
          toneCalibrationNotes:
            "apology + correction · references POD evidence",
          draftedAt: new Date().toISOString(),
        }
      : undefined

  const confidencePct = recommendation
    ? Math.round(recommendation.confidence * 100)
    : undefined

  const invoiceLineTotal = invoice ? invoice.amount : 0
  // Customer-stated quote attribution: e.g. "— Maria Gonzalez, Atlantic Industrial AR (May 11)"
  const filedLabel = fmtDate(dispute.filedAt)

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

        {customer ? (
          <DisputeSummaryCard dispute={dispute} customer={customer} />
        ) : null}

        {/* Closed banner (post-action or on reload) */}
        {isClosed && !confirmation ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle
              size={20}
              weight="fill"
              className="shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            <span className="font-medium">
              {isCreditMemoApproved
                ? "Credit memo issued and apology sent — dispute resolved."
                : "Dispute refused — refusal email sent to customer."}
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

        {/* Customer's stated reason */}
        <Card className="bg-card flex flex-col gap-3 p-6">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Customer&rsquo;s stated reason
          </h2>
          <blockquote className="text-foreground/85 border-primary/30 border-l-2 pl-4 text-sm italic leading-relaxed">
            {dispute.customerStatedReason}
          </blockquote>
          {customer ? (
            <div className="text-muted-foreground text-xs">
              &mdash; {customer.primaryContactName}, {customer.name} AR (
              {filedLabel})
            </div>
          ) : null}
        </Card>

        {/* Side-by-side invoice vs evidence */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="bg-card flex flex-col gap-4 p-6">
            <header className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Invoice
            </header>
            {invoice ? (
              <>
                <div className="flex flex-col gap-1">
                  <div className="text-foreground font-mono text-sm font-semibold">
                    {invoice.invoiceNumber}
                  </div>
                  <div className="text-foreground text-lg font-semibold tabular-nums">
                    {fmtDollars(invoice.amount)}
                  </div>
                </div>

                <div className="border-border/60 flex flex-col border-t pt-4">
                  <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
                    Line
                  </div>
                  <div className="border-border/40 flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-foreground">
                        {invoice.description ?? invoice.invoiceNumber}
                      </span>
                      {dispute.evidence?.poRecord ? (
                        <span className="text-muted-foreground text-xs">
                          {dispute.evidence.poRecord.quantity} ×{" "}
                          {fmtDollars(dispute.evidence.poRecord.unitPrice)}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-foreground shrink-0 tabular-nums">
                      {fmtDollars(invoiceLineTotal)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">
                Invoice {dispute.invoiceNumber} not found.
              </div>
            )}
          </Card>

          <EvidencePanel
            evidence={dispute.evidence}
            recommendationAction={recommendation?.action}
          />
        </div>

        {/* Neo's recommendation */}
        {recommendation ? (
          <Card className="border-primary/20 bg-primary/[0.03] flex flex-col gap-4 p-6">
            <header className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lightbulb size={16} weight="fill" className="text-primary" />
                <h2 className="text-foreground text-sm font-semibold">
                  Neo&rsquo;s recommendation
                </h2>
              </div>
              {confidencePct !== undefined ? (
                <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
                  {confidencePct}% conf
                </span>
              ) : null}
            </header>

            {recommendation.action === "issue-credit-memo" &&
            recommendation.creditMemoAmount ? (
              <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Issue credit memo:</dt>
                <dd className="text-foreground font-medium tabular-nums">
                  {dispute.evidence?.poRecord
                    ? `${dispute.evidence.poRecord.quantity - (dispute.evidence.grnRecord?.receivedQty ?? dispute.evidence.poRecord.quantity)} units × ${fmtDollars(dispute.evidence.poRecord.unitPrice)} = ${fmtDollars(recommendation.creditMemoAmount)}`
                    : fmtDollars(recommendation.creditMemoAmount)}
                </dd>

                <dt className="text-muted-foreground">Reason code:</dt>
                <dd className="text-foreground font-mono text-xs">
                  {recommendation.creditMemoReason}
                </dd>

                {creditMemo ? (
                  <>
                    <dt className="text-muted-foreground">
                      Accounting treatment:
                    </dt>
                    <dd className="text-foreground">
                      {creditMemo.accountingTreatment}
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : null}

            <blockquote className="text-foreground/85 border-primary/30 border-l-2 pl-4 text-sm italic leading-relaxed">
              {recommendation.reasoning}
            </blockquote>

            <div className="text-muted-foreground border-border/60 border-t pt-3 text-xs">
              Sources: {recommendation.sources.join(" · ")}
            </div>
          </Card>
        ) : null}

        {/* Drafted credit memo */}
        {creditMemo ? <CreditMemoCard creditMemo={creditMemo} /> : null}

        {/* Inline credit-memo amount edit */}
        {editingAmount && creditMemo ? (
          <Card className="bg-card flex flex-col gap-3 p-4">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              Edit credit memo amount
            </span>
            <Input
              type="number"
              value={editedAmount}
              onChange={(e) => setEditedAmount(e.target.value)}
              className="font-mono text-sm"
            />
            <div className="text-muted-foreground text-xs">
              Full edit support lands in M3 — for V1 the amount is captured but
              not persisted.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingAmount(false)
                  setEditedAmount(String(creditMemo.amount))
                }}
              >
                Cancel
              </Button>
              <Button onClick={() => setEditingAmount(false)}>Save</Button>
            </div>
          </Card>
        ) : null}

        {/* Apology email */}
        {apologyEmail ? <DraftedEmailCard email={apologyEmail} /> : null}

        {/* Action row */}
        {!isClosed && !confirmation && !editingAmount ? (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleInvestigate}>
              Investigate further
            </Button>
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setShowRefuseDialog(true)}
            >
              Refuse
            </Button>
            {creditMemo ? (
              <Button
                variant="outline"
                onClick={() => setEditingAmount(true)}
              >
                Edit credit memo
              </Button>
            ) : null}
            <Button onClick={handleApprove}>
              <CheckCircle size={14} weight="bold" />
              Approve credit memo + Send email
            </Button>
          </div>
        ) : null}

        {/* Refuse dispute dialog */}
        <Dialog open={showRefuseDialog} onOpenChange={setShowRefuseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refuse the dispute?</DialogTitle>
              <DialogDescription>
                Customer will receive a refusal email with the evidence
                attached. This action is logged in the audit trail.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRefuseDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                onClick={handleConfirmRefuse}
              >
                Refuse dispute
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Audit footer */}
        <div className="text-muted-foreground border-border/60 flex items-center gap-2 border-t pt-4 text-xs">
          <Shield size={14} weight="regular" className="text-primary" />
          <span>
            Audit trail will record: evidence-pulled &rarr; credit-memo-issued
            &rarr; email-sent.
          </span>
        </div>
      </div>
    </div>
  )
}
