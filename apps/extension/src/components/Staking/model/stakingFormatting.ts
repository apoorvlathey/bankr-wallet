import { formatUnits } from "viem";

export function formatStakingAmount(value: bigint, maximumFractionDigits = 4): string {
  const number = Number(formatUnits(value, 18));
  if (!Number.isFinite(number) || number === 0) return "0";
  if (number < 0.0001) return "<0.0001";
  return number.toLocaleString("en-US", { maximumFractionDigits });
}

export function formatPenaltyDate(timestamp: number | null): string | null {
  if (!timestamp) return null;
  const remaining = Math.max(0, timestamp - Date.now());
  const days = Math.ceil(remaining / 86_400_000);
  const date = new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return days > 0 ? `${days} day${days === 1 ? "" : "s"} · ${date}` : date;
}
