/**
 * Transaction and signature request handlers
 * Manages pending transactions, signature requests, and their lifecycle
 */

import { loadDecryptedApiKey, hasEncryptedApiKey } from "./crypto";
import {
  submitTransactionDirect,
  signMessageViaApi,
  TransactionParams,
  BankrApiError,
} from "./bankrApi";
import {
  ALLOWED_CHAIN_IDS,
  BANKR_SUPPORTED_CHAIN_IDS,
  CHAIN_NAMES,
  DEFAULT_NETWORKS,
  OP_STACK_CHAIN_IDS,
} from "../constants/networks";
import { CHAIN_CONFIG } from "../constants/chainConfig";
import type { Account } from "./types";
import {
  getActiveAccount,
  getAccountById,
  getAccounts,
  getTabAccount,
  addPrivateKeyAccount as addPKAccountStorage,
  removeAccount,
  addressExists,
  removeSeedGroup,
  updateSeedGroupCount,
} from "./accountStorage";
import { removeMnemonic } from "./mnemonicStorage";
import {
  addKeyToVault,
  removeKeyFromVault,
  decryptAllKeys,
} from "./vaultCrypto";
import {
  signAndBroadcastTransaction,
  handleSignatureRequest as localSignatureRequest,
  deriveAddress,
} from "./localSigner";
import {
  savePendingTxRequest,
  removePendingTxRequest,
  getPendingTxRequestById,
  PendingTxRequest,
} from "./pendingTxStorage";
import {
  savePendingSignatureRequest,
  removePendingSignatureRequest,
  getPendingSignatureRequestById,
  PendingSignatureRequest,
  SignatureParams,
} from "./pendingSignatureStorage";
import {
  addTxToHistory,
  updateTxInHistory,
  getTxById,
  type SwapMeta,
} from "./txHistoryStorage";
import {
  getCachedApiKey,
  setCachedApiKey,
  getCachedVault,
  setCachedVault,
  getPrivateKeyFromCache,
  getCachedPassword,
  getCachedVaultKey,
  getAutoLockTimeout,
  tryRestoreSession,
} from "./sessionCache";
import { handleUnlockWallet } from "./authHandlers";
import {
  getSidePanelMode,
  setSidePanelMode,
  isSidePanelSupported,
} from "./sidepanelManager";
import { startReceiptPolling } from "./txReceiptPoller";
import {
  getNextNonce,
  resetNonce,
  clearNoncesForAddress,
  clearAllNonces,
} from "./nonceManager";
import { FOURBYTE_SOURCIFY_LOOKUP_URL, FOURBYTE_DIRECTORY_API_URL } from "@/constants/externalUrls";

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface SignatureResult {
  success: boolean;
  signature?: string;
  error?: string;
}

/**
 * Write a result to chrome.storage.local for the content script to pick up.
 * Used instead of in-memory resolver Maps to survive service worker restarts
 * and avoid Chrome MV3 message channel lifetime issues.
 */
export async function writeResultToStorage(
  key: string,
  result: TransactionResult | SignatureResult,
): Promise<void> {
  await chrome.storage.local.set({ [key]: { result, timestamp: Date.now() } });
}

// Active transaction AbortControllers for cancellation
export const activeAbortControllers = new Map<string, AbortController>();

// Prevent double-execution: tracks txIds currently being processed
const processingTxIds = new Set<string>();

// Transaction expiry: reject confirmations for requests older than 30 minutes
const TX_EXPIRY_MS = 30 * 60 * 1000;

// Store failed transaction results for display when opening from notification
export interface FailedTxResult {
  txId: string;
  error: string;
  origin: string;
  chainId: number;
  timestamp: number;
}
export const failedTxResults = new Map<string, FailedTxResult>();

/**
 * Handles incoming transaction requests from content script
 */
export function handleTransactionRequest(
  message: {
    type: string;
    tx: TransactionParams;
    origin: string;
    favicon?: string | null;
  },
  txId: string,
  senderWindowId?: number,
): void {
  const { tx, origin, favicon } = message;

  // Do async storage + popup work in a fire-and-forget block
  (async () => {
    const chainName = CHAIN_NAMES[tx.chainId] || `Chain ${tx.chainId}`;

    const pendingRequest: PendingTxRequest = {
      id: txId,
      tx,
      origin,
      favicon: favicon || null,
      chainName,
      timestamp: Date.now(),
    };

    await savePendingTxRequest(pendingRequest);

    chrome.runtime
      .sendMessage({ type: "newPendingTxRequest", txRequest: pendingRequest })
      .catch(() => {});

    openExtensionPopup(senderWindowId);
  })();
}

/**
 * Handles incoming signature requests from content script
 */
export function handleSignatureRequest(
  message: {
    type: string;
    signature: SignatureParams;
    origin: string;
    favicon?: string | null;
  },
  sigId: string,
  senderWindowId?: number,
): void {
  const { signature, origin, favicon } = message;

  // Note: EIP-712 validation now happens in background.ts before this function is called

  // Do async storage + popup work in a fire-and-forget block
  (async () => {
    const chainName =
      CHAIN_NAMES[signature.chainId] || `Chain ${signature.chainId}`;

    const pendingRequest: PendingSignatureRequest = {
      id: sigId,
      signature,
      origin,
      favicon: favicon || null,
      chainName,
      timestamp: Date.now(),
    };

    await savePendingSignatureRequest(pendingRequest);

    chrome.runtime
      .sendMessage({
        type: "newPendingSignatureRequest",
        sigRequest: pendingRequest,
      })
      .catch(() => {});

    openExtensionPopup(senderWindowId);
  })();
}

