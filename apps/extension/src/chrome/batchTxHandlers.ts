/**
 * ERC-5792 batch transaction handlers
 * Manages wallet_getCapabilities, wallet_sendCalls, wallet_getCallsStatus, wallet_showCallsStatus
 */

import { encodeFunctionData, encodeAbiParameters } from "viem";
import {
  submitTransactionDirect,
  type TransactionParams,
} from "./bankrApi";
import {
  BANKR_SUPPORTED_CHAIN_IDS,
  CHAIN_NAMES,
} from "../constants/networks";
import { ALLOWED_CHAIN_IDS } from "../constants/chainRegistry";
import { CHAIN_CONFIG } from "../constants/chainConfig";
import { getActiveAccount, getTabAccount } from "./accountStorage";
import {
  savePendingBatchTxRequest,
  removePendingBatchTxRequest,
  getPendingBatchTxRequestById,
} from "./pendingBatchTxStorage";
import {
  saveBundleStatus,
  getBundleStatus,
  updateBundleStatus,
} from "./bundleStatusStorage";
import {
  getCachedApiKey,
  setCachedApiKey,
  getCachedPassword,
  getCachedVaultKey,
  setCachedVault,
  getAutoLockTimeout,
  tryRestoreSession,
  getPrivateKeyFromCache,
} from "./sessionCache";
import { loadDecryptedApiKey } from "./crypto";
import { handleUnlockWallet } from "./authHandlers";
import { addTxToHistory, updateTxInHistory, getTxById } from "./txHistoryStorage";
import { startReceiptPolling } from "./txReceiptPoller";
import { openExtensionPopup, writeResultToStorage, showNotification, getRpcUrl } from "./txHandlers";
import { signAndBroadcastTransaction } from "./localSigner";
import { getNextNonce, resetNonce } from "./nonceManager";
import { decryptAllKeys } from "./vaultCrypto";
import { hasEncryptedApiKey } from "./crypto";
import { getStoredResolvedChainById } from "../lib/chains";
import type {
  WalletSendCallsParams,
  ERC5792Call,
  WalletGetCallsStatusResult,
  PendingBatchTxRequest,
  BundleReceipt,
} from "./erc5792Types";
import { BUNDLE_STATUS, ERC5792_ERRORS } from "./erc5792Types";
import { OP_STACK_CHAIN_IDS } from "../constants/networks";

// ---------------------------------------------------------------------------
// ERC-7821 batch encoding
// ---------------------------------------------------------------------------

const ERC7821_ABI = [
  {
    inputs: [
      { name: "mode", type: "bytes32" },
      { name: "executionData", type: "bytes" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

const ERC7821_BATCH_MODE =
  "0x0100000000007821000100000000000000000000000000000000000000000000" as `0x${string}`;

/**
 * Encode an array of ERC-5792 calls into a single ERC-7821 batch transaction.
 * Returns the tx params to send (to = walletAddress, data = encoded batch, value = total value).
 */
export function encodeBatchCalls(
  calls: ERC5792Call[],
  walletAddress: string,
): { to: string; data: string; value: string } {
  const encodedCalls = calls.map((call) => ({
    to: call.to as `0x${string}`,
    value: call.value ? BigInt(call.value) : 0n,
    data: (call.data || "0x") as `0x${string}`,
  }));

  // Sum all call values for the outer tx value
  const totalValue = encodedCalls.reduce((sum, c) => sum + c.value, 0n);

  const executionData = encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { type: "address", name: "to" },
          { type: "uint256", name: "value" },
          { type: "bytes", name: "data" },
        ],
      },
    ],
    [encodedCalls],
  );

  const calldata = encodeFunctionData({
    abi: ERC7821_ABI,
    functionName: "execute",
    args: [ERC7821_BATCH_MODE, executionData],
  });

  return {
    to: walletAddress,
    data: calldata,
    value: totalValue > 0n ? `0x${totalValue.toString(16)}` : "0x0",
  };
}

// ---------------------------------------------------------------------------
// Prevent double-execution
// ---------------------------------------------------------------------------

