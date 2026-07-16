const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toSubscript(value: number): string {
  return String(value)
    .split("")
    .map((digit) => SUBSCRIPT_DIGITS[Number(digit)])
    .join("");
}

/** Format a positive decimal token amount without losing tiny non-zero values. */
export function formatTokenDecimalAmount(
  value: string,
  compactTiny = false,
): string {
  const [integer = "0", decimal = ""] = value.split(".");
  const digits = integer.length;
  if (digits <= 9) {
    const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const significantDecimal = decimal.replace(/0+$/, "");
    const firstNonZero = significantDecimal.search(/[1-9]/);
    if (integer === "0" && firstNonZero >= 6) {
      const coefficient = significantDecimal
        .slice(firstNonZero, firstNonZero + 4)
        .replace(/0+$/, "");
      if (compactTiny) {
        return `0.0${toSubscript(firstNonZero)}${coefficient}`;
      }
      return `0.${"0".repeat(firstNonZero)}${coefficient}`;
    }
    const trimmed = significantDecimal.slice(0, 6).replace(/0+$/, "");
    return trimmed ? `${formatted}.${trimmed}` : formatted;
  }
  if (digits <= 12) {
    const intBig = BigInt(integer);
    const scaled = (intBig * 100n) / 1_000_000_000n;
    const whole = scaled / 100n;
    const fraction = scaled % 100n;
    return `${whole}.${fraction.toString().padStart(2, "0")}B`;
  }
  const first = integer[0];
  const next = integer.slice(1, 3).padEnd(2, "0");
  return `${first}.${next}e${digits - 1}`;
}

export function parseDecimalToBaseUnits(
  value: string,
  decimals: number,
): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) return null;
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [integer, fraction = ""] = value.split(".");
  if (fraction.length > decimals) return null;
  const scale = 10n ** BigInt(decimals);
  return (
    BigInt(integer) * scale +
    BigInt((fraction || "0").padEnd(decimals, "0"))
  );
}

/** Prefer exact wei for the smallest five-digit-or-less 18-decimal values. */
export function formatSmallBaseUnitLabel(
  baseUnits: bigint,
  decimals: number,
): string | null {
  const magnitude = baseUnits < 0n ? -baseUnits : baseUnits;
  if (decimals !== 18 || magnitude < 1n || magnitude > 99_999n) return null;
  return `${magnitude.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} wei`;
}

/** Convert raw base units to a compact token amount while preserving dust. */
export function formatTokenBaseUnits(
  raw: string,
  decimals: number,
  compactTiny = true,
): string | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) return null;
  let magnitude: bigint;
  try {
    const parsed = BigInt(raw);
    magnitude = parsed < 0n ? -parsed : parsed;
  } catch {
    return null;
  }
  if (magnitude === 0n) return null;

  const baseUnitLabel = formatSmallBaseUnitLabel(magnitude, decimals);
  if (baseUnitLabel) return baseUnitLabel;

  const divisor = 10n ** BigInt(decimals);
  const whole = magnitude / divisor;
  const fraction = magnitude % divisor;
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  const decimal = fractionText ? `${whole}.${fractionText}` : whole.toString();
  return formatTokenDecimalAmount(decimal, compactTiny);
}

export function appendTokenSymbol(amount: string, symbol: string): string {
  return amount.endsWith(" wei") || !symbol ? amount : `${amount} ${symbol}`;
}
