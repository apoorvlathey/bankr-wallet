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

import {
  getAccounts,
  getAccountById,
  getActiveAccount,
  setActiveAccountId,
  getTabAccount,
  getTabAccounts,
  clearTabAccount,
  addBankrAccount,
  addBankrAccountWithCredentialUpdate,
  addImpersonatorAccount,
  getSeedGroups,
  renameSeedGroup,
  validateBankrAccountAddressUpdate,
  updateBankrAccountAddressWithCredentialUpdate,
} from "./accountStorage";
import type { Account } from "./types";
import { sanitizeCustomExplorerUrl } from "@/lib/externalNavigation";
import { generateNewMnemonic } from "./mnemonic/derivation";
import { previewSeedAddresses } from "./mnemonic/addressPreview";
import {
  addSeedPhraseGroup,
  deriveSeedAccounts,
} from "./mnemonic/accountHandlers";
import {
  RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
  validateEIP712TypedData,
} from "./eip712Validator";
import {
  clearExpiredErc7715PermissionRequests,
  getPendingErc7715PermissionRequests,
} from "./pendingErc7715PermissionStorage";
import {
  handleErc7715PermissionMethod,
  handleConfirmErc7715PermissionRequest,
  handleRejectErc7715PermissionRequest,
  handleInitiateErc7715PermissionRevoke,
  getActiveErc7715PermissionGrantsWithOnchainSync,
  isErc7715PermissionMethod,
} from "./erc7715PermissionHandlers";
import {
  ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR,
  isErc7715PermissionRequestLocked,
  refreshErc7715PermissionRequestLockFromStorage,
} from "./erc7715/requestLock";
import {
  removePendingTxRequest,
  getPendingTxRequestById,
  getPendingTxRequests,
  clearExpiredTxRequests,
  updateBadge,
  updatePendingTxRequestData,
} from "./pendingTxStorage";
import {
  removePendingSignatureRequest,
  getPendingSignatureRequestById,
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
} from "./networkStorage";
import { assertRpcEndpointAllowedForOrigin } from "./rpcHttpClient";
import {
  getStorageKeysWithPrefixes,
  getWalletLocalStorageKeysToRemove,
  WALLET_RESULT_STORAGE_PREFIXES,
  WALLET_SYNC_STORAGE_KEYS,
} from "./walletResetStorage";
import { migrateFromLegacyStorage } from "./legacyStorageMigration";
import {
  CACHE_PRUNE_INTERVAL_MS,
  pruneNonCriticalStorageCaches,
} from "./storageCachePruner";

// Session & cache management
import {
  AUTO_LOCK_STORAGE_KEY,
  handleAutoLockTimeoutStorageChange,
  getCachedApiKey,
  getCachedPassword,
  getCachedVaultKey,
  getPasswordType,
  resolvePasswordType,
  getAutoLockTimeout,
  initializeAutoLockTimeoutDefault,
  tryRestoreSession,
  incrementUIConnections,
  decrementUIConnections,
  clearAllAuthState,
  clearInMemoryAuthCache,
} from "./sessionCache";

// Auth handlers
import {
  handleUnlockWallet,
  prepareApiKeyUpdateWithCachedPassword,
  commitPreparedApiKeyUpdate,
} from "./authHandlers";
import {
  getAuthCeremonyEpoch,
  invalidateAuthCeremonies,
  runSerializedAuthTransition,
} from "./authTransition";
import { verifyBankrCredentialAddress } from "./bankrApi";
import {
  handleRevealPrivateKey,
  handleRevealSeedPhrase,
} from "./secretRevealHandlers";
import {
  assertCurrentMasterAuthorization,
} from "./masterAuthorization";

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
  handleCheckSponsoredTransferStatus,
  handleAcknowledgeSponsoredTransfer,
} from "./sponsoredTransferHandlers";
import {
  hasUnresolvedSponsoredTransferIntent,
  withSponsoredTransferOperation,
} from "./sponsoredTransferIntentStorage";

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
  clearExpiredWatchAssetRequests,
} from "./pendingWatchAssetStorage";
import {
  savePendingAddChainRequest,
  removePendingAddChainRequest,
  getPendingAddChainRequests,
  clearExpiredAddChainRequests,
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
  FRESH_INSTALL_THEME_ID,
  SELECTED_THEME_STORAGE_KEY,
  isThemeId,
} from "@/theme/tokens";

import {
  isSidePanelSupported,
  getSidePanelMode,
  initSidePanel,
  POPUP_PATH,
} from "./sidepanelManager";

import {
  fetchAndCacheAvatarImage,
  invalidateAvatarImageCacheForWalletReset,
} from "./avatarImageCache";
import { initEnsBrowsing, handleEnsBrowsingMessage } from "./ensBrowsing";
import {
  handleWalletConnectDisconnectSession,
  handleWalletConnectGetSessions,
  handleWalletConnectPair,
  handleWalletConnectSwitchChain,
  initWalletConnect,
  resetWalletConnectForWalletReset,
} from "./walletConnectHandlers";
import { clearExpiredWalletConnectPendingRequests } from "./walletConnectStorage";
import {
  getDappPermissions,
  getPendingDappConnectionRequests,
  handleConfirmDappConnection,
  handleGetDappAccounts,
  handleGetDappConnectionContext,
  handleRejectDappConnection,
  handleRequestDappConnection,
  handleRevokeDappPermission,
} from "./dappConnectionHandlers";
import { clearExpiredDappConnectionRequests } from "./dappPermissionStorage";
import { authorizeConnectedDappRequest } from "./dappRequestPolicy";
import { handleSafeRpcRequest } from "./safeRpcForwarding";
import { validateExternalProviderMessage } from "./externalProviderValidation";
import { classifyBackgroundMessage } from "./background/messageAccessPolicy";
import { routeBackgroundAuthMessage } from "./background/authRouter";
import { createBackgroundOnboardingMessageRouter } from "./background/onboardingRouter";
import { routeBackgroundAccountStateMessage } from "./background/accountStateRouter";
import { createBackgroundSettingsMessageRouter } from "./background/settingsRouter";
import { createBackgroundDappPermissionMessageRouter } from "./background/dappPermissionRouter";
import { createBackgroundWalletConnectSessionMessageRouter } from "./background/walletConnectSessionRouter";
import { createBackgroundWatchAssetMessageRouter } from "./background/watchAssetRouter";
import { createBackgroundChainPromptMessageRouter } from "./background/chainPromptRouter";
import { createBackgroundSigningRequestMessageRouter } from "./background/signingRequestRouter";
import { createBackgroundTransactionStatusMessageRouter } from "./background/transactionStatusRouter";
import {
  deliverProviderRequestRejection,
  mapProviderRequestRejection,
} from "./background/providerRequestRejection";
import { isTrustedWalletUiSender } from "./trustedWalletUiSender";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "./storageLock";
import {
  activateBrowserTabAccount,
  replaceBrowserTabAccountScope,
  resolveBrowserTabAccount,
} from "./tabAccountResolver";
import { removeAccountWithDappPrivacyBoundary } from "./accountRemovalDappPrivacy";
import {
  canSignalPendingTransactionCancellation,
  pendingRequestResolutionAction,
  runPendingRequestResolution,
  runPendingRequestResolutions,
  runWalletResetAgainstPendingResolutions,
  type PendingRequestResolutionAction,
} from "./pendingRequestResolution";
import { expireInjectedProviderRequest } from "./pendingRequestLifecycle";
import {
  expireDappConnectionRequest,
  expireErc7715PermissionRequest,
} from "./pendingDappRequestLifecycle";
import {
  enforceMetadataPromptAuthorizationAtConfirmation,
  expireMetadataPrompt,
} from "./pendingMetadataPromptLifecycle";
import { expireBatchAcknowledgement } from "./pendingBatchAcknowledgementLifecycle";