/**
 * Opens the extension popup window for transaction confirmation
 * Respects user preference: tries sidePanel.open() first in sidepanel mode,
 * falls back to popup window if sidepanel fails (e.g., Arc browser)
 */
export async function openExtensionPopup(
  senderWindowId?: number,
): Promise<void> {
  const useSidePanel = await getSidePanelMode();

  // If sidepanel mode is enabled, try to open the sidepanel directly
  if (useSidePanel && isSidePanelSupported()) {
    try {
      // Try to ping any open extension views first
      const response = await chrome.runtime
        .sendMessage({ type: "ping" })
        .catch(() => null);
      if (response === "pong") {
        // An extension view is open and responded, don't open popup
        return;
      }
    } catch {
      // No views responded, continue
    }

    // Try sidePanel.open() with the sender's window, then verify it actually opened
    try {
      const windowId =
        senderWindowId ||
        (await chrome.windows.getLastFocused({ populate: false })).id;
      if (windowId) {
        await chrome.sidePanel.open({ windowId });

        // Verify the sidepanel actually opened (Arc resolves but does nothing)
        await new Promise((r) => setTimeout(r, 600));
        let opened = false;
        if (chrome.runtime.getContexts) {
          const contexts = await chrome.runtime.getContexts({
            contextTypes: ["SIDE_PANEL" as chrome.runtime.ContextType],
          });
          opened = contexts.length > 0;
        } else {
          const pong = await chrome.runtime
            .sendMessage({ type: "ping" })
            .catch(() => null);
          opened = pong === "pong";
        }

        if (opened) return;
        // Sidepanel didn't actually open — fall through to popup window
        // Don't disable sidepanel mode: this is a transient failure, not a
        // permanent browser incompatibility. The user's preference should persist.
      }
    } catch (error) {
      console.warn(
        "Sidepanel failed to open for tx confirmation, falling back to popup:",
        error,
      );
      // Don't disable sidepanel mode — fall through to popup for this request only
    }
  }

  // Popup window fallback (also used when sidepanel is disabled)
  const existingWindows = await chrome.windows.getAll({
    windowTypes: ["popup"],
  });
  const popupUrl = chrome.runtime.getURL("index.html");

  for (const win of existingWindows) {
    if (win.id) {
      const tabs = await chrome.tabs.query({ windowId: win.id });
      if (tabs.some((tab) => tab.url?.startsWith(popupUrl))) {
        // Focus existing popup window
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    }
  }

  // Get the window where the dapp is running
  let targetWindow: chrome.windows.Window | null = null;

  // Method 1: Use sender's window ID (most accurate)
  if (senderWindowId) {
    try {
      targetWindow = await chrome.windows.get(senderWindowId, {
        populate: false,
      });
    } catch {
      targetWindow = null;
    }
  }

  // Method 2: Fall back to last focused window
  if (!targetWindow || targetWindow.left === undefined) {
    try {
      targetWindow = await chrome.windows.getLastFocused({ populate: false });
    } catch {
      targetWindow = null;
    }
  }

  const popupWidth = 360;
  const popupHeight = 680;

  let left: number | undefined;
  let top: number | undefined;

  if (
    targetWindow &&
    targetWindow.left !== undefined &&
    targetWindow.width !== undefined &&
    targetWindow.top !== undefined
  ) {
    left = targetWindow.left + targetWindow.width - popupWidth - 10;
    top = targetWindow.top + 80;
  }

  const createOptions: chrome.windows.CreateData = {
    url: popupUrl,
    type: "popup",
    width: popupWidth,
    height: popupHeight,
    focused: true,
  };

  if (left !== undefined && top !== undefined) {
    createOptions.left = left;
    createOptions.top = top;
  }

  await chrome.windows.create(createOptions);
}

/**
 * Opens a popup window (used when switching from sidepanel to popup mode)
 */
export async function openPopupWindow(): Promise<void> {
  const popupUrl = chrome.runtime.getURL("index.html");

  // Check if popup window already exists
  const existingWindows = await chrome.windows.getAll({
    windowTypes: ["popup"],
  });
  for (const win of existingWindows) {
    if (win.id) {
      const tabs = await chrome.tabs.query({ windowId: win.id });
      if (tabs.some((tab) => tab.url?.startsWith(popupUrl))) {
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    }
  }

  // Get last focused window for positioning
  let targetWindow: chrome.windows.Window | null = null;
  try {
    targetWindow = await chrome.windows.getLastFocused({ populate: false });
  } catch {
    targetWindow = null;
  }

  const popupWidth = 360;
  const popupHeight = 680;

  let left: number | undefined;
  let top: number | undefined;

  if (
    targetWindow &&
    targetWindow.left !== undefined &&
    targetWindow.width !== undefined &&
    targetWindow.top !== undefined
  ) {
    left = targetWindow.left + targetWindow.width - popupWidth - 10;
    top = targetWindow.top + 80;
  }

  const createOptions: chrome.windows.CreateData = {
    url: popupUrl,
    type: "popup",
    width: popupWidth,
    height: popupHeight,
    focused: true,
  };

  if (left !== undefined && top !== undefined) {
    createOptions.left = left;
    createOptions.top = top;
  }

  await chrome.windows.create(createOptions);
}

/**
 * Handles confirmation from the popup
 */
export async function handleConfirmTransaction(
  txId: string,
  password: string,
): Promise<TransactionResult> {
  const pending = await getPendingTxRequestById(txId);
  if (!pending || Date.now() - pending.timestamp > TX_EXPIRY_MS) {
    if (pending) await removePendingTxRequest(txId);
    return { success: false, error: "Transaction request expired" };
  }

  // Try to use cached API key first
  let apiKey = getCachedApiKey();

  if (!apiKey) {
    // Try session restoration if cache is empty and auto-lock is "Never"
    if (!getCachedPassword()) {
      const { getAutoLockTimeout } = await import("./sessionCache");
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const { tryRestoreSession } = await import("./sessionCache");
        const { handleUnlockWallet } = await import("./authHandlers");
        await tryRestoreSession(handleUnlockWallet);
        // Check if API key was restored
        apiKey = getCachedApiKey();
      }
    }

    // If still no cached API key, try to decrypt with provided password
    if (!apiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        return { success: false, error: "Invalid password" };
      }
      // Cache the API key and password for future transactions
      setCachedApiKey(apiKey, password);
    }
  }

  // Create AbortController for this transaction
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);

  try {
    const result = await submitTransactionDirect(
      apiKey,
      pending.tx,
      abortController.signal,
    );

    if (result.status === "reverted") {
      return { success: false, error: "Transaction reverted" };
    }

    return { success: true, txHash: result.transactionHash };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Transaction cancelled by user" };
    }
    if (error instanceof BankrApiError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    activeAbortControllers.delete(txId);
  }
}

