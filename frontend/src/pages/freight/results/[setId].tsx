import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { withAuthGuard } from "@/components/AuthGuard";
import { SourceViewerToolbar, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/components/SourceViewerToolbar";
import { Spinner } from "@/components/ui";
import { useFreight } from "@/contexts/FreightContext";
import { DOCUMENT_SETS } from "@/data/freightData";
import type { ActiveBbox } from "@/components/PdfViewer";

const PdfViewer = dynamic(
  () => import("@/components/PdfViewer").then(m => m.PdfViewer),
  { ssr: false, loading: () => <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%" }}><Spinner size="lg" /></div> }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

const toneColor: Record<string, string> = {
  red: "#b91c1c", amber: "#b45309", green: "#15803d", neutral: "#475569",
};
const toneBg: Record<string, string> = {
  red: "#fef2f2", amber: "#fffbeb", green: "#f0fdf4", neutral: "#f8fafc",
};

// ── Discrepancy step ──────────────────────────────────────────────────────────

function DiscrepancyStep({ setId, lineItems, onApprove, resolved, onConfirm }: {
  setId: string;
  lineItems: { id: string; charge: string; agreed: string; invoice: string; variance: string; varianceTone: string; status: string; requiresDecision: boolean }[];
  onApprove: (id: string) => void;
  resolved: boolean;
  onConfirm: () => void;
}) {
  const set = DOCUMENT_SETS[setId];
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "exceptions" | "matched">("all");

  const exceptions = lineItems.filter(i => i.requiresDecision);
  const matched    = lineItems.filter(i => !i.requiresDecision);
  const displayed  = tab === "exceptions" ? exceptions : matched;
  const selectedItem = lineItems.find(i => i.id === selected);

  // All items shown in the left panel (not tabbed — show all like the screenshot)
  const allDisplayed = lineItems;

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, minHeight:0, overflow:"hidden" }}>
      {/* ── Sub-tabs: Metadata | Line Items (matches invoice matching page) ── */}
      <div style={{ display:"flex", borderBottom:"1px solid #e2e8f0", padding:"0 24px", background:"#fff", flexShrink:0 }}>
        <span style={{ padding:"12px 0", marginRight:28, fontSize:14, fontWeight:500, color:"#4b5563", borderBottom:"2px solid transparent" }}>Metadata</span>
        <span style={{ padding:"12px 0", fontSize:14, fontWeight:600, color:"#1677ff", borderBottom:"2px solid #1677ff" }}>Line Items</span>
      </div>

      {/* ── All / Matched / Exceptions tabs ── */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 16px", borderBottom:"1px solid #e2e8f0", background:"#fff", flexShrink:0 }}>
        {([
          ["all",        `All ${lineItems.length}`,          lineItems.length],
          ["matched",    `Matched ${matched.length}`,        matched.length],
          ["exceptions", `Exceptions ${exceptions.length}`,  exceptions.length],
        ] as [string,string,number][]).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key as "exceptions"|"matched"); setSelected(null); }}
            style={{ padding:"4px 12px", fontSize:13, fontWeight: (tab===key||key==="all") ? 600 : 400, color: key==="all" ? "#0f172a" : tab===key ? "#1677ff" : "#64748b", background:"none", border:"none", cursor:"pointer", borderBottom: tab===key&&key!=="all" ? "2px solid #1677ff" : "2px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex:1, display:"grid", gridTemplateColumns:"480px 1fr", minHeight:0, overflow:"hidden" }}>

        {/* ── Left: line items table (exactly like invoice matching left panel) ── */}
        <div style={{ borderRight:"1px solid #e2e8f0", display:"flex", flexDirection:"column", overflow:"hidden", background:"#fff" }}>
          <div style={{ flex:1, overflowY:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead style={{ position:"sticky", top:0, zIndex:1 }}>
                <tr style={{ background:"#fafafa", borderBottom:"1px solid #e2e8f0" }}>
                  <th style={{ width:32, padding:"10px 8px 10px 16px" }} />
                  <th style={{ padding:"10px 8px", textAlign:"left", fontSize:11.5, fontWeight:600, color:"#94a3b8" }}>Description</th>
                  <th style={{ padding:"10px 8px", textAlign:"right", fontSize:11.5, fontWeight:600, color:"#94a3b8" }}>BOL Amount</th>
                  <th style={{ padding:"10px 8px", textAlign:"right", fontSize:11.5, fontWeight:600, color:"#94a3b8" }}>Invoice Amount</th>
                  <th style={{ padding:"10px 16px 10px 8px", textAlign:"right", fontSize:11.5, fontWeight:600, color:"#94a3b8" }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {(tab==="matched" ? matched : tab==="exceptions" ? exceptions : allDisplayed).map((item, idx) => {
                  const isException = item.requiresDecision;
                  const isApproved  = item.status === "approved-exception";
                  const isSelected  = selected === item.id;
                  return (
                    <tr key={item.id} onClick={() => setSelected(item.id)}
                      style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer", background: isSelected ? "#f0f7ff" : "#fff" }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background="#f8fafc"; }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background="#fff"; }}>
                      {/* status dot */}
                      <td style={{ padding:"10px 8px 10px 16px", verticalAlign:"middle" }}>
                        {isException && !isApproved
                          ? <div style={{ width:8, height:8, borderRadius:"50%", background:"#f59e0b", margin:"0 5px" }} />
                          : <div style={{ width:8, height:8, borderRadius:"50%", background:"#d1d5db", margin:"0 5px" }} />}
                      </td>
                      <td style={{ padding:"10px 8px", verticalAlign:"middle" }}>
                        <div style={{ fontSize:11.5, fontWeight:600, color:"#64748b", marginBottom:2 }}>
                          CHG-{String(idx+1).padStart(4,"0")}
                        </div>
                        <div style={{ fontSize:13, color:"#0f172a", fontWeight:500 }}>{item.charge}</div>
                      </td>
                      <td style={{ padding:"10px 8px", textAlign:"right", fontSize:13, color:"#475569", fontFamily:"monospace", verticalAlign:"middle" }}>{item.agreed}</td>
                      <td style={{ padding:"10px 8px", textAlign:"right", fontSize:13, fontWeight:600, fontFamily:"monospace", color: toneColor[item.varianceTone]||"#0f172a", verticalAlign:"middle" }}>{item.invoice}</td>
                      <td style={{ padding:"10px 16px 10px 8px", textAlign:"right", fontSize:13, fontWeight:700, fontFamily:"monospace", color: item.variance==="$0.00"?"#94a3b8": toneColor[item.varianceTone]||"#0f172a", verticalAlign:"middle" }}>{item.variance}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* footer */}
          {set && (
            <div style={{ padding:"10px 16px", borderTop:"1px solid #e2e8f0", fontSize:12.5, display:"flex", justifyContent:"space-between", background:"#fafafa", flexShrink:0 }}>
              <span style={{ color:"#475569" }}>Total Line Items: {lineItems.length}</span>
              <span style={{ fontWeight:700, color:"#0f172a", fontFamily:"monospace" }}>{set.amount}</span>
            </div>
          )}
        </div>

        {/* ── Right: detail panel (matches invoice right panel style) ── */}
        <div style={{ overflowY:"auto", background:"#fff" }}>
          {selectedItem ? (() => {
            const isException = selectedItem.requiresDecision;
            const isApproved  = selectedItem.status === "approved-exception";
            return (
              <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
                {/* header row — matches "ILI-0022 🟢 GRN PO-00058 | 7 Items Matched | Search" */}
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 20px", borderBottom:"1px solid #e2e8f0", background:"#fff", flexShrink:0 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>{selectedItem.charge}</span>
                  {isApproved || !isException
                    ? <div style={{ width:8, height:8, borderRadius:"50%", background:"#d1d5db" }} />
                    : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#f59e0b"/><path d="M8 5v4M8 10.5v.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>}
                  <span style={{ fontSize:12, fontWeight:600, color:"#94a3b8" }}>BOL</span>
                  <span style={{ fontSize:12.5, fontWeight:700, color:"#2563eb" }}>{set?.bolRef}</span>
                  <span style={{ flex:1 }} />
                  <span style={{ fontSize:12.5, color:"#64748b", fontWeight:500 }}>
                    {isApproved ? "Exception Accepted" : isException ? "1 Exception" : "Matched"}
                  </span>
                </div>

                {/* comparison table — matches right panel table exactly */}
                <div style={{ flex:1, overflowY:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead style={{ position:"sticky", top:0, zIndex:1 }}>
                      <tr style={{ background:"#fafafa", borderBottom:"1px solid #e2e8f0" }}>
                        <th style={{ width:32, padding:"10px 8px 10px 20px" }} />
                        <th style={{ padding:"10px 8px", textAlign:"left", fontSize:11.5, fontWeight:600, color:"#94a3b8" }}>Source</th>
                        <th style={{ padding:"10px 8px", textAlign:"left", fontSize:11.5, fontWeight:600, color:"#94a3b8" }}>Description</th>
                        <th style={{ padding:"10px 8px", textAlign:"right", fontSize:11.5, fontWeight:600, color:"#94a3b8" }}>Amount</th>
                        <th style={{ padding:"10px 20px 10px 8px", textAlign:"right", fontSize:11.5, fontWeight:600, color:"#94a3b8" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* BOL row */}
                      <tr style={{ borderBottom:"1px solid #f1f5f9", background:"#f0fdf4" }}>
                        <td style={{ padding:"12px 8px 12px 20px" }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:"#d1d5db" }} />
                        </td>
                        <td style={{ padding:"12px 8px", fontSize:12, fontWeight:600, color:"#64748b" }}>{set?.bolRef}</td>
                        <td style={{ padding:"12px 8px", fontSize:13, color:"#0f172a" }}>{selectedItem.charge} — BOL agreed rate</td>
                        <td style={{ padding:"12px 8px", textAlign:"right", fontSize:13, fontWeight:700, fontFamily:"monospace", color:"#0f172a" }}>{selectedItem.agreed}</td>
                        <td style={{ padding:"12px 20px 12px 8px", textAlign:"right" }}>
                          {isApproved
                            ? <span style={{ fontSize:12, fontWeight:600, color:"#15803d", background:"#dcfce7", padding:"2px 10px", borderRadius:4 }}>Approved</span>
                            : isException
                            ? <span style={{ fontSize:12, fontWeight:600, color:"#64748b", background:"#f1f5f9", padding:"2px 10px", borderRadius:4 }}>Agreed</span>
                            : <span style={{ fontSize:12, fontWeight:600, color:"#15803d", background:"#dcfce7", padding:"2px 10px", borderRadius:4 }}>Matched</span>}
                        </td>
                      </tr>
                      {/* Invoice row */}
                      <tr style={{ borderBottom:"1px solid #f1f5f9", background:"#fff" }}>
                        <td style={{ padding:"12px 8px 12px 20px" }}>
                          {isApproved
                            ? <div style={{ width:8, height:8, borderRadius:"50%", background:"#d1d5db" }} />
                            : isException
                            ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#f59e0b"/><path d="M8 5v4M8 10.5v.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                            : <div style={{ width:8, height:8, borderRadius:"50%", background:"#d1d5db" }} />}
                        </td>
                        <td style={{ padding:"12px 8px", fontSize:12, fontWeight:600, color:"#64748b" }}>{set?.invoiceNo}</td>
                        <td style={{ padding:"12px 8px", fontSize:13, color:"#0f172a" }}>
                          {selectedItem.charge} — Carrier billed
                          {isException && selectedItem.variance !== "$0.00" && (
                            <span style={{ marginLeft:8, fontSize:11.5, fontWeight:700, color: toneColor[selectedItem.varianceTone]||"#0f172a", fontFamily:"monospace" }}>
                              ({selectedItem.variance} variance)
                            </span>
                          )}
                        </td>
                        <td style={{ padding:"12px 8px", textAlign:"right", fontSize:13, fontWeight:700, fontFamily:"monospace", color: toneColor[selectedItem.varianceTone]||"#0f172a" }}>{selectedItem.invoice}</td>
                        <td style={{ padding:"12px 20px 12px 8px", textAlign:"right" }}>
                          {isApproved
                            ? <span style={{ fontSize:12, fontWeight:600, color:"#15803d", background:"#dcfce7", padding:"2px 10px", borderRadius:4 }}>Approved</span>
                            : isException
                            ? <span style={{ fontSize:12, fontWeight:600, color:"#b45309", background:"#fef3c7", padding:"2px 10px", borderRadius:4 }}>Exception</span>
                            : <span style={{ fontSize:12, fontWeight:600, color:"#15803d", background:"#dcfce7", padding:"2px 10px", borderRadius:4 }}>Matched</span>}
                        </td>
                      </tr>
                    </tbody>
                    {/* total row */}
                    <tfoot>
                      <tr style={{ background:"#f8fafc", borderTop:"2px solid #e2e8f0" }}>
                        <td colSpan={3} style={{ padding:"10px 8px 10px 20px", fontSize:13, fontWeight:700, color:"#0f172a" }}>Invoice Total (this line)</td>
                        <td style={{ padding:"10px 8px", textAlign:"right", fontSize:14, fontWeight:700, fontFamily:"monospace", color: toneColor[selectedItem.varianceTone]||"#0f172a" }}>{selectedItem.invoice}</td>
                        <td style={{ padding:"10px 20px 10px 8px" }} />
                      </tr>
                    </tfoot>
                  </table>

                  {/* AI Suggests + Approve */}
                  <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:12 }}>
                    <div style={{ border:"1px solid #e2e8f0", borderRadius:10, padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.2 3.3L12 4.8l-2.5 2.4.7 3.5L7 9l-3.2 1.7.7-3.5L2 4.8l3.8-.5L7 1z" fill="#6366f1"/></svg>
                        <span style={{ fontSize:12, fontWeight:700, color:"#6366f1", textTransform:"uppercase", letterSpacing:"0.06em" }}>AI Suggests</span>
                      </div>
                      <p style={{ fontSize:13, color:"#374151", margin:0, lineHeight:1.65 }}>
                        {selectedItem.varianceTone === "red"
                          ? `The ${selectedItem.charge} billed (${selectedItem.invoice}) exceeds the agreed BOL rate (${selectedItem.agreed}) by ${selectedItem.variance}. This variance exceeds the ±10% contractual tolerance. Recommend raising a formal dispute with the carrier before approving payment.`
                          : selectedItem.varianceTone === "amber"
                          ? `The ${selectedItem.charge} (${selectedItem.invoice}) appears on the carrier invoice but has no corresponding entry in the BOL. Verify whether this charge is legitimate under your service agreement before approving.`
                          : `This line item matches the BOL exactly. No discrepancy found — no further action required.`}
                      </p>
                    </div>

                    {isException && !isApproved && (
                      <button onClick={() => onApprove(selectedItem.id)}
                        style={{ borderRadius:8, padding:"11px 0", width:"100%", fontSize:13.5, fontWeight:600, color:"#fff", background:"#1876FF", border:"none", cursor:"pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.background="#0f65e3")}
                        onMouseLeave={e => (e.currentTarget.style.background="#1876FF")}>
                        Approve Exception
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })() : (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", color:"#94a3b8", gap:10 }}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="5" y="5" width="30" height="30" rx="6" stroke="#e2e8f0" strokeWidth="2"/><path d="M14 20h12M20 14v12" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round"/></svg>
              <div style={{ fontSize:14, fontWeight:500, color:"#64748b" }}>Select a line item to review</div>
              <div style={{ fontSize:12.5, color:"#cbd5e1" }}>Click any charge on the left to see the BOL vs invoice comparison</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{ padding:"10px 24px", borderTop:"1px solid #e2e8f0", background:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <span style={{ fontSize:13, color:"#64748b" }}>
          {resolved
            ? `All ${exceptions.length} exception${exceptions.length!==1?"s":""} reviewed`
            : `${exceptions.filter(i=>i.status!=="approved-exception").length} of ${exceptions.length} exception${exceptions.length!==1?"s":""} pending review`}
        </span>
        <button disabled={!resolved} onClick={onConfirm}
          style={{ height:32, padding:"0 18px", fontSize:13, fontWeight:500, color:"#fff", background: resolved?"#1876FF":"#e2e8f0", border:"none", borderRadius:6, cursor: resolved?"pointer":"not-allowed", display:"flex", alignItems:"center", gap:5 }}
          onMouseEnter={e=>{ if(resolved)(e.currentTarget.style.background="#0f65e3"); }}
          onMouseLeave={e=>{ if(resolved)(e.currentTarget.style.background="#1876FF"); }}>
          Confirm &amp; View Report
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2.5L8 6 4 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── Report step ───────────────────────────────────────────────────────────────

function ReportStep({ setId, lineItems, onSubmit, submitted }: {
  setId: string;
  lineItems: { id: string; charge: string; agreed: string; invoice: string; variance: string; varianceTone: string; status: string; requiresDecision: boolean }[];
  onSubmit: () => void;
  submitted: boolean;
}) {
  const set = DOCUMENT_SETS[setId];
  if (!set) return null;
  const [actionKey, setActionKey] = useState<string|null>(null);
  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sent, setSent] = useState(false);

  const ACTIONS: Record<string,{title:string;to:string;subject:string;body:string}> = {
    dispute: { title:"Raise Dispute with Carrier", to:"carrier-ap@maerskline.com", subject:`Dispute — BOL ${set.bolRef}`, body:`Dear ${set.carrier} AP Team,\n\nWe formally dispute invoice ${set.invoiceNo} referencing BOL ${set.bolRef}.\n\nExceptions:\n${set.exceptions.map((e,i)=>`${i+1}. ${e.title} — ${e.detail}`).join("\n")}\n\nPlease respond within 14 days.\n\nBest regards,\nAP Team` },
    breakdown: { title:"Request Breakdown", to:"carrier-ap@maerskline.com", subject:`Breakdown Request — ${set.invoiceNo}`, body:`Dear ${set.carrier} AP Team,\n\nPlease provide breakdown for:\n${set.exceptions.map(e=>`• ${e.title}`).join("\n")}\n\nBest regards,\nAP Team` },
    escalate: { title:"Escalate to Manager", to:"ap.manager@company.com", subject:`Escalation — ${set.invoiceNo}`, body:`Hi,\n\nEscalating invoice ${set.invoiceNo} from ${set.carrier}.\nAmount: ${set.amount}\nExceptions: ${set.exceptions.length}\n\nPlease advise.\n\nBest regards,\nAP Team` },
  };

  function openAction(key: string) {
    const cfg = ACTIONS[key];
    setActionKey(key); setGenerating(true); setSent(false); setDraftBody("");
    setTimeout(() => { setDraftTo(cfg.to); setDraftSubject(cfg.subject); setDraftBody(cfg.body); setGenerating(false); }, 2200);
  }

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"24px 32px", background:"#f8fafc" }}>

      {/* AI insight */}
      <div style={{ display:"flex", gap:14, borderRadius:12, padding:"16px 18px", background:"#f0fdfa", border:"1px solid #99f6e4", marginBottom:20 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:"#0f766e", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1l1.3 3.4L12.5 5l-2.5 2.5.7 3.7L7.5 9.5l-3.2 1.7.7-3.7L2.5 5l3.7-.6L7.5 1z" fill="white"/></svg>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:"#0f766e", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>Neoflo AI Summary</div>
          <p style={{ fontSize:13.5, color:"#0f172a", margin:0, lineHeight:1.65 }}>{set.aiInsight}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
        {set.summaryCards.map(c => (
          <div key={c.label} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"14px 16px" }}>
            <div style={{ fontSize:10.5, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>{c.label}</div>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color: toneColor[c.tone] || "#0f172a" }}>{c.value}</div>
            <div style={{ fontSize:11.5, color:"#94a3b8", marginTop:5 }}>{c.note}</div>
          </div>
        ))}
      </div>

      {/* Exceptions */}
      {set.hasExceptions && (
        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:12, padding:"16px 18px", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L15 14H1L8 1z" stroke="#b45309" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 6v4" stroke="#b45309" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="11.5" r=".7" fill="#b45309"/></svg>
            <span style={{ fontSize:13.5, fontWeight:700, color:"#92400e" }}>Accepted Exceptions — {set.exceptions.length}</span>
          </div>
          {set.exceptions.map((e,i) => (
            <div key={e.title} style={{ display:"flex", gap:10, marginBottom:8 }}>
              <span style={{ width:20, height:20, borderRadius:"50%", background:"#b45309", color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</span>
              <p style={{ fontSize:13, color:"#0f172a", margin:0, lineHeight:1.55 }}><strong>{e.title}</strong> — {e.detail}</p>
            </div>
          ))}
          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            {(["dispute","breakdown","escalate"] as const).map(k => (
              <button key={k} onClick={() => openAction(k)}
                style={{ borderRadius:8, padding:"8px 16px", fontSize:12.5, fontWeight:600, cursor:"pointer", background: k==="dispute"?"#274B95":"#fff", color: k==="dispute"?"#fff":"#92400e", border: k==="dispute"?"none":"1px solid #fde68a" }}>
                {k==="dispute"?"Raise Dispute":k==="breakdown"?"Request Breakdown":"Escalate to Manager"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Line item report table */}
      <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", marginBottom:20 }}>
        <div style={{ padding:"12px 18px", borderBottom:"1px solid #e2e8f0", fontSize:14, fontWeight:700, color:"#0f172a" }}>Line-Item Reconciliation Report</div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead><tr style={{ background:"#f8fafc" }}>
              {["Charge","BOL / Agreed","Invoice Amount","Variance","Status"].map((h,i) => (
                <th key={h} style={{ padding:"9px 16px", textAlign: i===4?"right":"left", fontSize:10.5, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.07em", borderBottom:"1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lineItems.map(item => (
                <tr key={item.id} style={{ borderTop:"1px solid #f1f5f9" }}>
                  <td style={{ padding:"10px 16px", fontWeight:500, color:"#0f172a" }}>{item.charge}</td>
                  <td style={{ padding:"10px 16px", fontFamily:"monospace", fontSize:12, color:"#475569" }}>{item.agreed}</td>
                  <td style={{ padding:"10px 16px", fontFamily:"monospace", fontSize:12, color:"#0f172a" }}>{item.invoice}</td>
                  <td style={{ padding:"10px 16px", fontFamily:"monospace", fontSize:12, fontWeight:600, color: toneColor[item.varianceTone] || "#0f172a" }}>{item.variance}</td>
                  <td style={{ padding:"10px 16px", textAlign:"right" }}>
                    {item.status==="approved" && <span style={{ fontSize:11.5, fontWeight:700, color:"#15803d", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:20, padding:"3px 10px" }}>Matched</span>}
                    {item.status==="approved-exception" && <span style={{ fontSize:11.5, fontWeight:700, color:"#b45309", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:20, padding:"3px 10px" }}>Exception Accepted</span>}
                    {item.status==="pending" && <span style={{ fontSize:11.5, fontWeight:700, color:"#b91c1c", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:20, padding:"3px 10px" }}>Pending</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submit */}
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <button onClick={onSubmit} disabled={submitted}
          style={{ borderRadius:10, padding:"12px 32px", fontSize:14, fontWeight:700, color:"#fff", background: submitted?"#e2e8f0":"#274B95", border:"none", cursor: submitted?"default":"pointer" }}
          onMouseEnter={e=>{ if(!submitted)(e.currentTarget.style.background="#1e3a7a"); }}
          onMouseLeave={e=>{ if(!submitted)(e.currentTarget.style.background="#274B95"); }}>
          {submitted ? "Submitted to AP ✓" : "Submit to AP Queue →"}
        </button>
      </div>

      {/* AI compose modal */}
      {actionKey && ACTIONS[actionKey] && (
        <div style={{ position:"fixed", inset:0, background:"rgba(4,28,76,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={() => setActionKey(null)}>
          <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:620, boxShadow:"0 20px 60px rgba(0,0,0,0.2)", display:"flex", flexDirection:"column", maxHeight:"90vh" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>{ACTIONS[actionKey].title}</div>
              <button onClick={() => setActionKey(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:20 }}>×</button>
            </div>
            {generating ? (
              <div style={{ padding:"48px 24px", display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
                <div style={{ position:"relative", width:52, height:52 }}>
                  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" style={{ animation:"spin 1.1s linear infinite", position:"absolute" }}>
                    <circle cx="26" cy="26" r="22" stroke="#e2e8f0" strokeWidth="3"/>
                    <path d="M26 4a22 22 0 0 1 22 22" stroke="#274B95" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2l1.8 5L17 7.7l-3.6 3.4.9 5.4L10 14l-4.3 2.5.9-5.4L3 7.7l5.2-.7L10 2z" fill="#274B95"/></svg>
                  </div>
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>Generating AI Email</div>
                <div style={{ fontSize:13, color:"#94a3b8" }}>Analysing exceptions and drafting a message…</div>
                <div style={{ display:"flex", gap:5 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"#274B95", animation:`dotBounce 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
                </div>
              </div>
            ) : sent ? (
              <div style={{ padding:32, textAlign:"center" }}>
                <div style={{ width:50, height:50, borderRadius:"50%", background:"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#15803d" strokeWidth="1.8"/><path d="M8 12l2.5 2.5 5.5-5.5" stroke="#15803d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div style={{ fontSize:16, fontWeight:700, color:"#0f172a", marginBottom:6 }}>Message Sent</div>
                <div style={{ fontSize:13, color:"#475569", marginBottom:20 }}>Sent to {draftTo}</div>
                <button onClick={() => setActionKey(null)} style={{ borderRadius:10, padding:"10px 28px", fontSize:13, fontWeight:600, color:"#fff", background:"#274B95", border:"none", cursor:"pointer" }}>Done</button>
              </div>
            ) : (
              <div style={{ flex:1, overflowY:"auto", padding:"16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:7, background:"#eff6ff", border:"1px solid #bfdbfe" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1l1.1 2.9L10 4.3l-2.1 2 .5 3L6 7.9l-2.4 1.4.5-3L2 4.3l2.9-.4L6 1z" fill="#274B95"/></svg>
                  <span style={{ fontSize:11.5, fontWeight:600, color:"#274B95" }}>AI-generated — review before sending</span>
                </div>
                {[["To", draftTo, setDraftTo], ["Subject", draftSubject, setDraftSubject]].map(([label, val, setter]) => (
                  <div key={label as string}>
                    <label style={{ fontSize:10.5, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.07em", display:"block", marginBottom:4 }}>{label as string}</label>
                    <input value={val as string} onChange={e => (setter as (v:string)=>void)(e.target.value)}
                      style={{ width:"100%", borderRadius:8, border:"1px solid #e2e8f0", padding:"8px 12px", fontSize:13, color:"#0f172a", outline:"none", boxSizing:"border-box" }} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize:10.5, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.07em", display:"block", marginBottom:4 }}>Message</label>
                  <textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={12}
                    style={{ width:"100%", borderRadius:8, border:"1px solid #e2e8f0", padding:"10px 12px", fontSize:13, color:"#0f172a", lineHeight:1.65, outline:"none", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                </div>
                <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                  <button onClick={() => setActionKey(null)} style={{ borderRadius:8, border:"1px solid #e2e8f0", background:"#fff", padding:"8px 16px", fontSize:13, fontWeight:600, color:"#475569", cursor:"pointer" }}>Cancel</button>
                  <button onClick={() => setSent(true)} style={{ borderRadius:8, border:"none", background:"#274B95", padding:"8px 18px", fontSize:13, fontWeight:600, color:"#fff", cursor:"pointer" }}>Send →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes dotBounce{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-6px);opacity:1}}`}</style>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type DocTab = "bol" | "invoice";
// ── Generating report step indicator ─────────────────────────────────────────

function GeneratingStep({ label, delay }: { label: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!visible) return null;

  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, animation:"fadeInStep 0.3s ease" }}>
      <div style={{ width:20, height:20, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="#15803d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <span style={{ fontSize:13.5, color:"#374151" }}>{label}</span>
    </div>
  );
}

type Step   = "review" | "discrepancy" | "report";

const STEP_ORDER: Step[] = ["review", "discrepancy", "report"];

// Per-setId report state persisted to localStorage
// Per-row (rowId) report tracking — independent of setId so multiple uploads don't bleed
function getReportKey(rowId: string) { return `freight_report_row_${rowId}`; }
function isReportGeneratedForRow(rowId: string) {
  if (typeof window === "undefined" || !rowId) return false;
  return localStorage.getItem(getReportKey(rowId)) === "1";
}
function markReportGeneratedForRow(rowId: string) {
  if (typeof window !== "undefined" && rowId) {
    localStorage.setItem(getReportKey(rowId), "1");
    // Also update completedRows in localStorage so status shows "Report Generated" in table
    try {
      const raw = localStorage.getItem("freight_completed_rows_v2");
      if (raw) {
        const rows = JSON.parse(raw);
        const updated = rows.map((r: { id: string; reportGenerated?: boolean }) =>
          r.id === rowId ? { ...r, reportGenerated: true } : r
        );
        localStorage.setItem("freight_completed_rows_v2", JSON.stringify(updated));
      }
    } catch { /* ignore */ }
  }
}

function ResultsPage() {
  const router = useRouter();
  const { setId, rowId } = router.query as { setId: string; rowId?: string };
  const { submitToAP } = useFreight();

  // PDF viewer state
  const [pdfPage, setPdfPage]   = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale]       = useState(0.8);
  const [rotate, setRotate]     = useState(0);

  // Start at "report" only if THIS specific row already generated a report
  const [step, setStep] = useState<Step>(() =>
    rowId && isReportGeneratedForRow(rowId) ? "report" : "review"
  );
  const [submitted,        setSubmitted]        = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [docTab,           setDocTab]           = useState<DocTab>("bol");
  const [activeTab,        setActiveTab]        = useState<"metadata"|"line_items">("metadata");

  // LOCAL line items — initialized from DOCUMENT_SETS.
  // If report already generated for this rowId → mark all exceptions as approved
  // so the user sees the final approved state when revisiting.
  const [localLineItems, setLocalLineItems] = useState<typeof DOCUMENT_SETS[string]["lineItems"]>(() => {
    const s = setId ? DOCUMENT_SETS[setId] : null;
    if (!s) return [];
    const alreadyDone = typeof window !== "undefined" && rowId && isReportGeneratedForRow(rowId as string);
    return s.lineItems.map(i =>
      alreadyDone && i.requiresDecision
        ? { ...i, status: "approved-exception" as const }
        : { ...i }
    );
  });



  function approveItem(itemId: string) {
    setLocalLineItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? { ...item, status: "approved-exception" as const, resolved: true }
          : item
      )
    );
  }

  const resolved = localLineItems
    .filter(i => i.requiresDecision)
    .every(i => i.status === "approved-exception");

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
    else router.push("/freight");
  }

  const set = setId ? DOCUMENT_SETS[setId] : null;

  if (!set) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", color:"#94a3b8", fontSize:14 }}>
        {setId ? "Reconciliation not found." : "Loading…"}
      </div>
    );
  }

  const lineItems = localLineItems;
  const activeBbox: ActiveBbox | null = null;

  // Which PDF to show based on docTab
  const pdfUrl = docTab === "bol"
    ? `/${set.bolFilename}`
    : `/${set.invoiceFilename}`;

  // Current panel's fields + charges
  const panel = docTab === "bol" ? set.bolPanel : set.invoicePanel;

  // Metadata rows (BOL or invoice fields)
  const metaRows = panel.fields;

  // Line-item rows (use lineItems for invoice tab, charges summary for BOL)
  const lineItemRows = docTab === "invoice" ? localLineItems : [];

  function handleSubmit() {
    submitToAP(setId);
    setSubmitted(true);
  }

  function goToReport() {
    setGeneratingReport(true);
    setTimeout(() => {
      if (rowId) markReportGeneratedForRow(rowId);
      setGeneratingReport(false);
      setStep("report");
    }, 2800);
  }

  return (
    <>
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", background:"#f4f6f9" }}>

      {/* ── Header (exact match to invoice review) ──────────────────────────── */}
      <div style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", background:"#fff", borderBottom:"1px solid #e2e8f0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={goBack}
            style={{ background:"none", border:"none", cursor:"pointer", color:"#64748b", display:"flex", alignItems:"center", padding:"16px 0" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 4L7.5 10l5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div>
            <h1 style={{ fontSize:16, fontWeight:600, color:"#1e293b", margin:0, lineHeight:"1.2" }}>
              {step === "review" ? "Reconciliation Review" : step === "discrepancy" ? "Discrepancy Review" : "Reconciliation Report"}
            </h1>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2, fontSize:12, color:"#64748b", flexWrap:"wrap" }}>
              <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                Manual Upload
              </span>
              <span>|</span>
              <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="1" width="9" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M4 4h4M4 7h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {set.invoiceNo}
              </span>
              <span>|</span>
              <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 10.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {set.carrier}
              </span>
              <span>|</span>
              <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {set.resultsHeader.date}
              </span>
            </div>
          </div>
        </div>

        {/* Step indicators + action buttons */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {/* step pills */}
          {([["review","1. Review"], ["discrepancy","2. Discrepancies"], ["report","3. Report"]] as [Step,string][]).map(([s, label]) => {
            const idx = ["review","discrepancy","report"].indexOf(s);
            const cur = ["review","discrepancy","report"].indexOf(step);
            const done = idx < cur;
            return (
              <span key={s} style={{ fontSize:12, fontWeight:500, padding:"3px 10px", borderRadius:20, background: done ? "#f0fdf4" : s===step ? "#eff6ff" : "#f8fafc", color: done ? "#15803d" : s===step ? "#274B95" : "#94a3b8", border: `1px solid ${done?"#bbf7d0":s===step?"#bfdbfe":"#e2e8f0"}` }}>
                {done ? "✓ " : ""}{label}
              </span>
            );
          })}

          <div style={{ width:1, height:24, background:"#e2e8f0", margin:"0 4px" }} />

          <button onClick={() => router.push("/freight")}
            style={{ padding:"6px 14px", fontSize:13, fontWeight:600, color:"#f87171", borderColor:"#f87171", border:"1px solid #f87171", background:"transparent", borderRadius:6, cursor:"pointer" }}>
            Reject
          </button>

          {step === "review" && (
            <button onClick={() => setStep("discrepancy")}
              style={{ height:32, padding:"0 16px", fontSize:13, fontWeight:500, background:"#1876FF", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
              Next
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2.5L8 6 4 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          {step === "report" && (
            <button onClick={handleSubmit} disabled={submitted}
              style={{ height:32, padding:"0 16px", fontSize:13, fontWeight:500, background: submitted?"#e2e8f0":"#274B95", color: submitted?"#94a3b8":"#fff", border:"none", borderRadius:6, cursor: submitted?"default":"pointer" }}>
              {submitted ? "Submitted ✓" : "Submit to AP"}
            </button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", minHeight:0, overflow:"hidden" }}>

        {/* ════════ REVIEW STEP ════════ */}
        {step === "review" && (<>

          {/* Left — PDF viewer (52%) */}
          <div style={{ width:"52%", flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid #e2e8f0" }}>
            {/* BOL / Invoice toggle above the viewer */}
            <div style={{ display:"flex", borderBottom:"1px solid #e2e8f0", background:"#fff", padding:"0 20px" }}>
              {([["bol","Bill of Lading"], ["invoice","Carrier Invoice"]] as [DocTab,string][]).map(([tab, label]) => (
                <button key={tab} onClick={() => { setDocTab(tab); setPdfPage(1); setNumPages(1); setActiveTab("metadata"); }}
                  style={{ padding:"10px 0", marginRight:24, fontSize:13.5, fontWeight:docTab===tab?700:500, color:docTab===tab?"#1677ff":"#4b5563", borderBottom:docTab===tab?"2px solid #1677ff":"2px solid transparent", background:"none", border:"none", cursor:"pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ flex:1, padding:"16px 20px", background:"#f8fafc", overflow:"auto" }}>
              <PdfViewer
                pdfUrl={pdfUrl}
                authToken={null}
                page={pdfPage}
                scale={scale}
                rotate={rotate}
                onNumPages={setNumPages}
                activeBbox={activeBbox}
              />
            </div>
            <SourceViewerToolbar
              scale={scale}
              onZoomOut={() => setScale(s => Math.max(ZOOM_MIN, parseFloat((s-ZOOM_STEP).toFixed(1))))}
              onZoomIn={() => setScale(s => Math.min(ZOOM_MAX, parseFloat((s+ZOOM_STEP).toFixed(1))))}
              rotate={rotate}
              onRotateLeft={() => setRotate(r => (r-90+360)%360)}
              onRotateRight={() => setRotate(r => (r+90)%360)}
              currentPage={pdfPage}
              totalPages={numPages}
              onPrev={() => setPdfPage(p => Math.max(1, p-1))}
              onNext={() => setPdfPage(p => Math.min(numPages, p+1))}
            />
          </div>

          {/* Right — Extracted Data panel (identical to invoice review) */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden", background:"#fff" }}>

            {/* Panel heading */}
            <div style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"20px 20px 8px" }}>
              <h2 style={{ fontSize:18, fontWeight:600, color:"#101828", margin:0 }}>Extracted Data</h2>
            </div>

            {/* Tabs — Metadata | Line Item */}
            <div style={{ flexShrink:0, display:"flex", borderBottom:"1px solid #e6e6e6", padding:"0 20px" }}>
              {([
                ["metadata", "Metadata", metaRows.length],
                ["line_items", "Line Item", docTab === "invoice" ? lineItems.length : panel.charges.length],
              ] as [string, string, number][]).map(([tab, label, count]) => {
                const isActive = activeTab === tab;
                return (
                  <button key={tab} onClick={() => setActiveTab(tab as "metadata"|"line_items")}
                    style={{ padding:"12px 0", marginRight:24, fontSize:14, fontWeight:500, color: isActive?"#1677FF":"#4B5563", borderBottom:`2px solid ${isActive?"#1677FF":"transparent"}`, background:"transparent", border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 }}>
                    {label}
                    <span style={{ padding:"2px 8px", borderRadius:4, fontSize:13, fontWeight:500, background: isActive?"#DBEAFE":"#E5E7EB", color: isActive?"#2563EB":"#4B5563", lineHeight:"18px" }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Table */}
            <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

              {activeTab === "metadata" && (
                <div style={{ border:"1px solid #E6E6E6", borderRadius:4, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
                    <thead>
                      <tr>
                        {["Field","Value"].map(h => (
                          <th key={h} style={{ textAlign:"left", fontSize:"0.8rem", fontWeight:600, padding:"4px 8px", lineHeight:"20px", backgroundColor:"#f6f3f4", border:"1px solid #e5e7eb", width: h==="Field"?"42%":undefined }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {metaRows.map((f,i) => (
                        <tr key={i} style={{ borderBottom:"1px solid #f3f4f6" }}>
                          <td style={{ padding:"8px 10px", fontSize:13, color:"#374151", fontWeight:500, borderRight:"1px solid #f3f4f6" }}>{f.label}</td>
                          <td style={{ padding:"8px 10px", fontSize:13, color: f.value ? "#111827" : "#9ca3af", fontFamily: f.mono ? "monospace" : "inherit" }}>
                            {f.value || <span style={{ color:"#fbbf24", background:"#fffbeb", padding:"1px 6px", borderRadius:4, fontSize:12, fontWeight:500 }}>Empty</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "line_items" && docTab === "invoice" && (
                <div style={{ border:"1px solid #E6E6E6", borderRadius:4, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr>
                        {["#","Code","Description","UOM","Qty","Unit Price","Total"].map(h => (
                          <th key={h} style={{ textAlign:"left", fontSize:"0.75rem", fontWeight:600, padding:"6px 10px", backgroundColor:"#f6f3f4", border:"1px solid #e5e7eb", color:"#6b7280" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom:"1px solid #f3f4f6" }}>
                          <td style={{ padding:"8px 10px", fontSize:12.5, color:"#6b7280" }}>{idx+1}</td>
                          <td style={{ padding:"8px 10px", fontSize:12.5, fontFamily:"monospace", color:"#111827", fontWeight:500 }}>{item.charge}</td>
                          <td style={{ padding:"8px 10px", fontSize:12.5, color:"#374151" }}>{item.charge}</td>
                          <td style={{ padding:"8px 10px", fontSize:12.5, color:"#6b7280" }}>EA</td>
                          <td style={{ padding:"8px 10px", fontSize:12.5, color:"#111827", fontFamily:"monospace" }}>—</td>
                          <td style={{ padding:"8px 10px", fontSize:12.5, color:"#111827", fontFamily:"monospace" }}>{item.agreed}</td>
                          <td style={{ padding:"8px 10px", fontSize:12.5, fontWeight:600, color:"#111827", fontFamily:"monospace" }}>{item.invoice}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "line_items" && docTab === "bol" && (
                <div style={{ border:"1px solid #E6E6E6", borderRadius:4, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr>
                        {["Charge","Amount","Note"].map(h => (
                          <th key={h} style={{ textAlign:"left", fontSize:"0.75rem", fontWeight:600, padding:"6px 10px", backgroundColor:"#f6f3f4", border:"1px solid #e5e7eb", color:"#6b7280" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {panel.charges.map((c,i) => (
                        <tr key={i} style={{ borderBottom:"1px solid #f3f4f6" }}>
                          <td style={{ padding:"8px 10px", fontSize:13, color:"#374151", fontWeight:500 }}>{c.label}</td>
                          <td style={{ padding:"8px 10px", fontSize:13, fontFamily:"monospace", fontWeight:600, color: toneColor[c.tone]||"#111827" }}>{c.value}</td>
                          <td style={{ padding:"8px 10px", fontSize:12, color:"#6b7280" }}>{c.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>)}

        {/* ════════ DISCREPANCY STEP ════════ */}
        {step === "discrepancy" && (
          <DiscrepancyStep
            setId={setId}
            lineItems={lineItems}
            onApprove={approveItem}
            resolved={resolved}
            onConfirm={goToReport}
          />
        )}

        {/* ════════ REPORT STEP ════════ */}
        {step === "report" && (
          <ReportStep setId={setId} lineItems={lineItems} onSubmit={handleSubmit} submitted={submitted} />
        )}
      </div>
    </div>

    {/* ── Generating Report overlay ── */}
    {generatingReport && (
      <div style={{ position:"fixed", inset:0, background:"rgba(255,255,255,0.92)", backdropFilter:"blur(6px)", zIndex:300, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:24 }}>
        {/* Animated icon */}
        <div style={{ position:"relative", width:72, height:72 }}>
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" style={{ animation:"spin 1.2s linear infinite", position:"absolute" }}>
            <circle cx="36" cy="36" r="30" stroke="#e2e8f0" strokeWidth="4"/>
            <path d="M36 6a30 30 0 0 1 30 30" stroke="#274B95" strokeWidth="4" strokeLinecap="round"/>
          </svg>
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 3l2.1 5.6L21.5 9l-4 3.8 1.2 6.2L14 16.2l-4.7 2.8 1.2-6.2L6.5 9l5.4-.4L14 3z" fill="#274B95"/>
            </svg>
          </div>
        </div>

        {/* Text */}
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:20, fontWeight:700, color:"#0f172a", marginBottom:8 }}>Generating Report</div>
          <div style={{ fontSize:14, color:"#64748b" }}>Analysing reconciliation data and compiling findings…</div>
        </div>

        {/* Progress steps */}
        <div style={{ display:"flex", flexDirection:"column", gap:10, minWidth:280 }}>
          {[
            ["Reviewing line item decisions", 0],
            ["Calculating discrepancy summary", 700],
            ["Preparing AI insights", 1400],
            ["Finalising report", 2100],
          ].map(([label, delay]) => (
            <GeneratingStep key={label as string} label={label as string} delay={delay as number} />
          ))}
        </div>

        <style>{`
          @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes fadeInStep { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        `}</style>
      </div>
    )}
    </>
  );
}

export default withAuthGuard(ResultsPage);