const routeBackgroundOnboardingMessage =
  createBackgroundOnboardingMessageRouter({
    resetWalletConnectForWalletReset,
    invalidateAvatarImageCacheForWalletReset,
    sendRuntimeMessage: (runtimeMessage) =>
      chrome.runtime.sendMessage(runtimeMessage),
  });

const routeBackgroundSettingsMessage = createBackgroundSettingsMessageRouter({
  openPopupWindow,
  setSyncStorage: (values) => chrome.storage.sync.set(values),
  setActionPopup: (popup) => chrome.action.setPopup({ popup }),
  popupPath: POPUP_PATH,
});

const CHAIN_SWITCH_NOTIFICATION_COOLDOWN_MS = 10_000;
const recentChainSwitchNotifications = new Map<string, number>();

function pendingResolutionConflict(
  winningAction: PendingRequestResolutionAction,
): { success: false; error: string } {
  const actionLabel: Record<PendingRequestResolutionAction, string> = {
    confirm: "confirmed",
    reject: "rejected",
    cancel: "cancelled",
    expire: "expired",
    move: "moved into a batch",
    edit: "edited",
    split: "split",
    reset: "reset",
  };
  return {
    success: false,
    error: `Request is already being ${actionLabel[winningAction]}`,
  };
}

const routeBackgroundDappPermissionMessage =
  createBackgroundDappPermissionMessageRouter({
    handleGetDappAccounts,
    handleRequestDappConnection,
    getDappPermissions,
    handleGetDappConnectionContext,
    getPendingDappConnectionRequests,
    handleConfirmDappConnection,
    handleRejectDappConnection,
    handleRevokeDappPermission,
    expireDappConnectionRequest,
    expireErc7715PermissionRequest,
    expireBatchAcknowledgement,
    expireMetadataPrompt,
    expireInjectedProviderRequest,
    runPendingRequestResolution,
    pendingResolutionConflict,
    writeResultToStorage,
  });

const routeBackgroundWalletConnectSessionMessage =
  createBackgroundWalletConnectSessionMessageRouter({
    handleWalletConnectGetSessions,
    handleWalletConnectPair,
    handleWalletConnectDisconnectSession,
    handleWalletConnectSwitchChain,
  });

const routeBackgroundWatchAssetMessage =
  createBackgroundWatchAssetMessageRouter({
    authorizeConnectedDappRequest,
    enforceMetadataPromptAuthorizationAtConfirmation,
    runPendingRequestResolution,
    pendingResolutionConflict,
    getPendingWatchAssetRequests,
    savePendingWatchAssetRequest,
    removePendingWatchAssetRequest,
    fetchTokenInfo,
    addCustomToken,
    unhidePortfolioToken,
    writeResultToStorage,
    openExtensionPopup,
    sendRuntimeMessage: (runtimeMessage) =>
      chrome.runtime.sendMessage(runtimeMessage),
    now: Date.now,
  });

const routeBackgroundChainPromptMessage =
  createBackgroundChainPromptMessageRouter({
    authorizeConnectedDappRequest,
    enforceMetadataPromptAuthorizationAtConfirmation,
    assertRpcEndpointAllowedForOrigin,
    runPendingRequestResolution,
    pendingResolutionConflict,
    getPendingAddChainRequests,
    savePendingAddChainRequest,
    removePendingAddChainRequest,
    getActiveAccount,
    addNetworkIfMissing,
    writeResultToStorage,
    openExtensionPopup,
    sendRuntimeMessage: (runtimeMessage) =>
      chrome.runtime.sendMessage(runtimeMessage),
    handleDappChainSwitchNotification,
    now: Date.now,
  });

const routeBackgroundSigningRequestMessage =
  createBackgroundSigningRequestMessageRouter({
    connectedProviderOriginOrReject,
    handleTransactionRequest,
    enqueueAuthorizedSignatureRequest,
    getPendingSignatureRequests,
    getPendingSignatureRequestById,
    removePendingSignatureRequest,
    getPendingTxRequests,
    getPendingTxRequestById,
    handleConfirmTransaction,
    handleRejectTransaction,
    handleCancelTransaction,
    runPendingRequestResolution,
    pendingResolutionConflict,
    pendingRequestResolutionAction,
    canSignalPendingTransactionCancellation,
    writeResultToStorage,
    readLocalStorage: (key) => chrome.storage.local.get(key),
  });

const routeBackgroundTransactionStatusMessage =
  createBackgroundTransactionStatusMessageRouter({
    handleCancelProcessingTx,
    failedTxResults,
    removeLocalStorage: (key) => {
      void chrome.storage.local.remove(key);
    },
    getTxHistory,
    queueAssetChangesBackfill,
    getProcessingTxs,
    clearTxHistory,
    clearTxHistoryForAddresses,
    clearAllNonces,
    checkPendingTxReceipt: checkPendingTxReceiptFn,
  });

/**
 * Serialize wallet reset against extension-internal signing/submission flows
 * that do not originate from a persisted dapp prompt. Each operation keeps its
 * own id so independent user-approved swaps/transfers are not serialized with
 * one another; the global reset barrier still observes every active claim.
 */