/**
 * Handles rejection from the popup
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handleRejectTransaction(_txId: string): TransactionResult {
  return { success: false, error: "Transaction rejected by user" };
}

/**
 * Handles cancellation of an in-progress transaction
 */
export async function handleCancelTransaction(
  txId: string,
): Promise<{ success: boolean; error?: string }> {
  const abortController = activeAbortControllers.get(txId);

  if (!abortController) {
    return { success: false, error: "No active transaction to cancel" };
  }

  abortController.abort();
  activeAbortControllers.delete(txId);

  return { success: true };
}

/**
 * Shows a browser notification
 */
export async function showNotification(
  notificationId: string,
  title: string,
  message: string,
): Promise<string> {
  return new Promise((resolve) => {
    chrome.notifications.create(
      notificationId,
      {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title,
        message,
        priority: 2,
      },
      (createdId) => {
        if (chrome.runtime.lastError) {
          console.error("Notification error:", chrome.runtime.lastError);
        }
        resolve(createdId || notificationId);
      },
    );
  });
}

/**
 * Lightweight 4-byte selector lookup for function names.
 * Used as fallback when the UI didn't provide a decoded function name.
 */
async function lookupFunctionName(calldata: string): Promise<string | null> {
  if (!calldata || calldata.length < 10) return null;
  const selector = calldata.slice(0, 10);

  // Try Sourcify first
  try {
    const url = new URL(FOURBYTE_SOURCIFY_LOOKUP_URL);
    url.searchParams.append("function", selector);
    const res = await fetch(url);
    const data = await res.json();
    if (data?.ok && data.result?.function?.[selector]?.[0]?.name) {
      const sig = data.result.function[selector][0].name;
      return sig.split("(")[0];
    }
  } catch {
    /* ignore */
  }

  // Fallback to 4byte.directory
  try {
    const url = new URL(FOURBYTE_DIRECTORY_API_URL);
    url.searchParams.append("hex_signature", selector);
    const res = await fetch(url);
    const data = await res.json();
    if (data?.count > 0 && data.results?.[0]?.text_signature) {
      // Extract just the function name from "functionName(uint256,address,...)"
      const sig = data.results[0].text_signature;
      return sig.split("(")[0];
    }
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Resolve RPC URL for a chain ID.
 * Checks user-configured networks first, falls back to defaults.
 */
export async function getRpcUrl(chainId: number): Promise<string | undefined> {
  const { networksInfo } = await chrome.storage.sync.get("networksInfo");
  if (networksInfo) {
    for (const name of Object.keys(networksInfo)) {
      if (networksInfo[name].chainId === chainId) {
        return networksInfo[name].rpcUrl;
      }
    }
  }
  // Fallback to defaults
  for (const net of Object.values(DEFAULT_NETWORKS)) {
    if (net.chainId === chainId) return net.rpcUrl;
  }
  return undefined;
}

/**
 * Fetch gas data from the transaction and receipt, then update tx history.
 * Fetches both eth_getTransactionByHash (for gasLimit) and eth_getTransactionReceipt
 * (for gasUsed, effectiveGasPrice, and L1 fee data on OP Stack).
 */
async function fetchAndStoreGasData(
  txId: string,
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

    // OP Stack L2s include L1 fee fields in the receipt
    if (OP_STACK_CHAIN_IDS.has(chainId)) {
      if (receipt.l1Fee) gasData.l1Fee = BigInt(receipt.l1Fee).toString();
      if (receipt.l1GasUsed)
        gasData.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
      if (receipt.l1GasPrice)
        gasData.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
    }

    await updateTxInHistory(txId, { gasData });
  } catch {
    // Non-critical — silently ignore
  }
}

/**
 * Handles async confirmation - returns immediately and polls in background
 */
export async function handleConfirmTransactionAsync(
  txId: string,
  password: string,
  functionName?: string,
): Promise<{ success: boolean; error?: string }> {
  // Prevent double-execution
  if (processingTxIds.has(txId)) {
    return { success: false, error: "Transaction already being processed" };
  }

  const pending = await getPendingTxRequestById(txId);
  if (!pending || Date.now() - pending.timestamp > TX_EXPIRY_MS) {
    if (pending) await removePendingTxRequest(txId);
    return { success: false, error: "Transaction request expired" };
  }

  // Validate chain is supported for Bankr API accounts
  if (!BANKR_SUPPORTED_CHAIN_IDS.has(pending.tx.chainId)) {
    return {
      success: false,
      error: `Chain ${CHAIN_NAMES[pending.tx.chainId] || pending.tx.chainId} is not supported for Bankr API accounts`,
    };
  }

  processingTxIds.add(txId);

  // Try to use cached API key first
  let apiKey = getCachedApiKey();

  if (!apiKey) {
    // Try session restoration if cache is empty and auto-lock is "Never"
    if (!getCachedPassword()) {
      const { getAutoLockTimeout } = await import("./sessionCache");
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const { tryRestoreSession } = await import("./sessionCache");
        const { handleUnlockWallet } = await import("./authHandlers");
        await tryRestoreSession(handleUnlockWallet);
        // Check if API key was restored
        apiKey = getCachedApiKey();
      }
    }

    // If still no cached API key, try to decrypt with provided password
    if (!apiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        processingTxIds.delete(txId);
        return { success: false, error: "Invalid password" };
      }
      // Cache the API key and password for future transactions
      setCachedApiKey(apiKey, password);
    }
  }

  // Remove from pending storage immediately
  await removePendingTxRequest(txId);

  // Start background processing (cleanup of processingTxIds happens in finally block)
  processTransactionInBackground(txId, pending, apiKey, functionName);

  return { success: true };
}

