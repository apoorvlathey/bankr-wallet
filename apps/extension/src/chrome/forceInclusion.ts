/**
 * Force Inclusion via OP Stack L1 Deposit
 *
 * Allows users to bypass L2 sequencer censorship by submitting transactions
 * directly to the L1 OptimismPortal contract. The L2 must include the
 * deposit within ~10 minutes.
 *
 * Two submission paths:
 *   - Bankr API: builds deposit tx, submits L1 params to Bankr API
 *   - Local (PK/Seed): builds deposit tx, signs & broadcasts on L1 directly
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import {
  publicActionsL2,
  walletActionsL1,
  getL2TransactionHashes,
} from "viem/op-stack";
import {
  FORCE_INCLUSION_CHAINS,
  type ForceInclusionChainInfo,
  RPC_URLS,
} from "@/constants/chainRegistry";
import { submitTransactionDirect, type TransactionParams } from "./bankrApi";
import { getRpcUrl } from "./txHandlers";
import {
  addTxToHistory,
  updateTxInHistory,
} from "./txHistoryStorage";
import { type PendingTxRequest } from "./pendingTxStorage";
import { fetchNativeCoinGeckoPrice } from "./coingeckoService";
import { getNativeCurrencySymbol } from "@/constants/chainRegistry";
import type { GasEstimate } from "./gasEstimation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ForceInclusionStage =
  | "building"
  | "submitting"
  | "waiting-l1"
  | "complete"
  | "error";

export interface ForceInclusionProgressData {
  stage: ForceInclusionStage;
  l1Hash?: string;
  l2Hash?: string;
  error?: string;
  l1ChainId: number;
  l2ChainId: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const L1_RPC_TIMEOUT = 30_000;
const DEFAULT_L2_GAS = 8_000_000n;

/** Minimal ABI for OptimismPortal.depositTransaction — only the function we call */
const PORTAL_DEPOSIT_ABI = [
  {
    type: "function",
    name: "depositTransaction",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
      { name: "_gasLimit", type: "uint64" },
      { name: "_isCreation", type: "bool" },
      { name: "_data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

export function getL1Chain(l1ChainId: number) {
  return l1ChainId === 1 ? mainnet : sepolia;
}

export async function getL1RpcUrl(l1ChainId: number): Promise<string> {
  // Check for user-configured override first
  const stored = await getRpcUrl(l1ChainId);
  if (stored) return stored;
  // Fallback to built-in registry or well-known public RPCs
  if (RPC_URLS[l1ChainId]) return RPC_URLS[l1ChainId];
  return l1ChainId === 1
    ? "https://eth.llamarpc.com"
    : "https://ethereum-sepolia-rpc.publicnode.com";
}

export function createL1PublicClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    transport: http(rpcUrl, { timeout: L1_RPC_TIMEOUT, retryCount: 1 }),
  });
}

export async function writeForceInclusionProgress(
  txId: string,
  data: ForceInclusionProgressData,
): Promise<void> {
  await chrome.storage.local.set({ [`fiProgress:${txId}`]: data });
}

// ---------------------------------------------------------------------------
// Gas Estimation for Force Inclusion
// ---------------------------------------------------------------------------

/**
 * Estimates gas for a force-inclusion deposit transaction on L1.
 * Returns a GasEstimate-compatible object so GasEstimateDisplay can use it.
 */
