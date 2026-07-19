export function formatTokenAmount(
  baseUnits: string,
  decimals: number,
  maximumFractionDigits = 6,
): string {
  const value = BigInt(baseUnits);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const rawFraction = (value % scale).toString().padStart(decimals, "0");
  const fraction = rawFraction
    .slice(0, Math.min(decimals, maximumFractionDigits))
    .replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export const formatUsdc = (baseUnits: string) =>
  formatTokenAmount(baseUnits, 6);

export interface NativeFeePaymentSummary {
  amount: string;
  fiat: string | null;
  balance: string;
  insufficient: boolean;
}