/**
 * Processes transaction in background and shows notification on completion
 */
async function processTransactionInBackground(
  txId: string,
  pending: PendingTxRequest,
  apiKey: string,
  functionName?: string,
): Promise<void> {
  // Create AbortController for this transaction
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);

  // Save to history as "processing" immediately
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
    functionName,
  });

  // If no function name provided by UI, try background lookup
  if (!functionName && pending.tx.data && pending.tx.data !== "0x") {
    lookupFunctionName(pending.tx.data).then((name) => {
      if (name) updateTxInHistory(txId, { functionName: name });
    });
  }

  try {
    const result = await submitTransactionDirect(
      apiKey,
      pending.tx,
      abortController.signal,
    );
    const txHash = result.transactionHash;

    if (result.status === "reverted") {
      await handleTransactionFailure(
        txId,
        pending,
        "Transaction reverted",
      );
    } else if (result.status === "success" && txHash) {
      // API confirmed on-chain (waitForConfirmation: true) — mark success
      await updateTxInHistory(txId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });

      // Fire-and-forget gas fee fetch
      fetchAndStoreGasData(txId, txHash, pending.tx.chainId);

      const notificationId = `tx-success-${txId}`;
      const chainConfig = CHAIN_CONFIG[pending.tx.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;

      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }

      await showNotification(
        notificationId,
        "Transaction Confirmed",
        `Transaction on ${pending.chainName} was successful. Click to view.`,
      );

      await writeResultToStorage(`txResult:${txId}`, { success: true, txHash });
    } else {
      // API returned "pending" — tx submitted but not yet confirmed
      await updateTxInHistory(txId, {
        status: "pending",
        txHash,
      });

      // Start polling for on-chain confirmation
      if (txHash) {
        startReceiptPolling(txId, txHash, pending.tx.chainId);
      }

      await writeResultToStorage(`txResult:${txId}`, { success: true, txHash });
    }
  } catch (error) {
    let errorMessage = "Unknown error";

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "Transaction cancelled by user";
      } else {
        errorMessage = error.message;
      }
    }

    await handleTransactionFailure(txId, pending, errorMessage);
  } finally {
    activeAbortControllers.delete(txId);
    processingTxIds.delete(txId);
  }
}

/**
 * Handles transaction failure - shows notification and stores error for display
 */
async function handleTransactionFailure(
  txId: string,
  pending: PendingTxRequest,
  error: string,
): Promise<void> {
  const notificationId = `tx-failed-${txId}`;

  // Update history to "failed"
  await updateTxInHistory(txId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });

  // Store failed result for display when opening from notification
  failedTxResults.set(notificationId, {
    txId,
    error,
    origin: pending.origin,
    chainId: pending.tx.chainId,
    timestamp: Date.now(),
  });

  // Store notification ID for click handler
  chrome.storage.local.set({
    [`notification-${notificationId}`]: { type: "error", txId: notificationId },
  });

  await showNotification(
    notificationId,
    "Transaction Failed",
    error.length > 100 ? error.substring(0, 100) + "..." : error,
  );

  await writeResultToStorage(`txResult:${txId}`, { success: false, error });
}

/** Gas overrides from user-edited gas params */
export interface GasOverrides {
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

/**
 * Processes a local (PK) transaction in background
 */
async function processLocalTransactionInBackground(
  txId: string,
  pending: PendingTxRequest,
  account: Account,
  privateKey: `0x${string}`,
  functionName?: string,
  gasOverrides?: GasOverrides,
): Promise<void> {
  // Create AbortController for this transaction
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);

