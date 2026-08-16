// Single source of truth for "where does this invoice's own stage page
// live" — used by the dashboard's row click/Continue button AND by every
// individual stage page's own "Next" button, so the two can never disagree
// about where an invoice at a given status actually belongs.
import { DpInvoiceRun } from "@/services/directpay";

export function invoiceRoute(inv: DpInvoiceRun): string {
  // Only a genuinely un-extracted upload goes back to the extraction screen.
  // "extracted"/"matching" (including "no contract matched yet") live on the
  // Matching screen, which has its own Contract picker. Once Matching has
  // been approved, the invoice moves on to Bill Posting — rejected invoices
  // stay wherever they were rejected from, but we only ever land here from
  // the dashboard or another stage's own "Next" button, so Bill Posting
  // (which also renders the posted summary) is the right destination for
  // both "bill_posting" and "posted".
  if (inv.status === "extraction") {
    return `/directpay/invoice/${inv.id}/review`;
  }
  if (inv.status === "fp_extraction") {
    return `/directpay/invoice/${inv.id}/fp-extraction`;
  }
  if (inv.status === "postprocessing") {
    return `/directpay/invoice/${inv.id}/extraction-postprocessing`;
  }
  if (inv.status === "bill_posting" || inv.status === "posted") {
    return `/directpay/invoice/${inv.id}/bill-posting`;
  }
  return `/directpay/invoice/${inv.id}/match`;
}
