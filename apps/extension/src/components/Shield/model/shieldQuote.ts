import { formatEther, parseEther } from "viem";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";

export const SHIELD_MINIMUM_WEI =
  PRIVACY_POOLS_DEPLOYMENT.assetConfig.minimumDepositAmount;
export const DEFAULT_SHIELD_AMOUNT = formatEther(SHIELD_MINIMUM_WEI);
export const SHIELD_VETTING_FEE_BPS =
  PRIVACY_POOLS_DEPLOYMENT.assetConfig.vettingFeeBPS;
const BASIS_POINTS_SCALE = 10_000n;
const MAX_UINT256 = (1n << 256n) - 1n;
const ETH_AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const SERIALIZED_WEI_PATTERN = /^(?:0|[1-9]\d{0,79})$/;

function validUsdPrice(priceUsd: number | null): priceUsd is number {
  return priceUsd !== null && Number.isFinite(priceUsd) && priceUsd > 0;
}

function trimDecimal(value: string): string {
  return value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
}

export type ShieldSourceAccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "impersonator";

export interface ShieldSourceAccount {
  readonly id: string;
  readonly type: ShieldSourceAccountType;
  readonly address: string;
  readonly displayName?: string;
}

export type ShieldAmountValidation =
  | { status: "valid"; amountWei: bigint; message: null }
  | {
      status: "empty" | "invalid" | "below-minimum";
      amountWei: null;
      message: string | null;
    };

export interface ShieldQuote {
  readonly chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  readonly amountWei: bigint;
  readonly balanceWei: bigint;
  readonly minimumAmountWei: bigint;
  readonly protocolFeeWei: bigint;
  readonly shieldedAmountWei: bigint;
  readonly gasReserveWei: bigint;
  readonly totalRequiredWei: bigint;
  readonly maxShieldableWei: bigint;
  readonly vettingFeeBPS: bigint;
  readonly canAfford: boolean;
}

/** Parse a syntactically valid amount without applying the Shield minimum. */
export function parseShieldAmountInputWei(amount: string): bigint | null {
  if (!ETH_AMOUNT_PATTERN.test(amount)) return null;
  try {
    const amountWei = parseEther(amount);
    return amountWei <= MAX_UINT256 ? amountWei : null;
  } catch {
    return null;
  }
}

export function validateShieldAmountInput(
  amount: string,
): ShieldAmountValidation {
  if (amount.length === 0) {
    return { status: "empty", amountWei: null, message: null };
  }
  const amountWei = parseShieldAmountInputWei(amount);
  if (amountWei === null) {
    return {
      status: "invalid",
      amountWei: null,
      message: "Enter a valid ETH amount.",
    };
  }
  if (amountWei < SHIELD_MINIMUM_WEI) {
    return {
      status: "below-minimum",
      amountWei: null,
      message: `Minimum is ${formatEther(SHIELD_MINIMUM_WEI)} ETH.`,
    };
  }
  return { status: "valid", amountWei, message: null };
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function serializedWei(value: unknown): bigint | null {
  if (typeof value !== "string" || !SERIALIZED_WEI_PATTERN.test(value)) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function parseShieldQuoteResponse(
  response: unknown,
  expectedAmountWei: bigint,
): ShieldQuote | null {
  if (
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response) ||
    !hasExactKeys(response, ["quote", "success"]) ||
    (response as { success?: unknown }).success !== true
  ) {
    return null;
  }
  const raw = (response as { quote?: unknown }).quote;
  const quoteKeys = [
    "amountWei",
    "balanceWei",
    "canAfford",
    "chainId",
    "gasReserveWei",
    "maxShieldableWei",
    "minimumAmountWei",
    "protocolFeeWei",
    "shieldedAmountWei",
    "totalRequiredWei",
    "vettingFeeBPS",
  ] as const;
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    !hasExactKeys(raw, quoteKeys)
  ) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const amountWei = serializedWei(value.amountWei);
  const balanceWei = serializedWei(value.balanceWei);
  const minimumAmountWei = serializedWei(value.minimumAmountWei);
  const protocolFeeWei = serializedWei(value.protocolFeeWei);
  const shieldedAmountWei = serializedWei(value.shieldedAmountWei);
  const gasReserveWei = serializedWei(value.gasReserveWei);
  const totalRequiredWei = serializedWei(value.totalRequiredWei);
  const maxShieldableWei = serializedWei(value.maxShieldableWei);
  const vettingFeeBPS = serializedWei(value.vettingFeeBPS);
  if (
    value.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
    typeof value.canAfford !== "boolean" ||
    amountWei === null ||
    balanceWei === null ||
    minimumAmountWei !== SHIELD_MINIMUM_WEI ||
    protocolFeeWei === null ||
    shieldedAmountWei === null ||
    gasReserveWei === null ||
    totalRequiredWei === null ||
    maxShieldableWei === null ||
    vettingFeeBPS !== SHIELD_VETTING_FEE_BPS ||
    amountWei !== expectedAmountWei ||
    amountWei > MAX_UINT256
  ) {
    return null;
  }
  const expectedFee = (amountWei * vettingFeeBPS) / BASIS_POINTS_SCALE;
  const expectedMax =
    balanceWei > gasReserveWei ? balanceWei - gasReserveWei : 0n;
  if (
    protocolFeeWei !== expectedFee ||
    shieldedAmountWei !== amountWei - expectedFee ||
    totalRequiredWei !== amountWei + gasReserveWei ||
    maxShieldableWei !== expectedMax ||
    value.canAfford !== (totalRequiredWei <= balanceWei)
  ) {
    return null;
  }

  return Object.freeze({
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    amountWei,
    balanceWei,
    minimumAmountWei,
    protocolFeeWei,
    shieldedAmountWei,
    gasReserveWei,
    totalRequiredWei,
    maxShieldableWei,
    vettingFeeBPS,
    canAfford: value.canAfford,
  });
}