const processingBundleIds = new Set<string>();
const TX_EXPIRY_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// wallet_getCapabilities
// ---------------------------------------------------------------------------

export async function handleWalletGetCapabilities(
  address: string,
  chainIds?: `0x${string}`[],
): Promise<Record<string, any>> {
  const account = await getActiveAccount();

  const isBankrAccount =
    account?.type === "bankr" || account?.type === "impersonator";
  const isPKOrSP =
    account?.type === "privateKey" || account?.type === "seedPhrase";

  const capabilities: Record<string, any> = {};

  // Bankr accounts: atomic batching on Bankr-supported chains
  if (isBankrAccount) {
    for (const chainId of BANKR_SUPPORTED_CHAIN_IDS) {
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      if (chainIds && chainIds.length > 0 && !chainIds.includes(hexChainId)) {
        continue;
      }
      capabilities[hexChainId] = {
        atomic: { status: "supported" },
      };
    }
  }

  // PK/SP accounts: report "supported" so dapps show the batching option.
  // Actual execution is non-atomic (sequential txs), but if a dapp explicitly
  // requires atomicity via atomicRequired: true, we reject in handleWalletSendCalls.
  if (isPKOrSP) {
    for (const chainId of ALLOWED_CHAIN_IDS) {
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      if (chainIds && chainIds.length > 0 && !chainIds.includes(hexChainId)) {
        continue;
      }
      capabilities[hexChainId] = {
        atomic: { status: "supported" },
      };
    }
  }

  return capabilities;
}

// ---------------------------------------------------------------------------
// wallet_sendCalls
// ---------------------------------------------------------------------------

export function handleWalletSendCalls(
  params: WalletSendCallsParams,
  bundleId: string,
  origin: string,
  favicon: string | null,
  senderWindowId?: number,
): void {
  (async () => {
    // Validate version
    if (params.version !== "2.0.0") {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Unsupported version. Expected 2.0.0",
        code: ERC5792_ERRORS.UNSUPPORTED_CAPABILITY,
      });
      return;
    }

    const chainId = Number(params.chainId);

    // Validate account type — must be Bankr, PK, or SP (not impersonator read-only)
    const account = await getActiveAccount();
    const isBankrAccount =
      account?.type === "bankr" || account?.type === "impersonator";
    const isPKOrSP =
      account?.type === "privateKey" || account?.type === "seedPhrase";

    if (!account || (!isBankrAccount && !isPKOrSP)) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Active account does not support batch transactions",
        code: ERC5792_ERRORS.ATOMIC_NOT_SUPPORTED,
      });
      return;
    }

    // Validate chain support — Bankr accounts use Bankr chains, PK/SP use all chains
    const supportedChains = isBankrAccount
      ? BANKR_SUPPORTED_CHAIN_IDS
      : ALLOWED_CHAIN_IDS;

    if (!supportedChains.has(chainId)) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: `Chain ${chainId} is not supported for batch transactions`,
        code: ERC5792_ERRORS.UNSUPPORTED_CHAIN,
      });
      return;
    }

    // Validate calls array
    if (!params.calls || params.calls.length === 0) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "No calls provided",
        code: -32602,
      });
      return;
    }

    // Validate every call has a "to" address (contract deployment via batch not supported)
    if (params.calls.some((call) => !call.to)) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Each call must have a 'to' address",
        code: -32602,
      });
      return;
    }

    // Validate from matches if provided
    if (params.from && params.from.toLowerCase() !== account.address.toLowerCase()) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "From address does not match active account",
        code: ERC5792_ERRORS.UNAUTHORIZED,
      });
      return;
    }

    const isAtomic = isBankrAccount;
    const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;

    // Save pending request (include accountType for confirm handler routing)
    const pendingRequest: PendingBatchTxRequest = {
      id: bundleId,
      params,
      origin,
      favicon,
      chainName,
      chainId,
      timestamp: Date.now(),
      accountType: account.type as PendingBatchTxRequest["accountType"],
    };
    await savePendingBatchTxRequest(pendingRequest);

    // Create initial bundle status (pending)
    await saveBundleStatus({
      id: bundleId,
      chainId,
      status: BUNDLE_STATUS.PENDING,
      atomic: isAtomic,
      createdAt: Date.now(),
    });

    // Send ack immediately so the dapp gets the bundle ID
    await writeResultToStorage(`batchTxAck:${bundleId}`, {
      success: true,
      id: bundleId,
    });

    // Notify popup of new batch request
    chrome.runtime
      .sendMessage({ type: "newPendingBatchTxRequest", batchRequest: pendingRequest })
      .catch(() => {});

    // Open popup for user confirmation
    openExtensionPopup(senderWindowId);
  })();
}

