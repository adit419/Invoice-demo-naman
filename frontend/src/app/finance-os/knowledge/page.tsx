// app/neoflo-workspace/knowledge/page.tsx
//
// Knowledge Sources surface. Two top-level sections:
//
//   1. Your sources — internal AcmeCo documents (contracts, SOPs, master
//      data) that Neoflo reads to ground every prediction in your reality.
//   2. Neoflo library — four curated packs (Compliance Core, Benchmark
//      Suite, Risk Intelligence, Playbook Library) mapped to pricing tiers.
//
// Persona-filterable via the global persona chip — narrows both grids to
// what matters most for the active role. Each card opens a detail dialog
// showing what's inside, sample signals Neoflo extracts, and which
// workflows the source powers.
"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowRight, Books, Plus } from "@phosphor-icons/react"

import { Button } from "@/components/neoflo-os/ui/button"
import { Separator } from "@/components/neoflo-os/ui/separator"
import { ConnectSourceDialog } from "@/components/neoflo-os/neoflo-workspace/connect-source-dialog"
import { KnowledgeSourceCard } from "@/components/neoflo-os/neoflo-workspace/knowledge-source-card"
import { KnowledgeSourceDialog } from "@/components/neoflo-os/neoflo-workspace/knowledge-source-dialog"
import { NeoChip } from "@/components/neoflo-os/workspace/neo-chip"
import { WorkspaceHeader } from "@/components/neoflo-os/workspace/workspace-header"
import {
  ALL_KNOWLEDGE_SOURCES,
  filterSourcesByPersona,
  getInternalSources,
  getLibrarySourcesByPack,
  getSourceById,
  PACK_META,
  type KnowledgePack,
  type KnowledgeSource,
} from "@/lib/neoflo-os/neoflo-workspace/knowledge"
import { getPersona } from "@/lib/neoflo-os/neoflo-workspace/personas"
import {
  useActivePersona,
  usePersonaStore,
} from "@/lib/neoflo-os/neoflo-workspace/persona-store"
import { ChatThread } from "@/components/neoflo-os/workspace/chat-thread"
import { useGuardedSurface } from "@/lib/neoflo-os/users/permissions"
import { snapshotBriefing } from "@/lib/neoflo-os/workspace/briefing-snapshot"
import { cn } from "@/lib/neoflo-os/utils"

const PACK_ORDER: KnowledgePack[] = [
  "Compliance Core",
  "Benchmark Suite",
  "Risk Intelligence",
  "Playbook Library",
]

export default function KnowledgePage() {
  return (
    <React.Suspense fallback={null}>
      <KnowledgePageInner />
    </React.Suspense>
  )
}

