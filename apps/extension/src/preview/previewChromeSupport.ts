import type { GasEstimate } from "@/chrome/gasEstimation";
import type { SimulationResult } from "@/chrome/txSimulation";
import { DEFAULT_NETWORKS } from "@/constants/networks";
import type { PreviewEnvironment } from "./previewEnvironment";

export interface PreviewChromeLogger {
  warn: (message: string, detail?: unknown) => void;
  error: (message: string, detail?: unknown) => void;
}

export const previewGasEstimate: GasEstimate = {
  gasLimit: "138000",
  maxFeePerGas: "125000000",
  maxPriorityFeePerGas: "25000000",
  baseFee: "100000000",
  estimatedCostWei: "17250000000000",
  nativePriceUsd: 3600,
  nativeCurrencySymbol: "ETH",
  accountBalance: "3000000000000000000",
  insufficientBalance: false,
  estimationFailed: false,
  dappProvidedGas: false,
  tiers: {
    slow: {
      maxFeePerGas: "115000000",
      maxPriorityFeePerGas: "15000000",
    },
    standard: {
      maxFeePerGas: "125000000",
      maxPriorityFeePerGas: "25000000",
    },
    fast: {
      maxFeePerGas: "145000000",
      maxPriorityFeePerGas: "45000000",
    },
  },
};

export const previewSimulationResult: SimulationResult = {
  txSuccess: true,
  simulationFailed: false,
  metadataComplete: true,
  nativeChange: {
    address: "native",
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    rawDelta: "-42000000000000000",
    formattedAmount: "0.042",
    valueUsd: 151.2,
    direction: "out",
  },
  tokenChanges: [
    {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      rawDelta: "148620000",
      formattedAmount: "148.62",
      valueUsd: 148.62,
      direction: "in",
    },
  ],
};

export function previewChainIdForName(chainName: unknown): number {
  if (typeof chainName !== "string") return 8453;
  return DEFAULT_NETWORKS[chainName]?.chainId ?? 8453;
}

export function activePreviewAccount(environment: PreviewEnvironment) {
  const activeAccountId = environment.storage.sync.activeAccountId;
  return (
    environment.accounts.find((account) => account.id === activeAccountId) ??
    environment.activeAccount
  );
}

export function previewCustomTokens(environment: PreviewEnvironment): any[] {
  const tokens = environment.storage.local.customTokens;
  return Array.isArray(tokens) ? tokens : [];
}

export function unknownPreviewMessage(
  message: unknown,
  logger: PreviewChromeLogger,
): { success: false; error: string } {
  const type =
    message && typeof message === "object" && "type" in message
      ? String((message as { type?: unknown }).type ?? "<missing>")
      : "<missing>";
  const error = `[PreviewChrome] Unhandled runtime message "${type}"; live extension runtime is disabled`;
  const looksLikeRead = /^(get|is|can|fetch|resolve|estimate|simulate|retry|check|ensure|walletConnectGet|ens-probe)/.test(
    type,
  );
  if (looksLikeRead) logger.error(error, message);
  else logger.warn(error, message);
  return { success: false, error };
}