export async function estimateForceInclusionGas(
  tx: {
    from: string;
    to?: string;
    data?: string;
    value?: string;
    chainId: number;
  },
  accountAddress: string,
): Promise<GasEstimate> {
  const info = FORCE_INCLUSION_CHAINS.get(tx.chainId);
  if (!info) {
    return failedEstimate("Chain does not support force inclusion");
  }

  const l1RpcUrl = await getL1RpcUrl(info.l1ChainId);
  const l1Client = createL1PublicClient(l1RpcUrl);

  const from = accountAddress as `0x${string}`;
  const value = tx.value && tx.value !== "0x0" ? BigInt(tx.value) : 0n;

  try {
    // Build the actual L1 deposit tx params (encodes portal call with L2 gas)
    // so we can estimate L1 gas accurately. The OptimismPortal's Burn.gas()
    // resource metering loop burns gas proportional to the L2 gas requested,
    // so the L1 gas needed scales with L2 gas. A hardcoded baseline like 200k
    // is incorrect for high-L2-gas deposits.
    const l1TxParams = await buildL1DepositTxParams(
      {
        from: accountAddress,
        to: tx.to || "0x0000000000000000000000000000000000000000",
        data: tx.data || "0x",
        value: tx.value || "0x0",
        chainId: tx.chainId,
      },
      info,
    );

    // Estimate L1 gas, fees, balance, and price in parallel
    const [l1GasEstimate, l1Fees, l1Balance, nativePriceUsd, nativeCurrencySymbol] =
      await Promise.all([
        l1Client
          .estimateGas({
            account: from,
            to: l1TxParams.to as `0x${string}`,
            data: l1TxParams.data as `0x${string}`,
            value,
          })
          .catch(() => null),
        l1Client.estimateFeesPerGas().catch(() => null),
        l1Client.getBalance({ address: from }).catch(() => 0n),
        fetchNativeCoinGeckoPrice(info.l1ChainId),
        getNativeCurrencySymbol(info.l1ChainId),
      ]);

    // Use real estimate (with 20% buffer) when available, fall back to 1M for safety
    const l1GasLimit = l1GasEstimate
      ? (l1GasEstimate * 120n) / 100n
      : 1_000_000n;

    const maxFeePerGas = l1Fees?.maxFeePerGas ?? 0n;
    const maxPriorityFeePerGas = l1Fees?.maxPriorityFeePerGas ?? 0n;
    const baseFee =
      maxFeePerGas > maxPriorityFeePerGas
        ? maxFeePerGas - maxPriorityFeePerGas
        : 0n;
    const estimatedCostWei = l1GasLimit * maxFeePerGas;
    const totalCost = estimatedCostWei + value;
    const insufficientBalance = l1Balance < totalCost;

    return {
      gasLimit: l1GasLimit.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      baseFee: baseFee.toString(),
      estimatedCostWei: estimatedCostWei.toString(),
      nativePriceUsd,
      nativeCurrencySymbol,
      accountBalance: l1Balance.toString(),
      insufficientBalance,
      estimationFailed: false,
      dappProvidedGas: false,
    };
  } catch (err: any) {
    return failedEstimate(
      err?.shortMessage || err?.message || "Force inclusion gas estimation failed",
    );
  }
}

function failedEstimate(error: string): GasEstimate {
  return {
    gasLimit: "0",
    maxFeePerGas: "0",
    maxPriorityFeePerGas: "0",
    baseFee: "0",
    estimatedCostWei: "0",
    nativePriceUsd: null,
    nativeCurrencySymbol: "ETH",
    accountBalance: "0",
    insufficientBalance: false,
    estimationFailed: true,
    estimationError: error,
    dappProvidedGas: false,
  };
}

// ---------------------------------------------------------------------------
// Process Force Inclusion — Bankr API path
// ---------------------------------------------------------------------------

