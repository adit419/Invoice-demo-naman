// app/neoflo-workspace/cash-app/match/[paymentId]/page.tsx
//
// Cash-app match-detail surface — the A hero. Per
// docs/handoff/cash-app/03-screen-specs.md § "Surface 3: Match-detail".
"use client"

import * as React from "react"
import { Link } from "next-view-transitions"
import { notFound, useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle, PencilSimple } from "@phosphor-icons/react"

import { MatchPuzzle } from "@/components/neoflo-os/cash-app/match-puzzle"
import { ShortPayReasonCard } from "@/components/neoflo-os/cash-app/short-pay-reason-card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/neoflo-os/ui/alert-dialog"
import { Button } from "@/components/neoflo-os/ui/button"
import { Input } from "@/components/neoflo-os/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/neoflo-os/ui/select"
import {
  useCashAppStore,
  useHydratedCashAppStore,
} from "@/lib/neoflo-os/cash-app/cash-app-store"
import { REASON_CODES } from "@/lib/neoflo-os/cash-app/reason-codes"
import { getApplicationByPaymentId } from "@/lib/neoflo-os/cash-app/seed-applications"
import { getCustomer } from "@/lib/neoflo-os/cash-app/seed-customers"
import { getInvoice } from "@/lib/neoflo-os/cash-app/seed-invoices"
import { getPayment } from "@/lib/neoflo-os/cash-app/seed-payments"
import type { ReasonCode } from "@/lib/neoflo-os/cash-app/types"

function fmtAmountFull(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}

