// app/neoflo-workspace/invoice-processing/match/[invoiceId]/page.tsx
//
// Invoice-processing match-detail surface — the puzzle view. Three render
// modes selected by `invoice.matchMode`:
//   - "3way" / "2way" → MatchPuzzle3Way + GLProposalCard (Mode A — implemented)
//   - "duplicate"     → placeholder (Mode B — next bundle)
//   - "tax"           → placeholder (Mode D — next bundle)
//   - "exception"     → basic exception summary
//
// Per docs/handoff/invoice-processing/03-screen-specs.md § "Surface 3:
// Match-detail" — focus of this bundle is Mode A.
"use client"

import * as React from "react"
import { Link } from "next-view-transitions"
import { notFound, useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  CaretDown,
  CheckCircle,
  ShieldCheck,
} from "@phosphor-icons/react"

import { DuplicateFindingCard } from "@/components/neoflo-os/invoice-processing/duplicate-finding-card"
import { GLProposalCard } from "@/components/neoflo-os/invoice-processing/gl-proposal-card"
import { InvoiceNumberLink } from "@/components/neoflo-os/invoice-processing/invoice-number-link"
import { MatchPuzzle3Way } from "@/components/neoflo-os/invoice-processing/match-puzzle-3way"
import { PONumberLink } from "@/components/neoflo-os/invoice-processing/po-number-link"
import { TaxCodingCard } from "@/components/neoflo-os/invoice-processing/tax-coding-card"
import { StatusBadge } from "@/components/neoflo-os/status-badge"
import { Button } from "@/components/neoflo-os/ui/button"
import { Card } from "@/components/neoflo-os/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/neoflo-os/ui/dropdown-menu"
import {
  useHydratedInvoiceProcessingStore,
  useInvoiceProcessingStore,
} from "@/lib/neoflo-os/invoice-processing/invoice-processing-store"
import { getReasonCode } from "@/lib/neoflo-os/invoice-processing/reason-codes"
import { getGRN } from "@/lib/neoflo-os/invoice-processing/seed-grns"
import { getInvoice } from "@/lib/neoflo-os/invoice-processing/seed-invoices"
import { getPO } from "@/lib/neoflo-os/invoice-processing/seed-purchase-orders"
import { getVendor } from "@/lib/neoflo-os/invoice-processing/seed-vendors"

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  "edi-810": "EDI",
  billcom: "Bill.com",
  coupa: "Coupa",
  ariba: "Ariba",
  photo: "Photo",
  manual: "Manual",
}

function fmtMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount).toLocaleString("en-US")
  if (currency === "USD") return `$${rounded}`
  return `${currency} ${rounded}`
}

function fmtReceivedAt(iso: string): string {
  const d = new Date(iso)
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
  const day = d.getUTCDate()
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return `${month} ${day} ${hh}:${mm}`
}

// ════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════

