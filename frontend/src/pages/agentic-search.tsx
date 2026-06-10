import { useState, useRef, useEffect } from "react"
import { withAuthGuard } from "@/components/AuthGuard"

const PDF_OPTIONS = [
  {
    key:      "360one",
    label:    "360One Data",
    file:     "/sample-360one.pdf",
    title:    "360 ONE MF — Sample Document",
  },
  {
    key:      "grab",
    label:    "Grab Sample Data",
    file:     "/sample-grab.pdf",
    title:    "Grab Q1 2026 Results",
  },
] as const

type PdfKey = typeof PDF_OPTIONS[number]["key"]

function AgenticSearch() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [activePdf,    setActivePdf]    = useState<PdfKey | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", onOutside)
    return () => document.removeEventListener("mousedown", onOutside)
  }, [dropdownOpen])

  const selected = PDF_OPTIONS.find(o => o.key === activePdf)

  return (
    // Transparent container — the iframe lives in _app.tsx behind this page
    <div style={{ height: "100vh", background: "transparent", position: "relative" }}>

      {/* ── Sample PDF button + dropdown ──────────────────────────────────── */}
      <div
        ref={dropdownRef}
        style={{ position: "absolute", top: 8, right: 60, zIndex: 10 }}
      >
        {/* Trigger button — styled to blend with the iframe header */}
        <button
          onClick={() => setDropdownOpen(o => !o)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 11px", background: "#fff", color: "#1e293b",
            borderRadius: 6, fontSize: 12.5, fontWeight: 500,
            border: "1px solid #e2e8f0", cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,.07)",
            fontFamily: "inherit", transition: "background .15s, border-color .15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
        >
          <svg viewBox="0 0 20 20" fill="none" width={14} height={14}
               stroke="#475569" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
            <path d="M12 2v4h4"/>
            <path d="M7 11h6M7 14h4"/>
          </svg>
          Sample PDF
          {/* chevron */}
          <svg viewBox="0 0 12 12" fill="none" width={10} height={10}
               stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
               style={{ marginLeft: 1, transition: "transform .15s", transform: dropdownOpen ? "rotate(180deg)" : "none" }}>
            <path d="M2 4l4 4 4-4"/>
          </svg>
        </button>

        {/* Dropdown menu */}
        {dropdownOpen && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            background: "#fff", borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,.18)", border: "1px solid #e2e8f0",
            minWidth: 210, overflow: "hidden",
            animation: "as-pop-in .14s ease",
            zIndex: 20,
          }}>
            {PDF_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => { setActivePdf(opt.key); setDropdownOpen(false) }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "11px 16px",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 500, color: "#0f172a",
                  textAlign: "left", fontFamily: "inherit",
                  transition: "background .12s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                <svg viewBox="0 0 20 20" fill="none" width={14} height={14}
                     stroke="#C74634" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
                  <path d="M12 2v4h4"/><path d="M7 11h6M7 14h4"/>
                </svg>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── PDF modal ────────────────────────────────────────────────────── */}
      {activePdf && selected && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setActivePdf(null) }}
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
                  {selected.title}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <a
                  href={selected.file}
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
                  onClick={() => setActivePdf(null)}
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
              src={selected.file}
              style={{ flex: 1, border: "none", display: "block" }}
              title={selected.title}
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
