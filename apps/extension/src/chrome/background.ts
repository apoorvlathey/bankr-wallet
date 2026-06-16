/**
 * Background service worker - message router and Chrome event listeners
 *
 * All business logic has been extracted into focused modules:
 * - sessionCache.ts: Credential caching, session persistence, auto-lock
 * - authHandlers.ts: Wallet unlock, vault key system, password management
 * - txHandlers.ts: Transaction/signature requests, notifications
 * - chatHandlers.ts: Bankr AI chat prompt handling
 * - sidepanelManager.ts: Side panel detection and mode management
 */

import { encryptWithVaultKey } from "./crypto";
import {
  getAccounts,
  getAccountById,
  getActiveAccount,
  setActiveAccountId,
  getTabAccount,
  setTabAccount,
  addBankrAccount,
  addImpersonatorAccount,
  addSeedPhraseAccount,
  addSeedGroup,
  removeSeedGroup,
  getSeedGroups,
  renameSeedGroup,
  updateSeedGroupCount,
  updateAccountDisplayName,
  validateBankrAccountAddressUpdate,
  updateBankrAccountAddress,
  findAccountByAddress,
  convertToSeedPhraseAccount,
} from "./accountStorage";
import type { SeedPhraseAccount } from "./types";
import { decryptAllKeys, addKeyToVault } from "./vaultCrypto";
import {
  generateNewMnemonic,
  isValidMnemonic,
  derivePrivateKey as deriveSeedPrivateKey,
} from "./seedPhraseUtils";
import { storeMnemonic, getMnemonic, removeMnemonic } from "./mnemonicStorage";
import { deriveAddress } from "./localSigner";
import { validateEIP712TypedData } from "./eip712Validator";
import {
  removePendingTxRequest,
  getPendingTxRequests,
  clearExpiredTxRequests,
  updateBadge,
  updatePendingTxRequestData,
} from "./pendingTxStorage";
import {
  removePendingSignatureRequest,
  getPendingSignatureRequests,
  clearExpiredSignatureRequests,
} from "./pendingSignatureStorage";
import {
  getPendingBatchTxRequests,
  clearExpiredBatchTxRequests,
} from "./pendingBatchTxStorage";
import { cleanupOldBundleStatuses } from "./bundleStatusStorage";
import {
  handleWalletGetCapabilities,
  handleWalletSendCalls,
  handleConfirmBatchTransaction,
  handleConfirmBatchTransactionPK,
  handleRejectBatchTransaction,
  handleRemoveCallFromPendingBatch,
  handleUpdateCallInPendingBatch,
  handleWalletGetCallsStatus,
  handleWalletShowCallsStatus,
} from "./batchTxHandlers";
import { handleSplitBatchIntoIndividualTxs } from "./splitBatchSequencer";
import {
  handleGetDelegationStatus,
  handleProbeDelegateContract,
  handleSetCustomDelegate,
  handleRemoveCustomDelegate,
  handleInitiateRevokeDelegation,
  handleInitiateSetDelegation,
} from "./delegationHandlers";
import {
  handleAddToCrossDappBatch,
  handleAddCallsToCrossDappBatch,
  handleRemoveFromCrossDappBatch,
  handleUpdateCallInCrossDappBatch,
  handleRejectCrossDappBatch,
  handleConfirmCrossDappBatch,
} from "./crossDappBatchHandlers";
import {
  getTxHistory,
  getProcessingTxs,
  clearTxHistory,
  clearTxHistoryForAddresses,
  cleanupStaleProcessingTxs,
} from "./txHistoryStorage";
import { queueAssetChangesBackfill } from "./receiptEnrichment";
import {
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
  addMessageToConversation,
  updateMessageInConversation,
} from "./chatStorage";
import {
  handleGetClearSigningDescriptor,
  handleInvalidateClearSigningCache,
  getClearSigningEnabled,
  setClearSigningEnabled,
} from "./clearSigningHandlers";
import {
  addNetworkIfMissing,
  deleteNetworkEntry,
  ensureNetworksInfo,
  setNetworkHiddenState,
  updateNetworkEntry,
} from "./networkStorage";
import {
  getStorageKeysWithPrefixes,
  getWalletLocalStorageKeysToRemove,
  WALLET_RESULT_STORAGE_PREFIXES,
  WALLET_SYNC_STORAGE_KEYS,
} from "./walletResetStorage";
import {
  CACHE_PRUNE_INTERVAL_MS,
  pruneNonCriticalStorageCaches,
} from "./storageCachePruner";

// Session & cache management
import {
  AUTO_LOCK_STORAGE_KEY,
  updateCachedAutoLockTimeout,
  getCachedApiKey,
  setCachedApiKeyDirect,
  clearCachedApiKey,
  getCachedPassword,
  setCachedVault,
  clearCachedVault,
  getCachedVaultKey,
  getPasswordType,
  resolvePasswordType,
  getAutoLockTimeout,
  setAutoLockTimeout,
  isApiKeyCached,
  isWalletUnlocked,
  getPrivateKeyFromCache,
  getCurrentSessionId,
  tryRestoreSession,
  incrementUIConnections,
  decrementUIConnections,
  clearAllAuthState,
} from "./sessionCache";

// Auth handlers
import {
  handleUnlockWallet,
  handleSetAgentPassword,
  handleRemoveAgentPassword,
  handleSaveApiKeyWithCachedPassword,
  handleChangePasswordWithCachedPassword,
} from "./authHandlers";

// Transaction handlers
import {
  failedTxResults,
  handleTransactionRequest,
  handleSignatureRequest,
  handleConfirmTransaction,
  handleRejectTransaction,
  handleCancelTransaction,
  handleConfirmTransactionAsync,
  handleConfirmTransactionAsyncPK,
  handleConfirmSignatureRequest,
  handleConfirmSignatureRequestBankr,
  handleAddPrivateKeyAccount,
  handleRemoveAccount,
  openPopupWindow,
  openExtensionPopup,
  performSecurityReset,
  handleInitiateTransfer,
  handleExecuteSwapDirect,
  handleExecuteSwapBatch,
  handleExecuteSwapAtomicPK,
  handleCancelProcessingTx,
  writeResultToStorage,
  showNotification,
  SignatureResult,
} from "./txHandlers";

// Gas estimation
import { estimateGas, fetchNativePrice } from "./gasEstimation";
import { estimateBatchGasSequential } from "./batchGasEstimation";

// Transaction simulation (asset change detection)
import { simulateAssetChanges, simulateBatchAssetChanges, simulateBatchAssetChangesNonAtomic, retryTokenMetadata } from "./txSimulation";

// Chat handlers
import { handleSubmitChatPrompt } from "./chatHandlers";

// Sponsored transfer handlers
import {
  handleSponsoredTransfer,
  handleCheckPremiumStatus,
} from "./sponsoredTransferHandlers";

// Swap API
import {
  fetchSwapPrice,
  fetchSwapQuote,
  fetchTokenInfo,
  fetchTokenPrice,
  getCachedTokenList,
  checkTokenAllowance,
  checkPermit2Allowance,
  getTokenBalanceWei,
} from "./swapApi";
import { resolveTokenLogoUrl, resolveTokenMetadata } from "./tokenMetadata";
import {
  fetchBridgeQuote,
  fetchBridgeBuildTx,
  fetchBridgeStatus,
  getCachedBungeeChains,
  getCachedBungeeTokens,
} from "./bridgeApi";
import {
  getBridgeSourceChains,
  getBridgeDestinationChains,
} from "./bridgeChainsResolver";
import {
  resumePendingBridgePollers,
} from "./bridgeStatusPoller";
import { prunePendingBridges } from "./pendingBridgeStorage";
import {
  resolveCoinGeckoNativeAssetsBatch,
  resolveCoinGeckoErc20PricesBatch,
} from "./coingeckoService";

// Sidepanel management
// Watch asset (wallet_watchAsset / EIP-747)
import {
  savePendingWatchAssetRequest,
  removePendingWatchAssetRequest,
  getPendingWatchAssetRequests,
  PendingWatchAssetRequest,
} from "./pendingWatchAssetStorage";
import {
  savePendingAddChainRequest,
  removePendingAddChainRequest,
  getPendingAddChainRequests,
  PendingAddChainRequest,
} from "./pendingAddChainStorage";
import {
  addCustomToken,
  getCustomTokens,
  removeCustomToken,
  updateCustomToken,
} from "./customTokenStorage";
import { unhidePortfolioToken } from "./hiddenPortfolioTokens";
import { getResolvedChainById } from "@/lib/chains";
import type { NetworksInfo } from "@/types";

import {
  isSidePanelSupported,
  isSidePanelSupportedAsync,
  getSidePanelMode,
  setSidePanelMode,
  initSidePanel,
  POPUP_PATH,
} from "./sidepanelManager";

import { fetchAndCacheAvatarImage } from "./avatarImageCache";
import { initEnsBrowsing, handleEnsBrowsingMessage } from "./ensBrowsing";
import {
  handleWalletConnectDisconnectSession,
  handleWalletConnectGetSessions,
  handleWalletConnectPair,
  handleWalletConnectSwitchChain,
  initWalletConnect,
} from "./walletConnectHandlers";
import { clearExpiredWalletConnectPendingRequests } from "./walletConnectStorage";

// Handles RPC requests proxied from inpage script (to bypass page CSP)
async function handleRpcRequest(
  rpcUrl: string,
  method: string,
  params: any[],
): Promise<any> {
  // Validate URL is a known RPC endpoint from networksInfo (defense-in-depth)
  const { networksInfo } = (await chrome.storage.sync.get("networksInfo")) as {
    networksInfo: Record<string, { rpcUrl: string }> | undefined;
  };
  const allowedUrls = networksInfo
    ? new Set(Object.values(networksInfo).map((n) => n.rpcUrl))
    : new Set<string>();
  if (!allowedUrls.has(rpcUrl)) {
    throw new Error("RPC URL not in allowed list");
  }

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "RPC error");
  }

  return data.result;
}

const CHAIN_SWITCH_NOTIFICATION_COOLDOWN_MS = 10_000;
const recentChainSwitchNotifications = new Map<string, number>();

function getSenderUrl(sender: chrome.runtime.MessageSender): string | undefined {
  return sender.url || sender.tab?.url || sender.origin || undefined;
}

function getDappLabel(sender: chrome.runtime.MessageSender): string {
  const source = getSenderUrl(sender);
  if (!source) return "A dapp";

  try {
    return new URL(source).hostname || "A dapp";
  } catch {
    return "A dapp";
  }
}