export async function processForceInclusionBankr(
  txId: string,
  pending: PendingTxRequest,
  apiKey: string,
): Promise<void> {
  const info = FORCE_INCLUSION_CHAINS.get(pending.tx.chainId);
  if (!info) {
    await writeFailure(txId, pending, "Chain does not support force inclusion");
    return;
  }

  const progress = (
    stage: ForceInclusionStage,
    extra?: Partial<ForceInclusionProgressData>,
  ) =>
    writeForceInclusionProgress(txId, {
      stage,
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.tx.chainId,
      timestamp: Date.now(),
      ...extra,
    });

  console.log("[ForceInclusion] Bankr path - pending.tx: " + JSON.stringify({
    from: pending.tx.from,
    to: pending.tx.to,
    data: pending.tx.data?.slice(0, 40) + "...",
    value: pending.tx.value,
    chainId: pending.tx.chainId,
  }));

  // Save to tx history as processing — include forceInclusionMeta from the
  // start so the activity feed can show "L1 Pending" instead of "Processing"
  await addTxToHistory({
    id: txId,
    status: "processing",
    tx: pending.tx,
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId: pending.tx.chainId,
    createdAt: pending.timestamp,
    accountType: "bankr",
    functionName: "Force Inclusion (L1 Deposit)",
    forceInclusionMeta: {
      l1TxHash: "", // Not yet known
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.tx.chainId,
      l2Confirmed: false,
    },
  });

  try {
    // Stage 1: Build deposit tx
    await progress("building");
    const l1TxParams = await buildL1DepositTxParams(pending.tx, info);
    console.log("[ForceInclusion] L1 tx params for Bankr: " + JSON.stringify({
      to: l1TxParams.to,
      data: l1TxParams.data?.slice(0, 40) + "...",
      value: l1TxParams.value,
      chainId: l1TxParams.chainId,
    }));

    // Stage 2: Submit to Bankr API
    await progress("submitting");
    const result = await submitTransactionDirect(apiKey, l1TxParams);
    const l1Hash = result.transactionHash;

    if (result.status === "reverted") {
      await progress("error", { error: "L1 deposit transaction reverted" });
      await writeFailure(txId, pending, "L1 deposit transaction reverted");
      return;
    }

    // Update history with L1 hash immediately so the activity feed can link to it
    await updateTxInHistory(txId, {
      forceInclusionMeta: {
        l1TxHash: l1Hash,
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.tx.chainId,
        l2Confirmed: false,
      },
    });

    // Stage 3: Wait for L1 receipt & extract L2 hash
    await progress("waiting-l1", { l1Hash });

    const l1RpcUrl = await getL1RpcUrl(info.l1ChainId);
    const l1Client = createL1PublicClient(l1RpcUrl);
    const receipt = await l1Client.waitForTransactionReceipt({
      hash: l1Hash as Hash,
      timeout: 120_000,
    });

    // Critical: L1 tx may have reverted on-chain even if Bankr API said "success"
    if (receipt.status === "reverted") {
      await progress("error", { error: "L1 deposit transaction reverted on-chain" });
      await writeFailure(txId, pending, "L1 deposit transaction reverted on-chain");
      return;
    }

    const l2Hash = extractL2Hash(receipt);
    await finishSuccess(txId, pending, info, l1Hash, l2Hash, progress);
  } catch (err: any) {
    const error = err?.shortMessage || err?.message || "Force inclusion failed";
    await progress("error", { error });
    await writeFailure(txId, pending, error);
  }
}

// ---------------------------------------------------------------------------
// Process Force Inclusion — Local (PK/Seed) path
// ---------------------------------------------------------------------------

