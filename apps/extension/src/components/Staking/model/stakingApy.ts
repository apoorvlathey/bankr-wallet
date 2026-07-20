import type { StakingApy } from "../types";

export function normalizeWchanApy(value: unknown): StakingApy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (![record.totalApy, record.wchanApy, record.wethApy].every(isValidApy)) return null;
  return {
    totalApy: record.totalApy as number,
    wchanApy: record.wchanApy as number,
    wethApy: record.wethApy as number,
  };
}

function isValidApy(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000;
}
