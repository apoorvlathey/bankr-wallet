import { formatUnits } from "viem";

/**
 * Shared token-amount formatters used by the swap UI.
 *
 * - `formatTokenBalance` formats an already-decimal balance string for token
 *   selector rows (threshold "<0.0001", no thousands separators — matches the
 *   compact list density).
 * - `formatTokenAmountFromBase` formats a base-unit string (raw uint) using
 *   `decimals`. Used for swap quote / confirmation amounts where finer
 *   precision matters (threshold "< 0.000001"). Pass `thousandsSeparator`
 *   for confirmation-style readability.
 */

export function formatTokenBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return parseFloat(num.toPrecision(6)).toString();
}

export interface FormatTokenAmountOptions {
  /** Use locale-formatted thousands separators (e.g. "1,234.567"). */
  thousandsSeparator?: boolean;
}

/**
 * Format an already-decimal token amount (e.g. user input "1.5" or
 * `formatUnits(...)` output). Same precision/threshold rules as
 * `formatTokenAmountFromBase`.
 */
export function formatTokenAmount(
  amount: string | number,
  opts: FormatTokenAmountOptions = {},
): string {
  const num = typeof amount === "number" ? amount : parseFloat(amount);
  if (isNaN(num) || num === 0) return "0";
  if (num < 0.000001) return "< 0.000001";
  if (opts.thousandsSeparator) {
    return Number(num.toPrecision(6)).toLocaleString("en-US", {
      maximumFractionDigits: 6,
    });
  }
  return num.toFixed(6).replace(/\.?0+$/, "");
}

export function formatTokenAmountFromBase(
  amountBase: string,
  decimals: number,
  opts: FormatTokenAmountOptions = {},
): string {
  return formatTokenAmount(formatUnits(BigInt(amountBase), decimals), opts);
}