export async function processForceInclusionLocal(
  txId: string,
  pending: PendingTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
): Promise<void> {
  const info = FORCE_INCLUSION_CHAINS.get(pending.tx.chainId);
  if (!info) {
    await writeFailure(txId, pending, "Chain does not support force inclusion");
    return;
  }

  const progress = (
    stage: ForceInclusionStage,
    extra?: Partial<ForceInclusionProgressData>,
  ) =>
    writeForceInclusionProgress(txId, {
      stage,
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.tx.chainId,
      timestamp: Date.now(),
      ...extra,
    });

  // Save to tx history as processing — include forceInclusionMeta from the
  // start so the activity feed can show "L1 Pending" instead of "Processing"
  await addTxToHistory({
    id: txId,
    status: "processing",
    tx: pending.tx,
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId: pending.tx.chainId,
    createdAt: pending.timestamp,
    accountType: account.type as "privateKey" | "seedPhrase",
    functionName: "Force Inclusion (L1 Deposit)",
    forceInclusionMeta: {
      l1TxHash: "", // Not yet known
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.tx.chainId,
      l2Confirmed: false,
    },
  });

  try {
    // Stage 1: Build deposit tx
    await progress("building");
    const l2RpcUrl = await getRpcUrl(pending.tx.chainId);
    if (!l2RpcUrl) throw new Error("No RPC URL for L2 chain");

    const l2Client = createPublicClient({
      chain: info.viemChain,
      transport: http(l2RpcUrl, { timeout: L1_RPC_TIMEOUT }),
    }).extend(publicActionsL2());

    const from = pending.tx.from as `0x${string}`;
    const value =
      pending.tx.value && pending.tx.value !== "0x0"
        ? BigInt(pending.tx.value)
        : 0n;

    let l2Gas = DEFAULT_L2_GAS;
    try {
      const estimated = await l2Client.estimateGas({
        account: from,
        to: pending.tx.to as `0x${string}` | undefined,
        value,
        data: (pending.tx.data as `0x${string}`) || undefined,
      });
      // Add 20% buffer
      l2Gas = (estimated * 120n) / 100n;
    } catch {
      // Use default
    }

    const l2To = pending.tx.to as `0x${string}` | undefined;
    const l2Data = (pending.tx.data && pending.tx.data !== "0x" ? pending.tx.data : "0x") as `0x${string}`;

    const depositArgs = await l2Client.buildDepositTransaction({
      mint: value,
      to: l2To,
      data: l2Data,
      gas: l2Gas,
      account: from,
    });

    console.log("[ForceInclusion] PK/Seed depositArgs: " + JSON.stringify({
      l2To,
      l2Data: l2Data.slice(0, 40) + "...",
      l2Gas: l2Gas.toString(),
      value: value.toString(),
      requestTo: (depositArgs as any).request?.to,
      requestData: (depositArgs as any).request?.data?.toString().slice(0, 40),
      requestGas: (depositArgs as any).request?.gas?.toString(),
      requestIsCreation: (depositArgs as any).request?.isCreation,
    }));

    // Stage 2: Submit to L1
    await progress("submitting");
    const l1RpcUrl = await getL1RpcUrl(info.l1ChainId);
    const l1Chain = getL1Chain(info.l1ChainId);
    const viemAccount = privateKeyToAccount(privateKey);

    const l1WalletClient = createWalletClient({
      account: viemAccount,
      chain: l1Chain,
      transport: http(l1RpcUrl, { timeout: L1_RPC_TIMEOUT }),
    }).extend(walletActionsL1());

    const l1Hash = await l1WalletClient.depositTransaction({
      ...depositArgs,
      account: viemAccount, // Must override — depositArgs.account is an address string, not the local signer
      chain: l1Chain,
      targetChain: info.viemChain,
    });

    console.log("[ForceInclusion] L1 tx submitted:", l1Hash);

    // Update history with L1 hash immediately so the activity feed can link to it
    await updateTxInHistory(txId, {
      forceInclusionMeta: {
        l1TxHash: l1Hash,
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.tx.chainId,
        l2Confirmed: false,
      },
    });

    // Stage 3: Wait for L1 confirmation
    await progress("waiting-l1", { l1Hash });
    const l1PublicClient = createL1PublicClient(l1RpcUrl);
    const receipt = await l1PublicClient.waitForTransactionReceipt({
      hash: l1Hash,
      timeout: 120_000,
    });

    // Critical: L1 tx may have reverted on-chain even if it was broadcast successfully
    if (receipt.status === "reverted") {
      await progress("error", { error: "L1 deposit transaction reverted on-chain" });
      await writeFailure(txId, pending, "L1 deposit transaction reverted on-chain");
      return;
    }

    const l2Hash = extractL2Hash(receipt);
    await finishSuccess(txId, pending, info, l1Hash, l2Hash, progress);
  } catch (err: any) {
    const error = err?.shortMessage || err?.message || "Force inclusion failed";
    await progress("error", { error });
    await writeFailure(txId, pending, error);
  }
}

// ---------------------------------------------------------------------------
// Shared completion helpers
// ---------------------------------------------------------------------------

export function extractL2Hash(receipt: TransactionReceipt): string | undefined {
  try {
    const [l2Hash] = getL2TransactionHashes(receipt);
    return l2Hash;
  } catch {
    return undefined;
  }
}

