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
  BANKR_SUPPORTED_CHAIN_IDS,
  CHAIN_NAMES,
  OP_STACK_CHAIN_IDS,
} from "../constants/networks";
import { CHAIN_REGISTRY } from "../constants/chainRegistry";

const CHAIN_BY_ID_TX = new Map(CHAIN_REGISTRY.map((c) => [c.chainId, c]));
import { CHAIN_CONFIG } from "../constants/chainConfig";
import { getStoredResolvedChainById, getStoredRpcUrl } from "@/lib/chains";
import type { Account } from "./types";
import {
  getActiveAccount,
  getAccountById,
  getAccounts,
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
  isSidePanelSupported,
} from "./sidepanelManager";
import { startReceiptPolling, applyReceiptToHistory } from "./txReceiptPoller";
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
  result: TransactionResult | SignatureResult | Record<string, unknown>,
): Promise<void> {
  await chrome.storage.local.set({ [key]: { result, timestamp: Date.now() } });
}

// Active transaction AbortControllers for cancellation
export const activeAbortControllers = new Map<string, AbortController>();

/**
 * SECURITY: resolve the pinned account for a pending request. Refuses if the
 * binding is missing (legacy entry from older build), if the account no longer
 * exists, or if its address has changed since the request was captured.
 */
export async function resolvePinnedAccount(
  pending: { accountId?: string; accountAddress?: string },
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  if (!pending.accountId) {
    return { ok: false, error: "Pending request is no longer valid" };
  }
  const account = await getAccountById(pending.accountId);
  if (!account) {
    return { ok: false, error: "Account no longer exists" };
  }
  if (
    pending.accountAddress &&
    account.address.toLowerCase() !== pending.accountAddress.toLowerCase()
  ) {
    return { ok: false, error: "Pending request is no longer valid" };
  }
  if (account.type === "impersonator") {
    return {
      ok: false,
      error: "View-only accounts cannot send transactions",
    };
  }
  return { ok: true, account };
}

// Prevent double-execution: tracks txIds currently being processed
const processingTxIds = new Set<string>();

