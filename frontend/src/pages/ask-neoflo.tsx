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

interface GrabCardOwner {
  name: string; email?: string; handle?: string; slack?: string
  role?: string; seniority?: string
}
interface GrabCardSupplier {
  name: string; description?: string; notes?: string
  tier?: string; channel?: string; buying_channel?: string
  threshold?: string; approval_threshold_usd?: number | null
  p_card?: boolean | string; p_card_eligible?: string
}
interface GrabCardData {
  process_level?: string
  managers?: GrabCardOwner[]
  suppliers?: GrabCardSupplier[]
  approval_chain?: string[]
  steps?: string[]; process_steps?: string[]
  compliance_note?: string
}

interface Msg {
  id: string
  role: "user" | "bot"
  text: string          // "__TYPING__" → loading indicator
  ms?: number
  traceIdx?: number | null
  invNums?: string[]
  vendorNames?: string[]
  pdfUrlMap?: Record<string, string>   // invoice# → absolute PDF proxy URL
  grabCard?: GrabCardData              // structured S2P card from grab_card API field
  question?: string
  isHtml?: boolean       // pre-formatted HTML — skip renderMarkdown
}

// ──────────────────────────────── Source-to-Procure types ────────────────────

interface S2POwner    { name: string; email: string; slack: string; seniority: string }
interface S2PSupplier {
  name: string; tier: string; contract_type?: string; contract_id?: string | null
  buying_channel: string; po_required: string; p_card_eligible: string
  approval_threshold_usd?: number | null; notes?: string
}
interface S2PQuestion {
  id: string; level: "L1" | "L2"; question: string; answer: string
  structured_answer: Record<string, unknown>
}

interface TraceStep { step: string; [k: string]: unknown }
interface TraceEntry { question: string; trace: TraceStep[] }
interface SideChat   { id: string; title: string }

interface PRLineItem {
  id: string; description: string; category: string; supplier: string
  qty: string; unit: string; unitCost: string; glAccount: string; buyingChannel: string
}
interface PRFormData {
  prNumber: string; prDate: string; requestor: string
  department: string; businessUnit: string; costCenter: string
  currency: string; needByDate: string; deliverToLocation: string
  description: string; justification: string
  lineItems: PRLineItem[]; approvalChain: string[]; notes: string
}

// ──────────────────────────────────────── constants ──────────────────────────

const API      = (p: string) => `/api/ask-neo/${p}`
const SID_KEY         = "ask_neoflo_sid"
const MSGS_KEY        = "ask_neoflo_msgs"
const CHATS_KEY       = "ask_neoflo_chats"          // legacy compat
const ACTIVE_CHAT_KEY = "ask_neoflo_active_chat"    // legacy compat
const APP_MODE_KEY    = "ask_neoflo_app_mode"

// Per-chat message storage key
const chatKey         = (id: string) => `ask_neoflo_chat_${id}`
// Mode-scoped storage keys
const modeActiveChatKey = (m: string) => `ask_neoflo_active_chat_${m}`
const modeChatsKey      = (m: string) => `ask_neoflo_chats_${m}`

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

let _rmCallId = 0  // ensures unique table IDs across renderMarkdown calls

function renderMarkdown(raw: string, invNums: string[], vendors: string[], pdfUrlMap: Record<string,string> = {}): string {
  const callId = ++_rmCallId
  // Fuzzy lookup: try exact key first, then normalised partial-match
  const normK = (s: string) => s.toLowerCase().replace(/[-_\s]/g, "").replace(/\.pdf$/i, "")
  function findPdfUrl(key: string): string {
    if (pdfUrlMap[key]) return pdfUrlMap[key]
    const kn = normK(key)
    for (const [mk, mv] of Object.entries(pdfUrlMap)) {
      const mn = normK(mk)
      if (mn === kn || mn.includes(kn) || kn.includes(mn)) return mv
    }
    return ""
  }

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
    const chipsHtml = chips.map(c => {
      const pdfUrl = findPdfUrl(c)
      const pdfAttr = pdfUrl ? ` data-pdf="${esc(pdfUrl)}"` : ""
      const icon = pdfUrl ? "📄 " : ""
      return `<a href="#" class="anf-src-chip${pdfUrl ? " anf-src-chip-pdf" : ""}" data-inv="${esc(c)}"${pdfAttr}>${icon}${esc(c)}</a>`
    }).join("")
    srcHtml = `<div class="anf-src"><span class="anf-src-lbl">${esc(label)}</span> `
      + `<span class="anf-src-chips">${chipsHtml}</span>`
      + (desc ? `<span class="anf-src-desc">${esc(desc)}</span>` : "")
      + `</div>`
  }

  // Convert markdown lines to HTML (tables + text)
  const TABLE_THRESH = 5  // data rows shown before "Show more"
  const lines = text.split("\n")
  let html = "", inTable = false, tHtml = "", tDataRows = 0, tIdx = 0

  const flushTable = () => {
    if (tDataRows > TABLE_THRESH) {
      const tid = `anftw-${callId}-${++tIdx}`
      const extra = tDataRows - TABLE_THRESH
      html += `<div class="anf-tw anf-tw-coll" id="${tid}">${tHtml}</table><div class="anf-tw-fade"></div></div>`
             + `<button class="anf-show-more" data-expand-tw="${tid}">Show ${extra} more rows ↓</button>`
    } else {
      html += `<div class="anf-tw">${tHtml}</table></div>`
    }
    tHtml = ""; tDataRows = 0; inTable = false
  }

  for (const line of lines) {
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      if (!inTable) { inTable = true; tHtml = "<table>" }
      const cells = line.trim().slice(1, -1).split("|").map(c => c.trim())
      if (cells.every(c => /^[-:]+$/.test(c))) continue
      const isHdr = !tHtml.includes("<tr>")
      const tag   = isHdr ? "th" : "td"
      if (!isHdr) tDataRows++
      tHtml += "<tr>" + cells.map(c => {
        const ch = esc(c).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        return `<${tag}>${ch}</${tag}>`
      }).join("") + "</tr>"
    } else {
      if (inTable) flushTable()
      html += esc(line) + "\n"
    }
  }
  if (inTable) flushTable()

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
      const pdfUrl  = findPdfUrl(inv)
      const pdfAttr = pdfUrl ? ` data-pdf="${esc(pdfUrl)}"` : ""
      html = replaceText(html,
        new RegExp(`(?<![\\w/-])(${e})(?![\\w/-])`, "g"),
        `<a href="#" class="anf-inv${pdfUrl ? " anf-inv-pdf" : ""}" data-inv="${esc(inv)}"${pdfAttr}>$1</a>`)
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

// ──────────────────────────────── S2P question data ──────────────────────────

