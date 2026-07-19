/** Chrome listener registration and immediate startup composition. */

import { sanitizeCustomExplorerUrl } from "@/lib/externalNavigation";
import { clearTabAccount } from "../../accountStorage";
import {
  activateBrowserTabAccount,
  replaceBrowserTabAccountScope,
  resolveBrowserTabAccount,
} from "../../accounts/tabResolver";
import { migrateFromLegacyStorage } from "../../accounts/legacyMigration";
import { resumePendingBridgePollers } from "../../bridgeStatusPoller";
import { cleanupOldBundleStatuses } from "../../bundleStatusStorage";
import { initEnsBrowsing } from "../../ensBrowsing";
import { recoverStuckForceInclusionTxs } from "../../forceInclusion/single";
import { resumePendingPollers } from "../../forceInclusion/receiptPoller";
import { prunePendingBridges } from "../../requests/pendingBridgeStorage";
import { updateBadge } from "../../requests/pendingTxStorage";
import {
  AUTO_LOCK_STORAGE_KEY,
  clearInMemoryAuthCache,
  decrementUIConnections,
  getAutoLockTimeout,
  handleAutoLockTimeoutStorageChange,
  incrementUIConnections,
  initializeAutoLockTimeoutDefault,
} from "../../sessionCache";
import {
  getSidePanelMode,
  initSidePanel,
  isSidePanelSupported,
} from "../../sidepanelManager";
import {
  CACHE_PRUNE_INTERVAL_MS,
  pruneNonCriticalStorageCaches,
} from "../../storageCachePruner";
import {
  getStorageKeysWithPrefixes,
  WALLET_RESULT_STORAGE_PREFIXES,
} from "../../walletResetStorage";
import {
  FRESH_INSTALL_THEME_ID,
  SELECTED_THEME_STORAGE_KEY,
  isThemeId,
} from "@/theme/tokens";
import { cleanupStaleProcessingTxs } from "../../txHistoryStorage";
import { openPopupWindow } from "../../txHandlers";
import { fullscreenRequestNotificationWindowId } from "../../windowing/providerRequestSurface";
import { resumePendingFeePaymentOperations } from "../../feePayment/recovery";
import { isTrustedWalletUiSender } from "../../trustedWalletUiSender";
import { initWalletConnect } from "../../walletConnect/client";
import { clearExpiredWalletConnectPendingRequests } from "../../walletConnect/storage";
import { invalidateAuthCeremonies } from "../../authTransition";
import { refreshErc7715PermissionRequestLockFromStorage } from "../../erc7715/requestLock";
import { registerActionFallbackLifecycle } from "../lifecycle/actionFallback";
import { registerInstallUpdateLifecycle } from "../lifecycle/installUpdate";
import { startMaintenanceLifecycle } from "../lifecycle/maintenance";
import { registerNotificationClickLifecycle } from "../lifecycle/notificationClicks";
import { startRecoveryLifecycle } from "../lifecycle/startupRecovery";
import { registerStorageAuthLockLifecycle } from "../lifecycle/storageAuthLock";
import { registerTabAccountLifecycle } from "../lifecycle/tabAccounts";
import { registerTrustedUiPortLifecycle } from "../lifecycle/trustedUiPorts";

