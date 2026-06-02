/**
 * Ask Neoflo — full chat UI, ported from the Flask app.
 *
 * Layout (left → right):
 *   [Chat-history sidebar] | [Messages + input] | [PEV trace panel]
 *
 * API calls go to /api/ask-neoflo/* which is proxied to the Flask backend.
 */

import React, {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent,
} from "react"
import { withAuthGuard } from "@/components/AuthGuard"

// ─────────────────────────────────────────── types ───────────────────────────

interface Msg {
  id: string
  role: "user" | "bot"
  text: string          // "__TYPING__" → loading indicator
  ms?: number
  traceIdx?: number | null
  invNums?: string[]
  vendorNames?: string[]
  question?: string
}

interface TraceStep { step: string; [k: string]: unknown }
interface TraceEntry { question: string; trace: TraceStep[] }
interface SideChat   { id: string; title: string }

// ──────────────────────────────────────── constants ──────────────────────────

const API      = (p: string) => `/api/ask-neo/${p}`
const SID_KEY       = "ask_neoflo_sid"
const MSGS_KEY      = "ask_neoflo_msgs"
const CHATS_KEY     = "ask_neoflo_chats"
const ACTIVE_CHAT_KEY = "ask_neoflo_active_chat"

const STEP_LABELS: Record<string, string> = {
  router:        "Intent Detection",
  cache_hit:     "Cache Hit",
  cache_near:    "Cache Near-Match",
  pev_plan:      "Planner",
  pev_execute:   "Builder",
  pev_verify:    "Verifier",
  pev_retry:     "Retry",
  pev_run_query: "Run Query",
  pev_narrate:   "Aggregator",
}

const PIPELINE_STAGES = [
  "Planning query…",
  "Building Cypher…",
  "Verifying query…",
  "Running query…",
  "Composing answer…",
]

// ─────────────────────────────────────────── helpers ─────────────────────────

function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function metaRow(k: string, v: string) {
  return `<div class="anf-mr"><span class="anf-mk">${k}:</span> <span class="anf-mv">${esc(v)}</span></div>`
}

const CY_KW = /\b(MATCH|OPTIONAL|WHERE|RETURN|WITH|ORDER BY|LIMIT|AS|AND|OR|NOT|IN|IS|NULL|COLLECT|DISTINCT|COUNT|SUM|AVG|MIN|MAX|HEAD|TOLOWER|SUBSTRING|DURATION|DATE|ROUND|SIZE|ANY|MERGE|SET|CREATE|DELETE|REMOVE|UNION|ON|CASE|WHEN|THEN|ELSE|END|DESC|ASC|UNWIND|RANGE|FOREACH|CALL|YIELD|toFloat|toString)\b/gi

function highlightCypher(raw: string): string {
  let h = esc(raw)
  h = h.replace(/'([^']*)'/g,  `<span class="anf-cy-s">&#39;$1&#39;</span>`)
  h = h.replace(/(:[A-Z]\w+)/g, `<span class="anf-cy-l">$1</span>`)
  h = h.replace(/(\$\w+)/g,     `<span class="anf-cy-v">$1</span>`)
  h = h.replace(CY_KW, m => `<span class="anf-cy-k">${m}</span>`)
  return h
}

function badgeFor(step: TraceStep): { text: string; cls: string } {
  const n = step.step as string
  const intentLbl: Record<string,string> = {
    faq: "Source", invoice: "Invoice Query",
    greeting: "Greeting", off_topic: "Off-topic",
  }
  if (n === "router")        return { text: intentLbl[step.intent as string] ?? (step.intent as string), cls: "b-default" }
  if (n === "cache_hit")     return { text: `${step.similarity} sim`, cls: "b-ok" }
  if (n === "cache_near")    return { text: `~${step.similarity} sim`, cls: "b-med" }
  if (n === "pev_plan")      return { text: `${step.complexity} · ${step.step_count} step(s)`, cls: `b-${step.complexity ?? "default"}` }
  if (n === "pev_execute")   return { text: `step ${(step.step_index as number) + 1} · attempt ${step.attempt}`, cls: "b-default" }
  if (n === "pev_verify")    return { text: step.valid ? "valid" : "invalid", cls: step.valid ? "b-ok" : "b-fail" }
  if (n === "pev_retry")     return { text: `attempt ${step.attempt}`, cls: "b-fail" }
  if (n === "pev_run_query") return { text: `${step.rows_returned} rows`, cls: "b-default" }
  if (n === "pev_narrate")   return { text: "done", cls: "b-default" }
  return { text: "", cls: "b-default" }
}

