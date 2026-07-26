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
  approvalChanges: [],
  approvalDetectionIncomplete: false,
  nativeChange: {
    address: "native",
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    logoUrl: "/chainIcons/ethereum.svg",
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
      logoUrl: "/preview-assets/usdc.svg",
      rawDelta: "148620000",
      formattedAmount: "148.62",
      valueUsd: 148.62,
      direction: "in",
    },
  ],
};

export const previewIncreaseAllowanceSimulationResult: SimulationResult = {
  txSuccess: true,
  simulationFailed: false,
  metadataComplete: true,
  approvalChanges: [
    {
      system: "erc20",
      tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      owner: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      spender: "0x111111125421cA6dc452d289314280a0f8842A65",
      requestedAmount: "25000000",
      previousAmount: "100000000",
      remainingAmount: "125000000",
      expiration: null,
      verification: "verified",
      changeType: "increase",
      isUnlimited: false,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      logoUrl: "/preview-assets/usdc.svg",
      spenderLabel: "1inch Router",
    },
  ],
  approvalDetectionIncomplete: false,
  nativeChange: null,
  tokenChanges: [],
};

export const previewApprovalAndSendSimulationResult: SimulationResult = {
  txSuccess: true,
  simulationFailed: false,
  metadataComplete: true,
  approvalChanges: [
    {
      system: "erc20",
      tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      owner: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      spender: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      requestedAmount: ((1n << 256n) - 1n).toString(),
      previousAmount: "0",
      remainingAmount: ((1n << 256n) - 1n).toString(),
      expiration: null,
      verification: "verified",
      changeType: "increase",
      isUnlimited: true,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      logoUrl: "/preview-assets/usdc.svg",
      spenderLabel: "Bankr vault",
    },
  ],
  residualApprovals: [
    {
      system: "erc20",
      tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      owner: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      spender: "0x111111125421cA6dc452d289314280a0f8842A65",
      previousAmount: ((1n << 256n) - 1n).toString(),
      remainingAmount: ((1n << 256n) - 1n).toString(),
      sourceCallIndex: 1,
      evidence: "callTarget",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      logoUrl: "/preview-assets/usdc.svg",
    },
  ],
  approvalDetectionIncomplete: false,
  nativeChange: null,
  tokenChanges: [
    {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      rawDelta: "-1000000",
      formattedAmount: "1",
      valueUsd: 1,
      direction: "out",
      logoUrl: "/preview-assets/usdc.svg",
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