const S2P_QUESTIONS: S2PQuestion[] = [
  {
    id: "L1-01", level: "L1",
    question: "Who is the procurement manager for Travel & Accommodation in Vietnam?",
    answer: "The procurement manager for Travel & Accommodation (CAT-09) in Vietnam is Hoang Thi Lan (ht.lan@grab.com / @ht_lan). You can reach them directly on Slack at @ht_lan or via email.",
    structured_answer: {
      procurement_owners: [{ name: "Hoang Thi Lan", email: "ht.lan@grab.com", slack: "@ht_lan", seniority: "Junior" }],
      country: "Vietnam (VN)", category: "Travel & Accommodation (CAT-09)"
    }
  },
  {
    id: "L1-02", level: "L1",
    question: "What is the buying channel for Cloud & Infrastructure in Singapore?",
    answer: "The default buying channel for Cloud & Infrastructure (CAT-03) in Singapore is the Self-service Cloud Portal at portal.grab.com/cloud. Preferred suppliers are AWS and Microsoft Azure — both use the Self-service Cloud Portal with a $1,000 approval threshold. Google Cloud is Approved for ML/AI workloads only and requires a PO via Oracle ERP above $5,000. All cloud workloads must be tagged with a cost centre at the time of provisioning.",
    structured_answer: {
      default_channel: "Self-service Cloud Portal (BC-04)",
      suppliers: [
        { name: "AWS", tier: "Preferred", contract_type: "CPA", buying_channel: "Self-service Cloud Portal", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 1000, notes: "Primary cloud. Tag all workloads with cost centre. Monthly PO release." },
        { name: "Microsoft Azure", tier: "Preferred", contract_type: "CPA", buying_channel: "Self-service Cloud Portal", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 1000, notes: "Secondary cloud. Preferred for data residency workloads." },
        { name: "Google Cloud", tier: "Approved", contract_type: "BPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 5000, notes: "Approved for ML/AI workloads only. Requires CTO sign-off." },
        { name: "Cloudflare", tier: "Approved", contract_type: "BPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 2000, notes: "CDN and security. Route to Cloud Procurement." },
      ],
      country: "Singapore (SG)", category: "Cloud & Infrastructure (CAT-03)"
    }
  },
  {
    id: "L1-03", level: "L1",
    question: "Can I use my P-Card to buy office supplies in Thailand?",
    answer: "Yes, P-Card is allowed for Office Supplies & Stationery (CAT-05) in Thailand. No PO is required. Use the Punch-out Catalog in Oracle for bulk orders via Staples (up to $500). For smaller items, 3M and local stationery shops can be paid directly on P-Card up to $200 and $100 respectively. Amazon Business is a last-resort option up to $150 — prefer the Punch-out Catalog where possible. Retain all receipts and submit an expense report within 5 business days.",
    structured_answer: {
      p_card_allowed: true, po_required: false,
      suppliers: [
        { name: "Staples / local equiv", tier: "Preferred", buying_channel: "Punch-out Catalog", po_required: "No", p_card_eligible: "Yes", approval_threshold_usd: 500, notes: "Standard stationery. Under $500 use P-Card." },
        { name: "3M", tier: "Approved", buying_channel: "P-Card", po_required: "No", p_card_eligible: "Yes", approval_threshold_usd: 200, notes: "Whiteboards, stickies, cleaning. P-Card only." },
        { name: "Amazon Business", tier: "Other", buying_channel: "P-Card", po_required: "No", p_card_eligible: "Yes", approval_threshold_usd: 150, notes: "Last resort only. Prefer punch-out." },
        { name: "Local stationery", tier: "Other", buying_channel: "P-Card", po_required: "No", p_card_eligible: "Yes", approval_threshold_usd: 100, notes: "Petty cash items only. Retain receipt." },
      ],
      country: "Thailand (TH)", category: "Office Supplies & Stationery (CAT-05)"
    }
  },
  {
    id: "L1-04", level: "L1",
    question: "Which suppliers are approved for HR & Contingent Workforce in Philippines?",
    answer: "There are four approved suppliers for HR & Contingent Workforce (CAT-07) in Philippines. Randstad (Preferred, BPA) and Adecco (Preferred, BPA) are the primary staffing agencies for contingent workforce, both via PO in Oracle with thresholds of $10,000 and $8,000 respectively. Michael Page (Approved, BPA) handles permanent search for mid-to-senior roles and requires HR VP approval above $15,000. LinkedIn Jobs (Approved, BPA) is used for job postings via the Self-service Recruitment Portal above $2,000. All engagements require a PO in Oracle before work begins.",
    structured_answer: {
      suppliers: [
        { name: "Randstad", tier: "Preferred", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 10000, notes: "Contingent workforce. VMS integrated." },
        { name: "Adecco", tier: "Preferred", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 8000, notes: "Admin and ops temp staffing." },
        { name: "Michael Page", tier: "Approved", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 15000, notes: "Permanent search for mid-senior roles. HR VP approval required." },
        { name: "LinkedIn Jobs", tier: "Approved", buying_channel: "Self-service Recruitment Portal", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 2000, notes: "Job postings. TA team manages portal." },
      ],
      country: "Philippines (PH)", category: "HR & Contingent Workforce (CAT-07)"
    }
  },
  {
    id: "L1-05", level: "L1",
    question: "Who handles Professional & Legal Services procurement in Indonesia?",
    answer: "Professional & Legal Services (CAT-08) in Indonesia is managed by Hendra Wijaya (h.wijaya@grab.com / @h_wijaya). Contact them before engaging any external consultant or law firm. All Professional Services engagements require a PO in Oracle — no work should commence without an active PO.",
    structured_answer: {
      procurement_owners: [{ name: "Hendra Wijaya", email: "h.wijaya@grab.com", slack: "@h_wijaya", seniority: "Mid" }],
      country: "Indonesia (ID)", category: "Professional & Legal Services (CAT-08)"
    }
  },
  {
    id: "L2-01", level: "L2",
    question: "I'm in Singapore and need to onboard a new FM vendor for an office expansion. The quoted cost is $12,000. What is the process, who do I contact, and do I need Finance approval?",
    answer: "At $12,000, you must use a Preferred supplier and raise a PO via Oracle ERP — direct payment is not permitted. Your procurement owners for Facilities & Building Mgmt (CAT-06) in Singapore are Marcus Ong (m.ong@grab.com / @m_ong) and Faizal Bin Ahmad (f.ahmad@grab.com / @f_ahmad). The preferred suppliers are CBRE (BPA, threshold $10,000) and JLL (CPA, threshold $8,000). If you must use a new vendor, raise a Direct PO in Oracle with 2 competitor quotes and Finance approval (required above $3,000 for spot vendors).",
    structured_answer: {
      procurement_owners: [
        { name: "Marcus Ong", email: "m.ong@grab.com", slack: "@m_ong", seniority: "Mid" },
        { name: "Faizal Bin Ahmad", email: "f.ahmad@grab.com", slack: "@f_ahmad", seniority: "Junior" },
      ],
      preferred_suppliers: [
        { name: "CBRE", tier: "Preferred", contract_type: "BPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 10000, notes: "FM services. SLA in contract annex C." },
        { name: "JLL", tier: "Preferred", contract_type: "CPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 8000, notes: "Real estate advisory. All lease renewals require Legal + Proc." },
      ],
      spot_suppliers: [
        { name: "Local FM vendor", tier: "Other", contract_type: "Spot", buying_channel: "Direct PO", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 3000, notes: "Emergency works only. 2 quotes required. Finance approval needed." },
      ],
      approval_chain: ["Manager", "Finance (mandatory above $3,000 for Direct PO)", "Procurement"],
      finance_approval_required: true, po_required: true, amount_usd: 12000,
      compliance_note: "Do not pay vendor directly. No PO = policy violation. Retroactive POs require VP Finance approval.",
      steps: [
        "Contact Marcus Ong (m.ong@grab.com) or Faizal Bin Ahmad (f.ahmad@grab.com) to flag requirement",
        "Check if CBRE or JLL can cover the scope within SLA",
        "Raise PR in Oracle referencing CBRE or JLL contract ID",
        "PR approval chain: Manager → Finance → Procurement",
        "PO issued → works completed → invoice matched in Oracle → payment released",
      ]
    }
  },
  {
    id: "L2-02", level: "L2",
    question: "Our Vietnam team needs to run a 3-month LinkedIn and Google Ads campaign with a total budget of $22,000. How do we split the buying channel and who approves it?",
    answer: "At $22,000, both Meta and Google Ads exceed the $5,000 self-serve threshold, so a PO via Oracle ERP is required for each platform. Your procurement owners for Marketing & Advertising (CAT-04) in Vietnam are Le Hoang Nam (lh.nam@grab.com / @lh_nam) and Vu Thanh Hung (vt.hung@grab.com / @vt_hung). For direct ad platform spend above $5,000, raise a PR in Oracle referencing the Meta BPA and Google Ads BPA contract IDs. For test or exploratory budgets under $5,000 per platform, the Self-service Ad Portal with manager P-Card is acceptable.",
    structured_answer: {
      procurement_owners: [
        { name: "Le Hoang Nam", email: "lh.nam@grab.com", slack: "@lh_nam", seniority: "Senior" },
        { name: "Vu Thanh Hung", email: "vt.hung@grab.com", slack: "@vt_hung", seniority: "Mid" },
      ],
      suppliers: [
        { name: "Meta (Facebook Ads)", tier: "Preferred", contract_type: "BPA", buying_channel: "Self-service Ad Portal", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 5000, notes: "Paid social. Raise PO > $5k. Manager card for test budgets." },
        { name: "Google Ads", tier: "Preferred", contract_type: "BPA", buying_channel: "Self-service Ad Portal", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 5000, notes: "Search and display. Self-serve under $5k." },
        { name: "Dentsu", tier: "Preferred", contract_type: "CPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 25000, notes: "Regional AOR. All brand campaigns routed here." },
        { name: "Publicis", tier: "Preferred", contract_type: "BPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 15000, notes: "Digital and performance media." },
      ],
      approval_chain: ["Manager", "VP Marketing", "Procurement"],
      po_required: true, budget_usd: 22000,
      compliance_note: "Raise separate PRs in Oracle for Meta and Google. Share PO numbers with account managers before campaigns go live.",
      steps: [
        "Get VP Marketing sign-off on $22,000 total budget",
        "Contact Le Hoang Nam or Vu Thanh Hung to confirm BPA contract IDs",
        "Raise separate PRs in Oracle for Meta and Google Ads",
        "PR approval: Manager → VP Marketing → Procurement",
        "Share PO numbers with Meta and Google account managers before campaigns go live",
        "Invoices matched to POs in Oracle → payment released",
      ]
    }
  },
  {
    id: "L2-03", level: "L2",
    question: "Our Thailand team wants to subscribe to a new project management SaaS tool not on the approved list. The cost is $8,000 per year. What is the process?",
    answer: "New SaaS tools not on the approved vendor list require an IT Security review before any purchase can be made. Your procurement owners for Software Licenses (CAT-02) in Thailand are Nattaya Srisuk (n.srisuk@grab.com / @n_srisuk) and Vorasak Lertsiri (v.lertsiri@grab.com / @v_lertsiri). At $8,000 per year, this is above the $2,000 IT Procurement approval threshold, so IT Procurement sign-off is mandatory after security clearance. Do not subscribe using a P-Card or corporate card before the tool is approved — this is a shadow IT violation.",
    structured_answer: {
      procurement_owners: [
        { name: "Nattaya Srisuk", email: "n.srisuk@grab.com", slack: "@n_srisuk", seniority: "Mid" },
        { name: "Vorasak Lertsiri", email: "v.lertsiri@grab.com", slack: "@v_lertsiri", seniority: "Lead" },
      ],
      existing_approved_suppliers: [
        { name: "Microsoft", tier: "Preferred", contract_type: "CPA", buying_channel: "Self-service Software Portal", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 1000, notes: "M365, Teams, Azure AD. Raise PR for new seats." },
        { name: "Salesforce", tier: "Preferred", contract_type: "BPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 10000, notes: "CRM seats. All additions require IT Procurement approval." },
        { name: "Atlassian", tier: "Approved", contract_type: "BPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 2000, notes: "Jira, Confluence. Route through IT Procurement." },
        { name: "Zoom", tier: "Preferred", contract_type: "BPA", buying_channel: "Self-service Software Portal", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 200, notes: "Video conferencing. Self-serve for standard add-ons." },
      ],
      approval_chain: ["Manager", "IT Security (5-day review)", "IT Procurement (mandatory above $2,000)"],
      p_card_allowed: false, po_required: true, budget_usd: 8000,
      compliance_note: "Do not subscribe before IT Security clears the tool. P-Card use for unapproved SaaS is a shadow IT violation flagged in quarterly audits.",
      steps: [
        "Submit new vendor request at portal.grab.com/new-vendor",
        "IT Security review: SOC2, SSO/SAML, GDPR/PDPA compliance — 5 business days",
        "Contact Nattaya Srisuk or Vorasak Lertsiri to add vendor to approved list",
        "Raise PR in Oracle for $8,000/year",
        "PR routes: Manager → IT Procurement approval",
        "PO issued → subscription activated",
      ]
    }
  },
  {
    id: "L2-04", level: "L2",
    question: "Our Philippines entity needs to hire a Big 4 firm for a 6-week internal audit. Estimated cost is $60,000. What is the full procurement process and who needs to sign off?",
    answer: "At $60,000, CFO approval is mandatory — this exceeds the $50,000 threshold for Professional & Legal Services. Your procurement owners for CAT-08 in Philippines are Edgardo Torres (e.torres@grab.com / @e_torres) and Filipina Bautista (f.bautista@grab.com / @f_bautista). Preferred suppliers are Deloitte (CPA, $50,000 threshold), KPMG (CPA, $30,000 threshold), and Rajah & Tann (CPA, $15,000 threshold). All three require PO via Oracle ERP. Approval chain: GC (mandatory first step) → CFO (mandatory for all amounts) → Procurement.",
    structured_answer: {
      procurement_owners: [
        { name: "Edgardo Torres", email: "e.torres@grab.com", slack: "@e_torres", seniority: "Mid" },
        { name: "Filipina Bautista", email: "f.bautista@grab.com", slack: "@f_bautista", seniority: "Lead" },
      ],
      preferred_suppliers: [
        { name: "Deloitte", tier: "Preferred", contract_type: "CPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 50000, notes: "Strategy and finance advisory. CFO approval for engagements." },
        { name: "KPMG", tier: "Preferred", contract_type: "CPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 30000, notes: "Audit and tax advisory." },
        { name: "Rajah & Tann", tier: "Preferred", contract_type: "CPA", buying_channel: "PO via Oracle ERP", po_required: "Yes", p_card_eligible: "No", approval_threshold_usd: 15000, notes: "Primary SEA external counsel. GC approval for all matters." },
      ],
      approval_chain: ["GC (mandatory — first step)", "CFO (mandatory — all amounts)", "Procurement"],
      cfo_approval_required: true, po_required: true, budget_usd: 60000,
      compliance_note: "Never instruct Big 4 or any external firm without GC approval and an active PO. Retroactive POs require VP Finance approval.",
      steps: [
        "Raise a Legal Matter Request with in-house Legal (legal@grab.com)",
        "GC approves engagement and selects preferred firm (Deloitte, KPMG, or Rajah & Tann)",
        "Contact Edgardo Torres or Filipina Bautista to initiate PO",
        "Raise PR in Oracle referencing CPA contract ID",
        "PR approval: GC + CFO → Procurement issues PO",
        "No work commences until PO is active",
        "Milestone invoices submitted → matched to PO in Oracle → payment released",
      ]
    }
  },
  {
    id: "L2-05", level: "L2",
    question: "I'm based in Malaysia and my team of 40 is travelling to Indonesia for an annual offsite. How should we book flights and hotels, what is the P-Card limit, and what happens if total spend goes above $3,000?",
    answer: "Book all flights and hotels via Concur at travel.grab.com using your corporate P-Card. Agoda Business is the preferred hotel supplier with negotiated rates — search within Concur. For ground transport in Indonesia, use the corporate GrabBusiness App (auto-reconciled monthly, limit $200 per transaction). Your procurement owner for Travel & Accommodation (CAT-09) in Malaysia is Tan Wei Jie (t.weijie@grab.com / @t_weijie). P-Card limit: below $3,000 total trip spend, no PO is needed. Above $3,000: raise a PR in Oracle before travel — for a team of 40 this will almost certainly apply.",
    structured_answer: {
      procurement_owners: [
        { name: "Tan Wei Jie", email: "t.weijie@grab.com", slack: "@t_weijie", seniority: "Junior" },
      ],
      preferred_suppliers: [
        { name: "Concur / SAP Travel", tier: "Preferred", buying_channel: "Self-service Travel Portal", po_required: "No", p_card_eligible: "Yes", approval_threshold_usd: 3000, notes: "Book all air, hotel, rail via Concur. P-Card for incidentals." },
        { name: "Agoda Business", tier: "Preferred", buying_channel: "Self-service Travel Portal", po_required: "No", p_card_eligible: "Yes", approval_threshold_usd: 1000, notes: "Hotel only. Preferred rates negotiated. Book in portal." },
        { name: "GrabBusiness App", tier: "Preferred", buying_channel: "GrabBusiness App", po_required: "No", p_card_eligible: "Yes", approval_threshold_usd: 200, notes: "Ground transport. Use corporate GrabBusiness account." },
      ],
      approval_chain: ["Manager (travel approval in Workday)", "Procurement (mandatory above $3,000)"],
      p_card_limit_usd: 3000, po_required_above_usd: 3000,
      compliance_note: "Economy class for flights under 4 hours. Book at least 7 days in advance. Hotel cap $250/night in Indonesia. Submit expense report within 5 business days of return.",
      steps: [
        "Get manager travel approval in Workday",
        "Estimate total trip cost — if above $3,000 raise PR in Oracle before booking",
        "Book flights and hotel via Concur at travel.grab.com on corporate P-Card",
        "Use GrabBusiness App for all ground transport in Indonesia",
        "Submit expense report within 5 business days of return with all receipts",
      ]
    }
  },
]

// ──────────────────────────────── S2P answer formatter ───────────────────────

function formatS2PAnswer(q: S2PQuestion): string {
  const sa = q.structured_answer
  let html = ""

  // Main answer — split on ". " for paragraph feel
  const sentences = q.answer.split(/(?<=\.)\s+/)
  html += `<div style="line-height:1.75;color:#1e293b;font-size:14px;margin-bottom:16px">`
  sentences.forEach(s => { if (s.trim()) html += `<p style="margin:0 0 6px">${esc(s)}</p>` })
  html += `</div>`

  // Procurement owners
  const owners = (sa.procurement_owners as S2POwner[] | undefined) || []
  if (owners.length) {
    html += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#64748b;margin:14px 0 8px">Procurement Owners</div>`
    html += `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">`
    owners.forEach(o => {
      html += `<div style="padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;min-width:190px">
        <div style="font-weight:600;color:#0f172a;font-size:13px;margin-bottom:3px">${esc(o.name)}</div>
        <div style="color:#274B95;font-size:12px;margin-bottom:2px">✉ ${esc(o.email)}</div>
        <div style="color:#64748b;font-size:12px">${esc(o.slack)} · ${esc(o.seniority)}</div>
      </div>`
    })
    html += `</div>`
  }

  // Suppliers table — merge all supplier arrays
  const allSuppliers: S2PSupplier[] = [
    ...((sa.suppliers as S2PSupplier[]) || []),
    ...((sa.preferred_suppliers as S2PSupplier[]) || []),
    ...((sa.existing_approved_suppliers as S2PSupplier[]) || []),
    ...((sa.spot_suppliers as S2PSupplier[]) || []),
  ]
  if (allSuppliers.length) {
    html += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#64748b;margin:14px 0 8px">Approved Suppliers</div>`
    html += `<div class="anf-tw" style="margin-bottom:16px"><table>
      <tr><th>Supplier</th><th>Tier</th><th>Buying Channel</th><th>Threshold</th><th>P-Card</th></tr>`
    allSuppliers.forEach(s => {
      const tc = s.tier === "Preferred" ? "#16a34a" : s.tier === "Approved" ? "#0284c7" : "#64748b"
      const thresh = s.approval_threshold_usd ? `$${Number(s.approval_threshold_usd).toLocaleString()}` : "—"
      html += `<tr>
        <td><strong>${esc(s.name)}</strong>${s.notes ? `<br><span style="font-size:11px;color:#64748b">${esc(s.notes)}</span>` : ""}</td>
        <td><span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${tc}18;color:${tc}">${esc(s.tier)}</span></td>
        <td style="font-size:12px">${esc(s.buying_channel)}</td>
        <td style="font-size:12px;font-weight:600">${thresh}</td>
        <td style="font-size:12px;text-align:center;color:${s.p_card_eligible === "Yes" ? "#16a34a" : "#dc2626"}">${s.p_card_eligible === "Yes" ? "✓" : "✗"}</td>
      </tr>`
    })
    html += `</table></div>`
  }

  // Approval chain
  const chain = (sa.approval_chain as string[] | undefined) || []
  if (chain.length) {
    html += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#64748b;margin:14px 0 8px">Approval Chain</div>`
    html += `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:16px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">`
    chain.forEach((step, i) => {
      html += `<span style="padding:5px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;font-size:12px;color:#274B95;font-weight:500">${esc(step)}</span>`
      if (i < chain.length - 1) html += `<span style="color:#94a3b8;font-size:15px;font-weight:300">→</span>`
    })
    html += `</div>`
  }

  // Process steps
  const steps = (sa.steps as string[] | undefined) || []
  if (steps.length) {
    html += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#64748b;margin:14px 0 8px">Process Steps</div>`
    html += `<div style="margin-bottom:16px">`
    steps.forEach((step, i) => {
      html += `<div style="display:flex;gap:12px;padding:8px 0;${i < steps.length - 1 ? "border-bottom:1px solid #f1f5f9" : ""}">
        <span style="flex-shrink:0;width:22px;height:22px;background:#274B95;color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-top:1px">${i + 1}</span>
        <span style="font-size:13px;color:#1e293b;line-height:1.55">${esc(step)}</span>
      </div>`
    })
    html += `</div>`
  }

  // Compliance note
  const note = sa.compliance_note as string | undefined
  if (note) {
    html += `<div style="margin-top:14px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-left:3px solid #f97316;border-radius:0 8px 8px 0;font-size:12px;color:#9a3412;line-height:1.55">
      <strong>⚠ Compliance Note:</strong> ${esc(note)}
    </div>`
  }

  return html
}

// ──────────────────────────────────── GrabCard component ─────────────────────

function GrabCard({ card, text }: { card: GrabCardData; text: string }) {
  const steps    = card.steps ?? card.process_steps ?? []
  const managers = card.managers ?? []
  const suppliers = card.suppliers ?? []
  const chain    = card.approval_chain ?? []

  const tierColor = (tier = "") => {
    const t = tier.toLowerCase()
    if (t === "preferred") return "gc-tier-preferred"
    if (t === "approved")  return "gc-tier-approved"
    return "gc-tier-other"
  }
  const pCardNo = (s: GrabCardSupplier) => {
    const v = s.p_card ?? s.p_card_eligible ?? ""
    if (v === false || String(v).toLowerCase() === "no") return true
    return false
  }
  const threshold = (s: GrabCardSupplier) => {
    if (s.threshold) return s.threshold
    if (s.approval_threshold_usd != null) return `$${Number(s.approval_threshold_usd).toLocaleString()}`
    return "—"
  }

  return (
    <div className="gc-root">
      {/* Badge */}
      {card.process_level && (
        <div className="gc-badge">{card.process_level}</div>
      )}

      {/* Plain-text summary */}
      {text && (
        <div className="gc-text">
          {text.split(/\n+/).filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {/* Procurement Owners */}
      {managers.length > 0 && (
        <div className="gc-section">
          <div className="gc-section-title">PROCUREMENT OWNERS</div>
          <div className="gc-owners">
            {managers.map((m, i) => (
              <div key={i} className="gc-owner-card">
                <div className="gc-owner-name">{m.name}</div>
                {m.email && (
                  <div className="gc-owner-email">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}
                         width={12} height={12} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="3" width="14" height="10" rx="2"/>
                      <path d="M1 5l7 5 7-5"/>
                    </svg>
                    {m.email}
                  </div>
                )}
                <div className="gc-owner-meta">
                  {(m.handle || m.slack) && <span>{m.handle ?? m.slack}</span>}
                  {(m.role || m.seniority) && (
                    <span className="gc-owner-sep">·</span>
                  )}
                  {(m.role || m.seniority) && <span>{m.role ?? m.seniority}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved Suppliers */}
      {suppliers.length > 0 && (
        <div className="gc-section">
          <div className="gc-section-title">APPROVED SUPPLIERS</div>
          <div className="gc-sup-wrap">
            <table className="gc-sup-table">
              <thead>
                <tr>
                  <th>Supplier</th><th>Tier</th><th>Buying Channel</th>
                  <th>Threshold</th><th>P-Card</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <div className="gc-sup-name">{s.name}</div>
                      {(s.description || s.notes) && (
                        <div className="gc-sup-desc">{s.description ?? s.notes}</div>
                      )}
                    </td>
                    <td>
                      <span className={`gc-tier ${tierColor(s.tier)}`}>{s.tier ?? "—"}</span>
                    </td>
                    <td>{s.channel ?? s.buying_channel ?? "—"}</td>
                    <td>{threshold(s)}</td>
                    <td className="gc-pcard">
                      {pCardNo(s)
                        ? <span className="gc-pcard-no">✕</span>
                        : <span className="gc-pcard-yes">✓</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approval Chain */}
      {chain.length > 0 && (
        <div className="gc-section">
          <div className="gc-section-title">APPROVAL CHAIN</div>
          <div className="gc-chain">
            {chain.map((step, i) => (
              <React.Fragment key={i}>
                <div className="gc-chain-step">{step}</div>
                {i < chain.length - 1 && <span className="gc-chain-arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Process Steps */}
      {steps.length > 0 && (
        <div className="gc-section">
          <div className="gc-section-title">PROCESS STEPS</div>
          <ol className="gc-steps">
            {steps.map((step, i) => (
              <li key={i} className="gc-step-item">
                <span className="gc-step-num">{i + 1}</span>
                <span className="gc-step-text">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Compliance Note */}
      {card.compliance_note && (
        <div className="gc-compliance">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}
               width={16} height={16} strokeLinecap="round" strokeLinejoin="round"
               style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M10 2L2 17h16L10 2z"/>
            <path d="M10 8v4M10 14h.01"/>
          </svg>
          <div>
            <strong>Compliance Note:</strong>{" "}
            <span style={{ color: "#b45309" }}>{card.compliance_note}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────── component ──────────────────────────

function AskNeoFloPage() {
  // ── App mode (invoice | s2p) ─────────────────────────────────────────────
  const [appMode, setAppMode] = useState<"invoice" | "s2p">(() =>
    (localStorage.getItem(APP_MODE_KEY) as "invoice" | "s2p") || "invoice"
  )

  // ── Active chat ID (drives per-chat storage) ───────────────────────────────
  const [activeChatId, setActiveChatId] = useState<string>(() => {
    const m = localStorage.getItem(APP_MODE_KEY) || "invoice"
    return localStorage.getItem(modeActiveChatKey(m))
      || localStorage.getItem(ACTIVE_CHAT_KEY)
      || localStorage.getItem(SID_KEY)
      || crypto.randomUUID()
  })

  const [msgs,          setMsgs]          = useState<Msg[]>(() => {
    try {
      const m   = localStorage.getItem(APP_MODE_KEY) || "invoice"
      const aid = localStorage.getItem(modeActiveChatKey(m))
        || localStorage.getItem(ACTIVE_CHAT_KEY)
        || localStorage.getItem(SID_KEY)
      const perChat = aid ? localStorage.getItem(chatKey(aid)) : null
      return JSON.parse(perChat || localStorage.getItem(MSGS_KEY) || "[]")
    } catch { return [] }
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
    try {
      const m = localStorage.getItem(APP_MODE_KEY) || "invoice"
      return JSON.parse(
        localStorage.getItem(modeChatsKey(m)) || localStorage.getItem(CHATS_KEY) || "[]"
      )
    } catch { return [] }
  })
  const [traceHist,     setTraceHist]     = useState<TraceEntry[]>([])
  const [activeTrace,   setActiveTrace]   = useState(-1)
  const [stageLabel,    setStageLabel]    = useState("Thinking…")
  const [testQsOpen,    setTestQsOpen]    = useState(false)
  const [testQs,        setTestQs]        = useState<{template:string; question:string}[]>([])
  const [expanded,      setExpanded]      = useState<Set<number>>(new Set())
  const [faqTab,        setFaqTab]        = useState<"invoice" | "s2p">("invoice")
  const [pdfError,      setPdfError]      = useState<string | null>(null)
  const [prOpen,        setPrOpen]        = useState(false)
  const [prSubmitted,   setPrSubmitted]   = useState(false)
  const [prForm,        setPrForm]        = useState<PRFormData | null>(null)
  const [prLoading,     setPrLoading]     = useState(false)

  const msgsRef       = useRef<HTMLDivElement>(null)
  const inputRef      = useRef<HTMLTextAreaElement>(null)
  const sidRef        = useRef("")
  const abortRef      = useRef<AbortController | null>(null)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const stageIdxRef   = useRef(0)

  // ── Init session ref from activeChatId ───────────────────────────────────
  useEffect(() => {
    sidRef.current = activeChatId
    localStorage.setItem(SID_KEY, activeChatId)
    localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId)        // compat
    localStorage.setItem(modeActiveChatKey(appMode), activeChatId)
  }, [activeChatId, appMode])

  // ── Persist app mode ──────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(APP_MODE_KEY, appMode)
  }, [appMode])

  // ── Persist messages per-chat ─────────────────────────────────────────────
  useEffect(() => {
    const hasTyping = msgs.some(m => m.text === "__TYPING__")
    if (!hasTyping) {
      try {
        localStorage.setItem(chatKey(activeChatId), JSON.stringify(msgs))
        localStorage.setItem(MSGS_KEY, JSON.stringify(msgs)) // compat fallback
      } catch { /* quota */ }
    }
  }, [msgs, activeChatId])

  // ── Persist side chats list ───────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(modeChatsKey(appMode), JSON.stringify(sideChats))
      localStorage.setItem(CHATS_KEY, JSON.stringify(sideChats)) // compat
    } catch { /* quota */ }
  }, [sideChats, appMode])

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

    // Register in sidebar if this chat hasn't been added yet
    setSideChats(prev => {
      const exists = prev.some(c => c.id === activeChatId)
      if (exists) return prev
      const title = msg.length > 36 ? msg.slice(0, 36) + "…" : msg
      return [{ id: activeChatId, title }, ...prev]
    })

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

        // Fallback 1: parse "INV-XXXXXXX" style numbers from answer text
        const answerText = (c.answer as string) || ""
        const textInvMatches = answerText.match(/INV[-_ ]?\d+/gi) || []
        for (const m2 of textInvMatches) {
          // Normalise: strip the "INV" prefix and keep just the digit portion
          const digits = m2.replace(/^INV[-_ ]?/i, "")
          if (!invNums.includes(digits)) invNums.push(digits)
        }

        // Use the backend-provided pdf_url_map for direct invoice → PDF URL lookup.
        // URLs are already proxied by chat.ts.
        const pdfUrlMap: Record<string, string> =
          (c.pdf_url_map as Record<string, string>) || {}

        // Ensure every mapped key is included in invNums so it renders as a clickable chip
        for (const key of Object.keys(pdfUrlMap)) {
          if (!invNums.includes(key)) invNums.push(key)
        }

        const grabCard = (c.grab_card as GrabCardData) || undefined

        setMsgs(prev => prev.map(m => m.id === typingId ? {
          id: typingId, role: "bot" as const,
          text: c.answer as string,
          ms: (c.generated_in_ms as number) || 0,
          traceIdx, invNums, vendorNames, question: msg, pdfUrlMap, grabCard,
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
        body: JSON.stringify({
        message: msg,
        session_id: sidRef.current,
        kg_mode: appMode === "s2p" ? "grab" : "invoice",
      }),
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
  }, [input, busy, activeChatId, appMode])

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

  function resetChatState() {
    setMsgs([]); setTraceSteps([]); setTraceCount(0)
    setActiveCtx({}); setTraceHist([]); setActiveTrace(-1)
    setTraceLabel("PEV Trace")
  }

  // ── Switch between Invoice and S2P modes ──────────────────────────────────
  function switchMode(newMode: "invoice" | "s2p") {
    if (newMode === appMode) return

    // Save current mode state
    try { localStorage.setItem(modeActiveChatKey(appMode), activeChatId) } catch {}
    try { localStorage.setItem(modeChatsKey(appMode), JSON.stringify(sideChats)) } catch {}
    if (!msgs.some(m => m.text === "__TYPING__")) {
      try { localStorage.setItem(chatKey(activeChatId), JSON.stringify(msgs)) } catch {}
    }

    // Load target mode state
    const newActiveId = localStorage.getItem(modeActiveChatKey(newMode)) || crypto.randomUUID()
    let newChats: SideChat[] = []
    let newMsgs: Msg[] = []
    try { newChats = JSON.parse(localStorage.getItem(modeChatsKey(newMode)) || "[]") } catch {}
    try { newMsgs  = JSON.parse(localStorage.getItem(chatKey(newActiveId)) || "[]")  } catch {}

    setAppMode(newMode)
    setActiveChatId(newActiveId)
    setSideChats(newChats)
    setMsgs(newMsgs)
    setTraceHist([]); setActiveTrace(-1)
    setTraceSteps([]); setTraceCount(0)
    setActiveCtx({})
  }

  // ── Listen for mode-switch events from the global nav sidebar ─────────────
  const switchModeRef = useRef(switchMode)
  useEffect(() => { switchModeRef.current = switchMode })
  useEffect(() => {
    function handler(e: Event) {
      switchModeRef.current((e as CustomEvent<"invoice" | "s2p">).detail)
    }
    window.addEventListener("ask_neo_mode", handler)
    return () => window.removeEventListener("ask_neo_mode", handler)
  }, [])

  async function newChat() {
    // Save current chat messages before switching away
    if (msgs.length > 0) {
      try { localStorage.setItem(chatKey(activeChatId), JSON.stringify(msgs)) } catch { /* quota */ }
    }

    // Reset backend session
    if (sidRef.current) {
      fetch(API("reset"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sidRef.current }),
      }).catch(() => {})
    }

    // Generate new chat ID and activate it
    const newId = crypto.randomUUID()
    setActiveChatId(newId)
    resetChatState()
  }

  function switchToChat(chatId: string) {
    if (chatId === activeChatId) return

    // Persist current chat before switching
    if (msgs.length > 0) {
      try { localStorage.setItem(chatKey(activeChatId), JSON.stringify(msgs)) } catch { /* quota */ }
    }

    // Load saved messages for the target chat
    let restored: Msg[] = []
    try {
      const saved = localStorage.getItem(chatKey(chatId))
      if (saved) restored = JSON.parse(saved)
    } catch { /* ignore */ }

    setActiveChatId(chatId)
    setMsgs(restored)
    setTraceSteps([]); setTraceCount(0); setActiveTrace(-1)
    setTraceLabel("PEV Trace"); setActiveCtx({})
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

  async function openPdf(apiUrl: string, label: string, el: HTMLElement) {
    el.style.opacity = "0.6"
    const win = window.open("", "_blank")
    if (win) win.document.write("<html><body style='font-family:sans-serif;padding:2em;color:#374151'>Loading document…</body></html>")
    try {
      const res = await fetch(apiUrl)
      const ct  = res.headers.get("content-type") || ""
      if (!res.ok || !ct.includes("application/json")) {
        if (win) win.close()
        setPdfError(`Document not available: ${label}`)
        setTimeout(() => setPdfError(null), 4000)
        return
      }
      const d = await res.json()
      if (d.url) {
        if (win) win.location.href = d.url
        else window.open(d.url, "_blank")
      } else {
        if (win) win.close()
        setPdfError(d.error === "backend_unavailable"
          ? "Document server is offline — start the backend to view PDFs."
          : `Document not found: ${label}`)
        setTimeout(() => setPdfError(null), 4000)
      }
    } catch {
      if (win) win.close()
      setPdfError("Could not reach the document server. Is the backend running?")
      setTimeout(() => setPdfError(null), 4000)
    } finally { el.style.opacity = "1" }
  }


  function handleBubbleClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement

    // Source chips & inline invoice numbers → open PDF if available, else copy
    if (t.dataset.inv) {
      e.preventDefault()
      const pdfUrl = t.dataset.pdf
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener,noreferrer")
        setPdfError(`📄 Opening PDF…`)
        setTimeout(() => setPdfError(null), 2000)
      } else {
        const ref = t.dataset.inv
        navigator.clipboard.writeText(ref).catch(() => {})
        setPdfError(`📋 Copied invoice reference: ${ref}`)
        setTimeout(() => setPdfError(null), 3000)
      }
      return
    }

    // "Show more rows" button on collapsed tables
    if (t.dataset.expandTw) {
      e.preventDefault()
      const tw = document.getElementById(t.dataset.expandTw)
      if (tw) {
        tw.classList.remove("anf-tw-coll")
        tw.querySelector(".anf-tw-fade")?.remove()
      }
      t.remove()
      return
    }

    // Vendor links → copy vendor name
    if (t.dataset.vendor) {
      e.preventDefault()
      const vendor = t.dataset.vendor
      navigator.clipboard.writeText(vendor).catch(() => {})
      setPdfError(`📋 Copied vendor name: ${vendor}`)
      setTimeout(() => setPdfError(null), 3000)
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

  // ── PR generation ────────────────────────────────────────────────────────
  function glAccount(cat: string) {
    const m: Record<string,string> = {
      travel:"6200-001", cloud:"6300-002", office:"6100-003", hr:"6400-004",
      professional:"6500-005", facilities:"6600-006", marketing:"6700-007", software:"6800-008",
    }
    const k = Object.keys(m).find(k => cat.toLowerCase().includes(k))
    return k ? m[k] : "7100-000"
  }

  function generatePR(): PRFormData {
    // Find the last user question and the last bot answer from chat history
    const reversed  = [...msgs].reverse()
    const lastUser  = reversed.find(m => m.role === "user")
    const lastBot   = reversed.find(m => m.role === "bot" && m.text !== "__TYPING__")

    const question   = lastUser?.text || "Purchase Requisition"
    const answerText = lastBot?.text  || ""

    // Try to extract an amount from the question or answer
    const amountMatch = (question + " " + answerText).match(/\$[\d,]+/)
    const rawAmt      = amountMatch ? amountMatch[0].replace(/[$,]/g, "") : ""

    // Try to extract a supplier/vendor name mentioned in the answer
    const supplierMatch = answerText.match(/(?:supplier|vendor|provider)[:\s]+([A-Z][A-Za-z\s&.,-]{2,30})/i)
    const supplierName  = supplierMatch ? supplierMatch[1].trim() : ""

    const today   = new Date()
    const pad     = (n: number) => String(n).padStart(2, "0")
    const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const needBy  = new Date(today.getTime() + 30 * 864e5)
    const prNum   = `PR-${fmtDate(today).replace(/-/g, "")}-${String(Math.floor(Math.random() * 90000) + 10000)}`

    return {
      prNumber:         prNum,
      prDate:           fmtDate(today),
      requestor:        "Naman Sharma",
      department:       "Procurement",
      businessUnit:     "Corporate",
      costCenter:       `CC-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      currency:         "USD",
      needByDate:       fmtDate(needBy),
      deliverToLocation:"Head Office",
      description:      question.slice(0, 140),
      justification:    answerText.slice(0, 400) || "Business requirement identified via Ask Neo S2P query.",
      lineItems: [{
        id:           "1",
        description:  question.slice(0, 80),
        category:     "General Procurement",
        supplier:     supplierName,
        qty:          "1",
        unit:         "EA",
        unitCost:     rawAmt,
        glAccount:    "7100-000",
        buyingChannel:"PO via Oracle ERP",
      }],
      approvalChain: ["Manager", "Finance", "Procurement Head"],
      notes: "",
    }
  }

  function openCreatePR() {
    if (prLoading) return
    setPrLoading(true)
    const data = generatePR()
    setPrForm(data)
    setPrSubmitted(false)
    setTimeout(() => {
      setPrLoading(false)
      setPrOpen(true)
    }, 2000)
  }

  function updateLineItem(idx: number, field: keyof PRLineItem, val: string) {
    if (!prForm) return
    const items = prForm.lineItems.map((item, i) => i === idx ? { ...item, [field]: val } : item)
    setPrForm({ ...prForm, lineItems: items })
  }

  function addLineItem() {
    if (!prForm) return
    const newItem: PRLineItem = {
      id: String(prForm.lineItems.length + 1),
      description: "", category: "", supplier: "",
      qty: "1", unit: "EA", unitCost: "",
      glAccount: "7100-000", buyingChannel: "PO via Oracle ERP",
    }
    setPrForm({ ...prForm, lineItems: [...prForm.lineItems, newItem] })
  }

  function removeLineItem(idx: number) {
    if (!prForm || prForm.lineItems.length <= 1) return
    setPrForm({ ...prForm, lineItems: prForm.lineItems.filter((_, i) => i !== idx) })
  }

  function submitPR() {
    setPrSubmitted(true)
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
              <div className="anf-list-lbl">
                {appMode === "invoice" ? "Invoice chats" : "S2P chats"}
              </div>
              {sideChats.length === 0
                ? <div className="anf-chat-empty">No chats yet</div>
                : sideChats.map(c => (
                    <div
                      key={c.id}
                      className={`anf-chat-item${c.id === activeChatId ? " anf-chat-item-active" : ""}`}
                      title={c.title}
                      onClick={() => switchToChat(c.id)}
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}
                           width={13} height={13} style={{ flexShrink: 0, opacity: 0.5 }}>
                        <path d="M14 10c0 .667-.667 2-2 2H4l-2 2V4c0-1.333.667-2 2-2h8c1.333 0 2 .667 2 2v6z" />
                      </svg>
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
              {appMode === "s2p" && (
                <button
                  className="anf-header-btn anf-header-btn-outline"
                  onClick={() => openCreatePR()}
                  title="Generate Oracle Purchase Requisition from chat"
                  disabled={msgs.length === 0 || prLoading}
                  style={{ minWidth: 100, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
                >
                  {prLoading ? (
                    <>
                      <svg className="anf-pr-spin" viewBox="0 0 20 20" fill="none" width={14} height={14}>
                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40" strokeDashoffset="15" strokeLinecap="round"/>
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>+ Create PR</>
                  )}
                </button>
              )}
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
                        ) : msg.grabCard ? (
                          <GrabCard card={msg.grabCard} text={msg.text} />
                        ) : msg.isHtml ? (
                          <div dangerouslySetInnerHTML={{ __html: msg.text }} />
                        ) : (
                          <div dangerouslySetInnerHTML={{
                            __html: renderMarkdown(msg.text, msg.invNums ?? [], msg.vendorNames ?? [], msg.pdfUrlMap ?? {})
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

      {/* ─── FAQ modal ────────────────────────────────────────────────────── */}
      {testQsOpen && (
        <div className="anf-modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setTestQsOpen(false) }}>
          <div className="anf-modal">
            <div className="anf-modal-hdr">
              <div>
                <h2 style={{ margin:0 }}>FAQ</h2>
                <span className="anf-faq-mode-tag">
                  {appMode === "invoice" ? "Queries on Invoice" : "Source to Procure"}
                </span>
              </div>
              <button className="anf-modal-close" onClick={() => setTestQsOpen(false)}>×</button>
            </div>

            <div className="anf-modal-body">
              {appMode === "invoice" ? (
                /* ── Invoice & PO questions ─────────────────────────────── */
                Object.entries(testQsGrouped).map(([tmpl, qs]) => (
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
                ))
              ) : (
                /* ── Source to Procure questions ─────────────────────────── */
                <>
                  <div className="anf-tq-group">
                    <div className="anf-tq-lbl" style={{ color: "#0284c7" }}>Direct Lookup (L1)</div>
                    {S2P_QUESTIONS.filter(q => q.level === "L1").map((q, i) => (
                      <div key={i} className="anf-tq-card anf-tq-card-s2p">
                        <div className="anf-tq-q">{q.question}</div>
                        <button className="anf-tq-try" onClick={() => { setTestQsOpen(false); sendMessage(q.question) }}>
                          Try this →
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="anf-tq-group">
                    <div className="anf-tq-lbl" style={{ color: "#7c3aed" }}>Complex Process (L2)</div>
                    {S2P_QUESTIONS.filter(q => q.level === "L2").map((q, i) => (
                      <div key={i} className="anf-tq-card anf-tq-card-s2p">
                        <div className="anf-tq-q">{q.question}</div>
                        <button className="anf-tq-try" onClick={() => { setTestQsOpen(false); sendMessage(q.question) }}>
                          Try this →
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Oracle PR modal ──────────────────────────────────────────────── */}
      {prOpen && prForm && (
        <div className="anf-modal-overlay" onClick={e => { if (!prSubmitted && e.target === e.currentTarget) setPrOpen(false) }}>
          <div className="anf-pr-modal">

            {/* Oracle header bar */}
            <div className="anf-pr-oracle-bar">
              {/* Left: Oracle logo */}
              <div className="anf-pr-oracle-logo">
                {/* Oracle "O" ellipse + wordmark — faithful to Oracle brand */}
                <svg viewBox="0 0 170 32" width={170} height={32} fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Ellipse "O" mark */}
                  <ellipse cx="16" cy="16" rx="14" ry="14" fill="#C74634"/>
                  <ellipse cx="16" cy="16" rx="8"  ry="8"  fill="#3a3a3a"/>
                  {/* Wordmark — letterSpacing keeps chars spaced, x/width give plenty of room */}
                  <text x="36" y="22" fontFamily="'Arial Black','Arial','Helvetica',sans-serif" fontWeight="900"
                    fontSize="17" letterSpacing="2" fill="#ffffff">ORACLE</text>
                </svg>
                <div className="anf-pr-oracle-divider"/>
                <span className="anf-pr-oracle-app">Purchase Requisition</span>
              </div>
              {/* Right: status + close */}
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span className="anf-pr-status-badge">DRAFT</span>
                {!prSubmitted && (
                  <button className="anf-modal-close"
                    style={{ color:"rgba(255,255,255,.55)", fontSize:22, lineHeight:1, background:"none", border:"none", cursor:"pointer", padding:"0 2px" }}
                    onClick={() => setPrOpen(false)}>×</button>
                )}
              </div>
            </div>

            {prSubmitted ? (
              /* ── Success state ─────────────────────────────────────────── */
              <div className="anf-pr-success">
                <div className="anf-pr-success-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                       strokeLinecap="round" strokeLinejoin="round" width={32} height={32}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h3>PR Submitted Successfully</h3>
                <p><strong>{prForm.prNumber}</strong> has been uploaded to Oracle Fusion.</p>
                <p className="anf-pr-success-sub">Approval routing has been triggered. You will receive a notification once approved.</p>
                <button className="anf-pr-done-btn" onClick={() => { setPrOpen(false); setPrSubmitted(false) }}>
                  Done
                </button>
              </div>
            ) : (
              /* ── Editable form ─────────────────────────────────────────── */
              <div className="anf-pr-body">

                {/* PR number + date strip */}
                <div className="anf-pr-meta-strip">
                  <div className="anf-pr-meta-item">
                    <span className="anf-pr-meta-lbl">Requisition #</span>
                    <span className="anf-pr-meta-val">{prForm.prNumber}</span>
                  </div>
                  <div className="anf-pr-meta-item">
                    <span className="anf-pr-meta-lbl">Date</span>
                    <span className="anf-pr-meta-val">{prForm.prDate}</span>
                  </div>
                  <div className="anf-pr-meta-item">
                    <span className="anf-pr-meta-lbl">Need-by Date</span>
                    <input className="anf-pr-input" type="date" value={prForm.needByDate}
                      onChange={e => setPrForm({ ...prForm, needByDate: e.target.value })} />
                  </div>
                  <div className="anf-pr-meta-item">
                    <span className="anf-pr-meta-lbl">Currency</span>
                    <select className="anf-pr-input" value={prForm.currency}
                      onChange={e => setPrForm({ ...prForm, currency: e.target.value })}>
                      <option>USD</option><option>SGD</option><option>IDR</option>
                      <option>MYR</option><option>PHP</option><option>VND</option><option>THB</option>
                    </select>
                  </div>
                </div>

                {/* Section: Requester Info */}
                <div className="anf-pr-section">
                  <div className="anf-pr-section-title">Request Header</div>
                  <div className="anf-pr-grid">
                    {([
                      ["Requester",       "requestor",       "text"],
                      ["Department",      "department",      "text"],
                      ["Business Unit",   "businessUnit",    "text"],
                      ["Cost Center",     "costCenter",      "text"],
                      ["Deliver-to",      "deliverToLocation","text"],
                    ] as [string, keyof PRFormData, string][]).map(([lbl, key, type]) => (
                      <div key={key} className="anf-pr-field">
                        <label className="anf-pr-lbl">{lbl}</label>
                        <input className="anf-pr-input" type={type}
                          value={prForm[key] as string}
                          onChange={e => setPrForm({ ...prForm, [key]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section: Description */}
                <div className="anf-pr-section">
                  <div className="anf-pr-section-title">Request Description</div>
                  <textarea className="anf-pr-textarea" rows={2}
                    value={prForm.description}
                    onChange={e => setPrForm({ ...prForm, description: e.target.value })} />
                </div>

                {/* Section: Justification */}
                <div className="anf-pr-section">
                  <div className="anf-pr-section-title">Business Justification</div>
                  <textarea className="anf-pr-textarea" rows={3}
                    value={prForm.justification}
                    onChange={e => setPrForm({ ...prForm, justification: e.target.value })} />
                </div>

                {/* Section: Line Items */}
                <div className="anf-pr-section">
                  <div className="anf-pr-section-title" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span>Line Items</span>
                    <button className="anf-pr-add-line" onClick={addLineItem}>+ Add Line</button>
                  </div>
                  <div className="anf-pr-table-wrap">
                    <table className="anf-pr-table">
                      <thead>
                        <tr>
                          <th>#</th><th>Description</th><th>Category</th><th>Supplier</th>
                          <th>Qty</th><th>Unit</th><th>Est. Cost</th><th>Buying Channel</th>
                          <th>GL Account</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {prForm.lineItems.map((item, idx) => (
                          <tr key={item.id}>
                            <td style={{ textAlign:"center", color:"#64748b", fontSize:12 }}>{idx+1}</td>
                            {(["description","category","supplier","qty","unit","unitCost","buyingChannel","glAccount"] as (keyof PRLineItem)[]).map(f => (
                              <td key={f}>
                                <input className="anf-pr-cell-input"
                                  value={item[f] as string}
                                  onChange={e => updateLineItem(idx, f, e.target.value)} />
                              </td>
                            ))}
                            <td>
                              <button className="anf-pr-rm-line" onClick={() => removeLineItem(idx)}
                                title="Remove line">×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section: Approval Routing */}
                <div className="anf-pr-section">
                  <div className="anf-pr-section-title">Approval Routing</div>
                  <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:6, padding:"10px 0" }}>
                    {prForm.approvalChain.map((step, i) => (
                      <React.Fragment key={i}>
                        <span className="anf-pr-approval-step">{step}</span>
                        {i < prForm.approvalChain.length - 1 && (
                          <svg viewBox="0 0 16 16" width={14} height={14} fill="none">
                            <path d="M6 3l5 5-5 5" stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Section: Notes */}
                <div className="anf-pr-section">
                  <div className="anf-pr-section-title">Additional Notes</div>
                  <textarea className="anf-pr-textarea" rows={2} placeholder="Add any additional notes or attachments references…"
                    value={prForm.notes}
                    onChange={e => setPrForm({ ...prForm, notes: e.target.value })} />
                </div>

                {/* Footer actions */}
                <div className="anf-pr-footer">
                  <button className="anf-pr-cancel" onClick={() => setPrOpen(false)}>Cancel</button>
                  <button className="anf-pr-submit" onClick={submitPR}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width={14} height={14}>
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l.415-.133A15.99 15.99 0 0110 16c2.378 0 4.64.52 6.67 1.448l.416.133a1 1 0 001.168-1.409l-7-14z" />
                    </svg>
                    Submit to Oracle
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── PDF/source error toast ────────────────────────────────────────── */}
      {pdfError && (
        <div className={`anf-toast${pdfError.startsWith("📋") ? " anf-toast-ok" : ""}`}>
          {pdfError.startsWith("📋") ? (
            <svg viewBox="0 0 20 20" fill="currentColor" width={16} height={16} style={{ flexShrink: 0, marginTop: 1, color: "#22c55e" }}>
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor" width={16} height={16} style={{ flexShrink: 0, marginTop: 1 }}>
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          )}
          <span>{pdfError}</span>
          <button className="anf-toast-close" onClick={() => setPdfError(null)}>×</button>
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
/* ── Mode selector in sidebar ────────────────────────────────────────────── */
.anf-mode-sidebar {
  padding:10px 10px 6px;
  border-bottom:1px solid rgba(255,255,255,.07);
  margin-bottom:4px;
}
.anf-mode-sidebar-lbl {
  font-size:10px; font-weight:700; text-transform:uppercase;
  letter-spacing:.8px; color:rgba(255,255,255,.35);
  padding:0 6px; margin-bottom:5px;
}
.anf-mode-sidebar-opt {
  display:flex; align-items:center; gap:8px; width:100%;
  padding:8px 10px; border-radius:7px; border:none;
  background:none; color:rgba(255,255,255,.65);
  font-size:12.5px; font-weight:500; cursor:pointer;
  font-family:inherit; text-align:left; transition:background .12s, color .12s;
  margin-bottom:2px;
}
.anf-mode-sidebar-opt:hover { background:rgba(255,255,255,.08); color:#fff; }
.anf-mode-sidebar-opt-active {
  background:rgba(96,165,250,.18); color:#93c5fd; font-weight:600;
}
/* FAQ mode tag */
.anf-faq-mode-tag {
  font-size:11px; font-weight:500; color:#64748b;
  background:#f1f5f9; border:1px solid #e2e8f0;
  border-radius:20px; padding:2px 10px; margin-top:4px; display:inline-block;
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
.anf-header-btn-outline {
  background:transparent; color:#274B95; border-color:#274B95;
}
.anf-header-btn-outline:hover { background:#274B95; color:#fff; }
.anf-header-btn:disabled { opacity:.4; cursor:not-allowed; pointer-events:none; }
@keyframes anf-spin { to { transform:rotate(360deg) } }
.anf-pr-spin { animation:anf-spin .75s linear infinite; }
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
/* Collapsed state: cap height and show gradient fade */
.anf-tw-coll {
  max-height:232px; overflow:hidden; position:relative;
}
.anf-tw-fade {
  position:absolute; bottom:0; left:0; right:0; height:72px;
  background:linear-gradient(to bottom, transparent, rgba(255,255,255,0.96));
  pointer-events:none;
}
.anf-show-more {
  display:block; width:100%; margin:-4px 0 10px;
  padding:8px 12px; text-align:center;
  background:#f0f5ff; border:1px solid #c7d7f9; border-radius:0 0 10px 10px;
  color:#274B95; font-size:12.5px; font-weight:500; cursor:pointer;
  transition:background .15s;
}
.anf-show-more:hover { background:#dce8ff; }
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

/* ── FAQ tab bar ──────────────────────────────────────────────────────────── */
.anf-faq-tabs {
  display:flex; gap:0; border-bottom:1px solid #e2e8f0;
  background:#f8fafc; padding:0 22px; flex-shrink:0;
}
.anf-faq-tab {
  padding:11px 18px; font-size:13px; font-weight:500; cursor:pointer;
  background:none; border:none; border-bottom:2px solid transparent;
  color:#64748b; font-family:inherit; transition:all .15s;
  margin-bottom:-1px;
}
.anf-faq-tab:hover { color:#0f172a; }
.anf-faq-tab-active {
  color:#274B95; border-bottom-color:#274B95; font-weight:600;
}

/* ── S2P card variants ────────────────────────────────────────────────────── */
.anf-tq-card-s2p {
  border-left:3px solid #e2e8f0; transition:border-color .15s;
}
.anf-tq-card-s2p:hover { border-left-color:#274B95; }
.anf-tq-try-s2p {
  background:#f5f3ff; border-color:#ddd6fe; color:#7c3aed;
}
.anf-tq-try-s2p:hover { background:#7c3aed; color:#fff; border-color:#7c3aed; }

/* ── Error / info toast ───────────────────────────────────────────────────── */
.anf-toast {
  position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
  display:flex; align-items:flex-start; gap:10px; z-index:200;
  background:#fff; border:1px solid #fcd34d; border-left:3px solid #f59e0b;
  border-radius:10px; padding:12px 16px; max-width:460px; width:90vw;
  box-shadow:0 8px 24px rgba(0,0,0,.12); font-size:13px; color:#92400e;
  animation:anf-slide-up .25s ease;
}
.anf-toast.anf-toast-ok {
  border-color:#bbf7d0; border-left-color:#22c55e; color:#166534;
}
@keyframes anf-slide-up {
  from { opacity:0; transform:translateX(-50%) translateY(12px); }
  to   { opacity:1; transform:translateX(-50%) translateY(0); }
}
.anf-toast-close {
  margin-left:auto; background:none; border:none; color:#9ca3af;
  font-size:18px; cursor:pointer; line-height:1; padding:0; flex-shrink:0;
}
.anf-toast-close:hover { color:#0f172a; }

/* ── Oracle PR Modal ─────────────────────────────────────────────────────── */
.anf-pr-modal {
  background:#fff; border-radius:14px; width:min(920px,96vw);
  max-height:92vh; display:flex; flex-direction:column;
  overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,.22);
  animation:anf-modal-pop .18s ease;
}
@keyframes anf-modal-pop {
  from { opacity:0; transform:scale(.97) translateY(8px); }
  to   { opacity:1; transform:scale(1)   translateY(0); }
}
/* Oracle brand bar — dark charcoal matching Oracle Fusion UI */
.anf-pr-oracle-bar {
  display:flex; align-items:center; justify-content:space-between;
  padding:0 20px; height:48px;
  background:#3a3a3a;
  flex-shrink:0;
  border-bottom:3px solid #C74634;
}
.anf-pr-oracle-logo {
  display:flex; align-items:center; gap:14px;
}
.anf-pr-oracle-divider {
  width:1px; height:22px; background:rgba(255,255,255,.2);
}
.anf-pr-oracle-app {
  color:rgba(255,255,255,.85); font-size:13px; font-weight:400;
  letter-spacing:.1px;
}
.anf-pr-status-badge {
  font-size:10px; font-weight:700; letter-spacing:1.2px;
  background:#C74634; color:#fff;
  border-radius:3px; padding:3px 9px;
}
/* scrollable body */
.anf-pr-body {
  overflow-y:auto; padding:22px 28px; display:flex; flex-direction:column; gap:18px;
}
/* top meta strip */
.anf-pr-meta-strip {
  display:flex; gap:16px; flex-wrap:wrap;
  background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px;
  padding:14px 18px;
}
.anf-pr-meta-item { display:flex; flex-direction:column; gap:4px; flex:1; min-width:140px; }
.anf-pr-meta-lbl { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:#64748b; }
.anf-pr-meta-val { font-size:13px; font-weight:600; color:#0f172a; }
/* sections */
.anf-pr-section { display:flex; flex-direction:column; gap:8px; }
.anf-pr-section-title {
  font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.7px;
  color:#475569; border-bottom:1px solid #e2e8f0; padding-bottom:6px;
}
/* grid for header fields */
.anf-pr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; }
.anf-pr-field { display:flex; flex-direction:column; gap:4px; }
.anf-pr-lbl { font-size:11px; font-weight:500; color:#64748b; }
.anf-pr-input {
  padding:7px 10px; border:1px solid #e2e8f0; border-radius:6px;
  font-size:13px; color:#0f172a; font-family:inherit;
  background:#fff; outline:none; width:100%; box-sizing:border-box;
  transition:border-color .15s;
}
.anf-pr-input:focus { border-color:#274B95; box-shadow:0 0 0 2px rgba(39,75,149,.1); }
.anf-pr-textarea {
  padding:9px 12px; border:1px solid #e2e8f0; border-radius:8px;
  font-size:13px; color:#0f172a; font-family:inherit; resize:vertical;
  outline:none; transition:border-color .15s; width:100%; box-sizing:border-box;
}
.anf-pr-textarea:focus { border-color:#274B95; box-shadow:0 0 0 2px rgba(39,75,149,.1); }
/* line items table */
.anf-pr-table-wrap { overflow-x:auto; border-radius:8px; border:1px solid #e2e8f0; }
.anf-pr-table { width:100%; border-collapse:collapse; font-size:12px; }
.anf-pr-table thead { background:#f1f5f9; }
.anf-pr-table th {
  padding:8px 10px; text-align:left; font-size:10px; font-weight:700;
  text-transform:uppercase; letter-spacing:.5px; color:#475569;
  border-bottom:1px solid #e2e8f0; white-space:nowrap;
}
.anf-pr-table td { padding:5px 6px; border-bottom:1px solid #f1f5f9; }
.anf-pr-table tbody tr:last-child td { border-bottom:none; }
.anf-pr-table tbody tr:hover { background:#fafafa; }
.anf-pr-cell-input {
  width:100%; padding:5px 8px; border:1px solid transparent; border-radius:5px;
  font-size:12px; font-family:inherit; color:#0f172a; background:transparent;
  outline:none; min-width:80px; box-sizing:border-box;
}
.anf-pr-cell-input:focus { border-color:#274B95; background:#fff; box-shadow:0 0 0 2px rgba(39,75,149,.1); }
.anf-pr-add-line {
  font-size:12px; font-weight:600; color:#274B95; background:none; border:1px dashed #93c5fd;
  border-radius:6px; padding:4px 12px; cursor:pointer; transition:all .15s;
}
.anf-pr-add-line:hover { background:#eff6ff; border-color:#274B95; }
.anf-pr-rm-line {
  background:none; border:none; color:#cbd5e1; font-size:16px; cursor:pointer;
  padding:0 4px; line-height:1; transition:color .15s;
}
.anf-pr-rm-line:hover { color:#ef4444; }
/* approval chain */
.anf-pr-approval-step {
  background:#f0f4ff; color:#274B95; border:1px solid #c7d7f7;
  border-radius:20px; padding:4px 12px; font-size:12px; font-weight:600;
  white-space:nowrap;
}
/* footer */
.anf-pr-footer {
  display:flex; justify-content:flex-end; gap:10px; padding:16px 28px;
  border-top:1px solid #f1f5f9; flex-shrink:0; background:#fafafa;
}
.anf-pr-cancel {
  padding:9px 20px; border-radius:8px; border:1px solid #e2e8f0;
  background:#fff; color:#475569; font-size:13px; font-weight:600;
  cursor:pointer; font-family:inherit; transition:all .15s;
}
.anf-pr-cancel:hover { background:#f1f5f9; border-color:#cbd5e1; }
.anf-pr-submit {
  padding:9px 22px; border-radius:6px; border:none;
  background:#C74634;
  color:#fff; font-size:13px; font-weight:700;
  cursor:pointer; font-family:inherit; transition:all .15s;
  display:flex; align-items:center; gap:7px;
  box-shadow:0 2px 6px rgba(199,70,52,.35);
}
.anf-pr-submit:hover { background:#a8382a; box-shadow:0 4px 12px rgba(199,70,52,.45); }
/* success state */
.anf-pr-success {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:60px 40px; gap:14px; text-align:center;
}
.anf-pr-success-icon {
  width:64px; height:64px; border-radius:50%;
  background:#dcfce7; color:#16a34a;
  display:flex; align-items:center; justify-content:center;
  margin-bottom:8px;
}
.anf-pr-success h3 { font-size:20px; font-weight:700; color:#0f172a; margin:0; }
.anf-pr-success p  { font-size:14px; color:#475569; margin:0; }
.anf-pr-success-sub { font-size:13px; color:#94a3b8; max-width:400px; }
.anf-pr-success-dismiss { font-size:12px; color:#cbd5e1; margin-top:4px; }
.anf-pr-done-btn {
  margin-top:6px; padding:9px 28px; border-radius:7px; border:1px solid #e2e8f0;
  background:#fff; color:#475569; font-size:13px; font-weight:600;
  cursor:pointer; font-family:inherit; transition:all .15s;
}
.anf-pr-done-btn:hover { background:#f1f5f9; border-color:#cbd5e1; }

/* ── GrabCard ──────────────────────────────────────────────────────────────── */
.gc-root { display:flex; flex-direction:column; gap:18px; font-size:14px; color:#1e293b; }
.gc-badge {
  display:inline-block; width:fit-content;
  background:#f3f0ff; color:#6d28d9; border:1px solid #c4b5fd;
  border-radius:20px; padding:4px 14px; font-size:12px; font-weight:600;
}
.gc-text p { margin:0 0 8px; line-height:1.65; }
.gc-text p:last-child { margin-bottom:0; }

/* Section */
.gc-section { display:flex; flex-direction:column; gap:10px; }
.gc-section-title {
  font-size:11px; font-weight:700; letter-spacing:.08em;
  color:#94a3b8; text-transform:uppercase;
}

/* Owners */
.gc-owners { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; }
.gc-owner-card {
  background:#fff; border:1px solid #e2e8f0; border-radius:10px;
  padding:12px 14px; display:flex; flex-direction:column; gap:4px;
}
.gc-owner-name  { font-weight:700; font-size:14px; color:#0f172a; }
.gc-owner-email {
  display:flex; align-items:center; gap:5px;
  font-size:12.5px; color:#3b82f6;
}
.gc-owner-meta  { font-size:12px; color:#64748b; display:flex; align-items:center; gap:4px; }
.gc-owner-sep   { color:#cbd5e1; }

/* Suppliers table */
.gc-sup-wrap {
  border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;
  background:#fff;
}
.gc-sup-table { width:100%; border-collapse:collapse; font-size:13px; }
.gc-sup-table thead { background:#274B95; color:#fff; }
.gc-sup-table thead th {
  padding:10px 14px; text-align:left; font-weight:600;
  font-size:12px; white-space:nowrap;
}
.gc-sup-table tbody tr { border-top:1px solid #f1f5f9; }
.gc-sup-table tbody tr:first-child { border-top:none; }
.gc-sup-table td { padding:10px 14px; vertical-align:top; color:#334155; }
.gc-sup-name { font-weight:600; color:#0f172a; }
.gc-sup-desc { font-size:12px; color:#64748b; margin-top:2px; }
.gc-tier {
  display:inline-block; border-radius:12px; padding:2px 10px;
  font-size:11.5px; font-weight:600;
}
.gc-tier-preferred { background:#dcfce7; color:#15803d; }
.gc-tier-approved  { background:#dbeafe; color:#1d4ed8; }
.gc-tier-other     { background:#f1f5f9; color:#475569; }
.gc-pcard { text-align:center; }
.gc-pcard-no  { color:#ef4444; font-weight:700; font-size:15px; }
.gc-pcard-yes { color:#16a34a; font-weight:700; font-size:15px; }

/* Approval chain */
.gc-chain {
  display:flex; flex-wrap:wrap; align-items:center; gap:8px;
  background:#fff; border:1px solid #e2e8f0; border-radius:10px;
  padding:14px 16px;
}
.gc-chain-step {
  background:#f0f4ff; color:#1e3a8a; border:1px solid #c7d7f7;
  border-radius:20px; padding:5px 14px; font-size:12.5px; font-weight:600;
  white-space:nowrap;
}
.gc-chain-arrow { color:#94a3b8; font-size:16px; font-weight:700; }

/* Process steps */
.gc-steps { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
.gc-step-item { display:flex; align-items:flex-start; gap:12px; }
.gc-step-num {
  min-width:28px; height:28px; border-radius:50%;
  background:#1e3a8a; color:#fff;
  display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700; flex-shrink:0;
}
.gc-step-text { line-height:1.55; padding-top:5px; color:#334155; }

/* Compliance note */
.gc-compliance {
  display:flex; align-items:flex-start; gap:10px;
  background:#fff7ed; border-left:4px solid #f97316;
  border-radius:0 8px 8px 0; padding:12px 14px;
  color:#92400e; font-size:13px; line-height:1.55;
}
`