function renderTraceBody(step: TraceStep): string {
  const n = step.step as string
  let h = ""
  const intentLbl: Record<string,string> = { faq: "Source", invoice: "Invoice Query" }

  if (n === "router") {
    h += metaRow("intent", intentLbl[step.intent as string] ?? (step.intent as string))
    if (step.original && step.rewritten && step.original !== step.rewritten) {
      h += metaRow("original", step.original as string) + metaRow("rewritten", step.rewritten as string)
    } else if (step.rewritten) {
      h += metaRow("query", step.rewritten as string)
    }
  } else if (n === "cache_hit" || n === "cache_near") {
    h += metaRow("similarity", String(step.similarity)) + metaRow("matched", step.matched_question as string)
  } else if (n === "pev_plan") {
    h += metaRow("intent",   step.intent as string)
      +  metaRow("entities", ((step.entities as string[]) || []).join(", "))
      +  metaRow("metrics",  ((step.metrics  as string[]) || []).join(", "))
  } else if (n === "pev_execute" || n === "pev_run_query") {
    if (step.cypher) {
      h += `<div class="anf-cy-lbl">Cypher</div><div class="anf-cy-blk">${highlightCypher(step.cypher as string)}</div>`
    }
    if (step.step_description) h += metaRow("step", step.step_description as string)
    if (step.rows_returned !== undefined) h += metaRow("rows", String(step.rows_returned))
    const prev = step.preview as unknown[]
    if (prev?.length) h += `<pre class="anf-tpre">${esc(JSON.stringify(prev, null, 2))}</pre>`
  } else if (n === "pev_verify") {
    h += metaRow("valid", String(step.valid))
    const iss = step.issues as string[]
    if (iss?.length) h += `<pre class="anf-tpre">${esc(iss.join("\n"))}</pre>`
  } else if (n === "pev_retry") {
    h += metaRow("attempt", String(step.attempt))
    const iss = step.issues as string[]
    if (iss?.length) h += `<pre class="anf-tpre">${esc(iss.join("\n"))}</pre>`
  } else {
    const { step: _, ...rest } = step
    if (Object.keys(rest).length)
      h += `<pre class="anf-tpre">${esc(JSON.stringify(rest, null, 2))}</pre>`
  }
  return h
}

function renderMarkdown(raw: string, invNums: string[], vendors: string[]): string {
  let text = raw, srcHtml = ""

  // Pull out "Sources: …" suffix before rendering
  const srcRe = /(?:\r?\n)+\s*(sources?:[^\n]+?)\s*$/i
  const sm = text.match(srcRe)
  if (sm) {
    text = text.slice(0, sm.index!)
    const col   = sm[1].indexOf(":")
    const label = sm[1].slice(0, col + 1)
    let rest = sm[1].slice(col + 1).trim()
    let desc = ""
    const dm = rest.match(/\(([^)]+)\)\s*$/)
    if (dm) { desc = dm[1]; rest = rest.slice(0, dm.index!).trim() }
    const chips = rest.split(/\s*,\s*/).map(c => c.trim()).filter(Boolean)
    const chipsHtml = chips
      .map(c => `<a href="#" class="anf-src-chip" data-inv="${esc(c)}">${esc(c)}</a>`)
      .join("")
    srcHtml = `<div class="anf-src"><span class="anf-src-lbl">${esc(label)}</span> `
      + `<span class="anf-src-chips">${chipsHtml}</span>`
      + (desc ? `<span class="anf-src-desc">${esc(desc)}</span>` : "")
      + `</div>`
  }

  // Convert markdown lines to HTML (tables + text)
  const lines = text.split("\n")
  let html = "", inTable = false, tHtml = ""
  for (const line of lines) {
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      if (!inTable) { inTable = true; tHtml = "<table>" }
      const cells = line.trim().slice(1, -1).split("|").map(c => c.trim())
      if (cells.every(c => /^[-:]+$/.test(c))) continue
      const isHdr = !tHtml.includes("<tr>")
      const tag   = isHdr ? "th" : "td"
      tHtml += "<tr>" + cells.map(c => {
        const ch = esc(c).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        return `<${tag}>${ch}</${tag}>`
      }).join("") + "</tr>"
    } else {
      if (inTable) { html += `<div class="anf-tw">${tHtml}</table></div>`; tHtml = ""; inTable = false }
      html += esc(line) + "\n"
    }
  }
  if (inTable) html += `<div class="anf-tw">${tHtml}</table></div>`

  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, "<br>")
    .replace(/(<br>|^)(<strong>Note:<\/strong>[^<]*)(?=<br>|$)/g,
      '$1<div class="anf-note">$2</div>')

  // Replace only in text nodes (not inside HTML tags) to avoid breaking existing links
  function replaceText(h: string, re: RegExp, rep: string) {
    return h.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, txt) => {
      if (tag) return tag
      if (txt) return txt.replace(re, rep)
      return m
    })
  }

  // Clickable invoice numbers
  if (invNums.length) {
    ;[...invNums].sort((a, b) => b.length - a.length).forEach(inv => {
      const e = inv.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      html = replaceText(html,
        new RegExp(`(?<![\\w/-])(${e})(?![\\w/-])`, "g"),
        `<a href="#" class="anf-inv" data-inv="${esc(inv)}">$1</a>`)
    })
  }

  // Clickable vendor names
  if (vendors.length) {
    ;[...vendors].sort((a, b) => b.length - a.length).forEach(v => {
      if (!v) return
      const hv = esc(v), e = hv.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      html = replaceText(html,
        new RegExp(`(?<![\\w-])(${e})(?![\\w-])`, "g"),
        `<a href="#" class="anf-vnd" data-vendor="${hv}">$1</a>`)
    })
  }

  return html + srcHtml
}

// ──────────────────────────────────────── component ──────────────────────────

