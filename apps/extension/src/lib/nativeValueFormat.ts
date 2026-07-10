const DEFAULT_NATIVE_DECIMALS = 18;
const COMPACT_NATIVE_VALUE_DECIMALS = 6;

export type ParsedNativeAmount =
  | { ok: true; amount: bigint }
  | { ok: false };

function normalizeDecimals(decimals?: number): number {
  if (
    typeof decimals !== "number" ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  ) {
    return DEFAULT_NATIVE_DECIMALS;
  }
  return decimals;
}

function baseUnit(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

function formatSmallestVisibleAmount(decimals: number): string {
  const visibleDecimals = Math.min(COMPACT_NATIVE_VALUE_DECIMALS, decimals);
  if (visibleDecimals === 0) return "1";
  return `0.${"0".repeat(Math.max(0, visibleDecimals - 1))}1`;
}

export function parseNativeAmount(
  value: string | bigint | undefined,
): ParsedNativeAmount {
  if (typeof value === "bigint") {
    return value >= 0n ? { ok: true, amount: value } : { ok: false };
  }

  if (!value || value === "0" || value === "0x0" || value === "0x") {
    return { ok: true, amount: 0n };
  }

  try {
    const amount = BigInt(value);
    return amount >= 0n ? { ok: true, amount } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function formatNativeValueExact(
  amount: bigint,
  symbol: string,
  decimals?: number,
): string {
  const safeDecimals = normalizeDecimals(decimals);
  const base = baseUnit(safeDecimals);
  const whole = amount / base;
  const fractional = amount % base;

  if (safeDecimals === 0 || fractional === 0n) {
    return `${whole.toString()} ${symbol}`;
  }

  const fractionalText = fractional
    .toString()
    .padStart(safeDecimals, "0")
    .replace(/0+$/, "");

  return `${whole.toString()}.${fractionalText} ${symbol}`;
}

export function formatNativeValueCompact(
  amount: bigint,
  symbol: string,
  decimals?: number,
): string {
  const safeDecimals = normalizeDecimals(decimals);
  const base = baseUnit(safeDecimals);

  if (amount === 0n) {
    return `0 ${symbol}`;
  }

  const whole = amount / base;
  const fractional = amount % base;
  const visibleDecimals = Math.min(COMPACT_NATIVE_VALUE_DECIMALS, safeDecimals);

  if (visibleDecimals === 0 || fractional === 0n) {
    return `${whole.toString()} ${symbol}`;
  }

  const compactUnit = 10n ** BigInt(safeDecimals - visibleDecimals);
  if (whole === 0n && fractional < compactUnit) {
    return `<${formatSmallestVisibleAmount(safeDecimals)} ${symbol}`;
  }

  const compactFractional = (fractional / compactUnit)
    .toString()
    .padStart(visibleDecimals, "0")
    .replace(/0+$/, "");

  if (!compactFractional) {
    return `${whole.toString()} ${symbol}`;
  }

  return `${whole.toString()}.${compactFractional} ${symbol}`;
}

export function nativeAmountToNumber(amount: bigint, decimals?: number): number {
  const safeDecimals = normalizeDecimals(decimals);
  return Number(amount) / Number(baseUnit(safeDecimals));
}
