// app/neoflo-workspace/cash-app/inbox/page.tsx
//
// Cash-app inbox surface — today's payments list. Per
// docs/handoff/cash-app/03-screen-specs.md § "Surface 2: Inbox".
"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { MagnifyingGlass } from "@phosphor-icons/react"

import { PaymentRow } from "@/components/neoflo-os/cash-app/payment-row"
import { FilterChip } from "@/components/neoflo-os/filter-chip"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/neoflo-os/ui/input-group"
import { getApplicationByPaymentId } from "@/lib/neoflo-os/cash-app/seed-applications"
import { getCustomer } from "@/lib/neoflo-os/cash-app/seed-customers"
import { getPaymentsByDate } from "@/lib/neoflo-os/cash-app/seed-payments"
import type { Payment } from "@/lib/neoflo-os/cash-app/types"

const DEMO_TODAY = "2026-05-15"

type FilterId = "all" | "auto-applied" | "short-pay" | "unapplied"

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "auto-applied", label: "Auto-applied" },
  { id: "short-pay", label: "Short-pay" },
  { id: "unapplied", label: "Unapplied" },
]

type PaymentKind = "auto-applied" | "short-pay" | "unapplied"

function classifyPayment(p: Payment): PaymentKind {
  if (p.classification.label === "unapplied") return "unapplied"
  const app = getApplicationByPaymentId(p.id)
  if (app?.shortPay || app?.status === "needs-review") return "short-pay"
  return "auto-applied"
}

function customerNameForPayment(p: Payment): string {
  const matched = p.extractedPayer.matchedCustomerId
  return matched ? (getCustomer(matched)?.name ?? p.extractedPayer.name) : p.extractedPayer.name
}

function fmtTotal(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`
  return `$${n.toLocaleString()}`
}

// Sort: short-pay → unapplied → auto-applied, then by receivedAt descending.
function sortPriority(kind: PaymentKind): number {
  if (kind === "short-pay") return 0
  if (kind === "unapplied") return 1
  return 2
}

export default function CashAppInboxPage() {
  return (
    <React.Suspense fallback={null}>
      <CashAppInboxPageInner />
    </React.Suspense>
  )
}

function CashAppInboxPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const todaysPayments = React.useMemo(() => getPaymentsByDate(DEMO_TODAY), [])

  // Build kind index once
  const kinds = React.useMemo(() => {
    const map: Record<string, PaymentKind> = {}
    for (const p of todaysPayments) map[p.id] = classifyPayment(p)
    return map
  }, [todaysPayments])

  const counts = React.useMemo(() => {
    const map: Record<FilterId, number> = {
      all: todaysPayments.length,
      "auto-applied": 0,
      "short-pay": 0,
      unapplied: 0,
    }
    for (const p of todaysPayments) {
      const kind = kinds[p.id]
      if (kind === "auto-applied") map["auto-applied"] += 1
      else if (kind === "short-pay") map["short-pay"] += 1
      else if (kind === "unapplied") map.unapplied += 1
    }
    return map
  }, [todaysPayments, kinds])

  const totalDollars = React.useMemo(
    () => todaysPayments.reduce((s, p) => s + p.amount, 0),
    [todaysPayments]
  )

  // Filter state from URL — single source of truth so back/forward works.
  const filterParam = (searchParams?.get("filter") as FilterId | null) ?? "all"
  const activeFilter: FilterId = FILTERS.some((f) => f.id === filterParam)
    ? filterParam
    : "all"

  const [search, setSearch] = React.useState("")

  function setFilter(next: FilterId) {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (next === "all") params.delete("filter")
    else params.set("filter", next)
    const qs = params.toString()
    router.push(`/neoflo-workspace/cash-app/inbox${qs ? `?${qs}` : ""}`)
  }

  const visiblePayments = React.useMemo(() => {
    const filtered = todaysPayments.filter((p) => {
      const kind = kinds[p.id]
      if (activeFilter !== "all" && kind !== activeFilter) return false
      if (search.trim().length === 0) return true
      const q = search.trim().toLowerCase()
      const customerName = customerNameForPayment(p).toLowerCase()
      const invoiceMatch =
        p.remittance?.parsedInvoiceIds?.some((id) =>
          id.toLowerCase().includes(q) ||
          id.replace(/^inv-/, "inv-").toLowerCase().includes(q) ||
          `inv-${id.replace(/^inv-/, "")}`.toLowerCase().includes(q) ||
          `INV-${id.replace(/^inv-/, "")}`.toLowerCase().includes(q)
        ) ?? false
      const idMatch = p.id.toLowerCase().includes(q)
      return customerName.includes(q) || invoiceMatch || idMatch
    })

    // Sort by kind priority then by receivedAt descending.
    return filtered.sort((a, b) => {
      const ap = sortPriority(kinds[a.id])
      const bp = sortPriority(kinds[b.id])
      if (ap !== bp) return ap - bp
      return Date.parse(b.receivedAt) - Date.parse(a.receivedAt)
    })
  }, [todaysPayments, kinds, activeFilter, search])

  return (
    <div className="flex-1 overflow-auto px-10 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/* Page header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Today&apos;s payments
          </h1>
          <p className="text-muted-foreground text-sm">
            {counts.all} incoming · {fmtTotal(totalDollars)} total ·{" "}
            {counts["auto-applied"]} auto-applied · {counts["short-pay"]} need eyes ·{" "}
            {counts.unapplied} unapplied
          </p>
        </div>

        {/* Filter + search row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                label={f.label}
                count={counts[f.id]}
                active={activeFilter === f.id}
                onClick={() => setFilter(f.id)}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <InputGroup className="w-72">
              <InputGroupAddon>
                <MagnifyingGlass size={16} />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search by customer or invoice number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
          </div>
        </div>

        {/* List */}
        <section className="flex flex-col gap-3">
          {visiblePayments.length === 0 ? (
            <div className="bg-card text-muted-foreground rounded-lg border p-10 text-center text-sm">
              No payments matching this filter.
            </div>
          ) : (
            visiblePayments.map((p) => {
              const app = getApplicationByPaymentId(p.id)
              return (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  customerName={customerNameForPayment(p)}
                  application={app}
                />
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