function KnowledgePageInner() {
  const [chatOpen, setChatOpen] = React.useState(false)
  const [activeSource, setActiveSource] =
    React.useState<KnowledgeSource | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [connectOpen, setConnectOpen] = React.useState(false)

  const params = useSearchParams()
  const router = useRouter()
  const activePersonaId = useActivePersona()
  const setPersona = usePersonaStore((s) => s.setPersona)
  const persona = getPersona(activePersonaId)

  const allInternal = React.useMemo(() => getInternalSources(), [])
  const byPack = React.useMemo(() => getLibrarySourcesByPack(), [])

  const visibleInternal = React.useMemo(
    () => filterSourcesByPersona(allInternal, activePersonaId),
    [allInternal, activePersonaId],
  )
  const visibleByPack = React.useMemo(() => {
    const result: Record<KnowledgePack, KnowledgeSource[]> = {
      "Compliance Core": [],
      "Benchmark Suite": [],
      "Risk Intelligence": [],
      "Playbook Library": [],
    }
    for (const p of PACK_ORDER) {
      result[p] = filterSourcesByPersona(byPack[p], activePersonaId)
    }
    return result
  }, [byPack, activePersonaId])

  const totalVisible =
    visibleInternal.length +
    PACK_ORDER.reduce((sum, p) => sum + visibleByPack[p].length, 0)
  const totalAll = ALL_KNOWLEDGE_SOURCES.length

  function openSource(source: KnowledgeSource) {
    setActiveSource(source)
    setDialogOpen(true)
  }

  // Deep-link: ?source=src-vendor-msa opens the dialog for that source.
  React.useEffect(() => {
    const id = params?.get("source")
    if (!id) return
    const found = getSourceById(id)
    if (found) {
      setActiveSource(found)
      setDialogOpen(true)
    }
  }, [params])

  const allowed = useGuardedSurface("knowledge")
  if (!allowed) return null

  // Clear the URL param when the dialog closes so refreshing doesn't reopen.
  function handleDialogChange(open: boolean) {
    setDialogOpen(open)
    if (!open && params?.get("source")) {
      router.replace("/neoflo-workspace/knowledge", { scroll: false })
    }
  }

  function handleUpload() {
    setConnectOpen(true)
  }

  return (
    <>
      <WorkspaceHeader onOpenChat={() => setChatOpen(true)} />

      <div className="flex-1 overflow-auto px-10 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          {/* Page header — plain inline pattern matching every other workflow */}
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <NeoChip />
              <span className="text-muted-foreground text-xs">
                what grounds every Neoflo prediction
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                  Knowledge sources
                </h1>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleUpload}
              >
                <Plus size={14} weight="bold" />
                Connect a source
              </Button>
            </div>
            {activePersonaId !== "all" ? (
              <button
                type="button"
                onClick={() => setPersona("all")}
                className="text-primary self-start text-xs font-medium hover:underline"
              >
                Show all {totalAll} ({persona.title} view shows {totalVisible})
              </button>
            ) : null}
          </header>

          {/* SECTION A — Your sources */}
          <section className="flex flex-col gap-4">
            <SectionHeader
              title="Your sources"
              count={visibleInternal.length}
              totalCount={allInternal.length}
              isFiltered={activePersonaId !== "all"}
            />
            {visibleInternal.length === 0 ? (
              <EmptyState
                message={`No internal sources tagged for ${persona.title}.`}
                onReset={() => setPersona("all")}
                personaActive={activePersonaId !== "all"}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleInternal.map((src) => (
                  <KnowledgeSourceCard
                    key={src.id}
                    source={src}
                    onOpen={openSource}
                  />
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* SECTION B — Neoflo library */}
          <section className="flex flex-col gap-5">
            <SectionHeader
              title="Neoflo library"
              count={PACK_ORDER.reduce(
                (n, p) => n + visibleByPack[p].length,
                0,
              )}
              totalCount={PACK_ORDER.reduce((n, p) => n + byPack[p].length, 0)}
              isFiltered={activePersonaId !== "all"}
            />

            {PACK_ORDER.map((pack) => {
              const entries = visibleByPack[pack]
              if (entries.length === 0) return null
              const meta = PACK_META[pack]
              return (
                <div key={pack} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Books
                      size={14}
                      weight="regular"
                      className="text-muted-foreground"
                    />
                    <h3 className="text-foreground text-sm font-semibold tracking-tight">
                      {pack}
                    </h3>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        meta.pillBg,
                        meta.pillText,
                      )}
                    >
                      {meta.tier === "core"
                        ? "Included"
                        : meta.tier === "pro"
                          ? "Pro"
                          : "Premium"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      · {entries.length}{" "}
                      {entries.length === 1 ? "pack" : "packs"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {entries.map((src) => (
                      <KnowledgeSourceCard
                        key={src.id}
                        source={src}
                        onOpen={openSource}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Upgrade CTA strip — pinned bottom of library section */}
            <div className="bg-primary/5 border-primary/20 mt-2 flex items-center justify-between gap-3 rounded-xl border border-dashed px-5 py-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-foreground text-sm font-semibold">
                  Unlock Pro + Premium packs
                </span>
                <span className="text-muted-foreground text-xs">
                  Benchmark Suite + Playbook Library (Pro) and Risk
                  Intelligence (Premium) add the network-effect data your team
                  can&apos;t build alone.
                </span>
              </div>
              <Button onClick={handleUpload} className="shrink-0">
                Talk to your CSM
                <ArrowRight size={14} weight="bold" />
              </Button>
            </div>
          </section>
        </div>
      </div>

      <KnowledgeSourceDialog
        source={activeSource}
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        onConnectMore={() => setConnectOpen(true)}
      />

      <ConnectSourceDialog open={connectOpen} onOpenChange={setConnectOpen} />

      <ChatThread
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        context={snapshotBriefing()}
      />
    </>
  )
}

function SectionHeader({
  title,
  count,
  totalCount,
  isFiltered,
}: {
  title: string
  count: number
  totalCount: number
  isFiltered: boolean
}) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-foreground text-base font-semibold tracking-tight">
        {title}
      </h2>
      <span className="text-muted-foreground text-xs">
        {isFiltered ? `${count} of ${totalCount} for your view` : `${count}`}
      </span>
    </div>
  )
}

function EmptyState({
  message,
  onReset,
  personaActive,
}: {
  message: string
  onReset: () => void
  personaActive: boolean
}) {
  return (
    <div className="text-muted-foreground bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center text-sm">
      <div>{message}</div>
      {personaActive ? (
        <button
          type="button"
          onClick={onReset}
          className="text-primary font-medium hover:underline"
        >
          Switch to Vibs (see all)
        </button>
      ) : null}
    </div>
  )
}