function AskNeoFloPage() {
  const [msgs,          setMsgs]          = useState<Msg[]>(() => {
    try { return JSON.parse(localStorage.getItem(MSGS_KEY) || "[]") } catch { return [] }
  })
  const [input,         setInput]         = useState("")
  const [busy,          setBusy]          = useState(false)
  const [traceOpen,     setTraceOpen]     = useState(true)
  const [lsideOpen,     setLsideOpen]     = useState(true)
  const [traceSteps,    setTraceSteps]    = useState<TraceStep[]>([])
  const [traceLabel,    setTraceLabel]    = useState("PEV Trace")
  const [traceCount,    setTraceCount]    = useState(0)
  const [activeCtx,     setActiveCtx]     = useState<Record<string,string>>({})
  const [sideChats,     setSideChats]     = useState<SideChat[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHATS_KEY) || "[]") } catch { return [] }
  })
  const [traceHist,     setTraceHist]     = useState<TraceEntry[]>([])
  const [activeTrace,   setActiveTrace]   = useState(-1)
  const [stageLabel,    setStageLabel]    = useState("Thinking…")
  const [testQsOpen,    setTestQsOpen]    = useState(false)
  const [testQs,        setTestQs]        = useState<{template:string; question:string}[]>([])
  const [expanded,      setExpanded]      = useState<Set<number>>(new Set())

  const msgsRef       = useRef<HTMLDivElement>(null)
  const inputRef      = useRef<HTMLTextAreaElement>(null)
  const sidRef        = useRef("")
  const abortRef      = useRef<AbortController | null>(null)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const stageIdxRef   = useRef(0)

  // ── Init session from localStorage ───────────────────────────────────────
  useEffect(() => {
    const s = localStorage.getItem(SID_KEY)
    if (s) sidRef.current = s
  }, [])

  // ── Persist messages to localStorage ─────────────────────────────────────
  useEffect(() => {
    // Don't save while a message is still streaming (has __TYPING__ placeholder)
    const hasTyping = msgs.some(m => m.text === "__TYPING__")
    if (!hasTyping) {
      try { localStorage.setItem(MSGS_KEY, JSON.stringify(msgs)) } catch { /* quota */ }
    }
  }, [msgs])

  // ── Persist side chats list ───────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(CHATS_KEY, JSON.stringify(sideChats)) } catch { /* quota */ }
  }, [sideChats])

  // ── Auto-scroll messages ──────────────────────────────────────────────────
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }, [msgs])

  // ── Auto-expand last trace step ───────────────────────────────────────────
  useEffect(() => {
    if (traceSteps.length > 0) setExpanded(new Set([traceSteps.length - 1]))
  }, [traceSteps])

  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  function startPipeline() {
    stageIdxRef.current = 0
    setStageLabel(PIPELINE_STAGES[0])
    timerRef.current = setInterval(() => {
      stageIdxRef.current = Math.min(stageIdxRef.current + 1, PIPELINE_STAGES.length - 1)
      setStageLabel(PIPELINE_STAGES[stageIdxRef.current])
    }, 2800)
  }

  // ── Send message (SSE streaming) ──────────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || busy) return

    setBusy(true)
    setInput("")
    if (inputRef.current) inputRef.current.style.height = "auto"

    const typingId = crypto.randomUUID()
    setMsgs(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: msg },
      { id: typingId, role: "bot", text: "__TYPING__" },
    ])
    setStageLabel("Thinking…")
    setTraceSteps([])
    setTraceCount(0)

    // Register in sidebar on first message
    setSideChats(prev =>
      prev.length === 0
        ? [{ id: sidRef.current || typingId, title: msg.length > 36 ? msg.slice(0,36)+"…" : msg }]
        : prev
    )

    const ctrl = new AbortController()
    abortRef.current = ctrl
    const dec    = new TextDecoder()
    let buf = ""
    let liveTrace: TraceStep[] = []
    let traceIdx: number | null = null
    let pipelineStarted = false

    function handleChunk(c: Record<string, unknown>) {
      if (c.type === "trace") {
        const step = c.step as TraceStep
        // Handle GTM status events forwarded as trace steps
        if (step.step === "status") {
          const statusMsg = step.message as string
          if (statusMsg === "forming" && !pipelineStarted) {
            pipelineStarted = true
            startPipeline()
          } else if (statusMsg === "thinking") {
            setStageLabel("Thinking…")
          }
          return
        }
        if (step.step === "pev_plan" && !pipelineStarted) { pipelineStarted = true; startPipeline() }
        liveTrace = [...liveTrace, step]
        setTraceSteps([...liveTrace])
        setTraceCount(liveTrace.length)

      } else if (c.type === "done") {
        sidRef.current = (c.session_id as string) || sidRef.current
        localStorage.setItem(SID_KEY, sidRef.current)
        clearTimer()

        const trace = (c.trace as TraceStep[]) || liveTrace
        const hasMeaningful = trace.some(t =>
          ["pev_plan","cache_hit","cache_near"].includes(t.step as string)
        )
        if (hasMeaningful) {
          setTraceHist(prev => {
            traceIdx = prev.length
            setActiveTrace(traceIdx)
            setTraceLabel(`Q${traceIdx + 1}: ${msg.length > 32 ? msg.slice(0,32)+"…" : msg}`)
            setTraceSteps(trace)
            setTraceCount(trace.length)
            return [...prev, { question: msg, trace }]
          })
        }

        // Harvest invoice numbers + vendor names from run-query steps
        const invNums: string[] = [], vendorNames: string[] = []
        for (const st of trace) {
          if (st.step !== "pev_run_query") continue
          const nums: string[] = (st.invoice_numbers as string[])?.length
            ? st.invoice_numbers as string[]
            : ((st.preview as Record<string,unknown>[]) || [])
                .map(r => String(r.invoice_number || r["i.invoice_number"] || "")).filter(Boolean)
          nums.forEach(n => { if (!invNums.includes(n)) invNums.push(n) })
          const vns: string[] = (st.vendor_names as string[])?.length
            ? st.vendor_names as string[]
            : ((st.preview as Record<string,unknown>[]) || [])
                .map(r => String(r.vendor_name || r["v.name"] || "")).filter(Boolean)
          vns.forEach(v => { if (!vendorNames.includes(v)) vendorNames.push(v) })
        }

        setMsgs(prev => prev.map(m => m.id === typingId ? {
          id: typingId, role: "bot" as const,
          text: c.answer as string,
          ms: (c.generated_in_ms as number) || 0,
          traceIdx, invNums, vendorNames, question: msg,
        } : m))
        setActiveCtx((c.active_entities as Record<string,string>) || {})

      } else if (c.type === "error") {
        clearTimer()
        setMsgs(prev => prev.map(m => m.id === typingId ? {
          id: typingId, role: "bot" as const, text: "⚠️ Error: " + c.message,
        } : m))
      }
    }

    try {
      const res = await fetch(API("chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, session_id: sidRef.current }),
        signal: ctrl.signal,
      })
      const reader = res.body!.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
          if (!line.startsWith("data: ")) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try { handleChunk(JSON.parse(raw)) } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        clearTimer()
        setMsgs(prev => prev.map(m => m.id === typingId ? {
          id: typingId, role: "bot" as const,
          text: "⚠️ Network error: " + (e as Error).message,
        } : m))
      }
    } finally {
      setBusy(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }, [input, busy])

  function stopStream() {
    abortRef.current?.abort()
    clearTimer()
    setBusy(false)
    setMsgs(prev => {
      const last = prev[prev.length - 1]
      if (last?.text === "__TYPING__")
        return [...prev.slice(0,-1), { ...last, text: "Query stopped." }]
      return [...prev, { id: crypto.randomUUID(), role: "bot", text: "Query stopped." }]
    })
  }

  async function newChat() {
    if (sidRef.current) {
      fetch(API("reset"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sidRef.current }),
      }).catch(() => {})
    }
    sidRef.current = crypto.randomUUID()
    localStorage.setItem(SID_KEY, sidRef.current)
    localStorage.removeItem(MSGS_KEY)
    setMsgs([]); setTraceSteps([]); setTraceCount(0)
    setActiveCtx({}); setTraceHist([]); setActiveTrace(-1)
    setTraceLabel("PEV Trace")
  }

  const FAQ_QUESTIONS = [
    { template: "simple", question: "What is the total spend and WHT for Deloitte Touche Solutions across all invoices?" },
    { template: "simple", question: "Give me a spend summary across all vendors." },
    { template: "simple", question: "Which vendor had the highest total spend in April 2026?" },
    { template: "medium", question: "Which vendors sent more than 2 invoices, and how many did each send?" },
    { template: "medium", question: "List all invoices from Deloitte Touche Solutions with their dates and amounts." },
    { template: "medium", question: "Which vendors billed in USD and what was their total spend?" },
    { template: "medium", question: "Which invoices had a total amount before VAT greater than 10,000,000?" },
    { template: "medium", question: "Which invoices had withholding tax applied?" },
    { template: "complex", question: "What is the average ingestion lag between invoice date and ingestion date across all vendors?" },
    { template: "complex", question: "Show the monthly invoice count and total spend breakdown for 2026." },
    { template: "complex", question: "Give me a month-by-month breakdown of invoices and WHT for Deloitte Touche Solutions." },
    { template: "complex", question: "Which vendors have invoices spanning more than one month?" },
    { template: "agentic", question: "What is the total spend for Deloitte Touche Solutions and the payment terms for GS Paperboard & Packaging?" },
    { template: "agentic", question: "What is the total spend for Meta Platforms Ireland Limited and the invoice count for PT Google Indonesia?" },
    { template: "agentic", question: "List invoices above 10,000,000 IDR and show the total WHT for vendors that had withholding tax applied." },
    { template: "agentic", question: "What is the total spend on invoices backed by a PO versus invoices with no PO reference? How many invoices fall in each category?" },
    { template: "medium", question: "Which vendor has the highest total spend on invoices that have no PO number attached?" },
    { template: "complex", question: "Which vendors have sent some invoices with a PO reference and others without? List them with the count of each." },
    { template: "simple", question: "What is the total VAT (PPN) amount across all invoices that have a Faktur Pajak?" },
    { template: "medium", question: "List all invoices that have a Faktur Pajak number, along with their taxable amount (DPP) and VAT amount (PPN)." },
    { template: "agentic", question: "Which invoices have a Faktur Pajak attached and which do not? Show the total spend for each group." },
  ]

  async function openTestQs() {
    setTestQsOpen(true)
    if (testQs.length === 0) {
      // Use hardcoded FAQ questions; fall back to API if available
      try {
        const apiQs = await (await fetch(API("test-questions"))).json()
        setTestQs(apiQs.length ? apiQs : FAQ_QUESTIONS)
      } catch {
        setTestQs(FAQ_QUESTIONS)
      }
    }
  }

  async function openPdf(apiUrl: string, errorMsg: string, el: HTMLElement) {
    el.style.opacity = "0.6"
    const win = window.open("", "_blank")
    if (win) win.document.write("<html><body style='font-family:sans-serif;padding:2em'>Loading PDF…</body></html>")
    try {
      const d = await (await fetch(apiUrl)).json()
      if (d.url) { if (win) win.location.href = d.url; else window.open(d.url, "_blank") }
      else { if (win) win.close(); alert(errorMsg) }
    } catch (e) {
      if (win) win.close()
      alert("Could not fetch PDF: " + (e as Error).message)
    } finally { el.style.opacity = "1" }
  }

  function handleBubbleClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement
    if (t.dataset.inv) {
      e.preventDefault()
      openPdf(API(`invoice-pdf?invoice_number=${encodeURIComponent(t.dataset.inv)}`),
        "PDF not available for " + t.dataset.inv, t)
    } else if (t.dataset.vendor) {
      e.preventDefault()
      openPdf(API(`vendor-pdf?vendor_name=${encodeURIComponent(t.dataset.vendor)}`),
        "No PDF available for " + t.dataset.vendor, t)
    }
  }

  function recallTrace(idx: number) {
    const entry = traceHist[idx]
    if (!entry) return
    setTraceSteps(entry.trace)
    setTraceCount(entry.trace.length)
    setActiveTrace(idx)
    const q = entry.question
    setTraceLabel(`Q${idx + 1}: ${q.length > 32 ? q.slice(0,32)+"…" : q}`)
    if (!traceOpen) setTraceOpen(true)
  }

  function toggleStep(i: number) {
    setExpanded(prev => {
      const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n
    })
  }

  const ctxParts = Object.entries(activeCtx).filter(([, v]) => v)

  const testQsGrouped = React.useMemo(() => {
    const g: Record<string, typeof testQs> = {}
    testQs.forEach(q => { if (!g[q.template]) g[q.template] = []; g[q.template].push(q) })
    return g
  }, [testQs])

  // ─────────────────────────────────── render ────────────────────────────────

  return (
    <>
      {/* Scoped styles — anf- prefix avoids collisions with app globals */}
      <style>{CSS}</style>

      <div className="anf-root">

        {/* ── Chat-history sidebar ───────────────────────────────────────── */}
        <aside className={`anf-lside${lsideOpen ? "" : " anf-lside-col"}`}>
          <div className="anf-lside-top">
            <img src="/neoflo-logo.svg" alt="NeoFlo" className="anf-brand-logo" />
            <button className="anf-icon-btn" onClick={() => setLsideOpen(v => !v)} title="Toggle sidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                   strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          </div>

          <button className="anf-new-chat" onClick={newChat}>
            <span className="anf-nc-plus">+</span>
            {lsideOpen && <span>New Chat</span>}
          </button>

          {lsideOpen && (
            <div className="anf-chat-list">
              <div className="anf-list-lbl">Your chats</div>
              <div className="anf-list-lbl anf-list-lbl-muted">Today</div>
              {sideChats.length === 0
                ? <div className="anf-chat-empty">No chats yet</div>
                : sideChats.map(c => (
                    <div key={c.id} className="anf-chat-item anf-chat-item-active" title={c.title}>
                      <span className="anf-chat-title">{c.title}</span>
                    </div>
                  ))
              }
            </div>
          )}
        </aside>

        {/* ── Right area ────────────────────────────────────────────────── */}
        <div className="anf-right">

          {/* Header */}
          <header className="anf-header">
            <div className="anf-brand">Ask <span>Neo</span></div>
            <div className="anf-header-r">
              <button
                className="anf-header-btn"
                onClick={() => openTestQs()}
                title="Frequently Asked Questions"
              >
                FAQ
              </button>
            </div>
          </header>

          {/* Main content */}
          <div className="anf-main">

            {/* Chat panel */}
            <div className="anf-chat-panel">
              <div className="anf-messages" ref={msgsRef}>
                {msgs.length === 0 ? (
                  <div className="anf-empty">
                    <img src="https://framerusercontent.com/images/5GeOj2lMEsjJztk3pYdbgiEwGXk.png" alt="NeoFlo" className="anf-empty-logo" />
                    <h2>How can I <span>help you</span> today?</h2>
                    <p>Ask Neo turns your invoice archive into instant answers. Type your query to get started.</p>
                  </div>
                ) : msgs.map(msg => (
                  <div key={msg.id} className={`anf-msg${msg.role === "user" ? " anf-msg-u" : " anf-msg-b"}`}>
                    {msg.role === "bot" && (
                      <div className={`anf-avatar${msg.text === "__TYPING__" ? " anf-avatar-pulse" : ""}`}>
                        <img src="https://framerusercontent.com/images/5GeOj2lMEsjJztk3pYdbgiEwGXk.png" alt="NF" />
                      </div>
                    )}
                    <div className="anf-bubble-col">
                      <div
                        className={`anf-bubble${msg.role === "user" ? " anf-bubble-u" : " anf-bubble-b"}`}
                        onClick={msg.role === "bot" ? handleBubbleClick : undefined}
                      >
                        {msg.text === "__TYPING__" ? (
                          <div className="anf-typing-wrap">
                            <div className="anf-typing">
                              <div className="anf-dot" /><div className="anf-dot" /><div className="anf-dot" />
                            </div>
                            <span className="anf-stage">{stageLabel}</span>
                          </div>
                        ) : (
                          <div dangerouslySetInnerHTML={{
                            __html: renderMarkdown(msg.text, msg.invNums ?? [], msg.vendorNames ?? [])
                          }} />
                        )}
                      </div>

                      {msg.role === "bot" && msg.text !== "__TYPING__" && (
                        <>
                          {(msg.ms ?? 0) > 0 && (
                            <div className="anf-bot-meta">
                              Generated in {((msg.ms ?? 0) / 1000).toFixed(1)}s
                            </div>
                          )}
                          <div className="anf-bot-actions">
                            <button className="anf-act-btn" title="Regenerate"
                              onClick={() => { if (msg.question && !busy) sendMessage(msg.question) }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                                   strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                                <path d="M21 3v5h-5" />
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                                <path d="M8 16H3v5" />
                              </svg>
                            </button>
                            {msg.traceIdx !== null && msg.traceIdx !== undefined && (
                              <button
                                className={`anf-act-btn${activeTrace === msg.traceIdx ? " anf-act-btn-active" : ""}`}
                                title="View trace for this query"
                                onClick={() => recallTrace(msg.traceIdx!)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                                     strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
                                  <polyline points="16 18 22 12 16 6" />
                                  <polyline points="8 6 2 12 8 18" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>


              {/* Input area */}
              <div className="anf-input-area">
                <div className="anf-input-row">
                  <textarea
                    ref={inputRef}
                    className="anf-textarea"
                    value={input}
                    onChange={e => {
                      setInput(e.target.value)
                      e.target.style.height = "auto"
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
                    }}
                    placeholder="Ask about invoices, vendors, amounts, POs…"
                    rows={1}
                    onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
                        e.preventDefault(); sendMessage()
                      }
                    }}
                  />
                  {busy ? (
                    <button className="anf-stop-btn" onClick={stopStream}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                      </svg>
                    </button>
                  ) : (
                    <button className="anf-send-btn" onClick={() => sendMessage()} disabled={!input.trim()}>
                      ▶
                    </button>
                  )}
                </div>
                <div className="anf-hint">Enter to send · Shift+Enter for new line</div>
              </div>
            </div>


          </div>
        </div>
      </div>

      {/* ─── Test Questions modal ──────────────────────────────────────────── */}
      {testQsOpen && (
        <div className="anf-modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setTestQsOpen(false) }}>
          <div className="anf-modal">
            <div className="anf-modal-hdr">
              <h2>FAQ</h2>
              <button className="anf-modal-close" onClick={() => setTestQsOpen(false)}>×</button>
            </div>
            <div className="anf-modal-body">
              {Object.entries(testQsGrouped).map(([tmpl, qs]) => (
                <div key={tmpl} className="anf-tq-group">
                  <div className="anf-tq-lbl">{tmpl}</div>
                  {qs.map((q, i) => (
                    <div key={i} className="anf-tq-card">
                      <div className="anf-tq-q">{q.question}</div>
                      <button className="anf-tq-try"
                        onClick={() => { setTestQsOpen(false); sendMessage(q.question) }}>
                        Try this →
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default withAuthGuard(AskNeoFloPage)

// ──────────────────────────────────────────── CSS ─────────────────────────────
// All classes are prefixed "anf-" to avoid conflicts with app globals.

const CSS = `
/* ── Layout ─────────────────────────────────────────────────────────────── */
.anf-root {
  display:flex; height:100vh; width:100%;
  font-family:'Inter','Segoe UI',system-ui,sans-serif;
  color:#0f172a; background:#fff; overflow:hidden;
}

/* ── Left sidebar ──────────────────────────────────────────────────────── */
.anf-lside {
  width:230px; flex-shrink:0; background:#fff;
  border-right:1px solid #e2e8f0;
  display:flex; flex-direction:column;
  transition:width .2s ease; overflow:hidden;
}
.anf-lside-col { width:56px; }
.anf-lside-top {
  padding:14px 14px; display:flex; align-items:center;
  justify-content:space-between; gap:6px; flex-shrink:0;
  border-bottom:1px solid #e2e8f0;
}
.anf-lside-col .anf-lside-top { flex-direction:column; padding:14px 8px; gap:10px; }
.anf-brand-logo { height:26px; width:auto; }
.anf-icon-btn {
  background:transparent; border:1px solid transparent;
  width:30px; height:30px; border-radius:7px;
  display:inline-flex; align-items:center; justify-content:center;
  cursor:pointer; color:#64748b; transition:all .15s; padding:0;
}
.anf-icon-btn:hover { background:#f1f5f9; color:#274B95; }
.anf-new-chat {
  margin:12px 14px; padding:10px 14px;
  background:#274B95; color:#fff; border:none; border-radius:9px;
  font-size:13px; font-weight:600; cursor:pointer;
  display:flex; align-items:center; justify-content:center; gap:6px;
  transition:background .15s; font-family:inherit; flex-shrink:0;
}
.anf-new-chat:hover { background:#041C4C; }
.anf-lside-col .anf-new-chat { margin:10px auto; padding:10px 0; width:40px; }
.anf-nc-plus { font-size:16px; line-height:1; }
.anf-chat-list { flex:1; overflow-y:auto; padding:0 8px 12px; }
.anf-list-lbl {
  padding:8px 8px 4px; font-size:11px; color:#64748b;
  font-weight:600; letter-spacing:.4px;
}
.anf-list-lbl-muted { color:#94a3b8; font-weight:500; font-size:10px; }
.anf-chat-item {
  padding:6px 8px 6px 10px; border-radius:8px; cursor:pointer;
  font-size:13px; color:#0f172a; transition:background .12s;
  display:flex; align-items:center;
}
.anf-chat-item:hover { background:#f1f5f9; }
.anf-chat-item-active { background:#eff6ff; color:#274B95; font-weight:500; }
.anf-chat-title {
  flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.anf-chat-empty { padding:8px; color:#94a3b8; font-size:12px; font-style:italic; }

/* ── Right area ─────────────────────────────────────────────────────────── */
.anf-right {
  flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden;
}
.anf-header {
  background:#fff; border-bottom:1px solid #e2e8f0;
  padding:0 18px; height:54px; flex-shrink:0;
  display:flex; align-items:center; justify-content:space-between;
}
.anf-brand {
  font-size:18px; font-weight:700; color:#0f172a; letter-spacing:-.4px;
}
.anf-brand span { color:#60a5fa; }
.anf-header-r { display:flex; align-items:center; gap:6px; }
.anf-header-btn {
  padding:6px 14px; border-radius:7px; border:1px solid #274B95;
  font-size:12px; font-weight:600; cursor:pointer;
  background:#274B95; color:#fff; font-family:inherit;
  transition:all 0.15s; letter-spacing:0.3px;
}
.anf-header-btn:hover { background:#041C4C; border-color:#041C4C; }
.anf-hdr-btn {
  padding:5px 12px; border-radius:7px; border:1px solid rgba(255,255,255,0.15);
  font-size:12px; cursor:pointer; background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.7);
  font-family:inherit; transition:all .15s;
}
.anf-hdr-btn:hover { background:rgba(255,255,255,0.12); color:#fff; }
.anf-main {
  display:flex; flex:1 1 0; overflow:hidden; min-height:0;
}

/* ── Chat panel ─────────────────────────────────────────────────────────── */
.anf-chat-panel {
  flex:1; display:flex; flex-direction:column;
  min-width:0; background:#fff;
}
.anf-messages {
  flex:1; overflow-y:auto; padding:28px 32px;
  display:flex; flex-direction:column; gap:16px; min-height:0;
}
.anf-empty {
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  text-align:center; padding:40px 20px; margin:auto;
}
.anf-empty-logo { width:64px; height:64px; margin-bottom:20px; border-radius:50%; object-fit:cover; }
.anf-empty h2 {
  font-size:26px; font-weight:600; color:#0f172a;
  margin:0 0 10px; letter-spacing:-.5px;
}
.anf-empty h2 span { color:#274B95; }
.anf-empty p { font-size:14px; color:#64748b; max-width:440px; line-height:1.6; margin:0; }

/* ── Messages ───────────────────────────────────────────────────────────── */
.anf-msg { display:flex; gap:10px; }
.anf-msg-u { align-self:flex-end; justify-content:flex-end; max-width:720px; }
.anf-msg-b { align-self:flex-start; max-width:min(880px,calc(100% - 42px)); }
.anf-avatar {
  width:32px; height:32px; border-radius:50%;
  background:#fff; border:2px solid #274B95; padding:2px;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  overflow:hidden;
}
.anf-avatar img { width:100%; height:100%; object-fit:cover; }
.anf-avatar-pulse { animation:anf-pulse 1.4s ease-in-out infinite; }
@keyframes anf-pulse {
  0%,100% { box-shadow:0 0 0 0 rgba(96,165,250,.4); border-color:#60a5fa; }
  50%      { box-shadow:0 0 0 6px rgba(96,165,250,0); border-color:#3b82f6; }
}
.anf-bubble-col { display:flex; flex-direction:column; min-width:0; }
.anf-bubble { padding:12px 16px; border-radius:14px; font-size:14px; line-height:1.65; }
.anf-bubble-u {
  background:#274B95; color:#fff;
  border-radius:14px 4px 14px 14px;
}
.anf-bubble-b {
  background:#fff; border:1px solid #e2e8f0; border-left:3px solid #274B95;
  border-radius:0 14px 14px 14px;
  box-shadow:0 2px 8px rgba(0,0,0,.06); color:#1e293b;
  padding:16px 20px; overflow:hidden;
}
.anf-bubble p { margin:0 0 10px; }
.anf-bubble p:last-of-type { margin-bottom:0; }
.anf-bubble strong { color:#0f172a; font-weight:600; }

/* Tables inside bubbles */
.anf-tw {
  overflow-x:auto; margin:12px 0; border-radius:10px;
  border:1px solid rgba(255,255,255,0.1); box-shadow:0 1px 4px rgba(0,0,0,.2);
}
.anf-tw table { border-collapse:collapse; width:100%; font-size:13px; min-width:400px; }
.anf-tw th {
  background:linear-gradient(135deg,#274B95,#1d4ed8); color:#fff;
  padding:9px 14px; text-align:left; font-weight:600; white-space:nowrap;
}
.anf-tw th:first-child { border-radius:8px 0 0 0; }
.anf-tw th:last-child  { border-radius:0 8px 0 0; }
.anf-tw td { padding:8px 14px; border-bottom:1px solid #f1f5f9; color:#1e293b; }
.anf-tw tr:last-child td { border-bottom:none; }
.anf-tw tr:nth-child(even) td { background:#f8faff; }
.anf-tw tr:hover td { background:#eff6ff; transition:background .12s; }

/* Inline elements */
.anf-note {
  display:block; margin:8px 0; padding:8px 12px;
  background:#f8fafc; border-left:3px solid #94a3b8;
  border-radius:0 6px 6px 0; font-size:.88em; color:#475569; line-height:1.5;
}
.anf-inv, .anf-src-chip {
  color:#60a5fa; text-decoration:underline; cursor:pointer;
  font-weight:500; white-space:nowrap;
}
.anf-inv:hover { color:#93c5fd; }
.anf-vnd { color:#a78bfa; text-decoration:underline; cursor:pointer; font-weight:500; }
.anf-vnd:hover { color:#c4b5fd; }
.anf-src {
  margin-top:12px; padding-top:10px; border-top:1px dashed rgba(96,165,250,0.3);
}
.anf-src-lbl {
  font-size:12px; font-weight:700; color:#60a5fa;
  text-transform:lowercase; letter-spacing:.3px;
}
.anf-src-chips { display:inline-flex; flex-wrap:wrap; gap:4px 6px; vertical-align:middle; margin-left:4px; }
.anf-src-chip {
  display:inline-block; padding:2px 9px;
  background:rgba(96,165,250,0.1); border:1px solid rgba(96,165,250,0.3); border-radius:12px;
  font-family:'SF Mono','Menlo','Fira Code',monospace;
  font-size:11px; color:#60a5fa; font-weight:500;
  text-decoration:none; transition:background .12s;
}
.anf-src-chip:hover { background:rgba(96,165,250,0.2); text-decoration:underline; }
.anf-src-desc { font-size:11px; color:rgba(255,255,255,0.3); font-style:italic; display:block; margin-top:4px; }

/* Typing indicator */
.anf-typing-wrap { display:flex; flex-direction:column; gap:6px; padding:4px 0; }
.anf-typing { display:flex; align-items:center; gap:5px; }
.anf-dot {
  width:7px; height:7px; border-radius:50%; background:#60a5fa;
  animation:anf-bounce 1.2s infinite;
}
.anf-dot:nth-child(2) { animation-delay:.2s; }
.anf-dot:nth-child(3) { animation-delay:.4s; }
@keyframes anf-bounce {
  0%,60%,100% { transform:translateY(0); }
  30%          { transform:translateY(-7px); }
}
.anf-stage {
  font-size:12px; color:#64748b; font-weight:500;
  animation:anf-fade-in .3s ease;
}
@keyframes anf-fade-in { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:none} }

.anf-bot-meta { margin-top:5px; font-size:11px; color:#94a3b8; }
.anf-bot-actions { margin-top:3px; display:flex; gap:4px; }
.anf-act-btn {
  width:27px; height:27px; border-radius:7px; border:1px solid transparent;
  background:transparent; color:#94a3b8; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
  font-size:13px; transition:all .15s; font-family:inherit;
}
.anf-act-btn:hover { background:#eff6ff; color:#274B95; border-color:#dce4f5; }
.anf-act-btn-active { background:#eff6ff; color:#274B95; border-color:#b8ccf0; }

/* Input area */
.anf-input-area {
  padding:13px 22px 16px; border-top:1px solid #e2e8f0;
  background:#f8faff; flex-shrink:0;
}
.anf-input-row { display:flex; gap:10px; align-items:flex-end; }
.anf-textarea {
  flex:1; background:#fff; border:1.5px solid #dce4f5;
  border-radius:10px; color:#0f172a; font-size:14px;
  padding:11px 15px; resize:none; outline:none;
  font-family:inherit; min-height:46px; max-height:120px;
  line-height:1.5; transition:border-color .15s, box-shadow .15s;
}
.anf-textarea:focus { border-color:#274B95; box-shadow:0 0 0 3px rgba(39,75,149,.1); }
.anf-textarea::placeholder { color:#94a3b8; }
.anf-send-btn {
  width:46px; height:46px; border-radius:10px; background:#274B95;
  border:none; color:#fff; font-size:17px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  flex-shrink:0; transition:background .15s;
}
.anf-send-btn:hover { background:#041C4C; }
.anf-send-btn:disabled { background:#dce4f5; color:#94a3b8; cursor:not-allowed; }
.anf-stop-btn {
  width:46px; height:46px; border-radius:10px; background:#dc2626;
  border:none; color:#fff; cursor:pointer;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  transition:background .15s;
}
.anf-stop-btn:hover { background:#b91c1c; }
.anf-hint { font-size:11px; color:#94a3b8; margin-top:5px; }

/* ── Modal ───────────────────────────────────────────────────────────────── */
.anf-modal-overlay {
  position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:100;
  display:flex; align-items:center; justify-content:center;
  backdrop-filter:blur(4px);
}
.anf-modal {
  background:#fff; border:1px solid #e2e8f0; border-radius:16px;
  width:760px; max-width:95vw; max-height:85vh;
  display:flex; flex-direction:column; overflow:hidden;
  box-shadow:0 24px 60px rgba(0,0,0,.15);
}
.anf-modal-hdr {
  padding:17px 22px; border-bottom:1px solid #e2e8f0;
  display:flex; align-items:center; justify-content:space-between;
  background:#f8fafc;
}
.anf-modal-hdr h2 { font-size:15px; font-weight:600; color:#0f172a; margin:0; }
.anf-modal-close {
  background:none; border:none; color:#94a3b8;
  font-size:20px; cursor:pointer; line-height:1; padding:0;
}
.anf-modal-close:hover { color:#0f172a; }
.anf-modal-body {
  overflow-y:auto; padding:18px 22px;
  display:flex; flex-direction:column; gap:10px;
  background:#fff;
}
.anf-tq-group { margin-bottom:4px; }
.anf-tq-lbl {
  font-size:10px; font-weight:700; color:#274B95;
  letter-spacing:1.1px; text-transform:uppercase; margin-bottom:6px;
}
.anf-tq-card {
  background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;
  padding:12px 14px; display:flex; flex-direction:column; gap:6px;
  margin-bottom:6px;
}
.anf-tq-q { font-size:13px; color:#0f172a; line-height:1.4; }
.anf-tq-try {
  align-self:flex-start; padding:4px 12px; font-size:12px;
  border-radius:6px; background:#eff6ff; border:1px solid #bfdbfe;
  color:#274B95; cursor:pointer; transition:all .15s; font-family:inherit; font-weight:500;
}
.anf-tq-try:hover { background:#274B95; color:#fff; border-color:#274B95; }

/* ── Scrollbar ────────────────────────────────────────────────────────────── */
.anf-messages::-webkit-scrollbar,
.anf-chat-list::-webkit-scrollbar,
.anf-modal-body::-webkit-scrollbar { width:5px; }
.anf-messages::-webkit-scrollbar-thumb,
.anf-chat-list::-webkit-scrollbar-thumb,
.anf-modal-body::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }
`
