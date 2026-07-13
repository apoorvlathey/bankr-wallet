export type ParsedTransactionValue =
  | { ok: true; wei: bigint }
  | { ok: false; raw: string };

const WEI_PER_NATIVE_UNIT = 1_000_000_000_000_000_000n;
const COMPACT_NATIVE_VALUE_DECIMALS = 6;
const COMPACT_NATIVE_VALUE_UNIT =
  WEI_PER_NATIVE_UNIT / 10n ** BigInt(COMPACT_NATIVE_VALUE_DECIMALS);

export function parseTransactionValueWei(
  value: string | undefined,
): ParsedTransactionValue {
  if (!value || value === "0" || value === "0x0" || value === "0x") {
    return { ok: true, wei: 0n };
  }

  try {
    const wei = BigInt(value);
    return wei >= 0n ? { ok: true, wei } : { ok: false, raw: value };
  } catch {
    return { ok: false, raw: value };
  }
}

export function formatNativeValueCompact(
  wei: bigint,
  symbol: string,
): string {
  if (wei === 0n) return `0 ${symbol}`;

  const whole = wei / WEI_PER_NATIVE_UNIT;
  const fractional = wei % WEI_PER_NATIVE_UNIT;

  if (whole === 0n && fractional < COMPACT_NATIVE_VALUE_UNIT) {
    return `<0.000001 ${symbol}`;
  }

  const compactFractional = (fractional / COMPACT_NATIVE_VALUE_UNIT)
    .toString()
    .padStart(COMPACT_NATIVE_VALUE_DECIMALS, "0")
    .replace(/0+$/, "");

  return compactFractional
    ? `${whole.toString()}.${compactFractional} ${symbol}`
    : `${whole.toString()} ${symbol}`;
}
