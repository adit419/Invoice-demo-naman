// Single source of truth for "where does this invoice's own stage page
// live" — used by the dashboard's row click/Continue button AND by every
// individual stage page's own "Next" button, so the two can never disagree
// about where an invoice at a given status actually belongs.
import { DpInvoiceRun } from "@/services/directpay";

export function invoiceRoute(inv: DpInvoiceRun): string {
  // "extracted" is reused for two different moments: freshly extracted but
  // not yet confirmed (belongs on Extraction Review, same as "extraction"),
  // and post-Postprocessing, ready for Matching. Status alone can't tell
  // these apart — extraction_confirmed (a one-way flag set by Confirm
  // Extraction) can, same signal review.tsx's own isActionable uses. Without
  // this, a just-extracted, never-confirmed invoice fell through to the
  // final `/match` case below, skipping Extraction Review (and, for an IDR
  // vendor, Faktur Pajak + Derived Fields too) entirely.
  if (!inv.extraction_confirmed) {
    return `/directpay/invoice/${inv.id}/review`;
  }
  // Once Matching has been approved, the invoice moves on to Bill Posting —
  // rejected invoices stay wherever they were rejected from, but we only
  // ever land here from the dashboard or another stage's own "Next" button,
  // so Bill Posting (which also renders the posted summary) is the right
  // destination for both "bill_posting" and "posted".
  if (inv.status === "fp_extraction") {
    return `/directpay/invoice/${inv.id}/fp-extraction`;
  }
  if (inv.status === "bill_posting" || inv.status === "posted") {
    return `/directpay/invoice/${inv.id}/bill-posting`;
  }
  return `/directpay/invoice/${inv.id}/match`;
}