function getNotificationIconUrl(iconPath: string | undefined): string | undefined {
  if (!iconPath) return undefined;
  if (/^https?:\/\//i.test(iconPath)) return undefined;
  if (iconPath.startsWith("chrome-extension://") || iconPath.startsWith("moz-extension://")) {
    return iconPath;
  }
  return chrome.runtime.getURL(iconPath.replace(/^\/+/, ""));
}

async function handleDappChainSwitchNotification(
  message: any,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  const chainId = Number(message.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return { success: false, error: "Invalid chain ID" };
  }

  if (!sender.tab?.id) {
    return { success: false, error: "Missing tab context" };
  }

  const { networksInfo } = (await chrome.storage.sync.get("networksInfo")) as {
    networksInfo?: NetworksInfo;
  };
  const chain = getResolvedChainById(chainId, networksInfo);
  if (!chain) {
    return { success: false, error: "Unknown chain" };
  }

  const source = sender.origin || getSenderUrl(sender) || "unknown";
  const cooldownKey = `${sender.tab.id}:${source}:${chain.chainId}`;
  const now = Date.now();
  const previous = recentChainSwitchNotifications.get(cooldownKey);
  if (previous && now - previous < CHAIN_SWITCH_NOTIFICATION_COOLDOWN_MS) {
    return { success: true, skipped: true };
  }

  recentChainSwitchNotifications.set(cooldownKey, now);
  for (const [key, timestamp] of recentChainSwitchNotifications) {
    if (now - timestamp > CHAIN_SWITCH_NOTIFICATION_COOLDOWN_MS * 6) {
      recentChainSwitchNotifications.delete(key);
    }
  }

  await showNotification(
    `chain-switch-${sender.tab.id}-${chain.chainId}-${now}`,
    `Switched to ${chain.name}`,
    `${getDappLabel(sender)} switched WalletChan network`,
    { iconUrl: getNotificationIconUrl(chain.icon) },
  );

  return { success: true };
}

// ─── Security Helpers ────────────────────────────────────────────────────────

/**
 * Checks whether the message sender is an extension page (popup, sidepanel, onboarding)
 * as opposed to a content script running on a web page.
 * Content scripts have sender.url set to the web page URL, not the extension URL.
 */
// chrome.runtime.getURL("/") returns the extension root: `chrome-extension://<id>/`
// on Chrome, `moz-extension://<uuid>/` on Firefox. Computing it once avoids hardcoding
// the URL scheme (which was Firefox-broken: Firefox uses moz-extension://).
const EXTENSION_ORIGIN_PREFIX = chrome.runtime.getURL("/");

function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return !!sender.url?.startsWith(EXTENSION_ORIGIN_PREFIX);
}

// ─── Chrome Event Listeners ──────────────────────────────────────────────────

// Listen for storage changes to update cached timeout and broadcast address changes
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "sync") {
    if (changes[AUTO_LOCK_STORAGE_KEY]) {
      updateCachedAutoLockTimeout(changes[AUTO_LOCK_STORAGE_KEY].newValue);
    }

    // Broadcast address changes to all tabs so dapps receive accountsChanged event
    if (changes.address) {
      const newAddress = changes.address.newValue;
      const newDisplayAddress = changes.displayAddress?.newValue || newAddress;

      if (newAddress) {
        // Get all tabs and send setAddress message
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (
            tab.id &&
            tab.url &&
            !tab.url.startsWith("chrome://") &&
            !tab.url.startsWith("chrome-extension://") &&
            !tab.url.startsWith("moz-extension://") &&
            !tab.url.startsWith("about:")
          ) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "setAddress",
                msg: { address: newAddress, displayAddress: newDisplayAddress },
              })
              .catch(() => {
                // Ignore errors for tabs without content script
              });
          }
        }
      }
    }
  }
});

// Clear cache when service worker suspends
self.addEventListener("suspend", () => {
  clearCachedApiKey();
  clearCachedVault();
});

// Clean up expired transactions, signature requests, and batch requests periodically
setInterval(() => {
  clearExpiredTxRequests();
  clearExpiredSignatureRequests();
  clearExpiredBatchTxRequests();
  clearExpiredWalletConnectPendingRequests();
}, 60000); // Every minute

function pruneStorageCachesBestEffort(): void {
  pruneNonCriticalStorageCaches().catch((error) => {
    console.warn("[storage-cache] prune failed:", error);
  });
}

// Clean up stale result keys from storage (from previous service worker sessions)
chrome.storage.local.get(null).then((items) => {
  const staleKeys = getStorageKeysWithPrefixes(
    items,
    WALLET_RESULT_STORAGE_PREFIXES,
  ).filter((k) => {
    const entry = items[k];
    return entry?.timestamp && Date.now() - entry.timestamp > 30 * 60 * 1000;
  });
  if (staleKeys.length > 0) chrome.storage.local.remove(staleKeys);
});

// Keep non-critical metadata/image caches from crowding wallet-critical state.
pruneStorageCachesBestEffort();
setInterval(pruneStorageCachesBestEffort, CACHE_PRUNE_INTERVAL_MS);

// Clean up old bundle statuses on startup
cleanupOldBundleStatuses();

// Initialize badge on startup
updateBadge();

// Initialize auto-lock timeout cache on startup
getAutoLockTimeout();

/**
 * Migrates legacy storage (v0.1.1/v0.2.0) to the multi-account system.
 *
 * Old versions stored only `address` in chrome.storage.sync and had no `accounts`
 * array.  Without this migration the popup enters an onboarding loop because
 * App.tsx requires at least one entry in the accounts array.
 *
 * Safe to call multiple times — exits early when accounts already exist.
 */
async function migrateFromLegacyStorage(): Promise<boolean> {
  try {
    // Already migrated?
    const { accounts } = await chrome.storage.local.get("accounts");
    if (Array.isArray(accounts) && accounts.length > 0) {
      return false;
    }

    // Must have legacy encrypted data to be a real returning user
    const { encryptedApiKey } =
      await chrome.storage.local.get("encryptedApiKey");
    if (!encryptedApiKey) {
      return false; // Fresh install — nothing to migrate
    }

    // Read legacy address
    const { address, displayAddress } = await chrome.storage.sync.get([
      "address",
      "displayAddress",
    ]);
    if (!address) {
      return false; // No address stored — cannot create account entry
    }

    // Build a BankrAccount entry matching the shape in types.ts
    const newAccount = {
      id: crypto.randomUUID(),
      type: "bankr" as const,
      address: (address as string).toLowerCase(),
      displayName:
        displayAddress && displayAddress !== address
          ? (displayAddress as string)
          : undefined,
      createdAt: Date.now(),
    };

    // Write accounts array + set this account as active (single atomic write per store)
    await chrome.storage.local.set({ accounts: [newAccount] });
    await chrome.storage.sync.set({ activeAccountId: newAccount.id });

    console.log(
      "[WalletChan] Legacy storage migration complete:",
      newAccount.address,
    );
    return true;
  } catch (error) {
    console.error("[WalletChan] Legacy storage migration failed:", error);
    return false;
  }
}

/**
 * Migrates a user's custom OP Mainnet (chainId 10) entry to the built-in
 * "Optimism" chain. If a user manually added chainId 10 under any name before
 * it became built-in, this rekeys their networksInfo entry to "Optimism"
 * (preserving the custom RPC URL and hidden flag) and rewrites the global
 * `chainName` selection if it pointed at the old custom name. Without this,
 * the user's selected chain would silently fall back to the default after
 * the update because chainName is keyed by name, not id.
 *
 * Idempotent: short-circuits if no chainId-10 entry exists under a non-
 * canonical key.
 */
async function migrateCustomOptimismChain(): Promise<void> {
  try {
    const { networksInfo, chainName } = await chrome.storage.sync.get([
      "networksInfo",
      "chainName",
    ]);
    if (!networksInfo || typeof networksInfo !== "object") return;

    let oldName: string | null = null;
    for (const [name, entry] of Object.entries(
      networksInfo as Record<string, { chainId?: number }>,
    )) {
      if (entry?.chainId === 10 && name !== "Optimism") {
        oldName = name;
        break;
      }
    }
    if (!oldName) return;

    const oldEntry = (networksInfo as Record<string, any>)[oldName];
    const next = { ...(networksInfo as Record<string, any>) };
    delete next[oldName];
    next["Optimism"] = {
      chainId: 10,
      rpcUrl: oldEntry.rpcUrl,
      hidden: oldEntry.hidden,
    };

    const updates: Record<string, unknown> = { networksInfo: next };
    if (chainName === oldName) updates.chainName = "Optimism";

    await chrome.storage.sync.set(updates);
    console.log(
      `[WalletChan] Migrated custom chain "${oldName}" (chainId 10) → built-in "Optimism"`,
    );
  } catch (error) {
    console.error("[WalletChan] OP Mainnet migration failed:", error);
  }
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // First time install - open onboarding page
    const onboardingUrl = chrome.runtime.getURL("onboarding.html");
    await chrome.tabs.create({ url: onboardingUrl });
  } else if (details.reason === "update") {
    // Migrate from v0.1.1/v0.2.0 legacy storage to multi-account system
    await migrateFromLegacyStorage();
    // v3.5.0: rekey custom OP entries now that Optimism is built-in
    await migrateCustomOptimismChain();
  }
});

// Initialize sidepanel behavior on startup
initSidePanel();

// Clean up txs stuck in "processing" (e.g. from a service worker restart mid-tx)
cleanupStaleProcessingTxs();

// Resume receipt polling for any txs stuck in "pending" status
import { resumePendingPollers, checkPendingTxReceipt as checkPendingTxReceiptFn } from "./txReceiptPoller";
import { clearAllNonces } from "./nonceManager";
resumePendingPollers();

// Resume cross-chain bridge status polling. Prune stale entries first so we
// don't keep hammering Bungee for bridges that have been abandoned for hours.
prunePendingBridges()
  .then(() => resumePendingBridgePollers())
  .catch((err) => console.warn("[bridge] resume failed", err));

// Recover stuck force inclusion txs (L1 reverted, or L2 hash extraction failed but L1 succeeded)
import { recoverStuckForceInclusionTxs } from "./forceInclusion";
recoverStuckForceInclusionTxs();

// Initialize ENS browsing (enabled by default — installs the DNR rule that
// intercepts `*.eth` navigations and routes them through the interstitial).
initEnsBrowsing().catch((e) =>
  console.warn("[ens] init failed", e),
);

initWalletConnect().catch((e) =>
  console.warn("[WalletConnect] init failed", e),
);

chrome.runtime.onStartup.addListener(() => {
  initWalletConnect().catch((e) =>
    console.warn("[WalletConnect] startup init failed", e),
  );
});