export type BackgroundMessageListener = (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => boolean;

export function registerBackgroundLifecycle(
  onMessage: BackgroundMessageListener,
): void {
  registerStorageAuthLockLifecycle({
    storageOnChanged: chrome.storage.onChanged as any,
    autoLockStorageKey: AUTO_LOCK_STORAGE_KEY,
    refreshErc7715PermissionRequestLockFromStorage,
    handleAutoLockTimeoutStorageChange,
  });

  registerTabAccountLifecycle({
    activatedEvent: chrome.tabs.onActivated,
    updatedEvent: chrome.tabs.onUpdated as any,
    removedEvent: chrome.tabs.onRemoved,
    replacedEvent: chrome.tabs.onReplaced,
    activateBrowserTabAccount,
    resolveBrowserTabAccount,
    clearTabAccount,
    replaceBrowserTabAccountScope,
  });

  startMaintenanceLifecycle({
    suspendTarget: self as any,
    setInterval: (callback, milliseconds) =>
      setInterval(callback, milliseconds),
    invalidateAuthCeremonies,
    clearInMemoryAuthCache,
    clearExpiredWalletConnectPendingRequests,
    getAllLocalStorage: () => chrome.storage.local.get(null),
    getStorageKeysWithPrefixes,
    walletResultStoragePrefixes: WALLET_RESULT_STORAGE_PREFIXES,
    removeLocalStorage: (keys) => chrome.storage.local.remove(keys),
    pruneNonCriticalStorageCaches,
    cachePruneIntervalMs: CACHE_PRUNE_INTERVAL_MS,
    cleanupOldBundleStatuses,
    updateBadge,
    getAutoLockTimeout,
    now: Date.now,
    warn: (message, error) => console.warn(message, error),
  });

  registerInstallUpdateLifecycle({
    installedEvent: chrome.runtime.onInstalled as any,
    initializeAutoLockTimeoutDefault,
    getLocalStorage: (key) => chrome.storage.local.get(key),
    setLocalStorage: (values) => chrome.storage.local.set(values),
    selectedThemeStorageKey: SELECTED_THEME_STORAGE_KEY,
    freshInstallThemeId: FRESH_INSTALL_THEME_ID,
    isThemeId,
    migrateFromLegacyStorage,
    getSyncStorage: (keys) => chrome.storage.sync.get(keys),
    setSyncStorage: (values) => chrome.storage.sync.set(values),
    getRuntimeUrl: (path) => chrome.runtime.getURL(path),
    createTab: (options) => chrome.tabs.create(options),
    log: (message) => console.log(message),
    error: (message, error) => console.error(message, error),
  });

  startRecoveryLifecycle({
    initSidePanel,
    cleanupStaleProcessingTxs,
    resumePendingPollers,
    prunePendingBridges,
    resumePendingBridgePollers,
    recoverStuckForceInclusionTxs,
    initEnsBrowsing,
    initWalletConnect,
    startupEvent: chrome.runtime.onStartup,
    warn: (...args) => console.warn(...args),
  });
  void resumePendingFeePaymentOperations().catch((error) =>
    console.warn("[fee-payment] recovery failed", error),
  );

  registerActionFallbackLifecycle({
    actionClickedEvent: chrome.action.onClicked as any,
    openSidePanel: chrome.sidePanel?.open
      ? (options) => chrome.sidePanel.open(options)
      : null,
    getContexts: chrome.runtime.getContexts
      ? (options) =>
          chrome.runtime.getContexts({
            contextTypes: options.contextTypes as chrome.runtime.ContextType[],
          })
      : null,
    sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
    openPopupWindow,
    delay: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  });

  registerTrustedUiPortLifecycle({
    connectEvent: chrome.runtime.onConnect,
    isTrustedWalletUiSender,
    incrementUIConnections,
    decrementUIConnections,
    log: (message) => console.log(message),
  });

  chrome.runtime.onMessage.addListener(onMessage);

  registerNotificationClickLifecycle({
    notificationClickedEvent: chrome.notifications.onClicked as any,
    getLocalStorage: (keys) => chrome.storage.local.get(keys),
    removeLocalStorage: (key) => chrome.storage.local.remove(key),
    sanitizeCustomExplorerUrl,
    createTab: (options) => chrome.tabs.create(options),
    getSidePanelMode,
    isSidePanelSupported,
    getRuntimeUrl: (path) => chrome.runtime.getURL(path),
    createWindow: (options) => chrome.windows.create(options),
    clearNotification: (notificationId) =>
      chrome.notifications.clear(notificationId),
    fullscreenRequestWindowId: fullscreenRequestNotificationWindowId,
    openSidePanel: chrome.sidePanel?.open
      ? (options) => chrome.sidePanel.open(options)
      : null,
  });
}