  // Save to history as "processing" immediately
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
    functionName,
  });

  // If no function name provided by UI, try background lookup
  if (!functionName && pending.tx.data && pending.tx.data !== "0x") {
    lookupFunctionName(pending.tx.data).then((name) => {
      if (name) updateTxInHistory(txId, { functionName: name });
    });
  }

  try {
    // Get RPC URL for the chain
    const { networksInfo } = await chrome.storage.sync.get("networksInfo");
    let rpcUrl: string | undefined;
    if (networksInfo) {
      for (const chainName of Object.keys(networksInfo)) {
        if (networksInfo[chainName].chainId === pending.tx.chainId) {
          rpcUrl = networksInfo[chainName].rpcUrl;
          break;
        }
      }
    }

    // Get managed nonce to prevent conflicts with rapid txs
    const nonce = await getNextNonce(pending.tx.from, pending.tx.chainId);

    // Merge gas overrides if provided
    // When overrides are set, remove legacy gasPrice to avoid conflict with EIP-1559 params
    const txForSigning = gasOverrides
      ? {
          ...pending.tx,
          nonce,
          gas: gasOverrides.gasLimit,
          maxFeePerGas: gasOverrides.maxFeePerGas,
          maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
          gasPrice: undefined,
        }
      : { ...pending.tx, nonce };

    // Sign and broadcast the transaction
    const result = await signAndBroadcastTransaction(
      privateKey,
      txForSigning,
      rpcUrl,
    );
    const txHash = result.txHash;

    // Tx is broadcast but not yet confirmed — mark as pending
    await updateTxInHistory(txId, {
      status: "pending",
      txHash,
    });

    // Start polling for on-chain confirmation
    if (txHash) {
      startReceiptPolling(txId, txHash, pending.tx.chainId);
    }

    await writeResultToStorage(`txResult:${txId}`, { success: true, txHash });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Reset nonce cache on failure so next tx re-fetches from RPC
    resetNonce(pending.tx.from, pending.tx.chainId);

    await handleTransactionFailure(txId, pending, errorMessage);
  } finally {
    activeAbortControllers.delete(txId);
    processingTxIds.delete(txId);
  }
}

/**
 * Handles async confirmation for PK accounts - signs locally
 */
export async function handleConfirmTransactionAsyncPK(
  txId: string,
  password: string,
  tabId?: number,
  functionName?: string,
  gasOverrides?: GasOverrides,
): Promise<{ success: boolean; error?: string }> {
  // Prevent double-execution
  if (processingTxIds.has(txId)) {
    return { success: false, error: "Transaction already being processed" };
  }

  const pending = await getPendingTxRequestById(txId);
  if (!pending || Date.now() - pending.timestamp > TX_EXPIRY_MS) {
    if (pending) await removePendingTxRequest(txId);
    return { success: false, error: "Transaction request expired" };
  }

  processingTxIds.add(txId);

  // Get the account for this tab
  const account = tabId ? await getTabAccount(tabId) : await getActiveAccount();
  if (!account) {
    processingTxIds.delete(txId);
    return { success: false, error: "No account found" };
  }

  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    processingTxIds.delete(txId);
    return { success: false, error: "Account does not support local signing" };
  }

  // Try to get private key from cache first
  let privateKey = getPrivateKeyFromCache(account.id);

  if (!privateKey) {
    // Try session restoration if vault key isn't cached and auto-lock is "Never"
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const { handleUnlockWallet } = await import("./authHandlers");
        const restored = await tryRestoreSession(handleUnlockWallet);
        if (restored) {
          // Vault should be cached now
          privateKey = getPrivateKeyFromCache(account.id);
        }
      }
    }

    // If still no private key, need to decrypt vault
    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      let vault;

      if (cachedVaultKey) {
        // Use vault-key decryption (supports both migrated and legacy entries)
        const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
        vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
      } else {
        // Fall back to password decryption (legacy format only)
        vault = await decryptAllKeys(password);
      }

      if (!vault) {
        processingTxIds.delete(txId);
        return { success: false, error: "Invalid password" };
      }
      setCachedVault(vault);

      // Also cache API key and password if we have encrypted API key
      const hasApiKey = await hasEncryptedApiKey();
      if (hasApiKey) {
        const apiKey = await loadDecryptedApiKey(password);
        if (apiKey) {
          setCachedApiKey(apiKey, password);
        }
      }

      // Get the private key from the now-cached vault
      privateKey = getPrivateKeyFromCache(account.id);
      if (!privateKey) {
        processingTxIds.delete(txId);
        return { success: false, error: "Private key not found for account" };
      }
    }
  }

  // Remove from pending storage immediately
  await removePendingTxRequest(txId);

  // Start background processing (cleanup of processingTxIds happens in finally block)
  processLocalTransactionInBackground(
    txId,
    pending,
    account,
    privateKey,
    functionName,
    gasOverrides,
  );

  return { success: true };
}

/**
 * Handles signature confirmation for PK accounts
 */