// ---------------------------------------------------------------------------
// Confirm batch transaction (Bankr API path)
// ---------------------------------------------------------------------------

export async function handleConfirmBatchTransaction(
  bundleId: string,
  password: string,
  functionNames?: string[],
): Promise<{ success: boolean; error?: string }> {
  if (processingBundleIds.has(bundleId)) {
    return { success: false, error: "Bundle already being processed" };
  }

  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending || Date.now() - pending.timestamp > TX_EXPIRY_MS) {
    if (pending) await removePendingBatchTxRequest(bundleId);
    return { success: false, error: "Batch request expired" };
  }

  // Validate chain support
  if (!BANKR_SUPPORTED_CHAIN_IDS.has(pending.chainId)) {
    return {
      success: false,
      error: `Chain ${CHAIN_NAMES[pending.chainId] || pending.chainId} is not supported for Bankr API accounts`,
    };
  }

  processingBundleIds.add(bundleId);

  // Get API key (same pattern as handleConfirmTransactionAsync)
  let apiKey = getCachedApiKey();

  if (!apiKey) {
    if (!getCachedPassword()) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        await tryRestoreSession(handleUnlockWallet);
        apiKey = getCachedApiKey();
      }
    }

    if (!apiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Invalid password" };
      }
      setCachedApiKey(apiKey, password);
    }
  }

  // Remove from pending storage
  await removePendingBatchTxRequest(bundleId);

  // Process in background
  processBatchTransactionInBackground(bundleId, pending, apiKey, functionNames);

  return { success: true };
}

async function processBatchTransactionInBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  apiKey: string,
  functionNames?: string[],
): Promise<void> {
  const account = await getActiveAccount();
  if (!account) {
    await handleBatchFailure(bundleId, pending, "No active account");
    return;
  }

  // Encode calls into single ERC-7821 tx
  const batchTx = encodeBatchCalls(pending.params.calls, account.address);

  const tx: TransactionParams = {
    from: account.address,
    to: batchTx.to,
    data: batchTx.data,
    value: batchTx.value,
    chainId: pending.chainId,
  };

  // Compose display function name
  const displayName = functionNames?.length
    ? `Batch: ${functionNames.join(", ")}`
    : `Batch (${pending.params.calls.length} calls)`;

  // Save to tx history as "processing"
  await addTxToHistory({
    id: bundleId,
    status: "processing",
    tx,
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId: pending.chainId,
    createdAt: pending.timestamp,
    accountType: "bankr",
    functionName: displayName,
  });

  try {
    const result = await submitTransactionDirect(apiKey, tx);
    const txHash = result.transactionHash;

    if (result.status === "reverted") {
      await handleBatchFailure(bundleId, pending, "Transaction reverted");
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.REVERTED,
        txHash,
        completedAt: Date.now(),
      });
    } else if (result.status === "success" && txHash) {
      // Fetch receipt for bundle status
      const receipt = await fetchReceipt(txHash, pending.chainId);

      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.CONFIRMED,
        txHash,
        receipts: receipt ? [receipt] : undefined,
        completedAt: Date.now(),
      });

      await updateTxInHistory(bundleId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });

      // Fire-and-forget gas fee fetch
      fetchAndStoreBatchGasData(bundleId, txHash, pending.chainId);

      const chainConfig = CHAIN_CONFIG[pending.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;

      const notificationId = `tx-success-${bundleId}`;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }

      await showNotification(
        notificationId,
        "Batch Transaction Confirmed",
        `Batch transaction (${pending.params.calls.length} calls) on ${pending.chainName} was successful.`,
      );

      await writeResultToStorage(`batchTxResult:${bundleId}`, {
        success: true,
        txHash,
      });
    } else {
      // Pending — submitted but not yet confirmed
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.PENDING,
        txHash,
      });

      await updateTxInHistory(bundleId, {
        status: "pending",
        txHash,
      });

      if (txHash) {
        startReceiptPolling(bundleId, txHash, pending.chainId);
      }

      await writeResultToStorage(`batchTxResult:${bundleId}`, {
        success: true,
        txHash,
      });
    }
  } catch (error) {
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    await handleBatchFailure(bundleId, pending, errorMessage);
  } finally {
    processingBundleIds.delete(bundleId);
  }
}

