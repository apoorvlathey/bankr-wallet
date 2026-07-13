/**
 * Gas estimation for transaction confirmation
 * Makes RPC calls for gas limit, EIP-1559 fees, sender balance,
 * and fetches native token USD price from CoinGecko.
 */

import {
  createPublicClient,
  type PublicClient,
  type Address,
  type StateOverride,
} from "viem";
import { getRpcUrl } from "./transactions/rpcConfig";
import { secureHttpTransport } from "./rpcHttpClient";
import {
  getNativeCurrencySymbol,
  CHAIN_REGISTRY,
  NON_STANDARD_GAS_CHAIN_IDS,
} from "@/constants/chainRegistry";

const CHAIN_BY_ID_GAS = new Map(CHAIN_REGISTRY.map((c) => [c.chainId, c]));
const DEFAULT_GAS_BUFFER_PCT = 20;

/**
 * Bump a gas limit for a transaction that will carry one or more EIP-7702
 * authorization tuples.
 *
 * `eth_estimateGas` always simulates the tx body without the authorization
 * list attached — there's no way for the dapp-side / RPC simulator to know
 * an auth is coming. So the intrinsic cost of each tuple (mainline EVM:
 * PER_AUTH_BASE_COST 12_500 + PER_EMPTY_ACCOUNT_COST 25_000 = up to 37_500
 * per auth) is always missing from the estimate.
 *
 * Non-standard-gas chains like MegaETH scale intrinsic costs ~3-4× over
 * mainline; reverse-engineering each chain's formula would be a rabbit hole
 * and the user-visible cost of overshooting is essentially zero (you only
 * pay for gas consumed). So we hand those chains a much more generous
 * per-auth overhead.
 *
 * Used by both `estimateGas` (UI accuracy) and the broadcast paths in
 * `txHandlers` / `batchTxHandlers` (last-line defense against an underflow
 * that would manifest as "intrinsic gas too low" from the chain).
 */
export function bumpGasForEip7702Auth(
  chainId: number,
  currentGas: bigint,
  authCount: number,
): bigint {
  if (authCount <= 0) return currentGas;
  const isNonStandardGas = NON_STANDARD_GAS_CHAIN_IDS.has(chainId);
  const perAuthOverhead = isNonStandardGas ? 150_000n : 50_000n;
  const floor = isNonStandardGas ? 300_000n : 80_000n;
  const bumped = currentGas + perAuthOverhead * BigInt(authCount);
  return bumped > floor ? bumped : floor;
}
import {
  fetchNativeCoinGeckoPrice,
  resolveCoinGeckoNativeAssetsBatch,
} from "./coingeckoService";
import { estimateFees, type TierName } from "./feeEstimation";
import { convertLegacyGasPriceToEip1559 } from "./gasFeeNormalization";
import { getStoredResolvedChainById } from "@/lib/chains";

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
   * True when the dapp explicitly supplied a fee value of zero — either
   * `maxFeePerGas`, `maxPriorityFeePerGas`, or legacy `gasPrice`. Such txs
   * land in the mempool but get dropped (no tip = no inclusion incentive),
   * so the UI defaults the picker to Standard instead of Custom even when
   * `dappProvidedGas` is set. The user can still flip back to Custom to see
   * or edit the dapp's original values.
   */
  dappGasInvalid?: boolean;
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
    transport: secureHttpTransport(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 1 }),
  });
  clientCache.set(chainId, { rpcUrl, client });
  return client;
}

export async function fetchNativePrice(chainId: number): Promise<number | null> {
  const registryPrice = await fetchNativeCoinGeckoPrice(chainId);
  if (registryPrice !== null) return registryPrice;

  const chain = await getStoredResolvedChainById(chainId);
  if (!chain) return null;

  const [resolved] = await resolveCoinGeckoNativeAssetsBatch([
    {
      chainId,
      chainName: chain.name,
      nativeCurrencyName: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
    },
  ]);

  return resolved?.priceUsd ? resolved.priceUsd : null;
}

