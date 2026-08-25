/**
 * Tracker CSV export.
 *
 * Its own module rather than living in the page: this is the one piece of the
 * Tracker with a right and a wrong answer independent of any rendering (column
 * set, quoting, escaping), so it's worth being able to exercise on its own.
 *
 * Columns mirror the on-screen table, plus three the table doesn't need but a
 * spreadsheet does: Currency (the table folds that into the amount headers when
 * every row shares one), and the ERP bill number / rejection reason, which are
 * what you'd reconcile an exported row against.
 *
 * Amounts export as bare numbers so they land in a spreadsheet as numbers rather
 * than text; dates export exactly as the invoice printed them, except Invoice
 * Received Date, which is a system timestamp with no printed form.
 */
import { DpTrackerRow } from "@/services/directpay";
import { formatDate } from "@/utils/format";

// Every pipeline stage, since the Tracker now lists in-flight invoices too.
// "extracted" is deliberately absent: it covers three distinct moments and its
// label depends on `extraction_confirmed`, so it's resolved by
// trackerStatusLabel() below rather than by a flat lookup.
export const TRACKER_STATUS_LABEL: Record<string, string> = {
  extraction: "Extraction",
  fp_extraction: "Faktur Pajak",
  matching: "Matching",
  bill_posting: "Bill Posting",
  // "Bill Posted", not the dashboard's "Posted" — this screen names the stage
  // the user completed.
  posted: "Bill Posted",
  rejected: "Rejected",
};

/** The stage label for a row, resolving "extracted"'s three-way ambiguity.
 *
 *  The pipeline reuses "extracted" for: freshly extracted (awaiting Confirm),
 *  and post-Faktur-Pajak (ready for Matching). `extraction_confirmed` is the
 *  only thing that tells them apart — the same signal invoiceRoute uses to
 *  decide which page an "extracted" invoice belongs on. */
export function trackerStatusLabel(row: { status: string; extraction_confirmed?: boolean }): string {
  if (row.status === "extracted") {
    return row.extraction_confirmed ? "Ready for Matching" : "Extracted";
  }
  return TRACKER_STATUS_LABEL[row.status] ?? row.status;
}

type CsvValue = string | number | null | undefined;

export const CSV_COLUMNS: { header: string; value: (r: DpTrackerRow) => CsvValue }[] = [
  { header: "Invoice Received Date", value: r => (r.invoice_received_date ? formatDate(r.invoice_received_date, "") : "") },
  { header: "Vendor Name", value: r => r.vendor_name },
  { header: "Invoice Number", value: r => r.invoice_number },
  { header: "Invoice Date", value: r => r.invoice_date },
  { header: "Description", value: r => r.description },
  { header: "Currency", value: r => r.currency },
  { header: "Taxable Amount", value: r => r.taxable_amount },
  { header: "VAT Amount (PPN)", value: r => r.vat_amount },
  { header: "WHT Amount (PPh)", value: r => r.wht_amount },
  { header: "Payable Amount", value: r => r.payable_amount },
  { header: "Payment Due Date", value: r => r.payment_due_date },
  { header: "Bank Account Name", value: r => r.bank_account_name },
  { header: "Bank Account Number", value: r => r.bank_account_number },
  { header: "Contract", value: r => r.contract_name },
  { header: "Status", value: r => trackerStatusLabel(r) },
  { header: "ERP Bill Number", value: r => r.erp_bill_number },
  { header: "Rejection Reason", value: r => r.rejection_reason },
];

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  // Quoted unconditionally rather than only when the value contains a comma:
  // these are real vendor descriptions and bank account strings ("00801-625000
  // (Virtual Acc)", "206743304059 (BCA) / 89787 0343304059 (Mandiri)"), and a
  // quoting rule that only fires sometimes is the kind that gets one row wrong.
  return `"${v.replace(/"/g, '""')}"`;
}

export function buildTrackerCsv(rows: DpTrackerRow[]): string {
  const lines = [CSV_COLUMNS.map(c => csvCell(c.header)).join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map(c => csvCell(c.value(r))).join(","));
  // BOM + CRLF: Excel needs the BOM to read this as UTF-8 (vendor names carry
  // non-ASCII) and CRLF for row breaks.
  return "﻿" + lines.join("\r\n");
}

export function trackerCsvFilename(now: Date): string {
  return `directpay-tracker-${now.toISOString().slice(0, 10)}.csv`;
}