function runInternalIrreversibleOperation<T>(
  resolve: () => Promise<T>,
): Promise<T> {
  return runPendingRequestResolution({
    family: "internalOperation",
    requestId: crypto.randomUUID(),
    action: "confirm",
    resolve,
    conflictResult: (action) =>
      pendingResolutionConflict(action) as unknown as T,
  });
}

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
  if (/^(?:chrome|moz)-extension:\/\//i.test(iconPath)) {
    const extensionRoot = chrome.runtime.getURL("/");
    return iconPath.startsWith(extensionRoot) ? iconPath : undefined;
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

  // Portfolio linking is semantic state, so it must not be suppressed by the
  // user-notification cooldown below (a dapp can legitimately switch away and
  // back within that window).
  void chrome.runtime
    .sendMessage({
      type: "portfolioDappChainChanged",
      tabId: sender.tab.id,
      chainId: chain.chainId,
    })
    .catch(() => {
      // No wallet UI surface is currently open.
    });

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

async function connectedProviderOriginOrReject(
  sender: chrome.runtime.MessageSender,
  resultPrefix: "txResult" | "sigResult",
  requestId: unknown,
): Promise<string | null> {
  if (
    typeof requestId !== "string" ||
    requestId.length === 0 ||
    requestId.length > 128
  ) {
    return null;
  }

  try {
    const authorization = await authorizeConnectedDappRequest(sender);
    if (authorization.authorized) return authorization.origin;

    await writeResultToStorage(`${resultPrefix}:${requestId}`, {
      success: false,
      error: authorization.error,
      code: authorization.code,
    });
  } catch {
    await writeResultToStorage(`${resultPrefix}:${requestId}`, {
      success: false,
      error: "Unable to verify this site's WalletChan connection",
      code: 4100,
    });
  }

  return null;
}

function enqueueAuthorizedSignatureRequest(
  message: any,
  sender: chrome.runtime.MessageSender,
  trustedOrigin: string,
): void {
  const { signature } = message;
  if (
    !signature ||
    typeof signature !== "object" ||
    typeof signature.method !== "string" ||
    !Array.isArray(signature.params)
  ) {
    void writeResultToStorage(`sigResult:${message.sigId}`, {
      success: false,
      error: "Invalid signature request",
    });
    return;
  }

  // SECURITY: reject eth_sign — signs a raw 32-byte digest with no prefix or
  // semantic context. Reject deprecated v1 typed data for the same reason.
  if (signature.method === "eth_sign") {
    void writeResultToStorage(`sigResult:${message.sigId}`, {
      success: false,
      error:
        "eth_sign is deprecated and unsafe; use personal_sign or eth_signTypedData_v4",
    });
    return;
  }
  if (signature.method === "eth_signTypedData") {
    void writeResultToStorage(`sigResult:${message.sigId}`, {
      success: false,
      error:
        "eth_signTypedData (v1) is deprecated; please use eth_signTypedData_v4",
    });
    return;
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
        `[WalletChan] EIP-712 validation failed for ${trustedOrigin}:`,
        validationResult.error,
      );
      void writeResultToStorage(`sigResult:${message.sigId}`, {
        success: false,
        error:
          validationResult.error === RAW_ERC7710_DELEGATION_SIGNATURE_ERROR
            ? RAW_ERC7710_DELEGATION_SIGNATURE_ERROR
            : "Data must conform to EIP-712 schema",
      });
      return;
    }

    // Use sanitized typed data (extra properties stripped from type fields).
    if (validationResult.sanitized) {
      message.signature.params[1] = validationResult.sanitized;
    }
  }

  handleSignatureRequest(
    message,
    message.sigId,
    sender.tab?.windowId,
    trustedOrigin,
    sender.tab?.id,
    sender.frameId,
  );
}

const EXTERNAL_PROVIDER_RPC_MESSAGES_BLOCKED_DURING_ERC7715 = new Set([
  "addEthereumChain",
  "dappChainSwitchNotification",
  "requestDappConnection",
  "rpcRequest",
  "sendTransaction",
  "signatureRequest",
  "walletExecutionPermissions",
  "walletGetCallsStatus",
  "walletGetCapabilities",
  "walletSendCalls",
  "walletShowCallsStatus",
  "watchAsset",
]);

function rejectExternalProviderRequestDuringErc7715Lock(
  message: any,
  sendResponse: (response?: any) => void,
): boolean {
  if (!EXTERNAL_PROVIDER_RPC_MESSAGES_BLOCKED_DURING_ERC7715.has(message.type)) {
    return false;
  }
  if (!isErc7715PermissionRequestLocked()) return false;

  return rejectExternalProviderRequest(
    message,
    sendResponse,
    ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR,
    -32002,
  );
}

function rejectExternalProviderRequest(
  message: any,
  sendResponse: (response?: any) => void,
  error: string,
  code: number,
): boolean {
  return deliverProviderRequestRejection(
    mapProviderRequestRejection(message, error, code),
    { writeResult: writeResultToStorage, sendResponse },
  );
}

// ─── Chrome Event Listeners ──────────────────────────────────────────────────

// Listen for storage changes to update cached timeout.
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (
    areaName === "local" &&
    changes.pendingErc7715PermissionRequests
  ) {
    void refreshErc7715PermissionRequestLockFromStorage();
  }

  if (areaName === "sync") {
    if (changes[AUTO_LOCK_STORAGE_KEY]) {
      void handleAutoLockTimeoutStorageChange(
        changes[AUTO_LOCK_STORAGE_KEY].oldValue,
        changes[AUTO_LOCK_STORAGE_KEY].newValue,
      );
    }

  }
});

// Connected dapp tabs keep their own account. Ordinary tabs follow the shared
// global account and shed any stale override when activated or navigated.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void activateBrowserTabAccount(tabId).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  void resolveBrowserTabAccount(tabId).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearTabAccount(tabId).catch(() => {});
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void replaceBrowserTabAccountScope(addedTabId, removedTabId).catch(() => {});
});

async function sendAccountToTab(tabId: number, account: Account): Promise<void> {
  await chrome.tabs.sendMessage(tabId, {
    type: "setAccount",
    msg: {
      address: account.address,
      displayAddress: account.displayName || account.address,
      accountId: account.id,
      accountType: account.type,
    },
  }).catch(() => {});
}

// Clear cache when service worker suspends
self.addEventListener("suspend", () => {
  invalidateAuthCeremonies();
  clearInMemoryAuthCache();
});

