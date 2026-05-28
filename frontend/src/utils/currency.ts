/**
 * Currency formatting helpers — mirror invoice-validator-fe's helpers so all
 * monetary displays (variance panel, GRN/Invoice totals, tolerance pill, etc.)
 * use the same symbol and decimal precision regardless of locale.
 */

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
  MYR: "RM",
  SGD: "S$",
  PHP: "₱",
};

export function getCurrencySymbol(currency?: string | null): string {
  if (!currency) return "$";
  return SYMBOLS[currency.toUpperCase()] ?? "$";
}

export function formatCurrencyAmount(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "-";
  const symbol = getCurrencySymbol(currency);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${symbol}${formatted}`;
}