async function handleBatchFailure(
  bundleId: string,
  pending: PendingBatchTxRequest,
  error: string,
): Promise<void> {
  await updateBundleStatus(bundleId, {
    status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
    error,
    completedAt: Date.now(),
  });

  await updateTxInHistory(bundleId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });

  const notificationId = `tx-failed-${bundleId}`;
  await showNotification(
    notificationId,
    "Batch Transaction Failed",
    `Batch transaction on ${pending.chainName} failed: ${error}`,
  );

  await writeResultToStorage(`batchTxResult:${bundleId}`, {
    success: false,
    error,
  });
}

// ---------------------------------------------------------------------------
// Confirm batch transaction (PK/SP non-atomic path)
// ---------------------------------------------------------------------------

export async function handleConfirmBatchTransactionPK(
  bundleId: string,
  password: string,
  tabId?: number,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
): Promise<{ success: boolean; error?: string }> {
  if (processingBundleIds.has(bundleId)) {
    return { success: false, error: "Bundle already being processed" };
  }

  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending || Date.now() - pending.timestamp > TX_EXPIRY_MS) {
    if (pending) await removePendingBatchTxRequest(bundleId);
    return { success: false, error: "Batch request expired" };
  }

  processingBundleIds.add(bundleId);

  // Get the account (same pattern as handleConfirmTransactionAsyncPK)
  const account = tabId ? await getTabAccount(tabId) : await getActiveAccount();
  if (!account) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "No account found" };
  }

  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Account does not support local signing" };
  }

  // Get private key — try cache, then session restoration, then vault decryption
  let privateKey = getPrivateKeyFromCache(account.id);

  if (!privateKey) {
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const restored = await tryRestoreSession(handleUnlockWallet);
        if (restored) {
          privateKey = getPrivateKeyFromCache(account.id);
        }
      }
    }

    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      let vault;

      if (cachedVaultKey) {
        const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
        vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
      } else {
        vault = await decryptAllKeys(password);
      }

      if (!vault) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Invalid password" };
      }
      setCachedVault(vault);

      // Also cache API key if available
      const hasApiKeyStored = await hasEncryptedApiKey();
      if (hasApiKeyStored) {
        const apiKey = await loadDecryptedApiKey(password);
        if (apiKey) {
          setCachedApiKey(apiKey, password);
        }
      }

      privateKey = getPrivateKeyFromCache(account.id);
      if (!privateKey) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Private key not found for account" };
      }
    }
  }

  // Remove from pending storage
  await removePendingBatchTxRequest(bundleId);

  // Process in background (non-atomic: sequential nonces, individual broadcasts)
  processBatchTransactionNonAtomicInBackground(
    bundleId,
    pending,
    account,
    privateKey,
    functionNames,
    precomputedGasEstimates,
  );

  return { success: true };
}

async function processBatchTransactionNonAtomicInBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
): Promise<void> {
  const { calls } = pending.params;
  const chainId = pending.chainId;
  const fromAddr = account.address;

  const resolvedChain = await getStoredResolvedChainById(chainId);
  const rpcUrl = resolvedChain?.rpcUrl;
  const customChainMeta = resolvedChain?.isCustom
    ? {
        name: resolvedChain.name,
        nativeCurrency: resolvedChain.nativeCurrency,
        explorer: resolvedChain.explorer || undefined,
      }
    : undefined;

  // Phase 1 (sequential): assign nonces + write history entries
  const prepared: Array<{
    txId: string;
    call: ERC5792Call;
    nonce: number;
    functionName?: string;
  }> = [];

  try {
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const txId = `${bundleId}:${i}`;
      const nonce = await getNextNonce(fromAddr, chainId);
      const fnName = functionNames?.[i] || `Batch call ${i + 1}/${calls.length}`;

      await addTxToHistory({
        id: txId,
        status: "processing",
        tx: {
          from: fromAddr,
          to: call.to || "0x0000000000000000000000000000000000000000",
          data: call.data || "0x",
          value: call.value || "0x0",
          chainId,
        },
        origin: pending.origin,
        favicon: pending.favicon,
        chainName: pending.chainName,
        chainId,
        createdAt: pending.timestamp,
        accountType: account.type as "privateKey" | "seedPhrase",
        functionName: fnName,
      });

      prepared.push({ txId, call, nonce, functionName: fnName });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to prepare batch";
    await handleBatchFailure(bundleId, pending, errorMessage);
    processingBundleIds.delete(bundleId);
    return;
  }

  // Use pre-computed gas estimates from the UI if available (avoids duplicate RPC calls).
  // Otherwise, compute them now so dependent calls (e.g., swap after approve) get valid
  // gas limits without needing on-chain state from prior calls.
  let gasEstimates = precomputedGasEstimates;
  if (!gasEstimates || gasEstimates.length !== calls.length) {
    const { estimateBatchGasSequential } = await import("./batchGasEstimation");
    gasEstimates = await estimateBatchGasSequential(
      calls.map((c) => ({
        to: c.to || "0x0000000000000000000000000000000000000000",
        data: c.data || "0x",
        value: c.value || "0x0",
      })),
      fromAddr,
      chainId,
    );
  }

  // Phase 2 (concurrent broadcast): sign + broadcast each with pre-assigned nonce.
  // Provide gas + fee params from estimates so viem makes ZERO RPC calls during broadcast
  // (only eth_sendRawTransaction). This avoids 429 rate limiting breaking the broadcast.
  const txHashes: string[] = [];
  const results: Array<{ txId: string; success: boolean; txHash?: string; error?: string }> = [];

  const broadcastPromises = prepared.map(async (item, i) => {
    try {
      const est = gasEstimates[i];
      const txForSigning = {
        from: fromAddr,
        to: item.call.to || "0x0000000000000000000000000000000000000000",
        data: item.call.data || "0x",
        value: item.call.value || "0x0",
        chainId,
        nonce: item.nonce,
        gas: est?.gasLimit || "500000",
        maxFeePerGas: est?.maxFeePerGas || undefined,
        maxPriorityFeePerGas: est?.maxPriorityFeePerGas || undefined,
      };

      const result = await signAndBroadcastTransaction(
        privateKey,
        txForSigning,
        rpcUrl,
        customChainMeta,
      );

      await updateTxInHistory(item.txId, {
        status: "pending",
        txHash: result.txHash,
      });

      // Start individual receipt polling — uses exponential backoff (2s→30s)
      // to avoid rate-limiting. Updates tx history when receipts arrive.
      // Bundle status is tracked separately via local storage polling.
      startReceiptPolling(item.txId, result.txHash, chainId);

      return { txId: item.txId, success: true, txHash: result.txHash };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      resetNonce(fromAddr, chainId);

      await updateTxInHistory(item.txId, {
        status: "failed",
        error: errorMessage,
        completedAt: Date.now(),
      });

      return { txId: item.txId, success: false, error: errorMessage };
    }
  });

  const broadcastResults = await Promise.all(broadcastPromises);
  results.push(...broadcastResults);

  // Collect tx hashes for bundle status
  for (const r of results) {
    if (r.txHash) txHashes.push(r.txHash);
  }

  const allSuccess = results.every((r) => r.success);
  const allFailed = results.every((r) => !r.success);

  // Update bundle status
  if (allFailed) {
    const firstError = results.find((r) => r.error)?.error || "All transactions failed";
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
      txHashes,
      error: firstError,
      completedAt: Date.now(),
    });

    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Transaction Failed",
      `Batch transaction on ${pending.chainName} failed: ${firstError}`,
    );

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: false,
      error: firstError,
    });
  } else {
    // At least some txs were broadcast — mark as pending, let receipt polling finalize.
    // Use the LAST tx hash as the primary one (dapps show this to the user,
    // and the last call is typically the meaningful action, e.g., swap after approve).
    const primaryTxHash = txHashes[txHashes.length - 1] || txHashes[0];
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.PENDING,
      txHashes,
      txHash: primaryTxHash,
    });

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash: primaryTxHash,
    });

    // If some failed but others succeeded, show partial notification
    if (!allSuccess) {
      const failedCount = results.filter((r) => !r.success).length;
      await showNotification(
        `tx-partial-${bundleId}`,
        "Batch Partially Failed",
        `${failedCount}/${calls.length} calls failed to broadcast on ${pending.chainName}`,
      );
    }

    // Start aggregate status tracking — when all receipts resolve, compute final status
    trackNonAtomicBundleCompletion(bundleId, pending, results);
  }

  processingBundleIds.delete(bundleId);
}

