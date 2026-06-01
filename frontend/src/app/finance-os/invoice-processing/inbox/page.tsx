// app/neoflo-workspace/invoice-processing/inbox/page.tsx
//
// Invoice-processing inbox surface — today's invoices, filterable + searchable.
// Per docs/handoff/invoice-processing/03-screen-specs.md § "Surface 2: Inbox".
//
// Chrome (WorkspaceHeader, InvoiceProcessingTabs, ChatThread) is owned by
// app/neoflo-workspace/invoice-processing/layout.tsx — this page renders only the body.
"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import {
  CaretDown,
  CaretUp,
  CaretUpDown,
  MagnifyingGlass,
} from "@phosphor-icons/react"

import { InboxAmountFilter } from "@/components/neoflo-os/invoice-processing/inbox-amount-filter"
import { InboxDateFilter } from "@/components/neoflo-os/invoice-processing/inbox-date-filter"
import { InboxVendorFilter } from "@/components/neoflo-os/invoice-processing/inbox-vendor-filter"
import { InvoiceRow } from "@/components/neoflo-os/invoice-processing/invoice-row"
import { FilterChip } from "@/components/neoflo-os/filter-chip"
import { PageHeader } from "@/components/neoflo-os/page-header"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/neoflo-os/ui/input-group"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/neoflo-os/ui/table"
import {
  getChannelBreakdown,
  getInboxItems,
} from "@/lib/neoflo-os/invoice-processing/derive"
import {
  useHydratedInvoiceProcessingStore,
  useInvoiceProcessingStore,
} from "@/lib/neoflo-os/invoice-processing/invoice-processing-store"

const CHANNEL_DISPLAY_NAME: Record<string, string> = {
  email: "Email",
  "edi-810": "EDI",
  billcom: "Bill.com",
  coupa: "Coupa",
  ariba: "Ariba",
  photo: "Photo",
  manual: "Manual",
}

type FilterId = "all" | "auto-posted" | "match-review" | "exception"

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "auto-posted", label: "Auto-posted" },
  { id: "match-review", label: "Match review" },
  { id: "exception", label: "Exception" },
]

// Caret indicator for sortable table headers.
// Neutral CaretUpDown when the column isn't the active sort; CaretUp/Down when active.
function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return <CaretUpDown size={12} className="text-muted-foreground ml-1" />
  }
  return dir === "asc" ? (
    <CaretUp size={12} className="text-foreground ml-1" />
  ) : (
    <CaretDown size={12} className="text-foreground ml-1" />
  )
}

export default function InvoiceProcessingInboxPage() {
  return (
    <React.Suspense fallback={null}>
      <InvoiceProcessingInboxInner />
    </React.Suspense>
  )
}