export async function handleConfirmSignatureRequest(
  sigId: string,
  password: string,
  tabId?: number,
): Promise<SignatureResult> {
  const pending = await getPendingSignatureRequestById(sigId);
  if (!pending) {
    return { success: false, error: "Signature request not found or expired" };
  }

  // Get the account for this tab
  const account = tabId ? await getTabAccount(tabId) : await getActiveAccount();
  if (!account) {
    return { success: false, error: "No account found" };
  }

  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return {
      success: false,
      error:
        "Signatures are only supported for Private Key and Seed Phrase accounts",
    };
  }

  // Try to get private key from cache first
  let privateKey = getPrivateKeyFromCache(account.id);

  if (!privateKey) {
    // Try session restoration if vault key isn't cached and auto-lock is "Never"
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const { handleUnlockWallet } = await import("./authHandlers");
        const restored = await tryRestoreSession(handleUnlockWallet);
        if (restored) {
          // Vault should be cached now
          privateKey = getPrivateKeyFromCache(account.id);
        }
      }
    }

    // If still no private key, need to decrypt vault
    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      let vault;

      if (cachedVaultKey) {
        // Use vault-key decryption (supports both migrated and legacy entries)
        const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
        vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
      } else {
        // Fall back to password decryption (legacy format only)
        vault = await decryptAllKeys(password);
      }

      if (!vault) {
        return { success: false, error: "Invalid password" };
      }
      setCachedVault(vault);

      // Also cache API key and password if we have encrypted API key
      const hasApiKey = await hasEncryptedApiKey();
      if (hasApiKey) {
        const apiKey = await loadDecryptedApiKey(password);
        if (apiKey) {
          setCachedApiKey(apiKey, password);
        }
      }

      // Get the private key from the now-cached vault
      privateKey = getPrivateKeyFromCache(account.id);
      if (!privateKey) {
        return { success: false, error: "Private key not found for account" };
      }
    }
  }

  try {
    // Sign the message
    const signature = await localSignatureRequest(
      privateKey,
      pending.signature.method,
      pending.signature.params,
      pending.signature.chainId,
    );

    // Remove from pending storage
    await removePendingSignatureRequest(sigId);

    return { success: true, signature };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Signing failed",
    };
  }
}

/**
 * Handles signature confirmation for Bankr accounts via /agent/sign API
 */
export async function handleConfirmSignatureRequestBankr(
  sigId: string,
  password: string,
): Promise<SignatureResult> {
  const pending = await getPendingSignatureRequestById(sigId);
  if (!pending) {
    return { success: false, error: "Signature request not found or expired" };
  }

  // Try to use cached API key first
  let apiKey = getCachedApiKey();

  if (!apiKey) {
    // Try session restoration if cache is empty and auto-lock is "Never"
    if (!getCachedPassword()) {
      const { getAutoLockTimeout } = await import("./sessionCache");
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const { tryRestoreSession } = await import("./sessionCache");
        const { handleUnlockWallet } = await import("./authHandlers");
        await tryRestoreSession(handleUnlockWallet);
        // Check if API key was restored
        apiKey = getCachedApiKey();
      }
    }

    // If still no cached API key, try to decrypt with provided password
    if (!apiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        return { success: false, error: "Invalid password" };
      }
      setCachedApiKey(apiKey, password);
    }
  }

  try {
    const result = await signMessageViaApi(
      apiKey,
      pending.signature.method,
      pending.signature.params,
    );

    // Remove from pending storage
    await removePendingSignatureRequest(sigId);

    return { success: true, signature: result.signature };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Signing failed",
    };
  }
}

/**
 * Adds a new private key account
 */
export async function handleAddPrivateKeyAccount(
  privateKey: `0x${string}`,
  password: string,
  displayName?: string,
): Promise<{ success: boolean; account?: Account; error?: string }> {
  try {
    // Derive address from private key
    const address = deriveAddress(privateKey);

    // Check if address already exists
    if (await addressExists(address)) {
      return {
        success: false,
        error: "An account with this address already exists",
      };
    }

    // Add the account metadata
    const account = await addPKAccountStorage(address, displayName);

    // Add the private key to the vault
    await addKeyToVault(account.id, privateKey, password);

    // Update the cached vault if it exists
    const cachedVaultEntries = getCachedVault();
    if (cachedVaultEntries) {
      cachedVaultEntries.push({ id: account.id, privateKey });
      setCachedVault(cachedVaultEntries);
    }

    // Notify UI of account update
    chrome.runtime.sendMessage({ type: "accountsUpdated" }).catch(() => {});

    return { success: true, account };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add account",
    };
  }
}

/**
 * Removes an account (and its private key if PK account)
 */
export async function handleRemoveAccount(
  accountId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const account = await getAccountById(accountId);
    if (!account) {
      return { success: false, error: "Account not found" };
    }

    // Prevent removing the last account
    const allAccounts = await getAccounts();
    if (allAccounts.length <= 1) {
      return { success: false, error: "Cannot remove the last account" };
    }

    // If it's a PK or seed phrase account, remove from vault and clear nonces
    if (account.type === "privateKey" || account.type === "seedPhrase") {
      clearNoncesForAddress(account.address);
      await removeKeyFromVault(accountId);

      // Update the cached vault if it exists
      const cachedVaultEntries = getCachedVault();
      if (cachedVaultEntries) {
        const filtered = cachedVaultEntries.filter((e) => e.id !== accountId);
        setCachedVault(filtered);
      }
    }

    // For seed phrase accounts: clean up group if this is the last account
    if (account.type === "seedPhrase") {
      const seedGroupId = (account as any).seedGroupId;
      const allAccounts = await getAccounts();
      const remaining = allAccounts.filter(
        (a) =>
          a.type === "seedPhrase" &&
          (a as any).seedGroupId === seedGroupId &&
          a.id !== accountId,
      );
      if (remaining.length === 0) {
        // Last account in this group - remove mnemonic and group
        await removeMnemonic(seedGroupId);
        await removeSeedGroup(seedGroupId);
      } else {
        await updateSeedGroupCount(seedGroupId, remaining.length);
      }
    }

    // Remove the account metadata
    await removeAccount(accountId);

    // Notify UI of account update
    chrome.runtime.sendMessage({ type: "accountsUpdated" }).catch(() => {});

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to remove account",
    };
  }
}

/**
 * Performs a full security reset - clears ALL sensitive data from memory
 * This should be called when resetting the extension
 */