// Clean up expired transactions, signature requests, and batch requests periodically
setInterval(() => {
  clearExpiredTxRequests();
  clearExpiredSignatureRequests();
  clearExpiredBatchTxRequests();
  clearExpiredErc7715PermissionRequests();
  clearExpiredWalletConnectPendingRequests();
  clearExpiredDappConnectionRequests();
  clearExpiredAddChainRequests();
  clearExpiredWatchAssetRequests();
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

async function initializeThemeForFreshInstall(): Promise<void> {
  const stored = (await chrome.storage.local.get(SELECTED_THEME_STORAGE_KEY)) as Record<
    string,
    unknown
  >;

  if (isThemeId(stored[SELECTED_THEME_STORAGE_KEY])) {
    return;
  }

  await chrome.storage.local.set({
    [SELECTED_THEME_STORAGE_KEY]: FRESH_INSTALL_THEME_ID,
  });
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await initializeAutoLockTimeoutDefault().catch((error) =>
      console.error("[WalletChan] Auto-lock initialization failed:", error),
    );
    await initializeThemeForFreshInstall().catch((error) =>
      console.error("[WalletChan] Theme initialization failed:", error),
    );
    // First time install - open onboarding page
    const onboardingUrl = chrome.runtime.getURL("onboarding.html");
    await chrome.tabs.create({ url: onboardingUrl }).catch((error) =>
      console.error("[WalletChan] Could not open onboarding:", error),
    );
  } else if (details.reason === "update") {
    // Missing/invalid legacy settings migrate to the finite security default;
    // an explicit stored zero (Never) remains untouched.
    await initializeAutoLockTimeoutDefault().catch((error) =>
      console.error("[WalletChan] Auto-lock migration failed:", error),
    );
    // Migrate from v0.1.1/v0.2.0 legacy storage to multi-account system
    await migrateFromLegacyStorage().catch((error) =>
      console.error("[WalletChan] Legacy account migration failed:", error),
    );
    // v3.5.0: rekey custom OP entries now that Optimism is built-in
    await migrateCustomOptimismChain().catch((error) =>
      console.error("[WalletChan] Optimism migration failed:", error),
    );
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
  if (!isTrustedWalletUiSender(port.sender || {})) {
    // Content scripts and web-accessible ENS pages must not suppress auto-lock
    // by impersonating a wallet UI keepalive connection.
    port.disconnect();
    return;
  }
  if (port.name === "popup-wake") {
    // Just acknowledge the connection - the popup is waking us up
    console.log("Service worker woken up by popup");
  } else if (port.name === "ui-keepalive") {
    // UI view connected; disconnect resets idle timestamps, but cache getters
    // still enforce the configured auto-lock timeout.
    incrementUIConnections();
    port.onDisconnect.addListener(() => {
      decrementUIConnections();
    });
  }
});

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ENS browsing handlers (interstitial / banner / settings). Returns true
  // only for messages it handles, so the rest of the router falls through.
  if (handleEnsBrowsingMessage(message, sender, sendResponse)) {
    return true;
  }

  const trustedWalletUi = isTrustedWalletUiSender(sender);
  const audience = classifyBackgroundMessage(message?.type);

  if (!trustedWalletUi && audience !== "provider") {
    sendResponse({ success: false, error: "Unauthorized" });
    return false;
  }

  if (!trustedWalletUi) {
    const validation = validateExternalProviderMessage(message);
    if (!validation.valid) {
      rejectExternalProviderRequest(
        message,
        sendResponse,
        validation.error || "Invalid provider request",
        -32602,
      );
      return false;
    }
  }

  if (
    !trustedWalletUi &&
    rejectExternalProviderRequestDuringErc7715Lock(message, sendResponse)
  ) {
    return false;
  }

  const authRoute = routeBackgroundAuthMessage(message, sendResponse);
  if (authRoute.handled) return authRoute.keepChannelOpen;

  const onboardingRoute = routeBackgroundOnboardingMessage(
    message,
    sendResponse,
  );
  if (onboardingRoute.handled) return onboardingRoute.keepChannelOpen;

  const accountStateRoute = routeBackgroundAccountStateMessage(
    message,
    sender,
    sendResponse,
  );
  if (accountStateRoute.handled) return accountStateRoute.keepChannelOpen;

  const settingsRoute = routeBackgroundSettingsMessage(message, sendResponse);
  if (settingsRoute.handled) return settingsRoute.keepChannelOpen;

  const dappPermissionRoute = routeBackgroundDappPermissionMessage(
    message,
    sender,
    sendResponse,
  );
  if (dappPermissionRoute.handled) {
    return dappPermissionRoute.keepChannelOpen;
  }

  const walletConnectSessionRoute =
    routeBackgroundWalletConnectSessionMessage(message, sendResponse);
  if (walletConnectSessionRoute.handled) {
    return walletConnectSessionRoute.keepChannelOpen;
  }

  const watchAssetRoute = routeBackgroundWatchAssetMessage(
    message,
    sender,
    sendResponse,
  );
  if (watchAssetRoute.handled) return watchAssetRoute.keepChannelOpen;

  const chainPromptRoute = routeBackgroundChainPromptMessage(
    message,
    sender,
    sendResponse,
  );
  if (chainPromptRoute.handled) return chainPromptRoute.keepChannelOpen;

  const signingRequestRoute = routeBackgroundSigningRequestMessage(
    message,
    sender,
    sendResponse,
  );
  if (signingRequestRoute.handled) {
    return signingRequestRoute.keepChannelOpen;
  }

  const transactionStatusRoute = routeBackgroundTransactionStatusMessage(
    message,
    sendResponse,
  );
  if (transactionStatusRoute.handled) {
    return transactionStatusRoute.keepChannelOpen;
  }

  switch (message.type) {
    case "getPendingErc7715PermissionRequests": {
      getPendingErc7715PermissionRequests().then((requests) => {
        sendResponse(requests);
      });
      return true;
    }

    case "getErc7715PermissionGrantsForAccount": {
      const accountId =
        typeof message.accountId === "string" ? message.accountId : "";
      if (!accountId) {
        sendResponse({ success: false, error: "Account id is required" });
        return true;
      }

      getActiveErc7715PermissionGrantsWithOnchainSync({
        accountId,
      })
        .then((grants) =>
          grants.sort((a, b) => b.createdAt - a.createdAt),
        )
        .then((grants) => sendResponse({ success: true, grants }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "initiateErc7715PermissionRevoke": {
      const accountId =
        typeof message.accountId === "string" ? message.accountId : "";
      const grantId = typeof message.grantId === "string" ? message.grantId : "";
      if (!accountId || !grantId) {
        sendResponse({
          success: false,
          error: "Account id and grant id are required",
        });
        return true;
      }

      handleInitiateErc7715PermissionRevoke({ accountId, grantId })
        .then((result) => sendResponse(result))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "rejectErc7715PermissionRequest": {
      handleRejectErc7715PermissionRequest(message.requestId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    // ── ERC-5792 Batch Transactions ──────────────────────────────────────────
    case "walletGetCapabilities": {
      (async () => {
        const authorization = await authorizeConnectedDappRequest(sender);
        if (!authorization.authorized) {
          await writeResultToStorage(
            `capabilitiesResult:${message.requestId}`,
            {
              success: false,
              error: authorization.error,
              code: authorization.code,
            },
          );
          return;
        }
        const account =
          typeof sender.tab?.id === "number"
            ? await getTabAccount(sender.tab.id)
            : undefined;
        const result = await handleWalletGetCapabilities(
          message.address,
          message.chainIds,
          account ?? undefined,
        );
        await writeResultToStorage(
          `capabilitiesResult:${message.requestId}`,
          result,
        );
      })();
      return false;
    }

    case "walletSendCalls": {
      const senderWindowId = sender.tab?.windowId;
      void runPendingRequestResolution({
        family: "batchTransaction",
        requestId: message.bundleId,
        action: "confirm",
        conflictResult: () => undefined,
        resolve: async () => {
          const authorization = await authorizeConnectedDappRequest(sender);
          if (!authorization.authorized) {
            await writeResultToStorage(`batchTxAck:${message.bundleId}`, {
              success: false,
              error: authorization.error,
              code: authorization.code,
            });
            return;
          }
          await handleWalletSendCalls(
            message.params,
            message.bundleId,
            authorization.origin,
            message.favicon,
            senderWindowId,
            authorization.origin,
            authorization.tabId,
            sender.frameId,
          );
        },
      }).catch((error) =>
        writeResultToStorage(`batchTxAck:${message.bundleId}`, {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to queue batch transaction",
          code: -32000,
        }).catch(() => undefined),
      );
      return false;
    }

    case "walletGetCallsStatus": {
      void authorizeConnectedDappRequest(sender).then(async (authorization) => {
        if (!authorization.authorized) {
          await writeResultToStorage(
            `callsStatusResult:${message.requestId}`,
            {
              success: false,
              error: authorization.error,
              code: authorization.code,
            },
          );
          return;
        }
        const result = await handleWalletGetCallsStatus(
          message.bundleId,
          authorization.origin,
        );
        await writeResultToStorage(
          `callsStatusResult:${message.requestId}`,
          result,
        );
      });
      return false;
    }

    case "walletShowCallsStatus": {
      void authorizeConnectedDappRequest(sender).then((authorization) => {
        if (!authorization.authorized) return;
        handleWalletShowCallsStatus(message.bundleId, authorization.origin);
      });
      return false;
    }

    case "walletExecutionPermissions": {
      (async () => {
        try {
          const authorization = await authorizeConnectedDappRequest(sender);
          if (!authorization.authorized) {
            sendResponse({
              success: false,
              error: authorization.error,
              code: authorization.code,
            });
            return;
          }
          if (!isErc7715PermissionMethod(message.method)) {
            throw new Error(
              `Unsupported execution permission method: ${message.method}`,
            );
          }

          const account =
            typeof sender.tab?.id === "number"
              ? await getTabAccount(sender.tab.id)
              : undefined;
          const result = await handleErc7715PermissionMethod({
            method: message.method,
            params: Array.isArray(message.params) ? message.params : [],
            origin: authorization.origin,
            chainId:
              typeof message.chainId === "number" ? message.chainId : undefined,
            favicon: message.favicon || null,
            senderWindowId: sender.tab?.windowId,
            senderOrigin: authorization.origin,
            tabId: authorization.tabId,
            frameId: sender.frameId,
            account: account ?? undefined,
            requestId:
              typeof message.requestId === "string"
                ? message.requestId
                : undefined,
            waitForResult: message.method !== "wallet_requestExecutionPermissions",
          });
          sendResponse({ success: true, result });
        } catch (err) {
          sendResponse({
            success: false,
            error:
              err instanceof Error
                ? err.message
                : "Execution permission request failed",
          });
        }
      })();
      return true;
    }

    case "getPendingBatchTxRequests": {
      getPendingBatchTxRequests().then((requests) => {
        sendResponse(requests);
      });
      return true;
    }

    case "confirmBatchTransactionAsync": {
      const bundleId =
        typeof message.bundleId === "string" ? message.bundleId : "";
      runPendingRequestResolution({
        family: "batchTransaction",
        requestId: bundleId,
        action: "confirm",
        resolve: () =>
          handleConfirmBatchTransaction(
            bundleId,
            message.password,
            message.functionNames,
            message.forceInclusion,
          ),
        conflictResult: pendingResolutionConflict,
      })
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to confirm batch transaction",
          }),
        );
      return true;
    }

    case "confirmBatchTransactionAsyncPK": {
      const bundleId =
        typeof message.bundleId === "string" ? message.bundleId : "";
      runPendingRequestResolution({
        family: "batchTransaction",
        requestId: bundleId,
        action: "confirm",
        resolve: () =>
          handleConfirmBatchTransactionPK(
            bundleId,
            message.password,
            message.tabId,
            message.functionNames,
            message.gasEstimates,
            message.forceInclusion,
          ),
        conflictResult: pendingResolutionConflict,
      })
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to confirm batch transaction",
          }),
        );
      return true;
    }

    case "rejectBatchTransaction": {
      const bundleId =
        typeof message.bundleId === "string" ? message.bundleId : "";
      runPendingRequestResolution({
        family: "batchTransaction",
        requestId: bundleId,
        action: "reject",
        resolve: () => handleRejectBatchTransaction(bundleId),
        conflictResult: pendingResolutionConflict,
      })
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to reject batch transaction",
          }),
        );
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
      const bundleId =
        typeof message.bundleId === "string" ? message.bundleId : "";
      runPendingRequestResolution({
        family: "batchTransaction",
        requestId: bundleId,
        action: "split",
        resolve: () =>
          handleSplitBatchIntoIndividualTxs(bundleId, senderWindowId),
        conflictResult: pendingResolutionConflict,
      }).then(sendResponse).catch((error) =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Failed to split batch",
        }),
      );
      return true;
    }

    case "removeCallFromPendingBatch": {
      const bundleId =
        typeof message.bundleId === "string" ? message.bundleId : "";
      runPendingRequestResolution({
        family: "batchTransaction",
        requestId: bundleId,
        action: "edit",
        resolve: () =>
          handleRemoveCallFromPendingBatch(bundleId, message.callIndex),
        conflictResult: pendingResolutionConflict,
      }).then(sendResponse).catch((error) =>
        sendResponse({
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to update batch",
        }),
      );
      return true;
    }

    case "updateCallInPendingBatch": {
      const bundleId =
        typeof message.bundleId === "string" ? message.bundleId : "";
      runPendingRequestResolution({
        family: "batchTransaction",
        requestId: bundleId,
        action: "edit",
        resolve: () =>
          handleUpdateCallInPendingBatch(
            bundleId,
            message.callIndex,
            message.newData,
          ),
        conflictResult: pendingResolutionConflict,
      }).then(sendResponse).catch((error) =>
        sendResponse({
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to update batch",
        }),
      );
      return true;
    }

    case "updatePendingTxRequestData": {
      const txId = typeof message.txId === "string" ? message.txId : "";
      runPendingRequestResolution({
        family: "transaction",
        requestId: txId,
        action: "edit",
        resolve: async () => {
          await updatePendingTxRequestData(txId, message.newData);
          return { success: true };
        },
        conflictResult: pendingResolutionConflict,
      })
        .then(sendResponse)
        .catch((err) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      return true;
    }

    case "addToCrossDappBatch": {
      const txId = typeof message.txId === "string" ? message.txId : "";
      runPendingRequestResolutions({
        requests: [
          { family: "transaction", requestId: txId, action: "move" },
          { family: "crossDappBatch", requestId: "active", action: "move" },
        ],
        resolve: () => handleAddToCrossDappBatch(txId),
        conflictResult: (_family, _requestId, winningAction) =>
          pendingResolutionConflict(winningAction),
      }).then(sendResponse).catch((error) =>
        sendResponse({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to add transaction to batch",
        }),
      );
      return true;
    }

    case "addCallsToCrossDappBatch": {
      const bundleId =
        typeof message.bundleId === "string" ? message.bundleId : "";
      runPendingRequestResolutions({
        requests: [
          {
            family: "batchTransaction",
            requestId: bundleId,
            action: "move",
          },
          { family: "crossDappBatch", requestId: "active", action: "move" },
        ],
        resolve: () => handleAddCallsToCrossDappBatch(bundleId),
        conflictResult: (_family, _requestId, winningAction) =>
          pendingResolutionConflict(winningAction),
      }).then(sendResponse).catch((error) =>
        sendResponse({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to add calls to batch",
        }),
      );
      return true;
    }

    case "removeFromCrossDappBatch": {
      runPendingRequestResolution({
        family: "crossDappBatch",
        requestId: "active",
        action: "edit",
        resolve: () => handleRemoveFromCrossDappBatch(message.txId),
        conflictResult: pendingResolutionConflict,
      }).then(sendResponse).catch((error) =>
        sendResponse({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to remove transaction from batch",
        }),
      );
      return true;
    }

    case "updateCallInCrossDappBatch": {
      runPendingRequestResolution({
        family: "crossDappBatch",
        requestId: "active",
        action: "edit",
        resolve: () =>
          handleUpdateCallInCrossDappBatch(message.txId, message.newData),
        conflictResult: pendingResolutionConflict,
      }).then(sendResponse).catch((error) =>
        sendResponse({
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to update batch",
        }),
      );
      return true;
    }

    case "rejectCrossDappBatch": {
      runPendingRequestResolution({
        family: "crossDappBatch",
        requestId: "active",
        action: "reject",
        resolve: handleRejectCrossDappBatch,
        conflictResult: pendingResolutionConflict,
      })
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to reject cross-dapp batch",
          }),
        );
      return true;
    }

    case "confirmCrossDappBatch": {
      runPendingRequestResolution({
        family: "crossDappBatch",
        requestId: "active",
        action: "confirm",
        resolve: () =>
          handleConfirmCrossDappBatch(
            message.password,
            message.gasEstimates,
          ),
        conflictResult: pendingResolutionConflict,
      })
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to confirm cross-dapp batch",
          }),
        );
      return true;
    }

    case "migrateFromLegacy": {
      // Only extension pages (popup / sidepanel) may trigger migration
      if (!isTrustedWalletUiSender(sender)) {
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
          const passwordType = await resolvePasswordType(handleUnlockWallet);
          if (passwordType !== "master") {
            sendResponse({
              success: false,
              error: "Adding accounts requires master password",
            });
            return;
          }
          const preparedCredential = message.apiKey
            ? await prepareApiKeyUpdateWithCachedPassword(message.apiKey)
            : null;
          if (preparedCredential && !preparedCredential.success) {
            sendResponse(preparedCredential);
            return;
          }
          const operationAuthEpoch = preparedCredential?.success
            ? preparedCredential.expectedAuthEpoch
            : getAuthCeremonyEpoch();
          const verificationApiKey = preparedCredential?.success
            ? preparedCredential.apiKey
            : getCachedApiKey();
          if (!verificationApiKey) {
            sendResponse({
              success: false,
              error: "Bankr credential is unavailable. Unlock and try again.",
            });
            return;
          }
          await verifyBankrCredentialAddress(
            verificationApiKey,
            message.address,
          );

          const account = await withStorageLock(
            WALLET_SECRET_OPERATION_LOCK_KEY,
            async () => {
              assertCurrentMasterAuthorization(operationAuthEpoch);
              if (preparedCredential?.success) {
                const added = await addBankrAccountWithCredentialUpdate(
                  message.address,
                  message.displayName,
                  preparedCredential.storageUpdate,
                  operationAuthEpoch,
                );
                commitPreparedApiKeyUpdate(preparedCredential);
                await setActiveAccountId(
                  added.id,
                  operationAuthEpoch,
                ).catch((error) => {
                  console.warn(
                    "[background] Failed to select newly added Bankr account:",
                    error,
                  );
                });
                return added;
              }
              return addBankrAccount(
                message.address,
                message.displayName,
                operationAuthEpoch,
              );
            },
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
          if (passwordType !== "master") {
            sendResponse({
              success: false,
              error: "Adding accounts requires master password",
            });
            return;
          }
          const operationAuthEpoch = getAuthCeremonyEpoch();
          const account = await withStorageLock(
            WALLET_SECRET_OPERATION_LOCK_KEY,
            async () => {
              assertCurrentMasterAuthorization(operationAuthEpoch);
              return addImpersonatorAccount(
                message.address,
                message.displayName,
                operationAuthEpoch,
              );
            },
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
      if (!isTrustedWalletUiSender(sender)) {
        sendResponse({ success: false, error: "Unauthorized" });
        return false;
      }
      const mnemonic = generateNewMnemonic();
      sendResponse({ success: true, mnemonic });
      return false;
    }

    case "previewSeedAddresses": {
      void previewSeedAddresses(message).then(sendResponse);
      return true;
    }

    case "addSeedPhraseGroup": {
      void addSeedPhraseGroup(message).then(sendResponse);
      return true;
    }

    case "deriveSeedAccount": {
      void deriveSeedAccounts(message).then(sendResponse);
      return true;
    }

    case "revealSeedPhrase": {
      // SECURITY: Only extension pages can reveal seed phrases
      if (!isTrustedWalletUiSender(sender)) {
        sendResponse({ success: false, error: "Unauthorized" });
        return true;
      }
      void handleRevealSeedPhrase(
        typeof message.seedGroupId === "string" ? message.seedGroupId : "",
        typeof message.password === "string" ? message.password : "",
        sendResponse,
      );
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

    case "addPrivateKeyAccount": {
      (async () => {
        // SECURITY: Block adding accounts when unlocked with agent password.
        // Resolve via session restore so post-SW-restart agent sessions are caught.
        const passwordType = await resolvePasswordType(handleUnlockWallet);
        if (passwordType !== "master") {
          sendResponse({
            success: false,
            error: "Adding accounts requires master password",
          });
          return;
        }
        const operationAuthEpoch = getAuthCeremonyEpoch();

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

        if (!password && !getCachedVaultKey()) {
          sendResponse({ success: false, error: "Wallet is locked" });
          return;
        }

        const result = await handleAddPrivateKeyAccount(
          message.privateKey,
          password,
          message.displayName,
          operationAuthEpoch,
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
        if (passwordType !== "master") {
          sendResponse({
            success: false,
            error: "Account removal requires master password",
          });
          return;
        }
        const operationAuthEpoch = getAuthCeremonyEpoch();
        try {
          const result = await withSponsoredTransferOperation(() =>
            removeAccountWithDappPrivacyBoundary({
            accountId: message.accountId,
            validateRemoval: async () => {
              const account = await getAccountById(message.accountId);
              if (!account) throw new Error("Account not found");
              if (
                await hasUnresolvedSponsoredTransferIntent(account.address)
              ) {
                throw new Error(
                  "Check the pending sponsored transfer before removing this account",
                );
              }
              if ((await getAccounts()).length <= 1) {
                throw new Error("Cannot remove the last account");
              }
            },
            revokeOrigin: async (origin) => {
              await handleRevokeDappPermission(origin);
            },
            removeAccount: () =>
              handleRemoveAccount(message.accountId, operationAuthEpoch),
            }),
          );
          sendResponse(result);
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to disconnect sites before account removal",
          });
        }
      })();
      return true;
    }

    case "revealPrivateKey": {
      // SECURITY: Only extension pages can reveal private keys
      if (!isTrustedWalletUiSender(sender)) {
        sendResponse({ success: false, error: "Unauthorized" });
        return true;
      }
      void handleRevealPrivateKey(
        typeof message.accountId === "string" ? message.accountId : "",
        typeof message.password === "string" ? message.password : "",
        sendResponse,
      );
      return true;
    }

    case "confirmSignatureRequest": {
      const tabId = message.tabId || sender.tab?.id;
      const sigId = typeof message.sigId === "string" ? message.sigId : "";
      runPendingRequestResolution<SignatureResult>({
        family: "signature",
        requestId: sigId,
        action: "confirm",
        conflictResult: pendingResolutionConflict,
        resolve: async () => {
          let result: SignatureResult;
          // SECURITY: route by the pinned account type (captured at arrival),
          // not by whatever is active right now.
          const pending = await getPendingSignatureRequestById(sigId);
          if (!pending) {
            return { success: false, error: "Signature request not found" };
          }
          let pinnedType = pending.accountType;
          if (!pinnedType && pending.accountId) {
            const pinnedAcc = await getAccountById(pending.accountId);
            pinnedType = pinnedAcc?.type as typeof pinnedType;
          }
          if (pinnedType === "bankr") {
            result = await handleConfirmSignatureRequestBankr(
              sigId,
              message.password,
              message.allowUnsafeSiwe === true,
            );
          } else if (
            pinnedType === "privateKey" ||
            pinnedType === "seedPhrase"
          ) {
            result = await handleConfirmSignatureRequest(
              sigId,
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

          // Only a removed request is terminal. Invalid passwords and other
          // safe pre-sign validation failures remain pending and can be
          // retried without resolving the dapp's promise.
          if (!(await getPendingSignatureRequestById(sigId))) {
            const resultKey = `sigResult:${sigId}`;
            const existingResult = await chrome.storage.local.get(resultKey);
            if (!existingResult[resultKey]) {
              await writeResultToStorage(resultKey, result);
            }
          }
          return result;
        },
      })
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to confirm signature request",
          }),
        );
      return true;
    }

    case "confirmErc7715PermissionRequest": {
      handleConfirmErc7715PermissionRequest(
        message.requestId,
        message.password || "",
        message.editedRequest,
      ).then((result) => {
        sendResponse(result);
      });
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
      retryTokenMetadata(
        message.chainId,
        message.tokenChanges,
        message.accountAddress,
        message.nativeChange,
      ).then(sendResponse);
      return true;
    }

    case "confirmTransactionAsyncPK": {
      const tabId = message.tabId || sender.tab?.id;
      const txId = typeof message.txId === "string" ? message.txId : "";
      runPendingRequestResolution({
        family: "transaction",
        requestId: txId,
        action: "confirm",
        resolve: () =>
          handleConfirmTransactionAsyncPK(
            txId,
            message.password,
            tabId,
            message.functionName,
            message.gasOverrides,
            message.forceInclusion,
          ),
        conflictResult: pendingResolutionConflict,
      })
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to confirm transaction",
          }),
        );
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

          const preparedCredential =
            await prepareApiKeyUpdateWithCachedPassword(apiKey);
          if (!preparedCredential.success) {
            sendResponse(preparedCredential);
            return;
          }

          // `/wallet/sign` is non-transactional and returns the controlled
          // signer. Prove the replacement global credential matches the
          // account row before publishing either value.
          await verifyBankrCredentialAddress(
            preparedCredential.apiKey,
            address,
          );

          const updated = await withStorageLock(
            WALLET_SECRET_OPERATION_LOCK_KEY,
            async () => {
              assertCurrentMasterAuthorization(
                preparedCredential.expectedAuthEpoch,
              );
              const committed =
                await updateBankrAccountAddressWithCredentialUpdate(
                  accountId,
                  address,
                  preparedCredential.storageUpdate,
                  preparedCredential.expectedAuthEpoch,
                );
              commitPreparedApiKeyUpdate(preparedCredential);
              return committed;
            },
          );

          // The security-critical local commit is complete. Sync mirrors and
          // live-tab notifications are best effort and must not turn that
          // success into a false failure response.
          try {
            const activeAccount = await getActiveAccount();
            if (activeAccount?.id === updated.id) {
              await chrome.storage.sync.set({
                address: updated.address,
                displayAddress: updated.displayName || updated.address,
              });
            }
          } catch (error) {
            console.warn("[background] Failed to update active Bankr mirror:", error);
          }

          try {
            const tabAccounts = await getTabAccounts();
            for (const [tabId, mappedAccountId] of Object.entries(tabAccounts)) {
              if (mappedAccountId === updated.id) {
                await sendAccountToTab(Number(tabId), updated);
              }
            }
          } catch (error) {
            console.warn("[background] Failed to notify Bankr tabs:", error);
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
      // Legacy UI builds used this credential-only mutation. A Bankr API key
      // is wallet-wide, so changing it without simultaneously proving and
      // updating the sole Bankr account address can rebind approvals to the
      // wrong remote signer. Keep an explicit terminal response for a stale
      // popup, but never perform the unsafe partial update.
      sendResponse({
        success: false,
        error: "Update the Bankr credential from that account's settings.",
      });
      return false;
    }

    case "getCachedApiKey": {
      // SECURITY: Only extension pages can access the API key
      if (!isTrustedWalletUiSender(sender)) {
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

    case "rpcRequest": {
      const rpcResultKey = `rpcResult:${message.rpcId}`;
      void authorizeConnectedDappRequest(sender).then(async (authorization) => {
        if (!authorization.authorized) {
          await writeResultToStorage(rpcResultKey, {
            error: authorization.error,
            code: authorization.code,
          });
          return;
        }
        await handleSafeRpcRequest(
          message.rpcUrl,
          message.method,
          message.params,
          authorization.origin,
        )
          .then((result) => writeResultToStorage(rpcResultKey, { result }))
          .catch((error) =>
            writeResultToStorage(rpcResultKey, {
              error:
                error instanceof Error ? error.message : "RPC request failed",
            }),
          );
      });
      return false;
    }

    case "confirmTransactionAsync": {
      const txId = typeof message.txId === "string" ? message.txId : "";
      runPendingRequestResolution({
        family: "transaction",
        requestId: txId,
        action: "confirm",
        resolve: () =>
          handleConfirmTransactionAsync(
            txId,
            message.password,
            message.functionName,
            message.forceInclusion,
          ),
        conflictResult: pendingResolutionConflict,
      })
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to confirm transaction",
          }),
        );
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
      resolveTokenMetadata(message.chainId, String(message.tokenAddress || ""), {
        includeBungeeTokens: message.includeBungeeTokens !== false,
      })
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
      if (!isTrustedWalletUiSender(sender)) {
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
      runInternalIrreversibleOperation(() =>
        handleExecuteSwapDirect(
          message.transactions,
          message.chainName,
          message.gasEstimates,
          {
            accountId: message.accountId,
            fromAddress: message.fromAddress,
          },
        ),
      )
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error ? error.message : "Swap execution failed",
          }),
        );
      return true;
    }

    case "executeSwapBatch": {
      runInternalIrreversibleOperation(() =>
        handleExecuteSwapBatch(
          message.batchTx,
          message.originalTransactions,
          message.chainId,
          message.chainName,
          {
            accountId: message.accountId,
            fromAddress: message.fromAddress,
          },
        ),
      )
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error ? error.message : "Swap execution failed",
          }),
        );
      return true;
    }

    case "executeSwapAtomicPK": {
      runInternalIrreversibleOperation(() =>
        handleExecuteSwapAtomicPK({
          originalTransactions: message.originalTransactions,
          chainId: message.chainId,
          chainName: message.chainName,
          accountLock: {
            accountId: message.accountId,
            fromAddress: message.fromAddress,
          },
          gasOverrides: message.gasOverrides,
        }),
      )
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error ? error.message : "Swap execution failed",
          }),
        );
      return true;
    }

    case "sponsoredTransfer": {
      runInternalIrreversibleOperation(() => handleSponsoredTransfer(message))
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Sponsored transfer failed",
          }),
        );
      return true;
    }

    case "checkSponsoredTransferStatus": {
      handleCheckSponsoredTransferStatus(message.fromAddress)
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            hasUnresolved: true,
            error:
              error instanceof Error
                ? error.message
                : "Could not check sponsored transfer status",
          }),
        );
      return true;
    }

    case "acknowledgeSponsoredTransfer": {
      handleAcknowledgeSponsoredTransfer(
        message.intentId,
        message.fromAddress,
      )
        .then(sendResponse)
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    case "checkPremiumStatus": {
      handleCheckPremiumStatus(message.address).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "resetExtension": {
      runWalletResetAgainstPendingResolutions({
        // Install the reset barrier synchronously before password/session
        // restoration or any destructive storage await.
        resolve: () =>
          runSerializedAuthTransition(async () => {
            // SECURITY: Block extension reset when unlocked with agent password.
            // Resolve via session restore so post-SW-restart agent sessions are caught.
            const passwordType = await resolvePasswordType(handleUnlockWallet, true);
            if (passwordType !== "master") {
              return {
                success: false,
                error: "Extension reset requires master password",
              };
            }

            if (await hasUnresolvedSponsoredTransferIntent()) {
              return {
                success: false,
                error:
                  "Check pending sponsored transfers before resetting WalletChan",
              };
            }

            invalidateAuthCeremonies();
            invalidateAvatarImageCacheForWalletReset();
            // SECURITY: Perform full auth cleanup first (before async storage operations)
            await clearAllAuthState();

            // Rotate WalletConnect identity before persisted wallet secrets are
            // removed so old sessions cannot reattach to a later wallet.
            await resetWalletConnectForWalletReset();

            await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
              await performSecurityReset();

              const allLocalStorage = await chrome.storage.local.get(null);
              const localKeys = getWalletLocalStorageKeysToRemove(allLocalStorage);

              await Promise.all([
                chrome.storage.local.remove(localKeys),
                chrome.storage.sync.remove([...WALLET_SYNC_STORAGE_KEYS]),
              ]);

              await chrome.action.setBadgeText({ text: "" });
            });

            const notificationIds = await new Promise<string[]>((resolve) =>
              chrome.notifications.getAll((notifications) =>
                resolve(Object.keys(notifications)),
              ),
            );
            for (const notificationId of notificationIds) {
              chrome.notifications.clear(notificationId);
            }

            return { success: true };
          }),
        conflictResult: () => ({
          success: false,
          error:
            "A wallet request is currently being resolved. Wait for it to finish before resetting WalletChan.",
        }),
      })
        .then(sendResponse)
        .catch((error) => {
          console.error("Failed to reset extension:", error);
          sendResponse({ success: false, error: "Failed to reset extension" });
        });
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
      const safeUrl = sanitizeCustomExplorerUrl(notificationData);
      if (safeUrl) chrome.tabs.create({ url: safeUrl });
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