export function parseShieldQuoteError(response: unknown): string | null {
  if (
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response) ||
    !hasExactKeys(response, ["code", "error", "success"])
  ) {
    return null;
  }
  const value = response as Record<string, unknown>;
  return value.success === false &&
    typeof value.error === "string" &&
    value.error.length > 0 &&
    value.error.length <= 120
    ? value.error
    : null;
}

export function formatShieldWei(value: bigint): string {
  const exact = formatEther(value);
  const [whole, fraction = ""] = exact.split(".");
  if (fraction.length <= 8) return exact;
  const visible = fraction.slice(0, 8).replace(/0+$/, "");
  if (!visible) return `<0.00000001`;
  return `~${whole}.${visible}`;
}

export function formatShieldUsdValue(
  valueWei: bigint,
  nativePriceUsd: number | null,
): string | null {
  if (valueWei === 0n) return "$0.00";
  if (
    nativePriceUsd === null ||
    !Number.isFinite(nativePriceUsd) ||
    nativePriceUsd <= 0
  ) return null;
  const valueUsd = Number(formatEther(valueWei)) * nativePriceUsd;
  return Number.isFinite(valueUsd) ? formatUsd(valueUsd) : null;
}

/** Convert the renderer's active ETH/USD amount field into canonical ETH. */
export function shieldAmountInputInEth(
  amount: string,
  isUsdMode: boolean,
  nativePriceUsd: number | null,
): string {
  if (!isUsdMode) return amount;
  if (!validUsdPrice(nativePriceUsd) || amount.length === 0) return "";
  const usdAmount = Number(amount);
  if (!Number.isFinite(usdAmount) || usdAmount < 0) return "";
  return trimDecimal((usdAmount / nativePriceUsd).toFixed(18));
}

/** Format a canonical wei amount for the currently selected input unit. */
export function formatShieldAmountInput(
  valueWei: bigint,
  isUsdMode: boolean,
  nativePriceUsd: number | null,
): string {
  const ethAmount = formatEther(valueWei);
  if (!isUsdMode || !validUsdPrice(nativePriceUsd)) return ethAmount;
  return (Number(ethAmount) * nativePriceUsd).toFixed(2);
}

/** Preserve the entered economic value while switching ETH/USD input modes. */
export function convertShieldAmountInputMode(
  amount: string,
  isUsdMode: boolean,
  nativePriceUsd: number | null,
): string {
  if (!validUsdPrice(nativePriceUsd) || amount.length === 0) return amount;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) return amount;
  return isUsdMode
    ? trimDecimal((numericAmount / nativePriceUsd).toFixed(18))
    : (numericAmount * nativePriceUsd).toFixed(2);
}

export function formatShieldAmountConversion(
  amount: string,
  isUsdMode: boolean,
  nativePriceUsd: number | null,
): string | null {
  if (!validUsdPrice(nativePriceUsd) || amount.length === 0) return null;
  const ethAmount = shieldAmountInputInEth(amount, isUsdMode, nativePriceUsd);
  if (!ETH_AMOUNT_PATTERN.test(ethAmount)) return null;
  try {
    return isUsdMode
      ? `${formatShieldWei(parseEther(ethAmount))} ETH`
      : formatUsd(Number(ethAmount) * nativePriceUsd);
  } catch {
    return null;
  }
}

export function shieldMaximumInput(quote: ShieldQuote): string {
  return formatEther(quote.maxShieldableWei);
}

export function compactShieldSource(account: ShieldSourceAccount): string {
  if (account.displayName?.trim()) return account.displayName.trim();
  return `${account.address.slice(0, 6)}…${account.address.slice(-4)}`;
}
