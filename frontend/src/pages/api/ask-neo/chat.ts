/**
 * Proxy for the GTM chat API — streams SSE from the backend to the browser.
 * Translates the GTM SSE format into the format the Ask Neo UI expects.
 */
import type { NextApiRequest, NextApiResponse } from "next";

const GTM_BASE  = "http://65.1.10.248:5002";
const GTM_KEY   = "nf-gtm-2026-secure";

export const config = { api: { bodyParser: true, responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { message, session_id } = req.body as { message: string; session_id?: string };
  if (!message) { res.status(400).json({ error: "message required" }); return; }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");

  const sse = (obj: object) => { res.write(`data: ${JSON.stringify(obj)}\n\n`); };

  let gtmRes: Response;
  try {
    gtmRes = await fetch(`${GTM_BASE}/api/gtm/chat`, {
      method: "POST",
      headers: {
        "X-API-Key":    GTM_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: message, session_id }),
    });
  } catch (err) {
    sse({ type: "error", message: String(err) });
    res.end();
    return;
  }

  if (!gtmRes.ok || !gtmRes.body) {
    sse({ type: "error", message: `GTM API error: ${gtmRes.status}` });
    res.end();
    return;
  }

  // Stream GTM SSE → translate to Ask Neo SSE format
  const reader  = gtmRes.body.getReader();
  const decoder = new TextDecoder();
  let   buf     = "";
  let   answer  = "";
  const t0      = Date.now();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        let event: Record<string, unknown>;
        try { event = JSON.parse(raw); } catch { continue; }

        const type = event.type as string;

        if (type === "status") {
          // Forward thinking/forming as a trace step so the typing indicator updates
          sse({ type: "trace", step: { step: "status", message: event.message } });

        } else if (type === "answer") {
          answer = (event.text as string) || "";

        } else if (type === "done") {
          // Send final "done" in the Ask Neo format
          sse({
            type:             "done",
            answer,
            session_id:       session_id || "",
            generated_in_ms:  Date.now() - t0,
            trace:            [],
            active_entities:  {},
          });
          res.end();
          return;

        } else if (type === "error") {
          sse({ type: "error", message: event.message || "Unknown error" });
          res.end();
          return;
        }
      }
    }
  } catch (err) {
    sse({ type: "error", message: String(err) });
  }

  res.end();
}
