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
import { CHAIN_CONFIG } from "../constants/chainConfig";
import { getActiveAccount } from "./accountStorage";
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
  getAutoLockTimeout,
  tryRestoreSession,
} from "./sessionCache";
import { loadDecryptedApiKey } from "./crypto";
import { handleUnlockWallet } from "./authHandlers";
import { addTxToHistory, updateTxInHistory } from "./txHistoryStorage";
import { startReceiptPolling } from "./txReceiptPoller";
import { openExtensionPopup, writeResultToStorage, showNotification, getRpcUrl } from "./txHandlers";
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
    to: (call.to || "0x0000000000000000000000000000000000000000") as `0x${string}`,
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

  // Only Bankr (smart account) types support atomic batching
  const isBankrAccount =
    account?.type === "bankr" || account?.type === "impersonator";

  const capabilities: Record<string, any> = {};

  for (const chainId of BANKR_SUPPORTED_CHAIN_IDS) {
    const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;

    // If chainIds filter is provided, skip chains not in the list
    if (chainIds && chainIds.length > 0 && !chainIds.includes(hexChainId)) {
      continue;
    }

    capabilities[hexChainId] = {
      atomic: {
        status: isBankrAccount ? "supported" : "unsupported",
      },
    };
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

    // Validate chain is Bankr-supported
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
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

    // Validate account type
    const account = await getActiveAccount();
    if (!account || (account.type !== "bankr" && account.type !== "impersonator")) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Active account does not support batch transactions",
        code: ERC5792_ERRORS.ATOMIC_NOT_SUPPORTED,
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

    const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;

    // Save pending request
    const pendingRequest: PendingBatchTxRequest = {
      id: bundleId,
      params,
      origin,
      favicon,
      chainName,
      chainId,
      timestamp: Date.now(),
    };
    await savePendingBatchTxRequest(pendingRequest);

    // Create initial bundle status (pending)
    await saveBundleStatus({
      id: bundleId,
      chainId,
      status: BUNDLE_STATUS.PENDING,
      atomic: true,
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
