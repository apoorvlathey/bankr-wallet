/**
 * Shared gas formatting utilities
 * Used by both TxDetailModal (post-tx) and GasEstimateDisplay (pre-tx)
 */

export function formatEth(wei: string, symbol = "ETH"): string {
  const eth = Number(BigInt(wei)) / 1e18;
  if (eth === 0) return `0 ${symbol}`;
  const formatted = eth.toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
  return `${formatted} ${symbol}`;
}

/** Exact native-token amount without floating-point conversion. */
export function formatEthExact(wei: string, symbol = "ETH"): string {
  const raw = BigInt(wei);
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const whole = absolute / 10n ** 18n;
  const fraction = (absolute % 10n ** 18n)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  const amount = fraction ? `${whole}.${fraction}` : whole.toString();
  return `${negative ? "-" : ""}${amount} ${symbol}`;
}

/**
 * Compact exact native-token fee. Keeps three meaningful fractional digits and
 * all leading zeroes, so a non-zero fee can never render as zero.
 */
export function formatEthFee(wei: string, symbol = "ETH"): string {
  const raw = BigInt(wei);
  if (raw === 0n) return `0 ${symbol}`;

  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const whole = absolute / 10n ** 18n;
  const fraction = (absolute % 10n ** 18n).toString().padStart(18, "0");
  const firstMeaningful = fraction.search(/[1-9]/u);
  const visibleFractionLength =
    whole > 0n ? 3 : Math.min(18, Math.max(3, firstMeaningful + 3));
  const visibleFraction = fraction
    .slice(0, visibleFractionLength)
    .replace(/0+$/, "");
  const amount = visibleFraction
    ? `${whole}.${visibleFraction}`
    : whole.toString();

  return `${negative ? "-" : ""}${amount} ${symbol}`;
}

/**
 * Compact native-token fee for constrained confirmation footers.
 * Keeps three significant fractional digits without switching to scientific
 * notation; full precision remains available in the expanded gas details.
 */
export function formatEthCompact(wei: string, symbol = "ETH"): string {
  const eth = Number(BigInt(wei)) / 1e18;
  if (eth === 0) return `0 ${symbol}`;

  const absolute = Math.abs(eth);
  const leadingFractionalZeros =
    absolute < 1 ? Math.max(0, Math.floor(-Math.log10(absolute))) : 0;
  const fractionDigits = absolute < 1
    ? Math.min(18, leadingFractionalZeros + 3)
    : 4;
  const formatted = eth
    .toFixed(fractionDigits)
    .replace(/0+$/, "")
    .replace(/\.$/, "");

  return `${formatted} ${symbol}`;
}

export function formatGwei(wei: string): string {
  const gwei = Number(BigInt(wei)) / 1e9;
  if (gwei === 0) return "0 Gwei";
  const formatted = gwei.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
  return `${formatted} Gwei`;
}

export function formatNumber(value: string): string {
  return Number(value).toLocaleString();
}

/**
 * Format a wei-cost + native-token USD price as `~$X.XX`. Returns null when
 * the price isn't available so callers can omit the slot entirely. Used by
 * both single-tx and batch-tx gas displays.
 */
export function formatWeiToUsd(
  weiStr: string,
  priceUsd: number | null,
): string | null {
  if (priceUsd === null) return null;
  const eth = Number(BigInt(weiStr)) / 1e18;
  const usd = eth * priceUsd;
  if (usd < 0.01 && usd > 0) return "<$0.01";
  return `~$${usd.toFixed(2)}`;
}