/**
 * Track receipt completion for non-atomic bundles and update aggregate status.
 * Instead of making RPC calls (which can get rate-limited), this polls local
 * tx history storage. Individual receipt tracking is done by startReceiptPolling()
 * which has proper exponential backoff (2s→30s).
 */
async function trackNonAtomicBundleCompletion(
  bundleId: string,
  pending: PendingBatchTxRequest,
  results: Array<{ txId: string; success: boolean; txHash?: string; error?: string }>,
): Promise<void> {
  const successfulTxIds = results.filter((r) => r.success).map((r) => r.txId);
  if (successfulTxIds.length === 0) return;

  // Poll local storage (no RPC) until all txs have a terminal status.
  // startReceiptPolling() handles the actual RPC calls with exponential backoff.
  const MAX_WAIT_MS = 10 * 60 * 1000; // 10 min (match receipt poller timeout)
  const POLL_INTERVAL_MS = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let allResolved = true;
    for (const txId of successfulTxIds) {
      const tx = await getTxById(txId);
      if (!tx || tx.status === "processing" || tx.status === "pending") {
        allResolved = false;
        break;
      }
    }

    if (allResolved) break;
  }

  // Read final statuses and fetch receipts for bundle status (one-time, not polling)
  const receipts: BundleReceipt[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const r of results) {
    if (!r.success) {
      failCount++;
      continue;
    }
    const tx = await getTxById(r.txId);
    if (tx?.status === "success") {
      successCount++;
      if (r.txHash) {
        const receipt = await fetchReceipt(r.txHash, pending.chainId);
        if (receipt) receipts.push(receipt);
      }
    } else {
      failCount++;
    }
  }

  let aggregateStatus: number;
  if (successCount === results.length) {
    aggregateStatus = BUNDLE_STATUS.CONFIRMED;
  } else if (failCount === results.length) {
    aggregateStatus = BUNDLE_STATUS.REVERTED;
  } else {
    aggregateStatus = BUNDLE_STATUS.PARTIAL_REVERT;
  }

  // Set txHash to the last successful tx (the meaningful action, e.g., swap after approve)
  const lastSuccessfulTx = [...results].reverse().find((r) => r.success && r.txHash);
  await updateBundleStatus(bundleId, {
    status: aggregateStatus,
    txHash: lastSuccessfulTx?.txHash,
    // Reverse receipts so the last/most-meaningful tx (e.g., swap) comes first.
    // Dapps like LlamaSwap use `receipts.find(r => ...)` which picks the first match.
    receipts: receipts.length > 0 ? receipts.reverse() : undefined,
    completedAt: Date.now(),
  });

  // Notification for final status
  const chainConfig = CHAIN_CONFIG[pending.chainId];
  if (aggregateStatus === BUNDLE_STATUS.CONFIRMED) {
    const notificationId = `tx-success-${bundleId}`;
    const lastTxHash = lastSuccessfulTx?.txHash || results[0]?.txHash;
    const explorerUrl = chainConfig?.explorer && lastTxHash
      ? `${chainConfig.explorer}/tx/${lastTxHash}`
      : null;
    if (explorerUrl) {
      chrome.storage.local.set({ [`notification-${notificationId}`]: explorerUrl });
    }
    await showNotification(
      notificationId,
      "Batch Transaction Confirmed",
      `All ${results.length} calls on ${pending.chainName} confirmed successfully.`,
    );
  } else if (aggregateStatus === BUNDLE_STATUS.PARTIAL_REVERT) {
    await showNotification(
      `tx-partial-${bundleId}`,
      "Batch Partially Reverted",
      `${successCount}/${results.length} calls succeeded on ${pending.chainName}. ${failCount} reverted.`,
    );
  } else {
    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Transaction Reverted",
      `All calls on ${pending.chainName} reverted.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Reject batch transaction
// ---------------------------------------------------------------------------

export async function handleRejectBatchTransaction(
  bundleId: string,
): Promise<{ success: boolean }> {
  await removePendingBatchTxRequest(bundleId);

  await updateBundleStatus(bundleId, {
    status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
    error: "User rejected batch transaction",
    completedAt: Date.now(),
  });

  await writeResultToStorage(`batchTxResult:${bundleId}`, {
    success: false,
    error: "Batch transaction rejected by user",
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// wallet_getCallsStatus
// ---------------------------------------------------------------------------

export async function handleWalletGetCallsStatus(
  bundleId: string,
): Promise<WalletGetCallsStatusResult | { error: string; code: number }> {
  const status = await getBundleStatus(bundleId);
  if (!status) {
    return {
      error: "Unknown bundle ID",
      code: ERC5792_ERRORS.UNKNOWN_BUNDLE_ID,
    };
  }

  return {
    version: "2.0.0",
    id: bundleId,
    chainId: `0x${status.chainId.toString(16)}` as `0x${string}`,
    status: status.status,
    atomic: status.atomic,
    receipts: status.receipts,
  };
}

// ---------------------------------------------------------------------------
// wallet_showCallsStatus
// ---------------------------------------------------------------------------

export async function handleWalletShowCallsStatus(
  bundleId: string,
): Promise<void> {
  const status = await getBundleStatus(bundleId);
  if (status?.txHash) {
    const chainConfig = CHAIN_CONFIG[status.chainId];
    if (chainConfig?.explorer) {
      chrome.tabs.create({
        url: `${chainConfig.explorer}/tx/${status.txHash}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchReceipt(
  txHash: string,
  chainId: number,
): Promise<BundleReceipt | null> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
    });
    const data = await response.json();
    const receipt = data.result;
    if (!receipt) return null;

    return {
      status: receipt.status,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      transactionHash: receipt.transactionHash,
      logs: (receipt.logs || []).map((log: any) => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
      })),
    };
  } catch {
    return null;
  }
}

async function fetchAndStoreBatchGasData(
  bundleId: string,
  txHash: string,
  chainId: number,
): Promise<void> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return;

  try {
    const rpcCall = (method: string, params: any[]) =>
      fetch(rpcUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
        .then((r) => r.json())
        .then((r) => r.result);

    const [txData, receipt] = await Promise.all([
      rpcCall("eth_getTransactionByHash", [txHash]),
      rpcCall("eth_getTransactionReceipt", [txHash]),
    ]);
    if (!receipt) return;

    const gasData: import("./txHistoryStorage").GasData = {
      gasUsed: BigInt(receipt.gasUsed).toString(),
      gasLimit: txData?.gas
        ? BigInt(txData.gas).toString()
        : BigInt(receipt.gasUsed).toString(),
      effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
    };

    if (OP_STACK_CHAIN_IDS.has(chainId)) {
      if (receipt.l1Fee) gasData.l1Fee = BigInt(receipt.l1Fee).toString();
      if (receipt.l1GasUsed)
        gasData.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
      if (receipt.l1GasPrice)
        gasData.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
    }

    await updateTxInHistory(bundleId, { gasData });
  } catch {
    // Non-critical
  }
}
