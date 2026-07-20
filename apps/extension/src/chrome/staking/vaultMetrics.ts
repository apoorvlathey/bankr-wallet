import { WALLETCHAN_VAULT_DATA_API } from "@/constants/externalUrls";
import { fetchJsonBounded } from "../network/boundedHttp";

const VAULT_METRICS_TIMEOUT_MS = 10_000;
const VAULT_METRICS_MAX_BYTES = 16 * 1024;
const MAX_APY_PERCENT = 100_000;

export interface WchanVaultApy {
  totalApy: number;
  wchanApy: number;
  wethApy: number;
}

export function parseWchanVaultApy(value: unknown): WchanVaultApy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Vault APY response is invalid");
  }
  const record = value as Record<string, unknown>;
  return {
    totalApy: boundedApy(record.totalApy),
    wchanApy: boundedApy(record.wchanApy),
    wethApy: boundedApy(record.wethApy),
  };
}

export async function fetchWchanVaultApy(): Promise<WchanVaultApy> {
  const { response, data } = await fetchJsonBounded(
    WALLETCHAN_VAULT_DATA_API,
    { method: "GET", headers: { Accept: "application/json" } },
    {
      timeoutMs: VAULT_METRICS_TIMEOUT_MS,
      maxBytes: VAULT_METRICS_MAX_BYTES,
      invalidMessage: "Vault APY response is invalid",
    },
  );
  if (!response.ok) throw new Error("Vault APY is temporarily unavailable");
  return parseWchanVaultApy(data);
}

function boundedApy(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_APY_PERCENT) {
    throw new Error("Vault APY response is invalid");
  }
  return value;
}