// Handle extension icon click when popup is cleared (sidepanel mode)
// When sidepanel mode is active, setPopup('') causes onClicked to fire instead of opening a popup.
// We try sidePanel.open() and verify it actually opened. Some browsers (Arc) resolve the promise
// successfully but silently do nothing, so we check for a SIDE_PANEL context after a delay.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!chrome.sidePanel?.open) {
      // Firefox / browser without sidePanel API — fall back immediately
      await openPopupWindow();
      return;
    }
    await chrome.sidePanel.open({ windowId: tab.windowId! });

    // Verify the sidepanel actually opened — some browsers (Arc) resolve the promise
    // successfully but render nothing. Check for a SIDE_PANEL context after a brief delay.
    await new Promise((r) => setTimeout(r, 600));

    let sidePanelActuallyOpen = false;
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["SIDE_PANEL" as chrome.runtime.ContextType],
      });
      sidePanelActuallyOpen = contexts.length > 0;
    } else {
      try {
        const response = await chrome.runtime.sendMessage({ type: "ping" });
        sidePanelActuallyOpen = response === "pong";
      } catch {
        sidePanelActuallyOpen = false;
      }
    }

    if (!sidePanelActuallyOpen) {
      // Sidepanel didn't render — fall back to popup window for this click.
      // Don't permanently disable sidepanel mode; transient failures (timing,
      // service worker restart) shouldn't override the user's preference.
      // Arc browser is handled separately via isArcBrowser detection.
      await openPopupWindow();
    }
  } catch {
    // sidePanel.open() threw — fall back to popup for this click only
    await openPopupWindow();
  }
});

// Port connection listener - used for waking up the service worker and UI keepalive
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup-wake") {
    // Just acknowledge the connection - the popup is waking us up
    console.log("Service worker woken up by popup");
  } else if (port.name === "ui-keepalive") {
    // UI view (popup/sidepanel/onboarding) connected - pause auto-lock timer
    incrementUIConnections();
    port.onDisconnect.addListener(() => {
      decrementUIConnections();
    });
  }
});

// ─── Message Router ──────────────────────────────────────────────────────────