/**
 * Estimate gas limit for a single tx, with a custom buffer multiplier.
 * Returns null if no RPC is configured or estimation fails — callers decide
 * how to fall back. Used by paths that must hand the chain a hand-buffered
 * gas value (e.g., Bankr swap batches where Bankr's server-side estimate
 * underestimates V4-with-hooks calls).
 */
export async function estimateGasLimitWithBuffer(
  tx: {
    from: string;
    to: string;
    data?: string;
    value?: string;
    chainId: number;
  },
  bufferPct: number,
): Promise<bigint | null> {
  const client = await getClient(tx.chainId);
  if (!client) return null;

  const value =
    tx.value && tx.value !== "0x0" && tx.value !== "0"
      ? BigInt(tx.value)
      : 0n;
  const data =
    tx.data && tx.data !== "0x" ? (tx.data as `0x${string}`) : undefined;

  try {
    const raw = await client.estimateGas({
      account: tx.from as Address,
      to: tx.to as Address,
      value,
      data,
    });
    return (raw * BigInt(100 + bufferPct)) / 100n;
  } catch {
    return null;
  }
}

/**
 * Estimate gas for a transaction.
 * If the dapp provided gas params, those are used as defaults.
 * Returns gas params, estimated cost, balance, and warnings.
 *
 * `eip7702Delegate`, when provided, makes the simulation reflect what will
 * actually happen onchain after a 7702 authorization is processed: the EOA
 * gets the delegate's runtime code via state override, so an ERC-7821 self-
 * call (to == from == EOA, data == execute(mode, calls)) dispatches through
 * the delegate just like it would after broadcast. Required for atomic-7702
 * batches where the EOA isn't yet onchain-delegated (needsAuthorization=true)
 * — without it, eth_estimateGas runs against a code-less EOA, the calldata is
 * ignored, and any value transfer would be checked against the user's real
 * balance instead of routing through the delegate's batch executor.
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
  accountAddress: string,
  options?: {
    /** Delegate the simulation should treat `accountAddress` as 7702-delegated to. */
    eip7702Delegate?: `0x${string}`;
    /**
     * Number of authorization tuples that will be attached to the broadcast
     * tx (1 for set-delegate / revoke / dapp batch that toggles delegation).
     * `eth_estimateGas` doesn't see the auth list and so under-counts intrinsic
     * gas — this option triggers the same bump used at broadcast time so the
     * UI's displayed estimate matches what we actually sign.
     */
    eip7702AuthCount?: number;
  },
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
  // A literal-zero fee from the dapp (priority, max, or legacy gasPrice) is
  // treated as unusable — txs broadcast with priority=0 land in the mempool
  // but get dropped at the next block clear since miners have no inclusion
  // incentive. Surface the flag so the UI defaults to our Standard tier.
  const dappGasInvalid =
    dappProvidedGas &&
    ((dappMaxFee !== null && dappMaxFee === 0n) ||
      (dappPriorityFee !== null && dappPriorityFee === 0n) ||
      (dappGasPrice !== null && dappGasPrice === 0n));

  // For EIP-7702 atomic batches: fetch the delegate's runtime code and apply
  // it to the EOA via state override. This mirrors onchain semantics (after
  // the authorization is processed, eth_getCode(EOA) → 0xef0100<delegate> and
  // any call to EOA dispatches through the delegate's code) — without it, an
  // EOA self-call to a not-yet-delegated EOA would either no-op (calldata
  // ignored) or fail the value transfer's balance check. Probed in parallel
  // with fees / balance / price so it doesn't add a serial roundtrip.
  const delegateCodePromise: Promise<`0x${string}` | undefined> =
    options?.eip7702Delegate
      ? client
          .getCode({ address: options.eip7702Delegate })
          .then((code) => (code && code !== "0x" ? code : undefined))
          .catch(() => undefined)
      : Promise.resolve(undefined);

  let gasLimit = 0n;
  let estimationFailed = false;
  let estimationError: string | undefined;
  let estimationErrorFull: string | undefined;

  // Resolve non-gas-estimate inputs in parallel first so the gas estimation
  // call can pick up the right stateOverride. eth_estimateGas is the expensive
  // one anyway; the rest of the calls land well within its latency.
  const [delegateCode, feesResult, balance, nativePriceUsd] = await Promise.all([
    delegateCodePromise,
    // EIP-1559 fees (still fetched for baseFee even if dapp pinned fees) —
    // uses our own feeHistory-based estimator with per-chain priority floors.
    estimateFees(client, tx.chainId).catch(() => null),
    // Sender balance for insufficient-balance check.
    client.getBalance({ address: from }).catch(() => 0n),
    // Native token USD price for cost display.
    fetchNativePrice(tx.chainId),
  ]);

  const stateOverride: StateOverride | undefined = delegateCode
    ? [{ address: from, code: delegateCode }]
    : undefined;

  if (dappGas) {
    gasLimit = dappGas;
  } else {
    try {
      const gas = await client.estimateGas({
        account: from,
        to,
        value,
        data,
        ...(stateOverride ? { stateOverride } : {}),
      });
      // Per-chain buffer (default 20%, override via gasBufferPct).
      const bufferPct = chainEntry?.gasBufferPct ?? DEFAULT_GAS_BUFFER_PCT;
      gasLimit =
        bufferPct === 0 ? gas : (gas * BigInt(100 + bufferPct)) / 100n;
    } catch (err: any) {
      estimationFailed = true;
      const fullMsg = err.message || "Gas estimation failed";
      estimationError = err.shortMessage || fullMsg;
      estimationErrorFull = fullMsg;
      gasLimit = 200_000n;
      // Log 7702 sim failures explicitly so the per-call fallback path
      // can be diagnosed against the actual chain RPC error (some Base
      // RPCs ignore stateOverride on estimateGas; binary search also
      // sometimes fails on deeply nested executor calldata).
      if (options?.eip7702Delegate) {
        console.warn(
          "[estimateGas:7702] failed",
          {
            from,
            to,
            delegate: options.eip7702Delegate,
            value: value.toString(),
            dataLen: data?.length ?? 0,
            err: err?.shortMessage || err?.message,
          },
        );
      }
    }
  }

  // EIP-7702 auth-tuple intrinsic cost — `eth_estimateGas` above never sees
  // the authorizationList that will be attached at broadcast time, so the
  // returned gas is always short by ~12.5k per auth (more on non-standard-gas
  // chains). Bump here so the UI's displayed limit matches what we sign.
  if (options?.eip7702AuthCount && options.eip7702AuthCount > 0 && gasLimit > 0n) {
    gasLimit = bumpGasForEip7702Auth(
      tx.chainId,
      gasLimit,
      options.eip7702AuthCount,
    );
  }

  // baseFee from latest block (informational and required when translating a
  // legacy total gasPrice into an equivalent EIP-1559 fee pair).
  const baseFee = feesResult?.baseFee ?? 0n;

  // Use dapp-provided fees if available, otherwise use RPC estimates.
  let maxFeePerGas: bigint;
  let maxPriorityFeePerGas: bigint;

  if (dappMaxFee) {
    maxFeePerGas = dappMaxFee;
    maxPriorityFeePerGas = dappPriorityFee ?? feesResult?.maxPriorityFeePerGas ?? 0n;
  } else if (dappGasPrice) {
    const converted = convertLegacyGasPriceToEip1559(dappGasPrice, baseFee);
    maxFeePerGas = converted.maxFeePerGas;
    maxPriorityFeePerGas = converted.maxPriorityFeePerGas;
  } else {
    maxFeePerGas = feesResult?.maxFeePerGas ?? 0n;
    maxPriorityFeePerGas = feesResult?.maxPriorityFeePerGas ?? 0n;
  }

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
    dappGasInvalid,
  };
}