async function finishSuccess(
  txId: string,
  pending: PendingTxRequest,
  info: ForceInclusionChainInfo,
  l1Hash: string,
  l2Hash: string | undefined,
  progress: (
    stage: ForceInclusionStage,
    extra?: Partial<ForceInclusionProgressData>,
  ) => Promise<void>,
): Promise<void> {
  const resultHash = l2Hash || l1Hash;

  await progress("complete", { l1Hash, l2Hash: l2Hash || undefined });

  // Mark as "pending" (not "success") — L1 is confirmed but L2 sequencer
  // hasn't picked it up yet. The activity feed will show this as a 2-step
  // process. The tx will be marked "success" once the L2 receipt is found.
  await updateTxInHistory(txId, {
    status: "pending",
    txHash: resultHash,
    forceInclusionMeta: {
      l1TxHash: l1Hash,
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.tx.chainId,
      l2Confirmed: false,
    },
  });

  // Show notification
  const { CHAIN_CONFIG } = await import("@/constants/chainConfig");
  const { showNotification, writeResultToStorage } = await import(
    "./txHandlers"
  );

  const l1ChainConfig = CHAIN_CONFIG[info.l1ChainId];

  // Store L1 explorer link for the notification
  const l1ExplorerUrl = l1ChainConfig?.explorer
    ? `${l1ChainConfig.explorer}/tx/${l1Hash}`
    : null;
  if (l1ExplorerUrl) {
    chrome.storage.local.set({
      [`notification-tx-success-${txId}`]: l1ExplorerUrl,
    });
  }

  await showNotification(
    `tx-success-${txId}`,
    "L1 Deposit Confirmed",
    `Deposit confirmed on ${info.l1ChainName}. Awaiting L2 sequencer inclusion (~1-10 min).`,
  );

  // Write result for dapp — use L2 hash when available
  await writeResultToStorage(`txResult:${txId}`, {
    success: true,
    txHash: resultHash,
  });
}

async function writeFailure(
  txId: string,
  pending: PendingTxRequest,
  error: string,
): Promise<void> {
  const { showNotification, writeResultToStorage } = await import(
    "./txHandlers"
  );

  await updateTxInHistory(txId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });

  await showNotification(
    `tx-failed-${txId}`,
    "Force Inclusion Failed",
    error.length > 100 ? error.substring(0, 100) + "..." : error,
  );

  await writeResultToStorage(`txResult:${txId}`, { success: false, error });
}

// ---------------------------------------------------------------------------
// Build L1 deposit tx params (for Bankr API submission)
// ---------------------------------------------------------------------------

