import { formatUsd } from "@/lib/currencyFormatUtils";
import { formatAbsoluteTimestamp } from "@/lib/timeFormatUtils";

// Sentinels treated as "unlimited" approvals. uint256 is the standard ERC-20
// approve max; uint160 is Permit2's AllowanceTransfer max (its amount field is
// uint160, not uint256).
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;

export interface TokenInfo {
  symbol: string;
  decimals: number;
  logoUrl?: string;
}

export function toTokenInfo(
  metadata:
    | { symbol?: string; decimals?: number; logoUrl?: string }
    | null
    | undefined,
): TokenInfo | null {
  if (metadata?.symbol === undefined || metadata.decimals === undefined) {
    return null;
  }
  return {
    symbol: metadata.symbol,
    decimals: metadata.decimals,
    logoUrl: metadata.logoUrl,
  };
}

export function formatUsdValue(
  amountRaw: string,
  decimals: number,
  priceUsd: number,
): string | null {
  if (!priceUsd || priceUsd <= 0) return null;
  let big: bigint;
  try {
    big = BigInt(amountRaw);
  } catch {
    return null;
  }
  // Skip "unlimited" approvals — a USD value on max-uint is meaningless.
  // Permit2's AllowanceTransfer uses uint160, so its sentinel is 2^160-1, not
  // 2^256-1; treat both as unlimited.
  if (big === MAX_UINT256 || big === MAX_UINT160) return null;
  const neg = big < 0n;
  if (neg) big = -big;
  // Compute amount * price using JS number after scaling decimals; tokens here
  // have realistic magnitudes so precision loss is acceptable for display.
  const divisor = 10n ** BigInt(decimals);
  const whole = Number(big / divisor);
  const frac = Number(big % divisor) / Number(divisor);
  const value = (neg ? -1 : 1) * (whole + frac) * priceUsd;
  if (value === 0) return null;
  return formatUsd(value);
}

export function isUnlimitedAmount(raw: string): boolean {
  try {
    const big = BigInt(raw);
    return big === MAX_UINT256 || big === MAX_UINT160;
  } catch {
    return false;
  }
}

export function compareRawAmounts(a: string, b: string): number {
  try {
    const aa = BigInt(a);
    const bb = BigInt(b);
    return aa === bb ? 0 : aa > bb ? 1 : -1;
  } catch {
    return -1;
  }
}

export function formatUnit(raw: string, decimals: number): string {
  if (decimals <= 0) return raw;
  let big: bigint;
  try {
    big = BigInt(raw);
  } catch {
    return raw;
  }
  if (big === MAX_UINT256 || big === MAX_UINT160) return "unlimited";
  const neg = big < 0n;
  if (neg) big = -big;
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  if (frac === 0n) return `${neg ? "-" : ""}${whole.toString()}`;
  let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  // Cap to 8 fractional digits for display sanity.
  if (fracStr.length > 8) fracStr = fracStr.slice(0, 8);
  return `${neg ? "-" : ""}${whole.toString()}.${fracStr}`;
}

// Full-precision rendering used in the tooltip when we collapse a max-uint
// sentinel to "unlimited" — the user can still inspect what the contract will
// actually receive. Adds thousand separators to the whole part and keeps every
// fractional digit (no 8-digit cap).
export function formatUnitFull(raw: string, decimals: number): string {
  let big: bigint;
  try {
    big = BigInt(raw);
  } catch {
    return raw;
  }
  const neg = big < 0n;
  if (neg) big = -big;
  if (decimals <= 0) {
    const s = big.toString();
    return `${neg ? "-" : ""}${s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (frac === 0n) return `${neg ? "-" : ""}${wholeStr}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${wholeStr}.${fracStr}`;
}

export function formatDurationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return String(seconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(secs).padStart(2, "0")}`;
}

export const formatTimestamp = (ts: number): string =>
  formatAbsoluteTimestamp(ts, { includeYear: true, separator: " · " });