export default function InvoiceProcessingMatchDetailPage() {
  const params = useParams<{ invoiceId: string }>()
  const router = useRouter()
  const invoiceId = params!.invoiceId

  const invoice = getInvoice(invoiceId)
  if (!invoice) {
    notFound()
    // notFound() throws — this never runs, but it tells TS that `invoice`
    // is defined below.
    return null
  }

  const vendor = getVendor(invoice.vendorId)
  const vendorName = vendor?.name ?? invoice.vendorId

  // Runtime state for this invoice.
  const runtimeState = useHydratedInvoiceProcessingStore(
    (s) => s.applications[invoiceId]
  )
  const isApproved = runtimeState?.status === "user-approved"

  const [confirmation, setConfirmation] = React.useState<string | null>(null)

  function showToast(message: string) {
    setConfirmation(message)
  }

  function handleApprove() {
    useInvoiceProcessingStore.getState().approveInvoice(invoiceId)
    showToast("Posted to NetSuite. Audit log generated.")
    window.setTimeout(() => {
      router.push("/neoflo-workspace/invoice-processing")
    }, 600)
  }

  function handleReject() {
    useInvoiceProcessingStore.getState().rejectInvoice(invoiceId)
    router.push("/neoflo-workspace/invoice-processing/exceptions")
  }

  function handleEditGL(alternative: {
    account: string
    accountLabel: string
  }) {
    // We persist account + retain proposed cost center + entity for now —
    // a fuller GL editor lands with Mode D in the next bundle.
    const proposal = invoice?.glProposal
    if (!proposal) return
    useInvoiceProcessingStore.getState().editGLCoding(invoiceId, {
      account: alternative.account,
      costCenter: proposal.costCenter,
      entity: proposal.entity,
    })
  }

  // Resolve PO + GRN for 3-way / 2-way modes.
  const po = invoice.matchProposal?.poId
    ? getPO(invoice.matchProposal.poId)
    : undefined
  const grn = invoice.matchProposal?.grnId
    ? getGRN(invoice.matchProposal.grnId)
    : undefined

  const mode = invoice.matchMode

  // Action button row visibility — only Mode A (3way/2way) has the action set
  // wired in this bundle. Mode B/D placeholders ship with no actions yet.
  const isModeA = mode === "3way" || mode === "2way"

  return (
    <div className="flex-1 overflow-auto px-8 py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/* Back link */}
        <Link
          href="/neoflo-workspace/invoice-processing/inbox"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft size={14} weight="regular" />
          <span>Back to Inbox</span>
        </Link>

        {/* Invoice summary card */}
        <Card className="bg-card flex flex-col gap-2 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 className="text-foreground inline-flex items-baseline gap-2 text-xl font-semibold tracking-tight">
              <span>{vendorName}</span>
              <span className="text-muted-foreground font-normal">·</span>
              <InvoiceNumberLink
                invoiceId={invoice.id}
                label={invoice.invoiceNumber}
                className="text-muted-foreground hover:text-primary font-normal"
                mono={false}
              />
            </h1>
            <span className="text-foreground text-xl font-semibold tabular-nums">
              {fmtMoney(invoice.amount, invoice.currency)}
            </span>
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span>Received {fmtReceivedAt(invoice.receivedAt)}</span>
            <span>·</span>
            <span>{CHANNEL_LABEL[invoice.channel] ?? invoice.channel}</span>
            <span>·</span>
            <span>OCR {Math.round(invoice.ocrConfidence * 100)}% confidence</span>
            {po ? (
              <>
                <span>·</span>
                <PONumberLink
                  poId={po.id}
                  label={po.poNumber}
                  className="text-xs"
                />
              </>
            ) : null}
          </div>
        </Card>

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

        {/* Already-approved banner (e.g., on refresh) */}
        {isApproved && !confirmation ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle
              size={20}
              weight="fill"
              className="shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            <span className="font-medium">
              Posted to NetSuite. Audit log generated.
            </span>
          </div>
        ) : null}

        {/* ── Mode dispatch ─────────────────────────────────────── */}

        {isModeA ? (
          <>
            <MatchPuzzle3Way invoice={invoice} po={po} grn={grn} />
            {invoice.glProposal ? (
              <GLProposalCard
                glProposal={invoice.glProposal}
                editedGL={runtimeState?.editedGL}
              />
            ) : null}
            {invoice.taxLine ? (
              <Card className="bg-card flex items-center justify-between gap-3 p-4 text-sm">
                <span className="text-foreground font-medium">Tax</span>
                <span className="text-muted-foreground">
                  {invoice.taxLine.type} {Math.round(invoice.taxLine.rate * 100)}%
                  on {fmtMoney(invoice.taxLine.base, invoice.currency)} ={" "}
                  {fmtMoney(invoice.taxLine.amount, invoice.currency)}
                </span>
              </Card>
            ) : (
              <Card className="bg-card flex items-center gap-3 p-4 text-sm">
                <span className="text-foreground font-medium">Tax</span>
                <span className="text-muted-foreground">
                  No GST/VAT applicable (service, US-domestic)
                </span>
              </Card>
            )}
          </>
        ) : null}

        {mode === "duplicate" ? (
          <DuplicateFindingCard invoice={invoice} />
        ) : null}

        {mode === "tax" ? <TaxCodingCard invoice={invoice} /> : null}

        {mode === "exception" && invoice.exception ? (
          <Card className="bg-card flex flex-col gap-3 p-6">
            <div className="flex items-center gap-2">
              <StatusBadge
                tone={getReasonCode(invoice.exception.reasonCode).tone}
                showDot={false}
              >
                {invoice.exception.reasonCode}
              </StatusBadge>
              <h2 className="text-foreground text-sm font-semibold">
                {getReasonCode(invoice.exception.reasonCode).label}
              </h2>
            </div>
            <p className="text-foreground/85 text-sm leading-relaxed">
              {invoice.exception.neoInvestigation}
            </p>
            <div className="text-muted-foreground text-xs">
              Proposed action: {invoice.exception.proposedAction}
            </div>
          </Card>
        ) : null}

        {/* ── Action button row (Mode A only) ───────────────────── */}
        {isModeA && !isApproved && !confirmation ? (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={handleReject}
            >
              Reject + queue for human
            </Button>

            {invoice.glProposal?.alternatives &&
            invoice.glProposal.alternatives.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Edit GL
                    <CaretDown size={12} weight="bold" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  {invoice.glProposal.alternatives.map((alt) => (
                    <DropdownMenuItem
                      key={alt.account}
                      onSelect={() => handleEditGL(alt)}
                    >
                      <span className="font-mono text-xs">{alt.account}</span>
                      <span className="ml-2">{alt.accountLabel}</span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {Math.round(alt.confidence * 100)}%
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <Button onClick={handleApprove}>
              <CheckCircle size={14} weight="bold" />
              Approve &amp; Post
            </Button>
          </div>
        ) : null}

        {/* Audit footer */}
        <div className="text-muted-foreground border-border/60 flex items-center gap-2 border-t pt-4 text-xs">
          <ShieldCheck size={14} weight="regular" className="text-primary" />
          <span>
            Audit trail will record: ingest &rarr; OCR &rarr; 3-way match &rarr;
            GL code &rarr; tax check &rarr; post. SHA-256 hash on commit.
          </span>
        </div>
      </div>
    </div>
  )
}