export async function buildL1DepositTxParams(
  l2Tx: PendingTxRequest["tx"],
  info: ForceInclusionChainInfo,
  /**
   * Optional pre-computed L2 gas limit to bake into the portal call.
   * Pass this when you already have an accurate sequential estimate (e.g. from
   * estimateBatchGasSequential for dependent batch calls). Should already
   * include any desired buffer — no extra buffer is applied here.
   * If omitted, falls back to independent eth_estimateGas with 20% buffer.
   */
  l2GasOverride?: bigint,
): Promise<TransactionParams> {
  const from = l2Tx.from as `0x${string}`;
  const value =
    l2Tx.value && l2Tx.value !== "0x0" ? BigInt(l2Tx.value) : 0n;
  const l2To = l2Tx.to as `0x${string}` | undefined;
  const l2Data = (l2Tx.data && l2Tx.data !== "0x" ? l2Tx.data : "0x") as `0x${string}`;
  const isCreation = !l2To;

  // Determine L2 gas: use override if provided, otherwise estimate independently
  let l2Gas: bigint;
  if (l2GasOverride !== undefined) {
    l2Gas = l2GasOverride;
  } else {
    l2Gas = DEFAULT_L2_GAS;
    const l2RpcUrl = await getRpcUrl(l2Tx.chainId);
    if (l2RpcUrl) {
      const l2Client = createPublicClient({
        chain: info.viemChain,
        transport: http(l2RpcUrl, { timeout: L1_RPC_TIMEOUT }),
      });
      try {
        const estimated = await l2Client.estimateGas({
          account: from,
          to: l2To,
          value,
          data: l2Data !== "0x" ? l2Data : undefined,
        });
        l2Gas = (estimated * 120n) / 100n;
      } catch {
        // Use default
      }
    }
  }

  // Resolve portal contract address from viem chain definition
  const portalContracts = (info.viemChain.contracts as any)?.portal;
  if (!portalContracts) throw new Error("No portal contract for this chain");

  const portalAddress = Object.values(portalContracts)[0] as {
    address: string;
  };
  if (!portalAddress?.address)
    throw new Error("Could not resolve portal contract address");

  // Encode the OptimismPortal.depositTransaction call directly from original L2 tx params
  const { encodeFunctionData } = await import("viem");

  const portalCalldata = encodeFunctionData({
    abi: PORTAL_DEPOSIT_ABI,
    functionName: "depositTransaction",
    args: [
      l2To ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`),
      value,
      l2Gas,
      isCreation,
      l2Data,
    ],
  });

  console.log("[ForceInclusion] buildL1DepositTxParams: " + JSON.stringify({
    l2To,
    l2Data: l2Data.slice(0, 40) + "...",
    l2Gas: l2Gas.toString(),
    value: value.toString(),
    isCreation,
    portalAddress: portalAddress.address,
    encodedCalldata: portalCalldata.slice(0, 40) + "...",
  }));

  return {
    from: l2Tx.from,
    to: portalAddress.address,
    data: portalCalldata,
    value: value > 0n ? `0x${value.toString(16)}` : "0x0",
    chainId: info.l1ChainId,
  };
}

// ---------------------------------------------------------------------------
// Recovery: re-check stuck force inclusion txs on extension startup
// ---------------------------------------------------------------------------

/**
 * Find force inclusion txs that are stuck in "pending"/"processing" state
 * because their L1 receipt status was never checked. Re-fetch the L1 receipt:
 *   - If reverted → mark as failed
 *   - If success and we previously couldn't extract L2 hash → try again, start L2 polling
 *
 * Called from background.ts on service worker startup.
 */
export async function recoverStuckForceInclusionTxs(): Promise<void> {
  const { getTxHistory } = await import("./txHistoryStorage");
  const history = await getTxHistory();

  for (const tx of history) {
    if (!tx.forceInclusionMeta) continue;
    if (tx.status === "success" || tx.status === "failed") continue;

    const l1Hash = tx.forceInclusionMeta.l1TxHash;
    if (!l1Hash) continue; // No L1 hash yet, can't check

    // Skip txs that already have a valid L2 hash (the L2 receipt poller handles those)
    if (tx.status === "pending" && tx.txHash && tx.txHash !== l1Hash) continue;

    try {
      const l1RpcUrl = await getL1RpcUrl(tx.forceInclusionMeta.l1ChainId);
      const l1Client = createL1PublicClient(l1RpcUrl);

      const receipt = await l1Client
        .getTransactionReceipt({ hash: l1Hash as Hash })
        .catch(() => null);
      if (!receipt) continue; // Receipt not yet available — leave as is

      if (receipt.status === "reverted") {
        await updateTxInHistory(tx.id, {
          status: "failed",
          error: "L1 deposit transaction reverted on-chain",
          completedAt: Date.now(),
        });
        console.log(`[ForceInclusion Recovery] Marked ${tx.id} as failed (L1 reverted)`);
        continue;
      }

      // L1 succeeded — try to extract L2 hash
      const l2Hash = extractL2Hash(receipt);
      if (l2Hash) {
        await updateTxInHistory(tx.id, {
          status: "pending",
          txHash: l2Hash,
          forceInclusionMeta: {
            ...tx.forceInclusionMeta,
            l1TxHash: l1Hash,
          },
        });
        const { startReceiptPolling } = await import("./txReceiptPoller");
        startReceiptPolling(tx.id, l2Hash, tx.forceInclusionMeta.l2ChainId);
        console.log(`[ForceInclusion Recovery] Recovered ${tx.id} with L2 hash ${l2Hash}`);
      } else if (tx.status === "processing") {
        // L1 confirmed but no L2 hash extractable — bump to pending so the
        // activity feed shows "L1 Confirmed / L2 Pending" instead of stuck "L1 Pending".
        // The L1 hash stays in forceInclusionMeta for the L1 explorer link.
        await updateTxInHistory(tx.id, {
          status: "pending",
          txHash: l1Hash,
        });
      }
    } catch (e) {
      console.warn(`[ForceInclusion Recovery] Failed to check tx ${tx.id}:`, e);
    }
  }
}
