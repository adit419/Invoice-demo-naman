/**
 * Proxy for the GTM chat API — streams SSE from the backend to the browser.
 * Translates the GTM SSE format into the format the Ask Neo UI expects.
 * Auto-retries up to MAX_RETRIES times on transient backend errors.
 */
import type { NextApiRequest, NextApiResponse } from "next";

const GTM_BASE    = "http://65.1.10.248:5002";
const GTM_KEY     = "nf-gtm-2026-secure";
const MAX_RETRIES = 2;

export const config = { api: { bodyParser: true, responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { message, session_id, kg_mode } = req.body as {
    message: string; session_id?: string; kg_mode?: string
  };
  if (!message) { res.status(400).json({ error: "message required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");

  const sse = (obj: object) => { res.write(`data: ${JSON.stringify(obj)}\n\n`); };
  const t0  = Date.now();

  // Accumulators — reset on each retry attempt
  let answer     = "";
  let pdfUrls: string[] = [];
  let pdfUrlMap: Record<string, string> = {};
  let grabCard: unknown = null;
  let lastError  = "The backend encountered an error. Please try again.";
  let retryCount = 0;

  // ── helpers ──────────────────────────────────────────────────────────────

  // GTM sometimes sends literal (unescaped) newlines inside JSON string values.
  // This state machine escapes them so JSON.parse succeeds.
  function escapeNewlinesInStrings(s: string): string {
    let out = "", inStr = false, esc = false;
    for (const ch of s) {
      if (esc)               { out += ch; esc = false; }
      else if (ch === "\\")  { out += ch; esc = true;  }
      else if (ch === '"')   { out += ch; inStr = !inStr; }
      else if (inStr && ch === "\n") { out += "\\n"; }
      else if (inStr && ch === "\r") { out += "\\r"; }
      else                   { out += ch; }
    }
    return out;
  }

  function proxyUrls(urls: string[]): string[] {
    return urls.map(u => {
      try {
        const parsed = new URL(u);
        const fn  = parsed.searchParams.get("fn")  || "";
        const rid = parsed.searchParams.get("rid") || "";
        return `/api/ask-neo/pdf-proxy?fn=${encodeURIComponent(fn)}&rid=${encodeURIComponent(rid)}`;
      } catch { return u; }
    });
  }

  // GTM S2P mode embeds the grab card as $$GRAB_CARD$${...json} inside the answer text.
  // Extract it, strip the marker, and return the parsed card object.
  function proxyUrlMap(map: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, url] of Object.entries(map)) {
      try {
        const parsed = new URL(url);
        const fn  = parsed.searchParams.get("fn")  || "";
        const rid = parsed.searchParams.get("rid") || "";
        out[key] = `/api/ask-neo/pdf-proxy?fn=${encodeURIComponent(fn)}&rid=${encodeURIComponent(rid)}`;
      } catch { out[key] = url; }
    }
    return out;
  }

  function extractGrabCard(text: string): { cleanText: string; card: unknown } {
    const MARKER = "$$GRAB_CARD$$";
    const idx = text.indexOf(MARKER);
    if (idx === -1) return { cleanText: text, card: null };
    const jsonStr = text.slice(idx + MARKER.length).trim();
    let card: unknown = null;
    try { card = JSON.parse(jsonStr); } catch {}
    return { cleanText: text.slice(0, idx).trim(), card };
  }

  function processEvent(dataLines: string[]): "done" | "retry" | undefined {
    if (dataLines.length === 0) return;
    const joined = dataLines.join("\n");
    const raw    = escapeNewlinesInStrings(joined);
    if (!raw.trim()) return;

    let event: Record<string, unknown> | undefined;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      console.error("[chat.ts] JSON.parse failed:", String(e), "| raw (first 300):", raw.slice(0, 300));
      return;
    }
    if (!event) return;

    const type = event.type as string;

    if (type === "status") {
      // Only forward trace events on the first attempt to avoid duplicate indicators on retry
      if (retryCount === 0) {
        sse({ type: "trace", step: { step: "status", message: event.message } });
      }

    } else if (type === "answer") {
      const rawText = (event.text as string) || "";
      const extracted = extractGrabCard(rawText);
      answer  = extracted.cleanText;
      if (extracted.card) grabCard = extracted.card;
      pdfUrls = (event.pdf_urls as string[]) || pdfUrls;
      if (event.pdf_url_map) pdfUrlMap = event.pdf_url_map as Record<string, string>;
      if (event.grab_card !== undefined) grabCard = event.grab_card;

    } else if (type === "done") {
      if (event.pdf_urls)                pdfUrls  = event.pdf_urls  as string[];
      if (event.pdf_url_map)             pdfUrlMap = event.pdf_url_map as Record<string, string>;
      if (event.grab_card !== undefined) grabCard  = event.grab_card;
      // Also check if the answer text still contains an embedded grab card marker
      if (!grabCard && answer.includes("$$GRAB_CARD$$")) {
        const extracted = extractGrabCard(answer);
        answer  = extracted.cleanText;
        if (extracted.card) grabCard = extracted.card;
      }
      sse({
        type:            "done",
        answer,
        grab_card:       grabCard,
        pdf_urls:        proxyUrls(pdfUrls),
        pdf_url_map:     proxyUrlMap(pdfUrlMap),
        session_id:      session_id || "",
        generated_in_ms: Date.now() - t0,
        trace:           [],
        active_entities: {},
      });
      return "done";

    } else if (type === "error") {
      if (answer) {
        // Partial answer accumulated before error — deliver it
        sse({
          type:            "done",
          answer,
          grab_card:       grabCard,
          pdf_urls:        proxyUrls(pdfUrls),
          pdf_url_map:     proxyUrlMap(pdfUrlMap),
          session_id:      session_id || "",
          generated_in_ms: Date.now() - t0,
          trace:           [],
          active_entities: {},
        });
        return "done";
      }
      // No answer yet — record error and signal retry
      const msg = String(event.message || "Unknown error");
      const isBackendJsonErr = /line \d+ column \d+ \(char \d+\)/i.test(msg)
        || msg.includes("JSONDecodeError");
      const isPythonKeyErr   = msg.startsWith("'") && msg.endsWith("'");
      lastError = (isBackendJsonErr || isPythonKeyErr)
        ? "The backend encountered an error. Please try again."
        : msg;
      return "retry";
    }
  }

  // ── single GTM attempt ────────────────────────────────────────────────────

  async function runGtm(): Promise<"done" | "retry"> {
    answer = ""; pdfUrls = []; pdfUrlMap = {}; grabCard = null;
    let eventDataLines: string[] = [];
    let buf = "";

    let gtmRes: Response;
    try {
      gtmRes = await fetch(`${GTM_BASE}/api/gtm/chat`, {
        method:  "POST",
        headers: { "X-API-Key": GTM_KEY, "Content-Type": "application/json" },
        body:    JSON.stringify({ query: message, session_id, kg_mode: kg_mode || "invoice" }),
      });
    } catch (err) {
      lastError = "Could not reach the backend. Please try again.";
      return "retry";
    }

    if (!gtmRes.ok || !gtmRes.body) {
      lastError = `Backend unavailable (HTTP ${gtmRes.status}). Please try again.`;
      return "retry";
    }

    const reader  = gtmRes.body.getReader();
    const decoder = new TextDecoder();
    let innerResult: "done" | "retry" | undefined;

    try {
      outer: for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, "");
          buf = buf.slice(nl + 1);

          if (line.startsWith("data: ")) {
            eventDataLines.push(line.slice(6));
          } else if (line.trim() === "") {
            if (eventDataLines.length > 0) {
              innerResult = processEvent(eventDataLines);
              eventDataLines = [];
              if (innerResult === "done" || innerResult === "retry") break outer;
            }
          } else if (
            eventDataLines.length > 0 &&
            !line.startsWith("event:") &&
            !line.startsWith("id:") &&
            !line.startsWith(":")
          ) {
            // GTM sends JSON split across lines without repeating "data:" prefix
            eventDataLines.push(line);
          }
        }
      }
      // Flush trailing data not followed by a blank line
      if (eventDataLines.length > 0) {
        innerResult = processEvent(eventDataLines) ?? innerResult;
      }
    } catch (err) {
      lastError = "Connection error. Please try again.";
      return "retry";
    }

    return innerResult ?? "retry";
  }

  // ── retry loop ────────────────────────────────────────────────────────────

  while (true) {
    const result = await runGtm();
    if (result === "done") break;
    if (retryCount >= MAX_RETRIES) {
      sse({ type: "error", message: lastError });
      break;
    }
    retryCount++;
    // Exponential back-off: 300ms, 600ms
    await new Promise<void>(r => setTimeout(r, 300 * retryCount));
  }

  res.end();
}
