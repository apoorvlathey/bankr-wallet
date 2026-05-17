/**
 * Shared time formatters.
 *
 * - `formatAbsoluteTimestamp` handles wall-clock display (chart axis labels,
 *   clear-signing date fields). Accepts seconds OR milliseconds — values
 *   above 1e12 are assumed to already be ms.
 * - `formatRelativeTime` handles "X mins ago" style labels (pending tx list,
 *   chat list). Falls back to a locale date string for entries older than a
 *   week.
 */

export interface FormatAbsoluteOptions {
  /** Include the 4-digit year. Default: false. */
  includeYear?: boolean;
  /** Separator between date and time. Default: ", ". */
  separator?: string;
}

export function formatAbsoluteTimestamp(
  ts: number,
  opts: FormatAbsoluteOptions = {},
): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  const ms = ts > 1e12 ? ts : ts * 1000;
  try {
    const date = new Date(ms);
    const datePart = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(opts.includeYear ? { year: "numeric" } : {}),
    });
    const timePart = date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${datePart}${opts.separator ?? ", "}${timePart}`;
  } catch {
    return "—";
  }
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < MINUTE_MS) return "Just now";
  if (diff < HOUR_MS) {
    const mins = Math.floor(diff / MINUTE_MS);
    return mins === 1 ? "1 min ago" : `${mins} mins ago`;
  }
  if (diff < DAY_MS) {
    const hours = Math.floor(diff / HOUR_MS);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (diff < 2 * DAY_MS) return "Yesterday";
  if (diff < 7 * DAY_MS) {
    const days = Math.floor(diff / DAY_MS);
    return `${days} days ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}
