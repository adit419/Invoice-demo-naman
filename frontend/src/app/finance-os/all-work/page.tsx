// app/neoflo-workspace/all-work/page.tsx
"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { ChatThread } from "@/components/neoflo-os/workspace/chat-thread"
import { FeedFilterChip } from "@/components/neoflo-os/workspace/feed-filter-chip"
import { FeedRow } from "@/components/neoflo-os/workspace/feed-row"
import { NeoChip } from "@/components/neoflo-os/workspace/neo-chip"
import { PageTabs } from "@/components/neoflo-os/workspace/page-tabs"
import { WorkspaceHeader } from "@/components/neoflo-os/workspace/workspace-header"
import { Separator } from "@/components/neoflo-os/ui/separator"
import { SEED_FEED, type FeedItem } from "@/lib/neoflo-os/workspace/seed-feed"
import {
  SEED_FEED_PERSONA_AWARE,
  filterFeedByPersona,
  type PersonaAwareFeedItem,
} from "@/lib/neoflo-os/neoflo-workspace/seed-feed"
import { getPersona } from "@/lib/neoflo-os/neoflo-workspace/personas"
import { useActivePersona, usePersonaStore } from "@/lib/neoflo-os/neoflo-workspace/persona-store"
import { snapshotBriefing } from "@/lib/neoflo-os/workspace/briefing-snapshot"
import { useBasePath, useRewriteHref } from "@/lib/neoflo-os/workspace/use-base-path"
import { getIcon } from "@/lib/neoflo-os/workspace/workflow-icons"

type FilterKey =
  | "all"
  | "p2p"
  | "o2c"
  | "r2r"
  | "high-risk"
  | "needs-approval"
  | "quick-win"

const DOMAIN_FILTERS = new Set<FilterKey>(["p2p", "o2c", "r2r"])
const TAG_FILTERS = new Set<FilterKey>([
  "high-risk",
  "needs-approval",
  "quick-win",
])

function applyFilter<T extends FeedItem>(items: T[], key: FilterKey): T[] {
  if (key === "all") return items
  if (DOMAIN_FILTERS.has(key)) {
    const dom = key.toUpperCase() as FeedItem["domain"]
    return items.filter((it) => it.domain === dom)
  }
  if (TAG_FILTERS.has(key)) {
    const tag = key as "high-risk" | "needs-approval" | "quick-win"
    return items.filter((it) => it.tags.includes(tag))
  }
  return items
}

export default function AllWorkPage() {
  // useSearchParams triggers a CSR bailout at build time — wrap in Suspense.
  return (
    <React.Suspense fallback={null}>
      <AllWorkPageInner />
    </React.Suspense>
  )
}

function AllWorkPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const base = useBasePath()
  const rewriteHref = useRewriteHref()
  const [chatOpen, setChatOpen] = React.useState(false)
  const activePersonaId = useActivePersona()
  const setPersona = usePersonaStore((s) => s.setPersona)
  const persona = getPersona(activePersonaId)

  const rawFilter = params?.get("filter") ?? null
  const active: FilterKey = isFilterKey(rawFilter) ? rawFilter : "all"

  // Filter by persona first, then by chip — counts on chips reflect the
  // persona-narrowed pool so "P2P · 0" can communicate "this persona has
  // nothing in P2P right now".
  const personaScopedItems = React.useMemo(
    () => filterFeedByPersona(SEED_FEED_PERSONA_AWARE, activePersonaId),
    [activePersonaId],
  )
  const visibleItems = React.useMemo(
    () => applyFilter(personaScopedItems, active),
    [personaScopedItems, active],
  )
  const countFor = React.useCallback(
    (key: FilterKey) => applyFilter(personaScopedItems, key).length,
    [personaScopedItems],
  )

  const distinctWorkflowCount = React.useMemo(() => {
    const seen = new Set<string>()
    for (const it of personaScopedItems)
      seen.add(it.workflow.split(" · ")[0].trim())
    return seen.size
  }, [personaScopedItems])

  // Rough estimate — 5 min/item — keeps the line honest without per-item config
  const estimatedMinutesTotal = personaScopedItems.length * 5

  function setFilter(key: FilterKey) {
    const next = key === "all" ? `${base}/all-work` : `${base}/all-work?filter=${key}`
    router.push(next, { scroll: false })
  }

  return (
    <>
      <WorkspaceHeader onOpenChat={() => setChatOpen(true)} />
      <div className="bg-background border-b px-10 pt-3">
        <PageTabs active="feed" feedCount={personaScopedItems.length} />
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          {/* Header */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <NeoChip />
              <span className="text-muted-foreground text-xs">
                ranked by what needs you most
              </span>
            </div>
            <h2 className="text-foreground text-xl font-semibold tracking-tight">
              {activePersonaId === "all"
                ? "Everything that needs attention today"
                : `${persona.title}'s queue today`}
            </h2>
            <p className="text-muted-foreground text-sm">
              {personaScopedItems.length} items across{" "}
              {distinctWorkflowCount} workflows · est. {estimatedMinutesTotal}{" "}
              min total
              {activePersonaId !== "all" ? (
                <>
                  {" "}
                  ·{" "}
                  <button
                    type="button"
                    onClick={() => setPersona("all")}
                    className="text-primary font-medium hover:underline"
                  >
                    Show all {SEED_FEED.length} ({persona.title} view filters{" "}
                    {SEED_FEED.length - personaScopedItems.length} out)
                  </button>
                </>
              ) : null}
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <FeedFilterChip
              label="All"
              count={countFor("all")}
              active={active === "all"}
              onClick={() => setFilter("all")}
            />
            <FeedFilterChip
              label="P2P"
              count={countFor("p2p")}
              active={active === "p2p"}
              onClick={() => setFilter("p2p")}
            />
            <FeedFilterChip
              label="O2C"
              count={countFor("o2c")}
              active={active === "o2c"}
              onClick={() => setFilter("o2c")}
            />
            <FeedFilterChip
              label="R2R"
              count={countFor("r2r")}
              active={active === "r2r"}
              onClick={() => setFilter("r2r")}
            />
            <Separator orientation="vertical" className="h-5" />
            <FeedFilterChip
              label="High risk"
              count={countFor("high-risk")}
              active={active === "high-risk"}
              onClick={() => setFilter("high-risk")}
            />
            <FeedFilterChip
              label="Needs approval"
              count={countFor("needs-approval")}
              active={active === "needs-approval"}
              onClick={() => setFilter("needs-approval")}
            />
            <FeedFilterChip
              label="Quick wins"
              count={countFor("quick-win")}
              active={active === "quick-win"}
              onClick={() => setFilter("quick-win")}
            />
          </div>

          {/* Rows */}
          {visibleItems.length === 0 ? (
            <div className="text-muted-foreground bg-card flex flex-col gap-2 rounded-lg border border-dashed px-6 py-10 text-center text-sm">
              <div>
                No items match this filter for{" "}
                <span className="text-foreground font-medium">
                  {persona.title}
                </span>
                .
              </div>
              <div className="flex justify-center gap-3">
                {active !== "all" ? (
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="text-primary font-medium hover:underline"
                  >
                    Clear filter
                  </button>
                ) : null}
                {activePersonaId !== "all" ? (
                  <button
                    type="button"
                    onClick={() => setPersona("all")}
                    className="text-primary font-medium hover:underline"
                  >
                    Switch to Vibs (see all)
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {visibleItems.map((item) => {
                const Icon = getIcon(item.icon)
                return (
                  <FeedRow
                    key={item.id}
                    icon={Icon}
                    iconBg={item.iconBg}
                    iconText={item.iconText}
                    workflow={item.workflow}
                    title={item.title}
                    meta={item.meta}
                    urgency={item.urgency}
                    urgencyTone={item.urgencyTone}
                    persona={item.persona}
                    cta={item.cta}
                    ctaTone={item.ctaTone}
                    href={rewriteHref(item.href)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ChatThread
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        context={snapshotBriefing()}
      />
    </>
  )
}

function isFilterKey(value: string | null): value is FilterKey {
  return (
    value === "all" ||
    value === "p2p" ||
    value === "o2c" ||
    value === "r2r" ||
    value === "high-risk" ||
    value === "needs-approval" ||
    value === "quick-win"
  )
}
