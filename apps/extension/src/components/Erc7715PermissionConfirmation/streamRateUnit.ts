import { formatUnits, parseUnits } from "viem";

export const STREAM_RATE_DAY_SECONDS = 86_400n;

export type StreamRateUnit = "second" | "day";

export interface ParsedStreamRate {
  amountPerSecond: bigint;
  effectiveAmountInUnit: bigint;
  requestedAmountInUnit: bigint;
  roundedDown: boolean;
}

export function formatStreamRateInput(
  amountPerSecond: bigint,
  decimals: number,
  unit: StreamRateUnit,
): string {
  const amount =
    unit === "day"
      ? amountPerSecond * STREAM_RATE_DAY_SECONDS
      : amountPerSecond;
  return formatUnits(amount, decimals);
}

export function parseStreamRateInput(
  value: string,
  decimals: number,
  unit: StreamRateUnit,
): ParsedStreamRate {
  const requestedAmountInUnit = parseUnits(value.trim(), decimals);
  if (requestedAmountInUnit <= 0n) {
    throw new Error("Stream rate must be greater than zero");
  }

  if (unit === "second") {
    return {
      amountPerSecond: requestedAmountInUnit,
      effectiveAmountInUnit: requestedAmountInUnit,
      requestedAmountInUnit,
      roundedDown: false,
    };
  }

  const amountPerSecond = requestedAmountInUnit / STREAM_RATE_DAY_SECONDS;
  if (amountPerSecond <= 0n) {
    throw new Error("Daily rate is too small for this token's precision");
  }
  const effectiveAmountInUnit =
    amountPerSecond * STREAM_RATE_DAY_SECONDS;

  return {
    amountPerSecond,
    effectiveAmountInUnit,
    requestedAmountInUnit,
    roundedDown: effectiveAmountInUnit !== requestedAmountInUnit,
  };
}

function compactDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/u, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

export function streamRateRoundingNotice(
  parsed: ParsedStreamRate,
  decimals: number,
  symbol: string,
): string | null {
  if (!parsed.roundedDown) return null;

  const requested = compactDecimal(
    formatUnits(parsed.requestedAmountInUnit, decimals),
  );
  const effective = compactDecimal(
    formatUnits(parsed.effectiveAmountInUnit, decimals),
  );
  if (requested === effective) return null;

  return `Effective rate is ${effective} ${symbol}/day after rounding down to token precision.`;
}
