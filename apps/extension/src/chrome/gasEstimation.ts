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
import { getNativeCurrencySymbol, CHAIN_REGISTRY } from "@/constants/chainRegistry";

const CHAIN_BY_ID_GAS = new Map(CHAIN_REGISTRY.map((c) => [c.chainId, c]));
const DEFAULT_GAS_BUFFER_PCT = 20;
import { fetchNativeCoinGeckoPrice } from "./coingeckoService";
import { estimateFees, type TierName } from "./feeEstimation";

/** Per-tier preset fees. Wei strings to keep JSON-safe across chrome.runtime. */
export interface GasEstimateTier {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

export type GasEstimateTiers = Record<TierName, GasEstimateTier>;

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
  /**
   * Slow / Standard / Fast preset fee pairs. Populated whenever feeEstimation
   * was able to read eth_feeHistory. The tier picker reads this; signing reads
   * `maxFeePerGas` / `maxPriorityFeePerGas` (which point at the standard tier
   * by default — the picker overwrites them via GasOverrides on confirm).
   * Optional because force-inclusion paths and dapp-provided-fees skip it.
   */
  tiers?: GasEstimateTiers;
  /** EIP-1559 next-block baseFee prediction (wei). Used by Custom-tier UI. */
  predictedNextBaseFee?: string;
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
  const chainEntry = CHAIN_BY_ID_GAS.get(tx.chainId);
  // Chains with a non-standard gas model (MegaETH) have systematically wrong
  // dapp-side estimates; always re-estimate via the chain's own RPC. Fee
  // values are fine to honor — under-priced fees just delay inclusion.
  const dappGas =
    !chainEntry?.usesNonStandardGasModel && tx.gas ? BigInt(tx.gas) : null;
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
            // Per-chain buffer (default 20%, override via gasBufferPct).
            const bufferPct =
              chainEntry?.gasBufferPct ?? DEFAULT_GAS_BUFFER_PCT;
            gasLimit =
              bufferPct === 0 ? gas : (gas * BigInt(100 + bufferPct)) / 100n;
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

    // 2. Estimate EIP-1559 fees (still fetch for baseFee even if dapp provided fees).
    //    Uses our own feeHistory-based estimator with per-chain priority fee
    //    floors and a 2× base fee multiplier — see feeEstimation.ts for why
    //    viem's default produced stuck-then-dropped txs on ETH mainnet.
    estimateFees(client, tx.chainId).catch(() => null),

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

  // baseFee from latest block (informational, used by the UI gas editor).
  const baseFee = feesResult?.baseFee ?? 0n;

  // Estimated cost = gasLimit * maxFeePerGas
  const estimatedCostWei = gasLimit * maxFeePerGas;

  // Check if balance is sufficient for gas + tx value
  const totalCost = estimatedCostWei + value;
  const insufficientBalance = balance < totalCost;

  // Tiers come from feeEstimation. We expose them whenever they exist —
  // even when the dapp pinned gas params — so the user can still opt into
  // the wallet's Slow/Standard/Fast estimates instead of being forced to
  // accept whatever the dapp suggested. The default tier on the UI side
  // flips to Custom in that case so the dapp's values stay pre-filled.
  const tiersRaw = feesResult?.tiers;
  const tiers: GasEstimateTiers | undefined = tiersRaw
    ? {
        slow: {
          maxFeePerGas: tiersRaw.slow.maxFeePerGas.toString(),
          maxPriorityFeePerGas: tiersRaw.slow.maxPriorityFeePerGas.toString(),
        },
        standard: {
          maxFeePerGas: tiersRaw.standard.maxFeePerGas.toString(),
          maxPriorityFeePerGas: tiersRaw.standard.maxPriorityFeePerGas.toString(),
        },
        fast: {
          maxFeePerGas: tiersRaw.fast.maxFeePerGas.toString(),
          maxPriorityFeePerGas: tiersRaw.fast.maxPriorityFeePerGas.toString(),
        },
      }
    : undefined;

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
    tiers,
    predictedNextBaseFee: feesResult?.predictedNextBaseFee?.toString(),
    estimationFailed,
    estimationError,
    estimationErrorFull,
    dappProvidedGas,
  };
}
