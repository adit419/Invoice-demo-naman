/**
 * GET /api/ask-neo/pdf-proxy?fn=<filename>&rid=<rid>
 *
 * Proxies the EC2 invoice-pdf-proxy endpoint, adding the GTM API key so the
 * browser never has to send credentials directly to the backend.
 */
import type { NextApiRequest, NextApiResponse } from "next"

const GTM_BASE = "http://65.1.10.248:5002"
const GTM_KEY  = "nf-gtm-2026-secure"

export const config = { api: { responseLimit: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { fn, rid } = req.query
  if (!fn || typeof fn !== "string") {
    return res.status(400).json({ error: "fn required" })
  }

  const upstream = new URL(`${GTM_BASE}/api/invoice-pdf-proxy`)
  upstream.searchParams.set("fn", fn)
  if (rid && typeof rid === "string") upstream.searchParams.set("rid", rid)

  let upRes: Response
  try {
    upRes = await fetch(upstream.toString(), {
      headers: { "X-API-Key": GTM_KEY },
    })
  } catch (err) {
    return res.status(502).json({ error: String(err) })
  }

  if (!upRes.ok || !upRes.body) {
    return res.status(upRes.status).json({ error: `upstream ${upRes.status}` })
  }

  // Forward content-type (application/pdf) and disposition headers
  const ct = upRes.headers.get("content-type") || "application/pdf"
  res.setHeader("Content-Type", ct)
  const cd = upRes.headers.get("content-disposition")
  if (cd) res.setHeader("Content-Disposition", cd)
  res.setHeader("Cache-Control", "private, max-age=300")

  // Stream the PDF body straight through
  const reader = upRes.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
  } finally {
    res.end()
  }
}