// Transaction expiry: reject confirmations for requests older than 30 minutes
const TX_EXPIRY_MS = 30 * 60 * 1000;
const SIGNATURE_EXPIRY_MS = 30 * 60 * 1000;

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
  senderOrigin?: string,
  tabId?: number,
  frameId?: number,
): void {
  const { tx, origin, favicon } = message;

  // Do async storage + popup work in a fire-and-forget block
  (async () => {
    const chainName = CHAIN_NAMES[tx.chainId] || `Chain ${tx.chainId}`;

    // SECURITY: snapshot the active account at arrival time so confirm-time
    // account switches cannot redirect signing to a different account.
    const activeAccount = await getActiveAccount();
    if (!activeAccount) {
      await writeResultToStorage(`txResult:${txId}`, {
        success: false,
        error: "No active account",
      });
      return;
    }
    // SECURITY: dapp-supplied tx.from must match the active account address.
    if (
      typeof tx.from === "string" &&
      tx.from.length > 0 &&
      tx.from.toLowerCase() !== activeAccount.address.toLowerCase()
    ) {
      await writeResultToStorage(`txResult:${txId}`, {
        success: false,
        error: "Transaction 'from' does not match active account",
      });
      return;
    }

    // On chains whose gas model differs from standard EVM (MegaETH), dapp-side
    // gas estimates from wagmi/ethers are systematically wrong (computed against
    // standard EVM rules, missing MegaETH's storage gas component). Strip the
    // dapp's gas value at intake so all downstream code (UI estimation,
    // signing) re-estimates via the chain's own eth_estimateGas. Fee fields
    // are preserved — under-priced fees only delay inclusion, not revert.
    const sanitizedTx = CHAIN_BY_ID_TX.get(tx.chainId)?.usesNonStandardGasModel
      ? { ...tx, gas: undefined }
      : tx;

    const pendingRequest: PendingTxRequest = {
      id: txId,
      tx: sanitizedTx,
      origin,
      favicon: favicon || null,
      chainName,
      timestamp: Date.now(),
      accountId: activeAccount.id,
      accountAddress: activeAccount.address.toLowerCase(),
      accountType: activeAccount.type as PendingTxRequest["accountType"],
      tabId,
      frameId,
      senderOrigin,
      requestChainId: tx.chainId,
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
  senderOrigin?: string,
  tabId?: number,
  frameId?: number,
): void {
  const { signature, origin, favicon } = message;

  // Note: EIP-712 validation now happens in background.ts before this function is called

  // Do async storage + popup work in a fire-and-forget block
  (async () => {
    const chainName =
      CHAIN_NAMES[signature.chainId] || `Chain ${signature.chainId}`;

    // SECURITY: snapshot the active account at arrival time.
    const activeAccount = await getActiveAccount();
    if (!activeAccount) {
      await writeResultToStorage(`sigResult:${sigId}`, {
        success: false,
        error: "No active account",
      });
      return;
    }
    // SECURITY: validate signer param matches active account address.
    const signerParam = extractSignerParam(signature.method, signature.params);
    if (
      typeof signerParam === "string" &&
      signerParam.length > 0 &&
      signerParam.toLowerCase() !== activeAccount.address.toLowerCase()
    ) {
      await writeResultToStorage(`sigResult:${sigId}`, {
        success: false,
        error: "Signer address does not match active account",
      });
      return;
    }

    // SECURITY: typed data domain.chainId must match the request chainId.
    if (
      signature.method === "eth_signTypedData_v3" ||
      signature.method === "eth_signTypedData_v4"
    ) {
      let typedData: any = signature.params?.[1];
      if (typeof typedData === "string") {
        try {
          typedData = JSON.parse(typedData);
        } catch {
          /* validator already ran in background.ts; leave as-is */
        }
      }
      const domainChainId = typedData?.domain?.chainId;
      if (domainChainId !== undefined && domainChainId !== null) {
        const numDomainChainId = Number(domainChainId);
        if (
          Number.isFinite(numDomainChainId) &&
          numDomainChainId !== signature.chainId
        ) {
          await writeResultToStorage(`sigResult:${sigId}`, {
            success: false,
            error: `Provided chainId "${numDomainChainId}" must match the active chainId "${signature.chainId}"`,
          });
          return;
        }
      }
    }

    const pendingRequest: PendingSignatureRequest = {
      id: sigId,
      signature,
      origin,
      favicon: favicon || null,
      chainName,
      timestamp: Date.now(),
      accountId: activeAccount.id,
      accountAddress: activeAccount.address.toLowerCase(),
      accountType: activeAccount.type as PendingSignatureRequest["accountType"],
      tabId,
      frameId,
      senderOrigin,
      requestChainId: signature.chainId,
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

  // SECURITY: resolve the account pinned at request arrival; reject if the
  // binding is stale or the account is gone.
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) {
    return { success: false, error: pinned.error };
  }
  // SECURITY: this handler signs via the Bankr API.
  if (pinned.account.type !== "bankr") {
    return { success: false, error: "Pending request is no longer valid" };
  }
  if (
    typeof pending.tx.from === "string" &&
    pending.tx.from.length > 0 &&
    pending.tx.from.toLowerCase() !== pinned.account.address.toLowerCase()
  ) {
    return {
      success: false,
      error: "Transaction 'from' does not match active account",
    };
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
 * Handles rejection from the popup. Looks up the pending request before
 * removing it so we can detect split-bundle membership and advance the
 * sequencer (mark the bundle stopped at this index). Idempotent: if the
 * request is already gone, returns the standard rejection result.
 */
export async function handleRejectTransaction(
  txId: string,
): Promise<TransactionResult> {
  const pending = await getPendingTxRequestById(txId);
  await removePendingTxRequest(txId);
  await writeResultToStorage(`txResult:${txId}`, {
    success: false,
    error: "Transaction rejected by user",
  });
  if (pending?.parentBundleId && pending.bundleIndex !== undefined) {
    const { advanceSplitBundle } = await import("./splitBatchSequencer");
    await advanceSplitBundle({
      bundleId: pending.parentBundleId,
      bundleIndex: pending.bundleIndex,
      outcome: "rejected",
    });
  }
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
 * Centralized wrapper around the shared chain resolver. Keeping this export
 * avoids touching every existing caller while still making runtime chain
 * lookups come from one place.
 */
export async function getRpcUrl(chainId: number): Promise<string | undefined> {
  return getStoredRpcUrl(chainId);
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
  forceInclusion?: boolean,
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

  // SECURITY: resolve the pinned account; reject stale/missing/impersonator
  // bindings. Do NOT fall back to getActiveAccount() — that re-introduces the
  // confirm-time-account-switch attack.
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) {
    return { success: false, error: pinned.error };
  }
  // SECURITY: this handler signs via the Bankr API. Refuse if the pinned
  // account is not a Bankr account (the live active account may be Bankr now,
  // but signing through the API would not match the pinned address).
  if (pinned.account.type !== "bankr") {
    return { success: false, error: "Pending request is no longer valid" };
  }
  if (
    typeof pending.tx.from === "string" &&
    pending.tx.from.length > 0 &&
    pending.tx.from.toLowerCase() !== pinned.account.address.toLowerCase()
  ) {
    return {
      success: false,
      error: "Transaction 'from' does not match active account",
    };
  }

  // Validate chain is supported for Bankr API accounts.
  // For force inclusion, the actual L1 deposit goes to the L1 chain — verify
  // THAT chain is in the Bankr-supported set (currently mainnet only).
  if (forceInclusion) {
    const { FORCE_INCLUSION_CHAINS } = await import("@/constants/chainRegistry");
    const info = FORCE_INCLUSION_CHAINS.get(pending.tx.chainId);
    if (!info) {
      return { success: false, error: "Chain does not support force inclusion" };
    }
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(info.l1ChainId)) {
      return {
        success: false,
        error: `Force inclusion via Bankr requires an L1 chain supported by the Bankr API. Use a Private Key or Seed Phrase account to force-include on testnets.`,
      };
    }
  } else if (!BANKR_SUPPORTED_CHAIN_IDS.has(pending.tx.chainId)) {
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
  if (forceInclusion) {
    const { processForceInclusionBankr } = await import("./forceInclusion");
    processForceInclusionBankr(txId, pending, apiKey);
  } else {
    processTransactionInBackground(txId, pending, apiKey, functionName);
  }

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

  // Advance the parent bundle's split sequencer so it doesn't hang at PENDING
  // forever when a sign-time / RPC-side failure happens before broadcast.
  if (pending.parentBundleId && pending.bundleIndex !== undefined) {
    const { advanceSplitBundle } = await import("./splitBatchSequencer");
    await advanceSplitBundle({
      bundleId: pending.parentBundleId,
      bundleIndex: pending.bundleIndex,
      outcome: "rejected",
      errorMessage: error,
    });
  }

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
    parentBundleId: pending.parentBundleId,
    bundleIndex: pending.bundleIndex,
  });

  // If no function name provided by UI, try background lookup
  if (!functionName && pending.tx.data && pending.tx.data !== "0x") {
    lookupFunctionName(pending.tx.data).then((name) => {
      if (name) updateTxInHistory(txId, { functionName: name });
    });
  }

  try {
    const resolvedChain = await getStoredResolvedChainById(pending.tx.chainId);
    const rpcUrl = resolvedChain?.rpcUrl;
    const customChainMeta = resolvedChain?.isCustom
      ? {
          name: resolvedChain.name,
          nativeCurrency: resolvedChain.nativeCurrency,
          explorer: resolvedChain.explorer || undefined,
        }
      : undefined;

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
      customChainMeta,
    );
    const txHash = result.txHash;

    // Sync-send chains (e.g., MegaETH) return the receipt with the broadcast —
    // jump straight to the final state with no intermediate "pending" flash.
    // Otherwise mark pending and start the poller.
    if (txHash) {
      if (result.receipt) {
        await applyReceiptToHistory(txId, txHash, pending.tx.chainId, result.receipt, {
          rpcUrl,
          signedGasLimit: result.signedGasLimit,
        });
      } else {
        await updateTxInHistory(txId, { status: "pending", txHash });
        startReceiptPolling(txId, txHash, pending.tx.chainId);
      }
    } else {
      await updateTxInHistory(txId, { status: "pending", txHash });
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
  forceInclusion?: boolean,
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

  // SECURITY: resolve the pinned account; do NOT fall back to getActiveAccount().
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) {
    processingTxIds.delete(txId);
    return { success: false, error: pinned.error };
  }
  const account = pinned.account;

  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    processingTxIds.delete(txId);
    return { success: false, error: "Account does not support local signing" };
  }

  // Defense-in-depth: tx.from must match the pinned account address.
  if (
    typeof pending.tx.from === "string" &&
    pending.tx.from.length > 0 &&
    pending.tx.from.toLowerCase() !== account.address.toLowerCase()
  ) {
    processingTxIds.delete(txId);
    return {
      success: false,
      error: "Transaction 'from' does not match active account",
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
  if (forceInclusion) {
    const { processForceInclusionLocal } = await import("./forceInclusion");
    processForceInclusionLocal(txId, pending, account, privateKey, gasOverrides);
  } else {
    processLocalTransactionInBackground(
      txId,
      pending,
      account,
      privateKey,
      functionName,
      gasOverrides,
    );
  }

  return { success: true };
}

/**
 * Extracts the signer address param from a signature request based on the method.
 */
function extractSignerParam(
  method: SignatureParams["method"],
  params: any[],
): string | undefined {
  if (method === "personal_sign") return params?.[1];
  return params?.[0];
}

/**
 * Handles signature confirmation for PK accounts
 */
export async function handleConfirmSignatureRequest(
  sigId: string,
  password: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tabId?: number,
): Promise<SignatureResult> {
  const pending = await getPendingSignatureRequestById(sigId);
  // SECURITY: re-check expiry at confirm time in case cleanup didn't run.
  if (!pending || Date.now() - pending.timestamp > SIGNATURE_EXPIRY_MS) {
    if (pending) await removePendingSignatureRequest(sigId);
    return { success: false, error: "Signature request expired" };
  }

  // SECURITY: resolve the account pinned at request arrival.
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) {
    return { success: false, error: pinned.error };
  }
  const account = pinned.account;

  // SECURITY: enforce that the dapp-supplied signer matches the pinned account
  const signerParam = extractSignerParam(
    pending.signature.method,
    pending.signature.params,
  );
  if (
    typeof signerParam === "string" &&
    signerParam.toLowerCase() !== account.address.toLowerCase()
  ) {
    return {
      success: false,
      error: "Signer address does not match active account",
    };
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
  // SECURITY: re-check expiry at confirm time in case cleanup didn't run.
  if (!pending || Date.now() - pending.timestamp > SIGNATURE_EXPIRY_MS) {
    if (pending) await removePendingSignatureRequest(sigId);
    return { success: false, error: "Signature request expired" };
  }

  // SECURITY: resolve the account pinned at request arrival.
  // The Bankr API signs with the API key's owner address regardless of any
  // signer param; reject mismatched requests so users aren't shown a spoofed
  // address. Use the pinned account, not whatever is active right now.
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) {
    return { success: false, error: pinned.error };
  }
  const pinnedAccount = pinned.account;
  // SECURITY: this handler signs via the Bankr API.
  if (pinnedAccount.type !== "bankr") {
    return { success: false, error: "Pending request is no longer valid" };
  }
  const signerParam = extractSignerParam(
    pending.signature.method,
    pending.signature.params,
  );
  if (
    typeof signerParam === "string" &&
    signerParam.toLowerCase() !== pinnedAccount.address.toLowerCase()
  ) {
    return {
      success: false,
      error: "Signer address does not match active account",
    };
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

  // Validate chain is configured (hardcoded or custom)
  const configuredRpc = await getRpcUrl(tx.chainId);
  if (!configuredRpc) {
    return {
      success: false,
      error: `Chain ${tx.chainId} not configured. Add it in Settings → Chains.`,
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
  // Per-call gas overrides from the swap confirmation's tier picker. One
  // entry per `transactions[i]`. Optional for back-compat — Bankr accounts
  // and the legacy code paths still work without this.
  gasEstimates?: { gasLimit: string; maxFeePerGas: string; maxPriorityFeePerGas: string }[],
): Promise<{ success: boolean; txIds?: string[]; error?: string }> {
  if (transactions.length === 0) {
    return { success: false, error: "No transactions provided" };
  }

  const chainId = transactions[0].tx.chainId;

  // Validate chain is configured
  const swapRpc = await getRpcUrl(chainId);
  if (!swapRpc) {
    return { success: false, error: `Chain ${chainId} not configured` };
  }

  // Resolve account
  const account = await getActiveAccount();
  if (!account) {
    return { success: false, error: "No account found" };
  }

  // SECURITY: impersonator accounts are view-only — block all swap execution.
  if (account.type === "impersonator") {
    return { success: false, error: "View-only accounts cannot execute swaps" };
  }

  // --- Bankr API accounts ---
  if (account.type === "bankr") {
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

  // Phase 2 (concurrent): broadcast all TXs with pre-assigned nonces.
  // gasEstimates[i] aligns with prepared[i] because we built `prepared`
  // by iterating `transactions` in order — same indexing the UI used.
  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    const gasOverride = gasEstimates?.[i];
    broadcastSwapTxLocal(
      item.txId,
      item.pending,
      account,
      privateKey,
      item.nonce,
      rpcUrl,
      customChainMeta,
      gasOverride
        ? {
            gasLimit: gasOverride.gasLimit,
            maxFeePerGas: gasOverride.maxFeePerGas,
            maxPriorityFeePerGas: gasOverride.maxPriorityFeePerGas,
          }
        : undefined,
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
  customChainMeta?: { name: string; nativeCurrency?: { name: string; symbol: string; decimals: number }; explorer?: string },
  gasOverrides?: GasOverrides,
): Promise<void> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);

  try {
    // Apply tier-picker / Custom-tier overrides if the UI passed them in.
    // Clears legacy gasPrice the same way processLocalTransactionInBackground
    // does, to avoid an EIP-1559 / legacy field conflict at signing time.
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

    const result = await signAndBroadcastTransaction(
      privateKey,
      txForSigning,
      rpcUrl,
      customChainMeta,
    );
    const txHash = result.txHash;

    if (txHash) {
      if (result.receipt) {
        // Sync-send path (e.g., MegaETH): receipt arrived with the broadcast,
        // so skip the intermediate "pending" write and jump straight to the
        // final state. Otherwise the UI would briefly flash pending → success.
        await applyReceiptToHistory(txId, txHash, pending.tx.chainId, result.receipt, {
          rpcUrl,
          signedGasLimit: result.signedGasLimit,
        });
      } else {
        await updateTxInHistory(txId, { status: "pending", txHash });
        startReceiptPolling(txId, txHash, pending.tx.chainId);
      }
    } else {
      await updateTxInHistory(txId, { status: "pending", txHash });
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
  if (!account) {
    return { success: false, error: "No account found" };
  }
  // SECURITY: impersonator accounts are view-only — block all swap execution.
  if (account.type === "impersonator") {
    return { success: false, error: "View-only accounts cannot execute swaps" };
  }
  if (account.type !== "bankr") {
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