export async function performSecurityReset(): Promise<void> {
  // Abort all active transactions
  for (const [, abortController] of activeAbortControllers.entries()) {
    try {
      abortController.abort();
    } catch {
      // Ignore abort errors
    }
  }
  activeAbortControllers.clear();

  // Write reset errors to storage for any pending requests
  const allKeys = await chrome.storage.local.get(null);
  const pendingResultKeys = Object.keys(allKeys).filter(
    (k) => k.startsWith("txResult:") || k.startsWith("sigResult:"),
  );
  if (pendingResultKeys.length > 0) {
    await chrome.storage.local.remove(pendingResultKeys);
  }

  // Clear failed transaction results
  failedTxResults.clear();

  // Clear processing locks
  processingTxIds.clear();

  // Clear nonce cache
  clearAllNonces();
}

/**
 * Handles transfer initiated from within the extension UI (not from a dapp).
 * Creates a PendingTxRequest and notifies the UI to show TransactionConfirmation.
 */
export async function handleInitiateTransfer(message: {
  tx: TransactionParams;
  chainName: string;
  tokenName?: string;
  tokenLogo?: string | null;
}): Promise<{ success: boolean; txId?: string; error?: string }> {
  const { tx, chainName, tokenName, tokenLogo } = message;

  // Validate chain ID
  if (!ALLOWED_CHAIN_IDS.has(tx.chainId)) {
    return {
      success: false,
      error: `Chain ${tx.chainId} not supported`,
    };
  }

  const txId = crypto.randomUUID();

  const pendingRequest: PendingTxRequest = {
    id: txId,
    tx,
    origin: tokenName ? `Send ${tokenName}` : "WalletChan",
    favicon: tokenLogo ?? null,
    chainName,
    timestamp: Date.now(),
  };

  await savePendingTxRequest(pendingRequest);

  // Notify extension UI about the new pending tx
  chrome.runtime
    .sendMessage({ type: "newPendingTxRequest", txRequest: pendingRequest })
    .catch(() => {});

  return { success: true, txId };
}

// ---------------------------------------------------------------------------
// Direct Swap Execution (bypasses confirmation screen)
// ---------------------------------------------------------------------------

export interface SwapTxEntry {
  tx: TransactionParams;
  origin: string;
  favicon: string | null;
  functionName?: string;
  swapMeta?: SwapMeta;
}

/**
 * Directly signs and broadcasts swap transactions (approval + swap) without
 * going through the TransactionConfirmation screen. Handles all wallet types.
 * Uses the nonce manager so approval + swap get sequential nonces.
 */
export async function handleExecuteSwapDirect(
  transactions: SwapTxEntry[],
  chainName: string,
): Promise<{ success: boolean; txIds?: string[]; error?: string }> {
  if (transactions.length === 0) {
    return { success: false, error: "No transactions provided" };
  }

  const chainId = transactions[0].tx.chainId;

  // Validate chain
  if (!ALLOWED_CHAIN_IDS.has(chainId)) {
    return { success: false, error: `Chain ${chainId} not supported` };
  }

  // Resolve account
  const account = await getActiveAccount();
  if (!account) {
    return { success: false, error: "No account found" };
  }

  // --- Bankr API accounts ---
  if (account.type === "impersonator" || account.type === "bankr") {
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
      return { success: false, error: `Chain not supported for Bankr API accounts` };
    }

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
        return { success: false, error: "Wallet must be unlocked" };
      }
    }

    const txIds: string[] = [];
    for (const entry of transactions) {
      const txId = crypto.randomUUID();
      txIds.push(txId);
      const pending: PendingTxRequest = {
        id: txId,
        tx: entry.tx,
        origin: entry.origin,
        favicon: entry.favicon,
        chainName,
        timestamp: Date.now(),
      };
      // Await each TX so approval is broadcast before swap starts
      await processSwapTxBankr(txId, pending, apiKey, entry.functionName, entry.swapMeta);
    }
    return { success: true, txIds };
  }

  // --- PK / Seed Phrase accounts ---
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return { success: false, error: "Unsupported account type" };
  }

  let privateKey = getPrivateKeyFromCache(account.id);

  if (!privateKey) {
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const restored = await tryRestoreSession(handleUnlockWallet);
        if (restored) privateKey = getPrivateKeyFromCache(account.id);
      }
    }
    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      if (cachedVaultKey) {
        const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
        const vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
        if (vault) setCachedVault(vault);
      }
      privateKey = getPrivateKeyFromCache(account.id);
    }
    if (!privateKey) {
      return { success: false, error: "Wallet must be unlocked" };
    }
  }

  // Resolve RPC URL once
  const { networksInfo } = await chrome.storage.sync.get("networksInfo");
  let rpcUrl: string | undefined;
  if (networksInfo) {
    for (const name of Object.keys(networksInfo)) {
      if (networksInfo[name].chainId === chainId) {
        rpcUrl = networksInfo[name].rpcUrl;
        break;
      }
    }
  }

  // Phase 1 (sequential): assign nonces + write history entries
  // This avoids the addTxToHistory race condition and ensures correct nonces.
  const prepared: Array<{
    txId: string;
    pending: PendingTxRequest;
    nonce: number;
    functionName?: string;
    swapMeta?: SwapMeta;
  }> = [];

  const txIds: string[] = [];
  const fromAddr = transactions[0].tx.from;

  for (const entry of transactions) {
    const txId = crypto.randomUUID();
    txIds.push(txId);

    const nonce = await getNextNonce(fromAddr, chainId);

    const pending: PendingTxRequest = {
      id: txId,
      tx: entry.tx,
      origin: entry.origin,
      favicon: entry.favicon,
      chainName,
      timestamp: Date.now(),
    };

    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: entry.tx,
      origin: entry.origin,
      favicon: entry.favicon,
      chainName,
      chainId,
      createdAt: pending.timestamp,
      accountType: account.type as "privateKey" | "seedPhrase",
      functionName: entry.functionName,
      swapMeta: entry.swapMeta,
    });

    prepared.push({ txId, pending, nonce, functionName: entry.functionName, swapMeta: entry.swapMeta });
  }

  // Phase 2 (concurrent): broadcast all TXs with pre-assigned nonces
  for (const item of prepared) {
    broadcastSwapTxLocal(
      item.txId, item.pending, account, privateKey, item.nonce, rpcUrl,
    );
  }

  return { success: true, txIds };
}