// Message types that MUST originate from extension pages (popup/sidepanel/onboarding).
// Content scripts (web pages) are never allowed to send these.
const EXTENSION_ONLY_MESSAGES = new Set([
  // Transaction/signature confirmations
  "confirmTransaction",
  "confirmTransactionAsync",
  "confirmTransactionAsyncPK",
  "confirmBatchTransactionAsync",
  "confirmBatchTransactionAsyncPK",
  "confirmSignatureRequest",
  "confirmAddChain",
  "confirmWatchAsset",
  // Rejections (prevent malicious page from rejecting user's pending requests)
  "rejectTransaction",
  "rejectBatchTransaction",
  "splitBatchIntoIndividualTxs",
  "removeCallFromPendingBatch",
  "updatePendingTxRequestData",
  "updateCallInPendingBatch",
  "rejectSignatureRequest",
  "rejectAddChain",
  "rejectWatchAsset",
  "cancelTransaction",
  // Cross-dapp batch (popup-only assembly + ship)
  "addToCrossDappBatch",
  "addCallsToCrossDappBatch",
  "removeFromCrossDappBatch",
  "updateCallInCrossDappBatch",
  "rejectCrossDappBatch",
  "confirmCrossDappBatch",
  // Account management
  "addBankrAccount",
  "addImpersonatorAccount",
  "addSeedPhraseGroup",
  "previewSeedAddresses",
  "deriveSeedAccount",
  "addPrivateKeyAccount",
  "removeAccount",
  "getAccounts",
  "getTabAccount",
  "setTabAccount",
  "getSeedGroups",
  // getActiveAccount intentionally stays content-script reachable: inject.ts
  // uses it during provider initialization to correct stale synced address state.
  "setActiveAccount",
  "renameSeedGroup",
  "updateAccountDisplayName",
  "saveBankrApiKeyAndAddress",
  // Credential / session management
  "unlockWallet",
  "lockWallet",
  "isApiKeyCached",
  "isWalletUnlocked",
  "validateSession",
  "tryRestoreSession",
  "clearApiKeyCache",
  "saveApiKeyWithCachedPassword",
  "getCachedPassword",
  "changePasswordWithCachedPassword",
  "setAgentPassword",
  "removeAgentPassword",
  "isAgentPasswordEnabled",
  "getPasswordType",
  // Sensitive reads (pending request details)
  "getPendingTxRequests",
  "getPendingBatchTxRequests",
  "getPendingTransaction",
  "getPendingSignatureRequests",
  "getPendingWatchAssetRequests",
  "getPendingAddChainRequests",
  "getTxHistory",
  "getProcessingTxs",
  "getFailedTxResult",
  "checkPendingTxReceipt",
  // Key reveal (already had isExtensionPage but included for completeness)
  "migrateFromLegacy",
  "generateMnemonic",
  "revealSeedPhrase",
  "revealPrivateKey",
  // Destructive operations
  "resetExtension",
  "onboardingComplete",
  "clearTxHistory",
  "clearTxHistoryForAddresses",
  "clearNonceCache",
  "clearFailedTxResult",
  // Settings that affect security
  "setSidePanelMode",
  "setAutoLockTimeout",
  "getAutoLockTimeout",
  "setArcBrowser",
  "isSidePanelSupported",
  "getSidePanelMode",
  "openPopupWindow",
  "getClearSigningEnabled",
  "setClearSigningEnabled",
  "INVALIDATE_CLEAR_SIGNING_CACHE",
  // Network settings mutate synced provider-visible chain metadata.
  "ensureNetworksInfo",
  "addNetwork",
  "updateNetwork",
  "setNetworkHidden",
  "deleteNetwork",
  // Full token metadata may include watched/custom-token metadata.
  "resolveTokenMetadata",
  "lookupCustomToken",
  "addCustomToken",
  "updateCustomToken",
  "removeCustomToken",
  "backfillAssetChanges",
  // EIP-7702 delegation management
  "getDelegationStatus",
  "probeDelegateContract",
  "setCustomDelegate",
  "removeCustomDelegate",
  "initiateSetDelegation",
  "initiateRevokeDelegation",
  // WalletConnect session management
  "walletConnectGetSessions",
  "walletConnectPair",
  "walletConnectDisconnectSession",
  "walletConnectSwitchChain",
  // Direct-execution / UI-only handlers (defense in depth)
  "executeSwapDirect",
  "executeSwapBatch",
  "executeSwapAtomicPK",
  "initiateTransfer",
  "cancelProcessingTx",
  "sponsoredTransfer",
  "checkPremiumStatus",
  // Transaction-confirmation helpers operate on pending wallet context.
  "estimateGas",
  "estimateForceInclusionGas",
  "estimateBatchGasSequential",
  "simulateAssetChanges",
  "simulateBatchAssetChanges",
  "simulateBatchAssetChangesNonAtomic",
  "retryTokenMetadata",
  // Chat history and prompt submission are extension UI only.
  "submitChatPrompt",
  "getChatConversations",
  "getChatConversation",
  "createChatConversation",
  "deleteChatConversation",
  "addChatMessage",
  "updateChatMessage",
  // Clear-signing descriptor requests can use extension cache/preferences.
  "GET_CLEAR_SIGNING_DESCRIPTOR",
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ENS browsing handlers (interstitial / banner / settings). Returns true
  // only for messages it handles, so the rest of the router falls through.
  if (handleEnsBrowsingMessage(message, sender, sendResponse)) {
    return true;
  }

  // Centralized auth gate: reject extension-only messages from content scripts
  if (EXTENSION_ONLY_MESSAGES.has(message.type) && !isExtensionPage(sender)) {
    sendResponse({ success: false, error: "Unauthorized" });
    return false;
  }

  switch (message.type) {
    case "walletConnectGetSessions": {
      handleWalletConnectGetSessions().then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "walletConnectPair": {
      handleWalletConnectPair(message.uri || "").then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "walletConnectDisconnectSession": {
      handleWalletConnectDisconnectSession(message.topic || "").then(
        (result) => {
          sendResponse(result);
        },
      );
      return true;
    }

    case "walletConnectSwitchChain": {
      handleWalletConnectSwitchChain(message.chainName || "").then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "sendTransaction": {
      const senderWindowId = sender.tab?.windowId;
      handleTransactionRequest(
        message,
        message.txId,
        senderWindowId,
        sender.origin ?? undefined,
        sender.tab?.id,
        sender.frameId,
      );
      return false;
    }

    case "signatureRequest": {
      // Validate EIP-712 schema — write error to storage so content script picks it up
      const { signature } = message;
      // SECURITY: reject eth_sign — signs a raw 32-byte digest with no prefix
      // or semantic context. Attackers can pre-compute the hash of a transaction
      // or EIP-712 payload and trick users into producing valid signatures over
      // them while seeing only opaque hex. No legitimate dapp use remains.
      if (signature.method === "eth_sign") {
        writeResultToStorage(`sigResult:${message.sigId}`, {
          success: false,
          error:
            "eth_sign is deprecated and unsafe; use personal_sign or eth_signTypedData_v4",
        });
        return false;
      }
      // Reject deprecated v1 typed data (no domain separator → no chain binding)
      if (signature.method === "eth_signTypedData") {
        writeResultToStorage(`sigResult:${message.sigId}`, {
          success: false,
          error:
            "eth_signTypedData (v1) is deprecated; please use eth_signTypedData_v4",
        });
        return false;
      }
      if (
        signature.method === "eth_signTypedData_v3" ||
        signature.method === "eth_signTypedData_v4"
      ) {
        const validationResult = validateEIP712TypedData(
          signature.method,
          signature.params[1],
        );

        if (!validationResult.valid) {
          console.warn(
            `[WalletChan] EIP-712 validation failed for ${message.origin}:`,
            validationResult.error,
          );
          writeResultToStorage(`sigResult:${message.sigId}`, {
            success: false,
            error: "Data must conform to EIP-712 schema",
          });
          return false;
        }

        // Use sanitized typed data (extra properties stripped from type fields)
        if (validationResult.sanitized) {
          message.signature.params[1] = validationResult.sanitized;
        }
      }

      const senderWindowId = sender.tab?.windowId;
      handleSignatureRequest(
        message,
        message.sigId,
        senderWindowId,
        sender.origin ?? undefined,
        sender.tab?.id,
        sender.frameId,
      );
      return false;
    }

    case "getPendingSignatureRequests": {
      getPendingSignatureRequests().then((requests) => {
        sendResponse(requests);
      });
      return true;
    }

    case "rejectSignatureRequest": {
      const result: SignatureResult = {
        success: false,
        error: "Signature request cancelled by user",
      };
      removePendingSignatureRequest(message.sigId).then(async () => {
        await writeResultToStorage(`sigResult:${message.sigId}`, result);
        sendResponse(result);
      });
      return true;
    }

    // ── wallet_watchAsset (EIP-747) ──────────────────────────────────────────
    case "watchAsset": {
      const senderWindowId = sender.tab?.windowId;
      (async () => {
        const request: PendingWatchAssetRequest = {
          id: message.watchAssetId,
          asset: message.asset,
          chainId: message.chainId,
          origin: message.origin,
          favicon: message.favicon || null,
          timestamp: Date.now(),
        };
        await savePendingWatchAssetRequest(request);
        chrome.runtime
          .sendMessage({ type: "newPendingWatchAssetRequest", request })
          .catch(() => {});
        openExtensionPopup(senderWindowId);
      })();
      return false;
    }

    case "getPendingWatchAssetRequests": {
      getPendingWatchAssetRequests().then((requests) => {
        sendResponse(requests);
      });
      return true;
    }

    case "confirmWatchAsset": {
      (async () => {
        const requests = await getPendingWatchAssetRequests();
        const pending = requests.find((r) => r.id === message.watchAssetId);
        if (pending) {
          // Try to fetch the real token name from onchain
          let tokenName = pending.asset.symbol;
          try {
            const info = await fetchTokenInfo(pending.asset.address, pending.chainId);
            if (info?.name) tokenName = info.name;
          } catch { /* use symbol as fallback */ }

          await addCustomToken({
            chainId: pending.chainId,
            contractAddress: pending.asset.address,
            symbol: pending.asset.symbol,
            name: tokenName,
            decimals: pending.asset.decimals,
            image: pending.asset.image,
          });
          await unhidePortfolioToken(pending.chainId, pending.asset.address);
          await removePendingWatchAssetRequest(message.watchAssetId);
          await writeResultToStorage(`watchAssetResult:${message.watchAssetId}`, {
            success: true,
          });
        }
        sendResponse({ success: true });
      })();
      return true;
    }

    case "rejectWatchAsset": {
      (async () => {
        await removePendingWatchAssetRequest(message.watchAssetId);
        await writeResultToStorage(`watchAssetResult:${message.watchAssetId}`, {
          success: false,
          error: "User rejected token addition",
        });
        sendResponse({ success: true });
      })();
      return true;
    }

    // ── wallet_addEthereumChain (EIP-3085) ────────────────────────────────────
    case "addEthereumChain": {
      const senderWindowId = sender.tab?.windowId;
      (async () => {
        const request: PendingAddChainRequest = {
          id: message.requestId,
          chainId: message.chainId,
          chainName: message.chainName,
          nativeCurrency: message.nativeCurrency,
          rpcUrls: message.rpcUrls,
          blockExplorerUrls: message.blockExplorerUrls,
          origin: message.origin,
          favicon: message.favicon || null,
          timestamp: Date.now(),
        };
        await savePendingAddChainRequest(request);
        chrome.runtime
          .sendMessage({ type: "newPendingAddChainRequest", request })
          .catch(() => {});
        openExtensionPopup(senderWindowId);
      })();
      return false;
    }

    case "getPendingAddChainRequests": {
      getPendingAddChainRequests().then((requests) => {
        sendResponse(requests);
      });
      return true;
    }

    case "ensureNetworksInfo": {
      ensureNetworksInfo().then(sendResponse);
      return true;
    }

    case "addNetwork": {
      addNetworkIfMissing({
        chainName: message.chainName,
        entry: message.entry,
      }).then(sendResponse);
      return true;
    }

    case "updateNetwork": {
      updateNetworkEntry({
        chainName: message.chainName,
        nextChainName: message.nextChainName,
        entry: message.entry,
      }).then(sendResponse);
      return true;
    }

    case "setNetworkHidden": {
      (async () => {
        const activeAccount = await getActiveAccount();
        const result = await setNetworkHiddenState({
          chainName: message.chainName,
          hidden: message.hidden,
          activeAccountType: activeAccount?.type,
        });
        sendResponse(result);
      })();
      return true;
    }

    case "deleteNetwork": {
      (async () => {
        const activeAccount = await getActiveAccount();
        const result = await deleteNetworkEntry({
          chainName: message.chainName,
          activeAccountType: activeAccount?.type,
        });
        sendResponse(result);
      })();
      return true;
    }

    case "confirmAddChain": {
      (async () => {
        const requests = await getPendingAddChainRequests();
        const pending = requests.find((r) => r.id === message.requestId);
        if (pending) {
          const name = message.chainName || pending.chainName || `Chain ${pending.chainId}`;
          const rpcUrl = message.rpcUrl || pending.rpcUrls?.[0] || "";
          const explorer =
            message.explorer || pending.blockExplorerUrls?.[0] || "";
          const nativeCurrency =
            message.nativeCurrency || pending.nativeCurrency;
          const activeAccount = await getActiveAccount();
          const addResult = await addNetworkIfMissing({
            chainName: name,
            entry: {
              chainId: message.chainId || pending.chainId,
              rpcUrl,
              isCustom: true,
              explorer: explorer || undefined,
              nativeCurrency,
            },
            switchIfSupportedForAccountType: activeAccount?.type ?? null,
          });

          if (!addResult.success) {
            sendResponse(addResult);
            return;
          }

          await removePendingAddChainRequest(pending.id);
          const result = {
            success: true,
            rpcUrl:
              addResult.networksInfo[addResult.chainName]?.rpcUrl || rpcUrl,
            chainName: addResult.chainName,
            shouldSwitch: addResult.shouldSwitch,
          };
          await writeResultToStorage(`addChainResult:${pending.id}`, result);
          sendResponse(result);
          return;
        }
        sendResponse({ success: false, error: "Pending add-chain request not found" });
      })();
      return true;
    }

    case "rejectAddChain": {
      (async () => {
        await removePendingAddChainRequest(message.requestId);
        await writeResultToStorage(`addChainResult:${message.requestId}`, {
          success: false,
          error: "User rejected chain addition",
        });
        sendResponse({ success: true });
      })();
      return true;
    }

    case "dappChainSwitchNotification": {
      handleDappChainSwitchNotification(message, sender)
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to show notification",
          }),
        );
      return true;
    }

    // ── ERC-5792 Batch Transactions ──────────────────────────────────────────
    case "walletGetCapabilities": {
      handleWalletGetCapabilities(message.address, message.chainIds).then(
        async (result) => {
          await writeResultToStorage(
            `capabilitiesResult:${message.requestId}`,
            result,
          );
        },
      );
      return false;
    }

    case "walletSendCalls": {
      const senderWindowId = sender.tab?.windowId;
      handleWalletSendCalls(
        message.params,
        message.bundleId,
        message.origin,
        message.favicon,
        senderWindowId,
        sender.origin ?? undefined,
        sender.tab?.id,
        sender.frameId,
      );
      return false;
    }

    case "walletGetCallsStatus": {
      // Use sender-derived origin (trusted) to scope the lookup to the dapp
      // that originally created the bundle.
      const requestOrigin = sender.origin ?? undefined;
      handleWalletGetCallsStatus(message.bundleId, requestOrigin).then(
        async (result) => {
          await writeResultToStorage(
            `callsStatusResult:${message.requestId}`,
            result,
          );
        },
      );
      return false;
    }

    case "walletShowCallsStatus": {
      const requestOrigin = sender.origin ?? undefined;
      handleWalletShowCallsStatus(message.bundleId, requestOrigin);
      return false;
    }

    case "getPendingBatchTxRequests": {
      getPendingBatchTxRequests().then((requests) => {
        sendResponse(requests);
      });
      return true;
    }

    case "confirmBatchTransactionAsync": {
      handleConfirmBatchTransaction(
        message.bundleId,
        message.password,
        message.functionNames,
        message.forceInclusion,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "confirmBatchTransactionAsyncPK": {
      handleConfirmBatchTransactionPK(
        message.bundleId,
        message.password,
        message.tabId,
        message.functionNames,
        message.gasEstimates,
        message.forceInclusion,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "rejectBatchTransaction": {
      handleRejectBatchTransaction(message.bundleId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "getDelegationStatus": {
      handleGetDelegationStatus(message.accountId, message.chainId).then(
        (result) => sendResponse(result),
      );
      return true;
    }

    case "probeDelegateContract": {
      handleProbeDelegateContract(message.chainId, message.address).then(
        (result) => sendResponse(result),
      );
      return true;
    }

    case "setCustomDelegate": {
      handleSetCustomDelegate(
        message.accountId,
        message.chainId,
        message.delegate,
      ).then((result) => sendResponse(result));
      return true;
    }

    case "removeCustomDelegate": {
      handleRemoveCustomDelegate(message.accountId, message.chainId).then(
        (result) => sendResponse(result),
      );
      return true;
    }

    case "initiateRevokeDelegation": {
      handleInitiateRevokeDelegation(
        message.accountId,
        message.chainId,
      ).then((result) => sendResponse(result));
      return true;
    }

    case "initiateSetDelegation": {
      handleInitiateSetDelegation(
        message.accountId,
        message.chainId,
        message.targetDelegate,
      ).then((result) => sendResponse(result));
      return true;
    }

    case "splitBatchIntoIndividualTxs": {
      const senderWindowId = sender.tab?.windowId;
      handleSplitBatchIntoIndividualTxs(
        message.bundleId,
        senderWindowId,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "removeCallFromPendingBatch": {
      handleRemoveCallFromPendingBatch(
        message.bundleId,
        message.callIndex,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "updateCallInPendingBatch": {
      handleUpdateCallInPendingBatch(
        message.bundleId,
        message.callIndex,
        message.newData,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "updatePendingTxRequestData": {
      updatePendingTxRequestData(message.txId, message.newData)
        .then(() => sendResponse({ success: true }))
        .catch((err) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      return true;
    }

    case "addToCrossDappBatch": {
      handleAddToCrossDappBatch(message.txId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "addCallsToCrossDappBatch": {
      handleAddCallsToCrossDappBatch(message.bundleId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "removeFromCrossDappBatch": {
      handleRemoveFromCrossDappBatch(message.txId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "updateCallInCrossDappBatch": {
      handleUpdateCallInCrossDappBatch(message.txId, message.newData).then(
        (result) => {
          sendResponse(result);
        },
      );
      return true;
    }

    case "rejectCrossDappBatch": {
      handleRejectCrossDappBatch().then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "confirmCrossDappBatch": {
      handleConfirmCrossDappBatch(
        message.password,
        message.gasEstimates,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "getPendingTxRequests": {
      getPendingTxRequests().then((requests) => {
        sendResponse(requests);
      });
      return true;
    }

    case "getPendingTransaction": {
      (async () => {
        const { getPendingTxRequestById } = await import("./pendingTxStorage");
        const request = await getPendingTxRequestById(message.txId);
        if (request) {
          sendResponse({
            tx: request.tx,
            origin: request.origin,
            chainName: request.chainName,
            favicon: request.favicon,
          });
        } else {
          sendResponse(null);
        }
      })();
      return true;
    }

    case "isApiKeyCached": {
      sendResponse(isApiKeyCached());
      return false;
    }

    case "confirmTransaction": {
      handleConfirmTransaction(message.txId, message.password).then(
        async (result) => {
          await removePendingTxRequest(message.txId);
          await writeResultToStorage(`txResult:${message.txId}`, result);
          sendResponse(result);
        },
      );
      return true;
    }

    case "rejectTransaction": {
      handleRejectTransaction(message.txId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "cancelTransaction": {
      handleCancelTransaction(message.txId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "clearApiKeyCache": {
      clearCachedApiKey();
      sendResponse({ success: true });
      return false;
    }

    case "unlockWallet": {
      handleUnlockWallet(message.password).then((result) => {
        if (result.success) {
          // Broadcast so any other open UI surface (sidepanel + full-screen
          // tab simultaneously) auto-unlocks. The message carries no secrets;
          // each surface re-queries its own state from the SW cache.
          chrome.runtime.sendMessage({ type: "walletUnlockedExternal" }).catch(() => {});
        }
        sendResponse(result);
      });
      return true;
    }

    case "lockWallet": {
      (async () => {
        await clearAllAuthState();
        chrome.runtime.sendMessage({ type: "walletLockedExternal" }).catch(() => {});
        sendResponse({ success: true });
      })();
      return true; // async response
    }

    // Account management handlers
    case "getAccounts": {
      getAccounts().then((accounts) => {
        sendResponse(accounts);
      });
      return true;
    }

    case "getActiveAccount": {
      getActiveAccount().then((account) => {
        sendResponse(account);
      });
      return true;
    }

    case "setActiveAccount": {
      (async () => {
        await setActiveAccountId(message.accountId);
        const account = await getAccountById(message.accountId);
        if (account) {
          await chrome.storage.sync.set({
            address: account.address,
            displayAddress: account.displayName || account.address,
          });
        }
        chrome.runtime.sendMessage({ type: "accountsUpdated" }).catch(() => {});
        sendResponse({ success: true });
      })();
      return true;
    }

    case "getTabAccount": {
      const tabId = message.tabId || sender.tab?.id;
      if (tabId) {
        getTabAccount(tabId).then((account) => {
          sendResponse(account);
        });
      } else {
        getActiveAccount().then((account) => {
          sendResponse(account);
        });
      }
      return true;
    }

    case "setTabAccount": {
      const tabId = message.tabId || sender.tab?.id;
      if (tabId) {
        setTabAccount(tabId, message.accountId).then(() => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false, error: "No tab ID" });
      }
      return true;
    }

    case "migrateFromLegacy": {
      // Only extension pages (popup / sidepanel) may trigger migration
      if (!isExtensionPage(sender)) {
        sendResponse({ migrated: false });
        return false;
      }
      migrateFromLegacyStorage().then((migrated) => {
        sendResponse({ migrated });
      });
      return true;
    }

    case "addBankrAccount": {
      (async () => {
        try {
          // SECURITY: Block API key changes when unlocked with agent password.
          // Resolve via session restore so post-SW-restart agent sessions are caught.
          if (message.apiKey) {
            const passwordType = await resolvePasswordType(handleUnlockWallet);
            if (passwordType === "agent") {
              sendResponse({
                success: false,
                error: "Adding accounts with API keys requires master password",
              });
              return;
            }
          }

          // If apiKey is provided and wallet is unlocked, save it first
          if (message.apiKey) {
            let password = getCachedPassword();

            // If no cached password, try session restoration (for "Never" auto-lock mode)
            if (!password) {
              const autoLockTimeout = await getAutoLockTimeout();
              if (autoLockTimeout === 0) {
                const restored = await tryRestoreSession(handleUnlockWallet);
                if (restored) {
                  password = getCachedPassword();
                }
              }
            }

            if (password) {
              const vaultKey = getCachedVaultKey();
              if (vaultKey) {
                const encrypted = await encryptWithVaultKey(
                  vaultKey,
                  message.apiKey,
                );
                await chrome.storage.local.set({
                  encryptedApiKeyVault: encrypted,
                });
              } else {
                const { saveEncryptedApiKey } = await import("./crypto");
                await saveEncryptedApiKey(message.apiKey, password);
              }
              setCachedApiKeyDirect(message.apiKey);
            }
          }

          const account = await addBankrAccount(
            message.address,
            message.displayName,
          );
          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true, account });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to add account",
          });
        }
      })();
      return true;
    }

    case "addImpersonatorAccount": {
      (async () => {
        try {
          // SECURITY: Block when unlocked with agent password.
          // Resolve via session restore so post-SW-restart agent sessions are caught.
          const passwordType = await resolvePasswordType(handleUnlockWallet);
          if (passwordType === "agent") {
            sendResponse({
              success: false,
              error: "Adding accounts requires master password",
            });
            return;
          }
          const account = await addImpersonatorAccount(
            message.address,
            message.displayName,
          );
          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true, account });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to add account",
          });
        }
      })();
      return true;
    }

    case "generateMnemonic": {
      // SECURITY: Only extension pages can generate mnemonics
      if (!isExtensionPage(sender)) {
        sendResponse({ success: false, error: "Unauthorized" });
        return false;
      }
      const mnemonic = generateNewMnemonic();
      sendResponse({ success: true, mnemonic });
      return false;
    }

    case "previewSeedAddresses": {
      (async () => {
        try {
          const {
            mnemonic: rawMnemonic,
            seedGroupId,
            start,
            count,
          } = message as {
            mnemonic?: string;
            seedGroupId?: string;
            start?: number;
            count?: number;
          };

          let mnemonic: string | null = null;
          if (rawMnemonic) {
            if (!isValidMnemonic(rawMnemonic)) {
              sendResponse({
                success: false,
                error: "Invalid seed phrase (must be 12 words)",
              });
              return;
            }
            mnemonic = rawMnemonic.trim();
          } else if (seedGroupId) {
            // Existing-group preview: decrypt the stored mnemonic. Requires
            // unlocked wallet (master, not agent — same gate as deriveSeedAccount).
            const passwordType = await resolvePasswordType(handleUnlockWallet);
            if (passwordType === "agent") {
              sendResponse({
                success: false,
                error: "Deriving accounts requires master password",
              });
              return;
            }
            let password = getCachedPassword();
            if (!password) {
              const autoLockTimeout = await getAutoLockTimeout();
              if (autoLockTimeout === 0) {
                const restored = await tryRestoreSession(handleUnlockWallet);
                if (restored) password = getCachedPassword();
              }
            }
            if (!password) {
              sendResponse({
                success: false,
                error: "Wallet must be unlocked",
              });
              return;
            }
            const stored = await getMnemonic(seedGroupId, password);
            if (!stored) {
              sendResponse({
                success: false,
                error: "Seed phrase not found",
              });
              return;
            }
            mnemonic = stored;
          } else {
            sendResponse({
              success: false,
              error: "Either mnemonic or seedGroupId is required",
            });
            return;
          }

          const startIdx = Math.max(0, Math.floor(start ?? 0));
          const total = Math.max(1, Math.min(20, Math.floor(count ?? 5)));
          const existingAddresses = new Set(
            (await getAccounts()).map((a) => a.address.toLowerCase()),
          );
          const items = [] as Array<{
            index: number;
            address: string;
            exists: boolean;
          }>;
          for (let i = 0; i < total; i++) {
            const idx = startIdx + i;
            const pk = deriveSeedPrivateKey(mnemonic, idx);
            const address = deriveAddress(pk);
            items.push({
              index: idx,
              address,
              exists: existingAddresses.has(address.toLowerCase()),
            });
          }
          sendResponse({ success: true, items });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to preview seed phrase addresses",
          });
        }
      })();
      return true;
    }

    case "addSeedPhraseGroup": {
      (async () => {
        try {
          // SECURITY: Block when unlocked with agent password.
          // Resolve via session restore so post-SW-restart agent sessions are caught.
          const passwordType = await resolvePasswordType(handleUnlockWallet);
          if (passwordType === "agent") {
            sendResponse({
              success: false,
              error: "Adding seed phrases requires master password",
            });
            return;
          }
          let password = getCachedPassword();

          // If no cached password, try session restoration (for "Never" auto-lock mode)
          if (!password) {
            const autoLockTimeout = await getAutoLockTimeout();
            if (autoLockTimeout === 0) {
              const restored = await tryRestoreSession(handleUnlockWallet);
              if (restored) {
                password = getCachedPassword();
              }
            }
          }

          if (!password) {
            sendResponse({ success: false, error: "Wallet must be unlocked" });
            return;
          }

          // Generate or validate mnemonic
          let mnemonic: string;
          if (message.mnemonic) {
            if (!isValidMnemonic(message.mnemonic)) {
              sendResponse({
                success: false,
                error: "Invalid seed phrase (must be 12 words)",
              });
              return;
            }
            mnemonic = message.mnemonic.trim();
          } else {
            mnemonic = generateNewMnemonic();
          }

          // Normalize indices: caller can pass a sorted+deduped list, or omit
          // for the legacy "import index 0 only" behavior.
          const rawIndices = Array.isArray(message.indices)
            ? (message.indices as unknown[])
            : [0];
          const indices = Array.from(
            new Set(
              rawIndices
                .map((n) => Math.floor(Number(n)))
                .filter((n) => Number.isFinite(n) && n >= 0),
            ),
          ).sort((a, b) => a - b);
          if (indices.length === 0) {
            sendResponse({
              success: false,
              error: "At least one derivation index is required",
            });
            return;
          }

          const importableCandidates: Array<{
            index: number;
            address: string;
          }> = [];
          for (const idx of indices) {
            const privateKey = deriveSeedPrivateKey(mnemonic, idx);
            const address = deriveAddress(privateKey);
            const existingAccount = await findAccountByAddress(address);
            if (!existingAccount || existingAccount.type === "privateKey") {
              importableCandidates.push({ index: idx, address });
            }
          }

          if (importableCandidates.length === 0) {
            sendResponse({
              success: false,
              error: "All selected addresses already exist in this wallet",
            });
            return;
          }

          const group = await addSeedGroup(message.name);
          let mnemonicStored = false;

          // Store the mnemonic only after at least one selected address can be
          // imported or converted. Failed duplicate-only imports must not leave
          // orphaned seed material in storage.
          try {
            await storeMnemonic(group.id, mnemonic, password);
            mnemonicStored = true;
          } catch (error) {
            await removeSeedGroup(group.id);
            throw error;
          }

          const importedAccounts: SeedPhraseAccount[] = [];
          for (const candidate of importableCandidates) {
            // Check if address already exists (PK → seed phrase conversion)
            const existingAccount = await findAccountByAddress(
              candidate.address,
            );
            let account: SeedPhraseAccount;

            if (existingAccount) {
              if (existingAccount.type === "privateKey") {
                const converted = await convertToSeedPhraseAccount(
                  existingAccount.id,
                  group.id,
                  candidate.index,
                );
                if (!converted) throw new Error("Failed to convert account");
                account = converted;
              } else {
                // Skip duplicates that are already seed/bankr/impersonator.
                // We don't want to fail the whole import for one collision.
                continue;
              }
            } else {
              const privateKey = deriveSeedPrivateKey(
                mnemonic,
                candidate.index,
              );
              account = await addSeedPhraseAccount(
                candidate.address,
                group.id,
                candidate.index,
                // Only apply the user-supplied display name to the first
                // imported account so multi-imports don't collide on name.
                importedAccounts.length === 0
                  ? message.accountDisplayName || undefined
                  : undefined,
              );
              await addKeyToVault(account.id, privateKey, password);
            }
            importedAccounts.push(account);
          }

          if (importedAccounts.length === 0) {
            if (mnemonicStored) await removeMnemonic(group.id);
            await removeSeedGroup(group.id);
            sendResponse({
              success: false,
              error: "All selected addresses already exist in this wallet",
            });
            return;
          }

          await updateSeedGroupCount(group.id, importedAccounts.length);

          // Update cached vault
          const vault = await decryptAllKeys(password);
          if (vault) setCachedVault(vault);

          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({
            success: true,
            account: importedAccounts[0],
            accounts: importedAccounts,
            group,
            mnemonic: message.mnemonic ? undefined : mnemonic, // Only return if generated
          });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to create seed phrase",
          });
        }
      })();
      return true;
    }

    case "deriveSeedAccount": {
      (async () => {
        try {
          // SECURITY: Block when unlocked with agent password.
          // Resolve via session restore so post-SW-restart agent sessions are caught.
          const passwordType = await resolvePasswordType(handleUnlockWallet);
          if (passwordType === "agent") {
            sendResponse({
              success: false,
              error: "Deriving accounts requires master password",
            });
            return;
          }
          let password = getCachedPassword();

          // If no cached password, try session restoration (for "Never" auto-lock mode)
          if (!password) {
            const autoLockTimeout = await getAutoLockTimeout();
            if (autoLockTimeout === 0) {
              const restored = await tryRestoreSession(handleUnlockWallet);
              if (restored) {
                password = getCachedPassword();
              }
            }
          }

          if (!password) {
            sendResponse({ success: false, error: "Wallet must be unlocked" });
            return;
          }

          const { seedGroupId } = message;
          const mnemonic = await getMnemonic(seedGroupId, password);
          if (!mnemonic) {
            sendResponse({
              success: false,
              error: "Seed phrase not found or wrong password",
            });
            return;
          }

          const accounts = await getAccounts();
          const groupAccounts = accounts.filter(
            (a) =>
              a.type === "seedPhrase" && (a as any).seedGroupId === seedGroupId,
          );

          // Caller may pass `indices: number[]` to derive multiple at once.
          // Legacy callers pass nothing → derive the next (max+1) index.
          let indices: number[];
          if (Array.isArray(message.indices)) {
            indices = Array.from(
              new Set(
                (message.indices as unknown[])
                  .map((n) => Math.floor(Number(n)))
                  .filter((n) => Number.isFinite(n) && n >= 0),
              ),
            ).sort((a, b) => a - b);
          } else {
            const nextIndex =
              groupAccounts.length > 0
                ? Math.max(
                    ...groupAccounts.map((a) => (a as any).derivationIndex),
                  ) + 1
                : 0;
            indices = [nextIndex];
          }

          if (indices.length === 0) {
            sendResponse({
              success: false,
              error: "At least one derivation index is required",
            });
            return;
          }

          const newAccounts: SeedPhraseAccount[] = [];
          for (const idx of indices) {
            const privateKey = deriveSeedPrivateKey(mnemonic, idx);
            const address = deriveAddress(privateKey);

            const existingAccount = await findAccountByAddress(address);
            let account: SeedPhraseAccount;

            if (existingAccount) {
              if (existingAccount.type === "privateKey") {
                const converted = await convertToSeedPhraseAccount(
                  existingAccount.id,
                  seedGroupId,
                  idx,
                );
                if (!converted) throw new Error("Failed to convert account");
                account = converted;
              } else {
                // Already a seed-phrase / bankr / impersonator account.
                // Skip silently so a multi-derive doesn't fail on one collision.
                continue;
              }
            } else {
              account = await addSeedPhraseAccount(
                address,
                seedGroupId,
                idx,
                // Only apply the display name to the first new account.
                newAccounts.length === 0
                  ? message.displayName || undefined
                  : undefined,
              );
              await addKeyToVault(account.id, privateKey, password);
            }
            newAccounts.push(account);
          }

          if (newAccounts.length === 0) {
            sendResponse({
              success: false,
              error: "All selected addresses already exist in this wallet",
            });
            return;
          }

          await updateSeedGroupCount(
            seedGroupId,
            groupAccounts.length + newAccounts.length,
          );

          // Update cached vault
          const vault = await decryptAllKeys(password);
          if (vault) setCachedVault(vault);

          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({
            success: true,
            account: newAccounts[0],
            accounts: newAccounts,
          });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to derive account",
          });
        }
      })();
      return true;
    }

    case "revealSeedPhrase": {
      // SECURITY: Only extension pages can reveal seed phrases
      if (!isExtensionPage(sender)) {
        sendResponse({ success: false, error: "Unauthorized" });
        return true;
      }
      (async () => {
        try {
          const { seedGroupId, password } = message;

          if (!getCachedPassword()) {
            const autoLockTimeout = await getAutoLockTimeout();
            if (autoLockTimeout === 0) {
              await tryRestoreSession(handleUnlockWallet);
            }
          }

          const cachedPwd = getCachedPassword();
          if (!cachedPwd) {
            sendResponse({ success: false, error: "Wallet is locked" });
            return;
          }

          // SECURITY: Block when unlocked with agent password.
          // Session was already restored above, so resolvePasswordType reads the cached value.
          const seedRevealPasswordType = await resolvePasswordType(handleUnlockWallet);
          if (seedRevealPasswordType === "agent") {
            sendResponse({
              success: false,
              error: "Seed phrase reveal requires master password",
              requiresMasterPassword: true,
            });
            return;
          }

          if (password !== cachedPwd) {
            sendResponse({ success: false, error: "Invalid password" });
            return;
          }

          const mnemonic = await getMnemonic(seedGroupId, cachedPwd);
          if (!mnemonic) {
            sendResponse({ success: false, error: "Seed phrase not found" });
            return;
          }

          sendResponse({ success: true, mnemonic });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to reveal seed phrase",
          });
        }
      })();
      return true;
    }

    case "getSeedGroups": {
      getSeedGroups().then((groups) => {
        sendResponse(groups);
      });
      return true;
    }

    case "renameSeedGroup": {
      const newName = (typeof message.name === "string" ? message.name : "")
        .trim()
        .slice(0, 100);
      if (!message.seedGroupId || !newName) {
        sendResponse({ success: false, error: "Missing seedGroupId or name" });
        return true;
      }
      renameSeedGroup(message.seedGroupId, newName)
        .then(() => {
          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Failed to rename",
          });
        });
      return true;
    }

    case "updateAccountDisplayName": {
      const displayName =
        typeof message.displayName === "string"
          ? message.displayName.slice(0, 100)
          : "";
      updateAccountDisplayName(message.accountId, displayName)
        .then(() => {
          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Failed to update",
          });
        });
      return true;
    }

    case "addPrivateKeyAccount": {
      (async () => {
        // SECURITY: Block adding accounts when unlocked with agent password.
        // Resolve via session restore so post-SW-restart agent sessions are caught.
        const passwordType = await resolvePasswordType(handleUnlockWallet);
        if (passwordType === "agent") {
          sendResponse({
            success: false,
            error: "Adding accounts requires master password",
          });
          return;
        }

        let password = message.password || getCachedPassword();

        if (!password) {
          const autoLockTimeout = await getAutoLockTimeout();
          if (autoLockTimeout === 0) {
            const restored = await tryRestoreSession(handleUnlockWallet);
            if (restored) {
              password = getCachedPassword();
            }
          }
        }

        if (!password) {
          sendResponse({ success: false, error: "Wallet is locked" });
          return;
        }

        const result = await handleAddPrivateKeyAccount(
          message.privateKey,
          password,
          message.displayName,
        );
        sendResponse(result);
      })();
      return true;
    }

    case "removeAccount": {
      (async () => {
        // SECURITY: Block account removal when unlocked with agent password.
        // Resolve via session restore so post-SW-restart agent sessions are caught.
        const passwordType = await resolvePasswordType(handleUnlockWallet);
        if (passwordType === "agent") {
          sendResponse({
            success: false,
            error: "Account removal requires master password",
          });
          return;
        }
        const result = await handleRemoveAccount(message.accountId);
        sendResponse(result);
      })();
      return true;
    }

    case "revealPrivateKey": {
      // SECURITY: Only extension pages can reveal private keys
      if (!isExtensionPage(sender)) {
        sendResponse({ success: false, error: "Unauthorized" });
        return true;
      }
      (async () => {
        try {
          const { accountId, password } = message;

          if (!getCachedPassword()) {
            const autoLockTimeout = await getAutoLockTimeout();
            if (autoLockTimeout === 0) {
              await tryRestoreSession(handleUnlockWallet);
            }
          }

          const cachedPwd = getCachedPassword();
          if (!cachedPwd) {
            sendResponse({ success: false, error: "Wallet is locked" });
            return;
          }

          // SECURITY: Block private key reveal when unlocked with agent password.
          // Session was already restored above, so resolvePasswordType reads the cached value.
          const pkRevealPasswordType = await resolvePasswordType(handleUnlockWallet);
          if (pkRevealPasswordType === "agent") {
            sendResponse({
              success: false,
              error: "Private key reveal requires master password",
              requiresMasterPassword: true,
            });
            return;
          }

          if (password !== cachedPwd) {
            sendResponse({ success: false, error: "Invalid password" });
            return;
          }

          // Try cached vault first
          let privateKey = getPrivateKeyFromCache(accountId);
          if (!privateKey) {
            const vault = await decryptAllKeys(cachedPwd);
            if (!vault) {
              sendResponse({
                success: false,
                error: "Failed to decrypt vault",
              });
              return;
            }
            setCachedVault(vault);
            privateKey = getPrivateKeyFromCache(accountId);
          }
          if (!privateKey) {
            sendResponse({
              success: false,
              error: "Private key not found for this account",
            });
            return;
          }
          sendResponse({ success: true, privateKey });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to reveal private key",
          });
        }
      })();
      return true;
    }

    case "confirmSignatureRequest": {
      const tabId = message.tabId || sender.tab?.id;
      (async () => {
        let result: SignatureResult;
        // SECURITY: route by the pinned account type (captured at arrival),
        // not by whatever is active right now.
        const { getPendingSignatureRequestById } = await import(
          "./pendingSignatureStorage"
        );
        const pending = await getPendingSignatureRequestById(message.sigId);
        let pinnedType = pending?.accountType;
        if (!pinnedType && pending?.accountId) {
          const pinnedAcc = await getAccountById(pending.accountId);
          pinnedType = pinnedAcc?.type as typeof pinnedType;
        }
        if (pinnedType === "bankr") {
          result = await handleConfirmSignatureRequestBankr(
            message.sigId,
            message.password,
            message.allowUnsafeSiwe === true,
          );
        } else if (
          pinnedType === "privateKey" ||
          pinnedType === "seedPhrase"
        ) {
          result = await handleConfirmSignatureRequest(
            message.sigId,
            message.password,
            tabId,
            message.allowUnsafeSiwe === true,
          );
        } else {
          result = {
            success: false,
            error: "Pending request is no longer valid",
          };
        }
        await writeResultToStorage(`sigResult:${message.sigId}`, result);
        sendResponse(result);
      })();
      return true;
    }

    case "estimateGas": {
      estimateGas(message.tx, message.accountAddress, {
        eip7702Delegate: message.eip7702Delegate,
        eip7702AuthCount: message.eip7702AuthCount,
      }).then(sendResponse);
      return true;
    }

    case "estimateForceInclusionGas": {
      import("./forceInclusion").then(({ estimateForceInclusionGas }) => {
        estimateForceInclusionGas(message.tx, message.accountAddress).then(sendResponse);
      });
      return true;
    }

    case "estimateBatchGasSequential": {
      estimateBatchGasSequential(message.calls, message.fromAddress, message.chainId).then(sendResponse);
      return true;
    }

    case "simulateAssetChanges": {
      simulateAssetChanges(message.tx, message.accountAddress).then(sendResponse);
      return true;
    }

    case "simulateBatchAssetChanges": {
      simulateBatchAssetChanges(message.calls, message.fromAddress, message.chainId).then(sendResponse);
      return true;
    }

    case "simulateBatchAssetChangesNonAtomic": {
      simulateBatchAssetChangesNonAtomic(message.calls, message.fromAddress, message.chainId).then(sendResponse);
      return true;
    }

    case "retryTokenMetadata": {
      retryTokenMetadata(message.chainId, message.tokenChanges, message.accountAddress).then(sendResponse);
      return true;
    }

    case "confirmTransactionAsyncPK": {
      const tabId = message.tabId || sender.tab?.id;
      handleConfirmTransactionAsyncPK(
        message.txId,
        message.password,
        tabId,
        message.functionName,
        message.gasOverrides,
        message.forceInclusion,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "isWalletUnlocked": {
      (async () => {
        let unlocked = isWalletUnlocked();
        if (!unlocked) {
          const autoLockTimeout = await getAutoLockTimeout();
          if (autoLockTimeout === 0) {
            const restored = await tryRestoreSession(handleUnlockWallet);
            if (restored) {
              unlocked = true;
            }
          }
        }
        sendResponse(unlocked);
      })();
      return true;
    }

    case "validateSession": {
      sendResponse({
        valid: getCurrentSessionId() !== null && isWalletUnlocked(),
        sessionId: getCurrentSessionId(),
      });
      return false;
    }

    case "tryRestoreSession": {
      tryRestoreSession(handleUnlockWallet).then((restored) => {
        sendResponse(restored);
      });
      return true;
    }

    case "saveBankrApiKeyAndAddress": {
      (async () => {
        try {
          const accountId =
            typeof message.accountId === "string" ? message.accountId : "";
          const apiKey =
            typeof message.apiKey === "string" ? message.apiKey.trim() : "";
          const address =
            typeof message.address === "string" ? message.address.trim() : "";

          if (!accountId || !apiKey || !address) {
            sendResponse({
              success: false,
              error: "Missing account, API key, or address",
            });
            return;
          }

          await validateBankrAccountAddressUpdate(accountId, address);

          const saveResult = await handleSaveApiKeyWithCachedPassword(apiKey);
          if (!saveResult.success) {
            sendResponse(saveResult);
            return;
          }

          const updated = await updateBankrAccountAddress(accountId, address);
          const activeAccount = await getActiveAccount();
          if (activeAccount?.id === updated.id) {
            await chrome.storage.sync.set({
              address: updated.address,
              displayAddress: updated.displayName || updated.address,
            });
          }

          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true, account: updated });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to save configuration",
          });
        }
      })();
      return true;
    }

    case "saveApiKeyWithCachedPassword": {
      handleSaveApiKeyWithCachedPassword(message.apiKey).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "getCachedPassword": {
      (async () => {
        let hasCached = getCachedPassword() !== null;

        // If no cached password, try session restoration (for "Never" auto-lock mode)
        if (!hasCached) {
          const autoLockTimeout = await getAutoLockTimeout();
          if (autoLockTimeout === 0) {
            const restored = await tryRestoreSession(handleUnlockWallet);
            if (restored) {
              hasCached = getCachedPassword() !== null;
            }
          }
        }

        sendResponse({ hasCachedPassword: hasCached });
      })();
      return true;
    }

    case "changePasswordWithCachedPassword": {
      handleChangePasswordWithCachedPassword(message.newPassword).then(
        (result) => {
          sendResponse(result);
        },
      );
      return true;
    }

    case "getCachedApiKey": {
      // SECURITY: Only extension pages can access the API key
      if (!isExtensionPage(sender)) {
        sendResponse({ apiKey: null });
        return true;
      }
      (async () => {
        let apiKey = getCachedApiKey();
        if (!apiKey) {
          const autoLockTimeout = await getAutoLockTimeout();
          if (autoLockTimeout === 0) {
            const restored = await tryRestoreSession(handleUnlockWallet);
            if (restored) {
              apiKey = getCachedApiKey();
            }
          }
        }
        // SECURITY: Agent sessions cannot read the long-term Bankr API key.
        if (getPasswordType() !== "master") {
          sendResponse({ apiKey: null });
          return;
        }
        sendResponse({ apiKey: apiKey || null });
      })();
      return true;
    }

    case "setAgentPassword": {
      handleSetAgentPassword(message.agentPassword).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "removeAgentPassword": {
      handleRemoveAgentPassword(message.masterPassword).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "isAgentPasswordEnabled": {
      (async () => {
        const { agentPasswordEnabled } = await chrome.storage.local.get(
          "agentPasswordEnabled",
        );
        sendResponse({ enabled: !!agentPasswordEnabled });
      })();
      return true;
    }

    case "getPasswordType": {
      sendResponse({ passwordType: getPasswordType() });
      return false;
    }

    case "rpcRequest": {
      const rpcResultKey = `rpcResult:${message.rpcId}`;
      handleRpcRequest(message.rpcUrl, message.method, message.params)
        .then((result) => writeResultToStorage(rpcResultKey, { result }))
        .catch((error) => writeResultToStorage(rpcResultKey, { error: error.message }));
      return false;
    }

    case "setArcBrowser": {
      if (message.isArc) {
        chrome.storage.sync.set({
          sidePanelMode: false,
          isArcBrowser: true,
        });
        // Restore native popup so clicks work on Arc
        chrome.action.setPopup({ popup: POPUP_PATH }).catch(() => {});
      }
      sendResponse({ success: true });
      return false;
    }

    case "isSidePanelSupported": {
      isSidePanelSupportedAsync().then((supported) => {
        sendResponse({ supported });
      });
      return true;
    }

    case "getSidePanelMode": {
      getSidePanelMode().then((enabled) => {
        sendResponse({ enabled });
      });
      return true;
    }

    case "setSidePanelMode": {
      setSidePanelMode(message.enabled).then((success) => {
        sendResponse({ success, sidePanelWorks: success || !message.enabled });
      });
      return true;
    }

    case "getAutoLockTimeout": {
      getAutoLockTimeout().then((timeout) => {
        sendResponse({ timeout });
      });
      return true;
    }

    case "setAutoLockTimeout": {
      setAutoLockTimeout(message.timeout).then((success) => {
        sendResponse({ success });
      });
      return true;
    }

    case "openPopupWindow": {
      openPopupWindow().then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    case "confirmTransactionAsync": {
      handleConfirmTransactionAsync(
        message.txId,
        message.password,
        message.functionName,
        message.forceInclusion,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "initiateTransfer": {
      handleInitiateTransfer(message).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "fetchSwapPrice": {
      fetchSwapPrice({
        chainId: message.chainId,
        sellToken: message.sellToken,
        buyToken: message.buyToken,
        sellAmount: message.sellAmount,
        taker: message.taker,
        slippageBps: message.slippageBps,
      })
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchSwapQuote": {
      fetchSwapQuote({
        chainId: message.chainId,
        sellToken: message.sellToken,
        buyToken: message.buyToken,
        sellAmount: message.sellAmount,
        taker: message.taker,
        slippageBps: message.slippageBps,
      })
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchBridgeQuote": {
      fetchBridgeQuote({
        userAddress: message.userAddress,
        receiverAddress: message.receiverAddress,
        originChainId: message.originChainId,
        destinationChainId: message.destinationChainId,
        inputToken: message.inputToken,
        outputToken: message.outputToken,
        inputAmount: message.inputAmount,
        slippage: message.slippage,
      })
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchBridgeBuildTx": {
      fetchBridgeBuildTx(message.quoteId)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchBridgeStatus": {
      fetchBridgeStatus({
        requestHash: message.requestHash,
        txHash: message.txHash,
      })
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchBridgeChains": {
      // Two variants: source-only (filtered to signable chains) and the
      // full destination list. UI picks per side.
      const chainPromise =
        message.side === "destination"
          ? getBridgeDestinationChains()
          : getBridgeSourceChains(message.accountType);
      chainPromise
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchBridgeChainsRaw": {
      // Raw cached Bungee chain list (used when UI wants the unfiltered set).
      getCachedBungeeChains()
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchBridgeTokens": {
      getCachedBungeeTokens(message.chainId)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchTokenInfo": {
      fetchTokenInfo(message.tokenAddress, message.chainId)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "resolveTokenMetadata": {
      resolveTokenMetadata(message.chainId, String(message.tokenAddress || ""))
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "lookupCustomToken": {
      // Read-only lookup against the user's customTokens storage.
      // Used by inline token-amount views as a logo fallback when the swap
      // list / centralized metadata resolver doesn't have the address.
      (async () => {
        try {
          const tokens = await getCustomTokens();
          const addr = String(message.tokenAddress || "").toLowerCase();
          const match = tokens.find(
            (t) =>
              t.chainId === Number(message.chainId) &&
              t.contractAddress === addr,
          );
          sendResponse({ success: true, data: match || null });
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
    }

    case "addCustomToken": {
      (async () => {
        try {
          const token: Parameters<typeof addCustomToken>[0] = {
            chainId: Number(message.chainId),
            contractAddress: String(message.contractAddress || ""),
            symbol: String(message.symbol || ""),
            name: String(message.name || ""),
            decimals: Number(message.decimals),
          };
          if (typeof message.image === "string") {
            token.image = message.image;
          }
          await addCustomToken(token);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
    }

    case "updateCustomToken": {
      (async () => {
        try {
          const updates: Parameters<typeof updateCustomToken>[2] = {};
          if ("name" in message) updates.name = String(message.name || "");
          if ("symbol" in message) updates.symbol = String(message.symbol || "");
          if ("decimals" in message) updates.decimals = Number(message.decimals);
          if ("image" in message && typeof message.image === "string") {
            updates.image = message.image;
          }

          await updateCustomToken(
            Number(message.chainId),
            String(message.contractAddress || ""),
            updates,
          );
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
    }

    case "removeCustomToken": {
      (async () => {
        try {
          await removeCustomToken(
            Number(message.chainId),
            String(message.contractAddress || ""),
          );
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
    }

    case "fetchTokenPrice": {
      fetchTokenPrice(message.chainId, message.address)
        .then((priceUsd) =>
          sendResponse({ success: true, priceUsd }),
        )
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchNativePrice": {
      fetchNativePrice(message.chainId)
        .then((priceUsd) =>
          sendResponse({ success: true, priceUsd: priceUsd ?? 0 }),
        )
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "cacheAvatarImage": {
      // SECURITY: Only extension pages can trigger avatar fetches. Content
      // scripts could otherwise enumerate any URL via this proxy.
      if (!isExtensionPage(sender)) {
        sendResponse({ dataUrl: null });
        return false;
      }
      const url = typeof message.url === "string" ? message.url : "";
      if (!url) {
        sendResponse({ dataUrl: null });
        return false;
      }
      fetchAndCacheAvatarImage(url)
        .then((dataUrl) => sendResponse({ dataUrl }))
        .catch(() => sendResponse({ dataUrl: null }));
      return true;
    }

    case "resolveCoinGeckoNativeAssets": {
      resolveCoinGeckoNativeAssetsBatch(message.requests)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "resolveCoinGeckoErc20Prices": {
      resolveCoinGeckoErc20PricesBatch(message.requests)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchSwapTokenList": {
      getCachedTokenList(message.chainId)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchTokenLogo": {
      // Lightweight per-token logo lookup. Returns just `{ logoUrl }` so the
      // message payload stays under a kilobyte — avoids shipping the entire
      // swap token list across the popup ↔ background channel on every
      // render. The resolver shares swap-list, bridge-list, watched-asset,
      // and hardcoded-logo fallbacks.
      resolveTokenLogoUrl(message.chainId, String(message.tokenAddress || ""))
        .then((logoUrl) => sendResponse({ success: true, logoUrl }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "checkTokenAllowance": {
      checkTokenAllowance(
        message.tokenAddress,
        message.owner,
        message.spender,
        message.chainId,
      )
        .then((allowance) =>
          sendResponse({ success: true, allowance: allowance.toString() }),
        )
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "getTokenBalanceWei": {
      getTokenBalanceWei(
        message.tokenAddress,
        message.owner,
        message.chainId,
      )
        .then((balance) =>
          sendResponse({ success: true, balance: balance.toString() }),
        )
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "checkPermit2Allowance": {
      checkPermit2Allowance(
        message.token,
        message.owner,
        message.spender,
        message.chainId,
      )
        .then(({ amount, expiration }) =>
          sendResponse({
            success: true,
            amount: amount.toString(),
            expiration,
          }),
        )
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "executeSwapDirect": {
      handleExecuteSwapDirect(
        message.transactions,
        message.chainName,
        message.gasEstimates,
        {
          accountId: message.accountId,
          fromAddress: message.fromAddress,
        },
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "executeSwapBatch": {
      handleExecuteSwapBatch(
        message.batchTx,
        message.originalTransactions,
        message.chainId,
        message.chainName,
        {
          accountId: message.accountId,
          fromAddress: message.fromAddress,
        },
      ).then(sendResponse);
      return true;
    }

    case "executeSwapAtomicPK": {
      handleExecuteSwapAtomicPK({
        originalTransactions: message.originalTransactions,
        chainId: message.chainId,
        chainName: message.chainName,
        accountLock: {
          accountId: message.accountId,
          fromAddress: message.fromAddress,
        },
        gasOverrides: message.gasOverrides,
      }).then(sendResponse);
      return true;
    }

    case "sponsoredTransfer": {
      handleSponsoredTransfer(message).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "checkPremiumStatus": {
      handleCheckPremiumStatus(message.address).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "cancelProcessingTx": {
      handleCancelProcessingTx(message.txId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "getFailedTxResult": {
      const result = failedTxResults.get(message.notificationId);
      if (result) {
        failedTxResults.delete(message.notificationId);
        chrome.storage.local.remove(`notification-${message.notificationId}`);
      }
      sendResponse(result || null);
      return false;
    }

    case "clearFailedTxResult": {
      failedTxResults.delete(message.notificationId);
      chrome.storage.local.remove(`notification-${message.notificationId}`);
      sendResponse({ success: true });
      return false;
    }

    case "onboardingComplete": {
      chrome.runtime
        .sendMessage({ type: "onboardingComplete" })
        .catch(() => {});
      sendResponse({ success: true });
      return false;
    }

    case "getTxHistory": {
      getTxHistory().then((history) => {
        sendResponse(history);
      });
      return true;
    }

    case "backfillAssetChanges": {
      queueAssetChangesBackfill(String(message.txId || "")).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "getProcessingTxs": {
      getProcessingTxs().then((txs) => {
        sendResponse(txs);
      });
      return true;
    }

    case "clearTxHistory": {
      clearTxHistory().then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    case "clearTxHistoryForAddresses": {
      const addresses = Array.isArray(message.addresses)
        ? (message.addresses as unknown[]).filter(
            (a): a is string => typeof a === "string",
          )
        : [];
      clearTxHistoryForAddresses(addresses).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    case "clearNonceCache": {
      clearAllNonces();
      sendResponse({ success: true });
      return false;
    }

    case "checkPendingTxReceipt": {
      checkPendingTxReceiptFn(
        message.txId,
        message.txHash,
        message.chainId,
      ).then((result) => {
        sendResponse({ status: result });
      });
      return true;
    }

    case "resetExtension": {
      (async () => {
        // SECURITY: Block extension reset when unlocked with agent password.
        // Resolve via session restore so post-SW-restart agent sessions are caught.
        const passwordType = await resolvePasswordType(handleUnlockWallet);
        if (passwordType === "agent") {
          sendResponse({
            success: false,
            error: "Extension reset requires master password",
          });
          return;
        }

        try {
          // SECURITY: Perform full auth cleanup first (before async storage operations)
          await clearAllAuthState();

          await performSecurityReset();

          const allLocalStorage = await chrome.storage.local.get(null);
          const localKeys = getWalletLocalStorageKeysToRemove(allLocalStorage);

          await Promise.all([
            chrome.storage.local.remove(localKeys),
            chrome.storage.sync.remove([...WALLET_SYNC_STORAGE_KEYS]),
          ]);

          await chrome.action.setBadgeText({ text: "" });

          const notifications = await chrome.notifications.getAll();
          for (const notificationId of Object.keys(notifications)) {
            chrome.notifications.clear(notificationId);
          }

          sendResponse({ success: true });
        } catch (error) {
          console.error("Failed to reset extension:", error);
          sendResponse({ success: false, error: "Failed to reset extension" });
        }
      })();
      return true;
    }

    // Chat message handlers
    case "submitChatPrompt": {
      handleSubmitChatPrompt(
        message.conversationId,
        message.messageId,
        message.prompt,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "getChatConversations": {
      getConversations().then((conversations) => {
        sendResponse(conversations);
      });
      return true;
    }

    case "getChatConversation": {
      getConversation(message.conversationId).then((conversation) => {
        sendResponse(conversation);
      });
      return true;
    }

    case "createChatConversation": {
      createConversation(message.title).then((conversation) => {
        sendResponse(conversation);
      });
      return true;
    }

    case "deleteChatConversation": {
      deleteConversation(message.conversationId).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    case "addChatMessage": {
      addMessageToConversation(message.conversationId, message.message).then(
        (conversation) => {
          sendResponse(conversation);
        },
      );
      return true;
    }

    case "updateChatMessage": {
      updateMessageInConversation(
        message.conversationId,
        message.messageId,
        message.updates,
      ).then((conversation) => {
        sendResponse(conversation);
      });
      return true;
    }

    case "GET_CLEAR_SIGNING_DESCRIPTOR": {
      handleGetClearSigningDescriptor(message)
        .then((response) => sendResponse(response))
        .catch((err) =>
          sendResponse({
            descriptor: null,
            enabled: true,
            error: err?.message,
          }),
        );
      return true;
    }

    case "INVALIDATE_CLEAR_SIGNING_CACHE": {
      handleInvalidateClearSigningCache()
        .then((r) => sendResponse({ success: true, ...r }))
        .catch((err) => sendResponse({ success: false, error: err?.message }));
      return true;
    }

    case "getClearSigningEnabled": {
      getClearSigningEnabled()
        .then((enabled) => sendResponse({ enabled }))
        .catch((err) => sendResponse({ enabled: true, error: err?.message }));
      return true;
    }

    case "setClearSigningEnabled": {
      setClearSigningEnabled(!!message.value)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err?.message }));
      return true;
    }

    default: {
      if (message.type && typeof message.type === "string") {
        console.warn(`[WalletChan] Unknown message type: ${message.type}`);
      }
      break;
    }
  }

  return false;
});

// Handle notification clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const storageKey = `notification-${notificationId}`;
  const data = await chrome.storage.local.get([storageKey]);
  const notificationData = data[storageKey];

  if (notificationData) {
    if (typeof notificationData === "string") {
      chrome.tabs.create({ url: notificationData });
      chrome.storage.local.remove(storageKey);
    } else if (notificationData.type === "error") {
      const useSidePanel = await getSidePanelMode();

      if (useSidePanel && isSidePanelSupported()) {
        const popupUrl = chrome.runtime.getURL(
          `index.html?showError=${notificationData.txId}`,
        );
        await chrome.windows.create({
          url: popupUrl,
          type: "popup",
          width: 360,
          height: 680,
          focused: true,
        });
      } else {
        const popupUrl = chrome.runtime.getURL(
          `index.html?showError=${notificationData.txId}`,
        );
        await chrome.windows.create({
          url: popupUrl,
          type: "popup",
          width: 360,
          height: 680,
          focused: true,
        });
      }
    }
  }

  chrome.notifications.clear(notificationId);
});

// Export for module
export {};
