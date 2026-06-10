/**
 * Proxy: GET /api/ask-neo/vendor-pdf?vendor_name=Deloitte+Touche
 * Looks up the most recent invoice for a vendor and returns { url } for its PDF.
 */
import type { NextApiRequest, NextApiResponse } from "next"

const BACKEND = "http://localhost:8099/api/v1"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { vendor_name } = req.query
  if (!vendor_name || typeof vendor_name !== "string") {
    return res.status(400).json({ error: "vendor_name required" })
  }

  try {
    const listRes = await fetch(
      `${BACKEND}/invoices?page=1&page_size=100`,
      { headers: { "Content-Type": "application/json" } }
    )
    if (!listRes.ok) {
      return res.status(200).json({ error: "backend_unavailable" })
    }

    const data = await listRes.json()
    const items: Record<string, unknown>[] = data.invoices ?? data.items ?? data ?? []

    // Find latest invoice matching the vendor name (case-insensitive)
    const needle = vendor_name.toLowerCase()
    const match = items.find(i =>
      String(i.vendor_name ?? i["vendor_name"] ?? "").toLowerCase().includes(needle)
    )

    if (!match?.id) {
      return res.status(200).json({ error: "not_found" })
    }

    res.status(200).json({ url: `${BACKEND}/invoices/${match.id}/file` })
  } catch {
    res.status(200).json({ error: "backend_unavailable" })
  }
}