function fmtHeadline(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`
  return `$${n.toLocaleString()}`
}

export default function CashAppMatchDetailPage() {
  const params = useParams<{ paymentId: string }>()
  const router = useRouter()
  const paymentId = params!.paymentId

  const payment = getPayment(paymentId)
  const application = getApplicationByPaymentId(paymentId)

  // Runtime state for this application.
  const runtimeState = useHydratedCashAppStore(
    (s) => s.applications[paymentId]
  )

  // Local UI state.
  const [showRejectConfirm, setShowRejectConfirm] = React.useState(false)
  const [showHoldInput, setShowHoldInput] = React.useState(false)
  const [holdNote, setHoldNote] = React.useState("")
  const [showEditReason, setShowEditReason] = React.useState(false)
  const [confirmationVisible, setConfirmationVisible] = React.useState(false)

  if (!payment) {
    notFound()
  }
  if (!application) {
    notFound()
  }

  const customer = getCustomer(application.customerId)
  const invoices = application.invoiceIds
    .map((id) => getInvoice(id))
    .filter((inv): inv is NonNullable<typeof inv> => Boolean(inv))

  const customerName = customer?.name ?? payment.extractedPayer.name
  const confidencePct = Math.round(payment.classification.confidence * 100)

  // Effective reason code: user edit overrides seed.
  const effectiveReasonCode: ReasonCode | undefined =
    runtimeState?.editedShortPayReasonCode ?? application.shortPay?.reasonCode

  // Already-approved banner state. Show if user already clicked Approve and we
  // haven't navigated away yet (e.g. on refresh).
  const isApproved = runtimeState?.status === "user-approved"

  function handleApprove() {
    useCashAppStore.getState().approveApplication(paymentId)
    setConfirmationVisible(true)
    // Route back to inbox after the pulse.
    window.setTimeout(() => {
      router.push("/neoflo-workspace/cash-app/inbox")
    }, 1200)
  }

  function handleReject() {
    useCashAppStore.getState().rejectApplication(paymentId)
    setShowRejectConfirm(false)
    router.push("/neoflo-workspace/cash-app/unapplied")
  }

  function handleHoldSubmit() {
    if (holdNote.trim().length === 0) return
    useCashAppStore.getState().holdApplication(paymentId, holdNote.trim())
    setShowHoldInput(false)
    setHoldNote("")
  }

  function handleEditReason(newCode: ReasonCode) {
    useCashAppStore.getState().editShortPayReason(paymentId, newCode)
    setShowEditReason(false)
  }

  // Confirmation message for the approve pulse.
  const invoiceList = invoices
    .map((inv, i) =>
      i === 0
        ? inv.invoiceNumber
        : inv.invoiceNumber.replace(/^INV-/, "")
    )
    .join("/")

  const confirmMessage = application.shortPay
    ? `Applied. ${invoiceList} marked paid; ${effectiveReasonCode === application.shortPay.reasonCode ? "freight discount" : (REASON_CODES.find((r) => r.code === effectiveReasonCode)?.label ?? "short-pay")} ${fmtAmountFull(application.shortPay.amount)} booked.`
    : `Applied. ${invoiceList} marked paid.`

  return (
    <div className="flex-1 overflow-auto px-10 py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {/* Back link */}
        <Link
          href="/neoflo-workspace/cash-app/inbox"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft size={14} weight="regular" />
          <span>
            Inbox / {customerName} · {fmtHeadline(payment.amount)} · received{" "}
            <RelativeTime iso={payment.receivedAt} />
          </span>
        </Link>

        {/* Already-approved banner */}
        {isApproved && !confirmationVisible ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle size={20} weight="fill" className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">{confirmMessage}</span>
          </div>
        ) : null}

        {/* Pulse confirmation right after Approve click */}
        {confirmationVisible ? (
          <div className="animate-in fade-in slide-in-from-top-2 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 duration-300 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle size={20} weight="fill" className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">{confirmMessage}</span>
          </div>
        ) : null}

        {/* Three-card stack */}
        <MatchPuzzle
          payment={payment}
          application={application}
          customer={customer}
          invoices={invoices}
        />

        {application.shortPay ? (
          <ShortPayReasonCard
            shortPay={application.shortPay}
            customer={customer}
            effectiveReasonCode={effectiveReasonCode}
            paymentConfidencePct={confidencePct}
          />
        ) : null}

        {/* Edit reason inline panel */}
        {showEditReason && application.shortPay ? (
          <div className="bg-card flex items-center gap-3 rounded-lg border p-4">
            <PencilSimple size={16} weight="regular" className="text-muted-foreground" />
            <span className="text-foreground text-sm font-medium">Edit reason code:</span>
            <Select
              value={effectiveReasonCode}
              onValueChange={(v) => handleEditReason(v as ReasonCode)}
            >
              <SelectTrigger className="ml-auto w-72">
                <SelectValue placeholder="Choose a reason code" />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((rc) => (
                  <SelectItem key={rc.code} value={rc.code}>
                    {rc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setShowEditReason(false)}>
              Cancel
            </Button>
          </div>
        ) : null}

        {/* Hold note input */}
        {showHoldInput ? (
          <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
            <label className="text-foreground text-sm font-medium" htmlFor="hold-note">
              Why are you holding?
            </label>
            <Input
              id="hold-note"
              autoFocus
              value={holdNote}
              onChange={(e) => setHoldNote(e.target.value)}
              placeholder="Need clarification from Sarah on the freight clause..."
              onKeyDown={(e) => {
                if (e.key === "Enter") handleHoldSubmit()
                if (e.key === "Escape") setShowHoldInput(false)
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowHoldInput(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleHoldSubmit} disabled={holdNote.trim().length === 0}>
                Hold
              </Button>
            </div>
          </div>
        ) : null}

        {/* Action button row — destructive-left, primary-right */}
        {!isApproved && !confirmationVisible ? (
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowHoldInput(true)}>
              Hold for human
            </Button>
            {application.shortPay ? (
              <Button variant="outline" onClick={() => setShowEditReason((v) => !v)}>
                Edit reason
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setShowRejectConfirm(true)}
            >
              Reject
            </Button>
            <Button onClick={handleApprove}>
              <CheckCircle size={14} weight="bold" />
              Approve
            </Button>
          </div>
        ) : null}
      </div>

      {/* Reject confirm dialog */}
      <AlertDialog open={showRejectConfirm} onOpenChange={setShowRejectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send back to unapplied queue?</AlertDialogTitle>
            <AlertDialogDescription>
              This payment will be moved to the unapplied queue for further investigation. You can revisit it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject}>
              Send to unapplied
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Inline relative-time string — kept here so the back-link header doesn't import
// a one-off helper. Hydration-safe via suppressHydrationWarning since the value
// depends on the wall clock.
function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = React.useState<string>(() => {
    // SSR-safe initial: just the time, not the relative phrase.
    return ""
  })
  React.useEffect(() => {
    function compute() {
      const ms = Date.now() - Date.parse(iso)
      const hours = Math.floor(ms / (60 * 60 * 1000))
      if (hours < 1) {
        const mins = Math.max(1, Math.floor(ms / (60 * 1000)))
        setLabel(`${mins} minute${mins === 1 ? "" : "s"} ago`)
      } else if (hours < 24) {
        setLabel(`${hours} hour${hours === 1 ? "" : "s"} ago`)
      } else {
        const days = Math.floor(hours / 24)
        setLabel(`${days} day${days === 1 ? "" : "s"} ago`)
      }
    }
    compute()
    const t = window.setInterval(compute, 60_000)
    return () => window.clearInterval(t)
  }, [iso])
  return <span suppressHydrationWarning>{label || "today"}</span>
}
