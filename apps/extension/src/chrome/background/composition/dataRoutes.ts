/** Read-only data, chat, clear-signing, and destructive reset route wiring. */

import {
  fetchAndCacheAvatarImage,
  invalidateAvatarImageCacheForWalletReset,
} from "../../avatarImageCache";
import {
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
  addMessageToConversation,
  updateMessageInConversation,
} from "../../bankr/chat/storage";
import { handleSubmitChatPrompt } from "../../bankr/chat/handlers";
import {
  fetchBridgeQuote,
  fetchBridgeStatus,
  getCachedBungeeChains,
  getCachedBungeeTokens,
} from "../../bridgeApi";
import {
  getBridgeDestinationChains,
  getBridgeSourceChains,
} from "../../bridgeChainsResolver";
import {
  getClearSigningEnabled,
  handleGetClearSigningDescriptor,
  handleInvalidateClearSigningCache,
  setClearSigningEnabled,
} from "../../clearSigningHandlers";
import {
  addCustomToken,
  getCustomTokens,
  removeCustomToken,
  updateCustomToken,
} from "../../customTokenStorage";
import { fetchNativePrice } from "../../gasEstimation";
import {
  resolveCoinGeckoErc20PricesBatch,
  resolveCoinGeckoNativeAssetsBatch,
} from "../../portfolio/coingecko";
import {
  clearAllAuthState,
  resolvePasswordType,
} from "../../sessionCache";
import {
  checkPermit2Allowance,
  checkTokenAllowance,
  fetchSwapPrice,
  fetchSwapQuote,
  fetchTokenInfo,
  fetchTokenPrice,
  getCachedTokenList,
  getTokenBalanceWei,
} from "../../swapApi";
import { resolveTokenLogoUrl, resolveTokenMetadata } from "../../tokenMetadata";
import {
  getWalletLocalStorageKeysToRemove,
  WALLET_SYNC_STORAGE_KEYS,
} from "../../walletResetStorage";
import { isTrustedWalletUiSender } from "../../trustedWalletUiSender";
import {
  handleUnlockWallet,
} from "../../authHandlers";
import {
  invalidateAuthCeremonies,
  runSerializedAuthTransition,
} from "../../authTransition";
import { hasUnresolvedSponsoredTransferIntent } from "../../sponsoredTransfers/intentStorage";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import { performSecurityReset } from "../../txHandlers";
import { deletePrivacyOperationsDatabase } from "../../privacy/operations/repository";
import { clearPrivacyPublicEventCache } from "../../privacy/events/repository";
import { deletePrivacyCommitmentsDatabase } from "../../privacy/commitments/repository";
import { deletePrivacyWithdrawalsDatabase } from "../../privacy/withdrawals/repository";
import { deletePrivacyRagequitsDatabase } from "../../privacy/ragequit/repository";
import { deletePrivacyPortfolioDatabase } from "../../privacy/portfolioHistory/repository";
import { resetWalletConnectForWalletReset } from "../../walletConnect/client";
import { readPrivacyResetRisk } from "../../privacy/resetSafety";
import { createBackgroundChatMessageRouter } from "../chatRouter";
import { createBackgroundClearSigningMessageRouter } from "../clearSigningRouter";
import { createBackgroundResetMessageRouter } from "../resetRouter";
import { createBackgroundSwapBridgeDataMessageRouter } from "../swapBridgeDataRouter";
import { createBackgroundTokenDataMessageRouter } from "../tokenDataRouter";
import type { PendingResolutionComposition } from "./pendingResolution";

export function composeDataRoutes(pending: PendingResolutionComposition) {
  const routeBackgroundSwapBridgeDataMessage =
    createBackgroundSwapBridgeDataMessageRouter({
      fetchSwapPrice,
      fetchSwapQuote,
      fetchBridgeQuote,
      fetchBridgeStatus,
      getBridgeSourceChains,
      getBridgeDestinationChains,
      getCachedBungeeChains,
      getCachedBungeeTokens,
      getCachedTokenList,
    });

  const routeBackgroundTokenDataMessage =
    createBackgroundTokenDataMessageRouter({
      isTrustedWalletUiSender,
      fetchTokenInfo,
      resolveTokenMetadata,
      getCustomTokens,
      addCustomToken,
      updateCustomToken,
      removeCustomToken,
      fetchTokenPrice,
      fetchNativePrice,
      fetchAndCacheAvatarImage,
      resolveCoinGeckoNativeAssetsBatch,
      resolveCoinGeckoErc20PricesBatch,
      resolveTokenLogoUrl,
      checkTokenAllowance,
      getTokenBalanceWei,
      checkPermit2Allowance,
    });

  const routeBackgroundChatMessage = createBackgroundChatMessageRouter({
    submitPrompt: handleSubmitChatPrompt,
    getConversations,
    getConversation,
    createConversation,
    deleteConversation,
    addMessage: addMessageToConversation,
    updateMessage: updateMessageInConversation,
  });

  const routeBackgroundClearSigningMessage =
    createBackgroundClearSigningMessageRouter({
      getDescriptor: handleGetClearSigningDescriptor,
      invalidateCache: handleInvalidateClearSigningCache,
      getEnabled: getClearSigningEnabled,
      setEnabled: setClearSigningEnabled,
    });

  const routeBackgroundResetMessage = createBackgroundResetMessageRouter({
    runWalletResetAgainstPendingResolutions: (options) =>
      pending.runWalletResetAgainstPendingResolutions(options),
    runSerializedAuthTransition,
    resolvePasswordType,
    handleUnlockWallet,
    hasUnresolvedSponsoredTransferIntent,
    readPrivacyResetRisk,
    invalidateAuthCeremonies,
    invalidateAvatarImageCacheForWalletReset,
    clearAllAuthState,
    resetWalletConnectForWalletReset: async () => {
      await resetWalletConnectForWalletReset();
    },
    withWalletSecretLock: (work) =>
      withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, work),
    performSecurityReset,
    deletePrivacyOperationsDatabase,
    deletePrivacyCommitmentsDatabase,
    deletePrivacyWithdrawalsDatabase,
    deletePrivacyRagequitsDatabase,
    deletePrivacyPortfolioDatabase,
    clearPrivacyPublicEventCache,
    getAllLocalStorage: () => chrome.storage.local.get(null),
    getWalletLocalStorageKeysToRemove,
    removeLocalStorage: (keys) => chrome.storage.local.remove(keys),
    walletSyncStorageKeys: WALLET_SYNC_STORAGE_KEYS,
    removeSyncStorage: (keys) => chrome.storage.sync.remove(keys),
    clearBadge: () => chrome.action.setBadgeText({ text: "" }),
    getNotificationIds: () =>
      new Promise((resolve) =>
        chrome.notifications.getAll((notifications) =>
          resolve(Object.keys(notifications)),
        ),
      ),
    clearNotification: (notificationId) => {
      void chrome.notifications.clear(notificationId);
    },
    error: (message, error) => console.error(message, error),
  });

  return {
    routeBackgroundSwapBridgeDataMessage,
    routeBackgroundTokenDataMessage,
    routeBackgroundChatMessage,
    routeBackgroundClearSigningMessage,
    routeBackgroundResetMessage,
  };
}
