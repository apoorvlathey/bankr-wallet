/**
 * Shared USD formatters. The wallet displays USD in a few contexts with
 * slightly different conventions — privacy masking on portfolio screens,
 * suppressed output for zero on the swap confirmation. Options collapse all
 * three legacy variants into one helper.
 */

export interface FormatUsdOptions {
  /** Mask the value as "****" (portfolio privacy toggle). */
  hide?: boolean;
  /** Return "" instead of "$0.00" when the value is non-positive. */
  zeroAsEmpty?: boolean;
}

export function formatUsd(value: number, opts: FormatUsdOptions = {}): string {
  if (opts.hide) return "****";
  if (opts.zeroAsEmpty && value <= 0) return "";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs > 0 && abs < 0.01) return `${sign}<$0.01`;
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