function InvoiceProcessingInboxInner() {
  // Deep-link from Insights "View aged": ?aged=true narrows to >30d, unpaid.
  const searchParams = useSearchParams()
  const agedOnly = searchParams?.get("aged") === "true"

  // Persisted filter + search (sessionStorage via the invoice-processing store)
  const inboxFilter = useHydratedInvoiceProcessingStore((s) => s.inboxFilter)
  const inboxSearch = useHydratedInvoiceProcessingStore((s) => s.inboxSearch)
  const dateFrom = useHydratedInvoiceProcessingStore((s) => s.inboxDateFrom)
  const dateTo = useHydratedInvoiceProcessingStore((s) => s.inboxDateTo)
  const amountBucket = useHydratedInvoiceProcessingStore(
    (s) => s.inboxAmountBucket
  )
  const vendorIds = useHydratedInvoiceProcessingStore(
    (s) => s.inboxVendorIds
  )
  const sortKey = useHydratedInvoiceProcessingStore((s) => s.inboxSortKey)
  const sortDir = useHydratedInvoiceProcessingStore((s) => s.inboxSortDir)

  // Local debounced search mirror so typing stays snappy without thrashing the
  // store. Source of truth for filtering is the debounced value below.
  const [searchDraft, setSearchDraft] = React.useState(inboxSearch)

  // Keep local draft synced if another surface mutates the store value.
  React.useEffect(() => {
    setSearchDraft(inboxSearch)
  }, [inboxSearch])

  // 200ms debounce → push into the store.
  React.useEffect(() => {
    if (searchDraft === inboxSearch) return
    const t = window.setTimeout(() => {
      useInvoiceProcessingStore.getState().setInboxSearch(searchDraft)
    }, 200)
    return () => window.clearTimeout(t)
  }, [searchDraft, inboxSearch])

  // Counts — independent of the active filter so chips show stable totals.
  const counts = React.useMemo(() => {
    const all = getInboxItems({ filter: "all", search: inboxSearch })
    return {
      all: all.length,
      "auto-posted": all.filter((i) => i.status === "auto-posted").length,
      "match-review": all.filter(
        (i) => i.status === "needs-review" || i.status === "duplicate-suspected"
      ).length,
      exception: all.filter((i) => i.status === "exception").length,
    } as Record<FilterId, number>
  }, [inboxSearch])

  const channels = React.useMemo(() => getChannelBreakdown(), [])

  const visibleInvoices = React.useMemo(
    () =>
      getInboxItems({
        filter: inboxFilter,
        search: inboxSearch,
        dateFrom,
        dateTo,
        amountBucket,
        vendorIds,
        sortKey,
        sortDir,
        agedOnly,
      }),
    [
      inboxFilter,
      inboxSearch,
      dateFrom,
      dateTo,
      amountBucket,
      vendorIds,
      sortKey,
      sortDir,
      agedOnly,
    ]
  )

  const totalCount = React.useMemo(() => getInboxItems().length, [])

  function setFilter(next: FilterId) {
    useInvoiceProcessingStore.getState().setInboxFilter(next)
  }

  // Three-state sort cycle per column: inactive → desc → asc → cleared.
  function toggleSort(key: "receivedAt" | "amount" | "vendorName") {
    const setSort = useInvoiceProcessingStore.getState().setInboxSort
    if (sortKey !== key) {
      setSort(key, "desc")
    } else if (sortDir === "desc") {
      setSort(key, "asc")
    } else {
      setSort(null, "desc") // third click clears
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={`Inbox · ${totalCount}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              Channels
            </span>
            {channels.map(({ channel, count }, idx) => (
              <React.Fragment key={channel}>
                {idx > 0 ? (
                  <span className="text-muted-foreground/60">·</span>
                ) : null}
                <span className="border-border bg-muted text-foreground/80 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
                  {CHANNEL_DISPLAY_NAME[channel] ?? channel} {count}
                </span>
              </React.Fragment>
            ))}
          </span>
        }
      />

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          {/* Filter chips + search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <FilterChip
                  key={f.id}
                  label={f.label}
                  count={counts[f.id]}
                  active={inboxFilter === f.id}
                  onClick={() => setFilter(f.id)}
                />
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <InboxDateFilter
                from={dateFrom}
                to={dateTo}
                onChange={(from, to) =>
                  useInvoiceProcessingStore
                    .getState()
                    .setInboxDateRange(from, to)
                }
              />
              <InboxAmountFilter
                value={amountBucket}
                onChange={(b) =>
                  useInvoiceProcessingStore
                    .getState()
                    .setInboxAmountBucket(b)
                }
              />
              <InboxVendorFilter
                vendorIds={vendorIds}
                onChange={(ids) =>
                  useInvoiceProcessingStore
                    .getState()
                    .setInboxVendorIds(ids)
                }
              />
              <InputGroup className="w-72">
                <InputGroupAddon>
                  <MagnifyingGlass size={16} />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Search vendor / inv #"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                />
              </InputGroup>
            </div>
          </div>

          {/* Table */}
          <div className="bg-card overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {/*
                    House-style carve-out: CLAUDE.md forbids raw <button> outside
                    the sidebar, but sortable table headers are the documented
                    exception (shadcn / TanStack Table pattern is a <button>
                    inside <TableHead>). The buttons inherit the TableHead's
                    typography so visual language is unchanged.
                  */}
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("vendorName")}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center"
                    >
                      Vendor
                      <SortIcon
                        active={sortKey === "vendorName"}
                        dir={sortDir}
                      />
                    </button>
                  </TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("amount")}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center"
                    >
                      Amount
                      <SortIcon
                        active={sortKey === "amount"}
                        dir={sortDir}
                      />
                    </button>
                  </TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>PO ref</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead aria-label="Action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleInvoices.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </TableBody>
            </Table>

            {visibleInvoices.length === 0 ? (
              <div className="text-muted-foreground p-10 text-center text-sm">
                No invoices match. Try clearing filters or searching across all
                channels.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
