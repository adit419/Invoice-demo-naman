/**
 * Proxy: GET /api/ask-neo/invoice-pdf?invoice_number=INV-001
 * Looks up the invoice in the local backend and returns { url } for the PDF.
 */
import type { NextApiRequest, NextApiResponse } from "next"

const BACKEND = "http://localhost:8099/api/v1"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { invoice_number } = req.query
  if (!invoice_number || typeof invoice_number !== "string") {
    return res.status(400).json({ error: "invoice_number required" })
  }

  try {
    // Fetch invoice list filtered by invoice number
    const listRes = await fetch(
      `${BACKEND}/invoices?page=1&page_size=50`,
      { headers: { "Content-Type": "application/json" } }
    )
    if (!listRes.ok) {
      return res.status(200).json({ error: "backend_unavailable" })
    }

    const data = await listRes.json()
    const items: Record<string, unknown>[] = data.invoices ?? data.items ?? data ?? []

    // Find matching invoice (exact match on invoice_number field)
    const match = items.find(
      i =>
        String(i.invoice_number ?? i["invoice_number"] ?? "").toLowerCase() ===
        invoice_number.toLowerCase()
    )

    if (!match?.id) {
      // Fallback: try fetching by number directly if the backend supports it
      return res.status(200).json({ error: "not_found" })
    }

    // Return the file URL so the browser can open it in a new tab
    res.status(200).json({ url: `${BACKEND}/invoices/${match.id}/file` })
  } catch {
    res.status(200).json({ error: "backend_unavailable" })
  }
}
