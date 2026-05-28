/**
 * Shared date / value formatting helpers.
 *
 * `formatDate` and `formatValue` were previously copy-pasted across ~7 page
 * files; the only difference between copies was the empty-value fallback, which
 * is now a parameter so existing call sites keep their exact output.
 */

const EN_GB_DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

/**
 * Format an ISO date string as `dd Mon yyyy` (en-GB). Returns `fallback` for
 * empty input and the original string when it can't be parsed — matching the
 * behaviour of every former local copy.
 */
export function formatDate(
  s: string | null | undefined,
  fallback = "-",
): string {
  if (!s) return fallback;
  try {
    return new Date(s).toLocaleDateString("en-GB", EN_GB_DATE);
  } catch {
    return s;
  }
}

/**
 * Format a date-time string as `dd Mon yyyy, HH:mm` (en-GB).
 */
export function formatDateTime(
  s: string | null | undefined,
  fallback = "—",
): string {
  if (!s) return fallback;
  try {
    return new Date(s).toLocaleString("en-GB", {
      ...EN_GB_DATE,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

/**
 * Format a metadata field value: `date` values via {@link formatDate},
 * `number` values with 2-decimal grouping, everything else stringified.
 * Empty values render as `-`.
 */
export function formatValue(
  v: string | number | null | undefined,
  type?: string,
): string {
  if (v === null || v === undefined || v === "") return "-";
  if (type === "date" && typeof v === "string") return formatDate(v);
  if (type === "number" && typeof v === "number") {
    return v.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return String(v);
}