/** Fire-and-forget: sign+broadcast a single swap tx via Bankr API */
async function processSwapTxBankr(
  txId: string,
  pending: PendingTxRequest,
  apiKey: string,
  functionName?: string,
  swapMeta?: SwapMeta,
): Promise<void> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);

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
    functionName,
    swapMeta,
  });

  try {
    const result = await submitTransactionDirect(
      apiKey,
      pending.tx,
      abortController.signal,
    );
    const txHash = result.transactionHash;

    if (result.status === "reverted") {
      // Save txHash before marking as failed so explorer link works
      if (txHash) await updateTxInHistory(txId, { txHash });
      await handleTransactionFailure(txId, pending, "Transaction reverted on-chain");
    } else if (result.status === "success" && txHash) {
      await updateTxInHistory(txId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });
      fetchAndStoreGasData(txId, txHash, pending.tx.chainId);

      const notificationId = `tx-success-${txId}`;
      const chainConfig = CHAIN_CONFIG[pending.tx.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }
    } else {
      await updateTxInHistory(txId, { status: "pending", txHash });
      if (txHash) startReceiptPolling(txId, txHash, pending.tx.chainId);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    resetNonce(pending.tx.from, pending.tx.chainId);
    await handleTransactionFailure(txId, pending, errorMessage);
  } finally {
    activeAbortControllers.delete(txId);
  }
}

/**
 * Fire-and-forget: sign+broadcast a swap tx with a pre-assigned nonce.
 * History entry must already exist (created in the preparation phase).
 */
async function broadcastSwapTxLocal(
  txId: string,
  pending: PendingTxRequest,
  account: Account,
  privateKey: `0x${string}`,
  nonce: number,
  rpcUrl?: string,
): Promise<void> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);

  try {
    const txForSigning = { ...pending.tx, nonce };

    const result = await signAndBroadcastTransaction(
      privateKey,
      txForSigning,
      rpcUrl,
    );
    const txHash = result.txHash;

    await updateTxInHistory(txId, { status: "pending", txHash });
    if (txHash) startReceiptPolling(txId, txHash, pending.tx.chainId);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    resetNonce(pending.tx.from, pending.tx.chainId);
    await handleTransactionFailure(txId, pending, errorMessage);
  } finally {
    activeAbortControllers.delete(txId);
  }
}

// ---------------------------------------------------------------------------
// Batched Swap Execution (Bankr accounts: approve+swap as single ERC-7821 tx)
// ---------------------------------------------------------------------------

/**
 * Submits a batched swap transaction (approval + swap encoded as single ERC-7821
 * batch) via the Bankr API. Only for Bankr/impersonator accounts.
 */
export async function handleExecuteSwapBatch(
  batchTx: { to: string; data: string; value: string },
  originalTransactions: SwapTxEntry[],
  chainId: number,
  chainName: string,
): Promise<{ success: boolean; txIds?: string[]; error?: string }> {
  // Validate chain
  if (!BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
    return { success: false, error: `Chain not supported for Bankr API accounts` };
  }

  // Resolve account
  const account = await getActiveAccount();
  if (!account || (account.type !== "impersonator" && account.type !== "bankr")) {
    return { success: false, error: "Batch swap requires a Bankr account" };
  }

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
      return { success: false, error: "Wallet must be unlocked" };
    }
  }

  const txId = crypto.randomUUID();
  const fromAddress = account.address;

  // Build combined function name and extract swapMeta from original txs
  const functionNames = originalTransactions
    .map((t) => t.functionName || t.origin)
    .join(", ");
  const swapMeta = originalTransactions.find((t) => t.swapMeta)?.swapMeta;

  const batchTxParams: TransactionParams = {
    from: fromAddress,
    to: batchTx.to,
    data: batchTx.data,
    value: batchTx.value,
    chainId,
  };

  const pending: PendingTxRequest = {
    id: txId,
    tx: batchTxParams,
    origin: `Batch: ${functionNames}`,
    favicon: originalTransactions[0]?.favicon ?? null,
    chainName,
    timestamp: Date.now(),
  };

  // Fire-and-forget: process in background
  processSwapTxBankr(txId, pending, apiKey, `Batch: ${functionNames}`, swapMeta);

  return { success: true, txIds: [txId] };
}

/**
 * Cancels a processing transaction by aborting the in-flight request.
 */
export async function handleCancelProcessingTx(
  txId: string,
): Promise<{ success: boolean; error?: string }> {
  const controller = activeAbortControllers.get(txId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(txId);
  }

  // Update history regardless (may already have been marked failed by the abort handler)
  const tx = await getTxById(txId);
  if (tx && tx.status === "processing") {
    await updateTxInHistory(txId, {
      status: "failed",
      error: "Cancelled by user",
      completedAt: Date.now(),
    });
  }

  return { success: true };
}
