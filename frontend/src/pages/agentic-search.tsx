import { useState } from "react"
import { withAuthGuard } from "@/components/AuthGuard"

function AgenticSearch() {
  const [pdfOpen, setPdfOpen] = useState(false)

  return (
    // Transparent container — the iframe lives in _app.tsx behind this page
    <div style={{ height: "100vh", background: "transparent", position: "relative" }}>

      {/* ── Sample PDF button ─────────────────────────────────────────────── */}
      <div style={{ position: "absolute", top: 14, right: 18, zIndex: 10 }}>
        <button
          onClick={() => setPdfOpen(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "8px 16px", background: "#274B95", color: "#fff",
            borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: "none", cursor: "pointer",
            boxShadow: "0 2px 8px rgba(39,75,149,.3)",
            fontFamily: "inherit", transition: "background .15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#041C4C")}
          onMouseLeave={e => (e.currentTarget.style.background = "#274B95")}
        >
          <svg viewBox="0 0 20 20" fill="none" width={15} height={15}
               stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
            <path d="M12 2v4h4"/>
            <path d="M7 11h6M7 14h4"/>
          </svg>
          Sample PDF
        </button>
      </div>

      {/* ── PDF modal ────────────────────────────────────────────────────── */}
      {pdfOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setPdfOpen(false) }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "as-fade-in .18s ease",
          }}
        >
          <div style={{
            width: "min(860px, 92vw)", height: "min(92vh, 1000px)",
            background: "#fff", borderRadius: 12, overflow: "hidden",
            display: "flex", flexDirection: "column",
            boxShadow: "0 24px 80px rgba(0,0,0,.35)",
            animation: "as-pop-in .18s ease",
          }}>
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 18px", borderBottom: "1px solid #e2e8f0",
              background: "#f8fafc", flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <svg viewBox="0 0 20 20" fill="none" width={16} height={16}
                     stroke="#C74634" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
                  <path d="M12 2v4h4"/><path d="M7 11h6M7 14h4"/>
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                  360 ONE MF — Sample Document
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <a
                  href="/sample-360one.pdf"
                  download
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: "#274B95", color: "#fff", textDecoration: "none",
                    transition: "background .15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#041C4C")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#274B95")}
                >
                  <svg viewBox="0 0 16 16" fill="none" width={12} height={12}
                       stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M5 7l3 3 3-3"/><path d="M2 13h12"/>
                  </svg>
                  Download
                </a>
                <button
                  onClick={() => setPdfOpen(false)}
                  style={{
                    width: 30, height: 30, borderRadius: 6, border: "1px solid #e2e8f0",
                    background: "#fff", cursor: "pointer", fontSize: 18, color: "#64748b",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    lineHeight: 1, transition: "all .15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget.style.background = "#f1f5f9"); (e.currentTarget.style.color = "#0f172a") }}
                  onMouseLeave={e => { (e.currentTarget.style.background = "#fff"); (e.currentTarget.style.color = "#64748b") }}
                >×</button>
              </div>
            </div>

            {/* PDF embed */}
            <iframe
              src="/sample-360one.pdf"
              style={{ flex: 1, border: "none", display: "block" }}
              title="360 ONE MF Sample PDF"
            />
          </div>

          <style>{`
            @keyframes as-fade-in { from { opacity:0 } to { opacity:1 } }
            @keyframes as-pop-in  { from { opacity:0; transform:scale(.96) translateY(10px) } to { opacity:1; transform:scale(1) translateY(0) } }
          `}</style>
        </div>
      )}
    </div>
  )
}

export default withAuthGuard(AgenticSearch)
