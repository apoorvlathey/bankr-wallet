/**
 * Gas estimation for transaction confirmation
 * Makes RPC calls for gas limit, EIP-1559 fees, sender balance,
 * and fetches native token USD price from CoinGecko.
 */

import {
  createPublicClient,
  http,
  type PublicClient,
  type Address,
} from "viem";
import { getRpcUrl } from "./txHandlers";
import { getNativeCurrencySymbol } from "@/constants/chainRegistry";
import { fetchNativeCoinGeckoPrice } from "./coingeckoService";

export interface GasEstimate {
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  baseFee: string;
  estimatedCostWei: string;
  nativePriceUsd: number | null;
  /** Native currency symbol for display (e.g. "ETH", "AVAX", "BNB") */
  nativeCurrencySymbol: string;
  accountBalance: string;
  insufficientBalance: boolean;
  estimationFailed: boolean;
  estimationError?: string;
  estimationErrorFull?: string;
  /** Whether the dapp provided gas params (shown as "Dapp suggested" in UI) */
  dappProvidedGas: boolean;
  /**
   * True when this estimate is a hardcoded dependent-call fallback (not a real
   * eth_estimateGas or eth_simulateV1 result). Set by estimateBatchGasSequential
   * when a later call in the batch can't be estimated because it depends on state
   * from a prior call and the RPC doesn't support eth_simulateV1. The UI should
   * surface this prominently — especially for force inclusion where an
   * over-estimate directly increases L1 burn cost.
   */
  fallbackUsed?: boolean;
}

/** RPC timeout for gas estimation */
const RPC_TIMEOUT = 10_000;

/** Cached viem clients keyed by chainId and invalidated when RPC URL changes */
const clientCache = new Map<number, { rpcUrl: string; client: PublicClient }>();

async function getClient(chainId: number): Promise<PublicClient | null> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;

  const cached = clientCache.get(chainId);
  if (cached && cached.rpcUrl === rpcUrl) {
    return cached.client;
  }

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 1 }),
  });
  clientCache.set(chainId, { rpcUrl, client });
  return client;
}

export async function fetchNativePrice(chainId: number): Promise<number | null> {
  return fetchNativeCoinGeckoPrice(chainId);
}

/**
 * Estimate gas for a transaction.
 * If the dapp provided gas params, those are used as defaults.
 * Returns gas params, estimated cost, balance, and warnings.
 */
export async function estimateGas(
  tx: {
    from: string;
    to?: string;
    data?: string;
    value?: string;
    chainId: number;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  },
  accountAddress: string
): Promise<GasEstimate> {
  // Resolve native currency symbol (parallel with client creation)
  const [client, nativeCurrencySymbol] = await Promise.all([
    getClient(tx.chainId),
    getNativeCurrencySymbol(tx.chainId),
  ]);

  if (!client) {
    return {
      gasLimit: "0",
      maxFeePerGas: "0",
      maxPriorityFeePerGas: "0",
      baseFee: "0",
      estimatedCostWei: "0",
      nativePriceUsd: null,
      nativeCurrencySymbol,
      accountBalance: "0",
      insufficientBalance: false,
      estimationFailed: true,
      estimationError: "No RPC URL configured for this chain",
      dappProvidedGas: false,
    };
  }

  const from = accountAddress as Address;
  const to = tx.to ? (tx.to as Address) : undefined;
  const value = tx.value && tx.value !== "0x0" ? BigInt(tx.value) : 0n;
  const data = tx.data && tx.data !== "0x" ? (tx.data as `0x${string}`) : undefined;

  // Check if dapp provided gas parameters
  const dappGas = tx.gas ? BigInt(tx.gas) : null;
  const dappMaxFee = tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : null;
  const dappPriorityFee = tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : null;
  const dappGasPrice = tx.gasPrice ? BigInt(tx.gasPrice) : null;
  const dappProvidedGas = !!(dappGas || dappMaxFee || dappPriorityFee || dappGasPrice);

  // Run gas estimation, fee estimation, balance fetch, and price fetch in parallel
  let gasLimit = 0n;
  let estimationFailed = false;
  let estimationError: string | undefined;
  let estimationErrorFull: string | undefined;

  const [gasResult, feesResult, balance, nativePriceUsd] = await Promise.all([
    // 1. Estimate gas limit (skip if dapp provided it)
    dappGas
      ? Promise.resolve(dappGas).then((g) => { gasLimit = g; return g; })
      : client
          .estimateGas({ account: from, to, value, data })
          .then((gas) => {
            // Add 20% buffer
            gasLimit = (gas * 120n) / 100n;
            return gasLimit;
          })
          .catch((err: any) => {
            estimationFailed = true;
            const fullMsg = err.message || "Gas estimation failed";
            estimationError = err.shortMessage || fullMsg;
            estimationErrorFull = fullMsg;
            gasLimit = 200_000n;
            return gasLimit;
          }),

    // 2. Estimate EIP-1559 fees (still fetch for baseFee even if dapp provided fees)
    client.estimateFeesPerGas().catch(() => null),

    // 3. Get sender balance
    client.getBalance({ address: from }).catch(() => 0n),

    // 4. Fetch native token USD price
    fetchNativePrice(tx.chainId),
  ]);

  // Use dapp-provided fees if available, otherwise use RPC estimates
  // For legacy gasPrice txs, treat gasPrice as both maxFee and priorityFee
  let maxFeePerGas: bigint;
  let maxPriorityFeePerGas: bigint;

  if (dappMaxFee) {
    maxFeePerGas = dappMaxFee;
    maxPriorityFeePerGas = dappPriorityFee ?? feesResult?.maxPriorityFeePerGas ?? 0n;
  } else if (dappGasPrice) {
    // Legacy tx: gasPrice acts as both max fee and priority fee
    maxFeePerGas = dappGasPrice;
    maxPriorityFeePerGas = dappGasPrice;
  } else {
    maxFeePerGas = feesResult?.maxFeePerGas ?? 0n;
    maxPriorityFeePerGas = feesResult?.maxPriorityFeePerGas ?? 0n;
  }

  // baseFee from network estimate (informational)
  const networkMaxFee = feesResult?.maxFeePerGas ?? 0n;
  const networkPriorityFee = feesResult?.maxPriorityFeePerGas ?? 0n;
  const baseFee = networkMaxFee > networkPriorityFee
    ? networkMaxFee - networkPriorityFee
    : 0n;

  // Estimated cost = gasLimit * maxFeePerGas
  const estimatedCostWei = gasLimit * maxFeePerGas;

  // Check if balance is sufficient for gas + tx value
  const totalCost = estimatedCostWei + value;
  const insufficientBalance = balance < totalCost;

  return {
    gasLimit: gasLimit.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    baseFee: baseFee.toString(),
    estimatedCostWei: estimatedCostWei.toString(),
    nativePriceUsd,
    nativeCurrencySymbol,
    accountBalance: balance.toString(),
    insufficientBalance,
    estimationFailed,
    estimationError,
    estimationErrorFull,
    dappProvidedGas,
  };
}
