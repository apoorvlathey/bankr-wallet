/** Authentication, onboarding, account-state, and settings route wiring. */

import {
  getActiveAccount,
  getTabAccounts,
} from "../../accountStorage";
import {
  getCachedApiKey,
  getAutoLockTimeout,
  getPasswordType,
  tryRestoreSession,
} from "../../sessionCache";
import {
  commitPreparedApiKeyUpdate,
  handleUnlockWallet,
  prepareApiKeyUpdateWithCachedPassword,
} from "../../authHandlers";
import { assertCurrentMasterAuthorization } from "../../masterAuthorization";
import { verifyBankrCredentialAddress } from "../../bankr/client";
import {
  updateBankrAccountAddressWithCredentialUpdate,
  validateBankrAccountAddressUpdate,
} from "../../accountStorage";
import {
  invalidateAvatarImageCacheForWalletReset,
} from "../../avatarImageCache";
import { resetWalletConnectForWalletReset } from "../../walletConnect/client";
import { openPopupWindow } from "../../txHandlers";
import { POPUP_PATH } from "../../sidepanelManager";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import { isTrustedWalletUiSender } from "../../trustedWalletUiSender";
import { createSendAccountToTab } from "../lifecycle/tabAccounts";
import { routeBackgroundAuthMessage } from "../authRouter";
import { routeBackgroundAccountStateMessage } from "../accountStateRouter";
import { createBackgroundBankrCredentialMessageRouter } from "../bankrCredentialRouter";
import { createBackgroundOnboardingMessageRouter } from "../onboardingRouter";
import { createBackgroundSettingsMessageRouter } from "../settingsRouter";

// Keep this adapter local to the only route family that publishes account
// compatibility messages to tabs.
const sendAccountToTab = createSendAccountToTab((tabId, message) =>
  chrome.tabs.sendMessage(tabId, message),
);

export function composeIdentityRoutes() {
  const routeBackgroundBankrCredentialMessage =
    createBackgroundBankrCredentialMessageRouter({
      isTrustedWalletUiSender,
      validateBankrAccountAddressUpdate,
      prepareApiKeyUpdateWithCachedPassword,
      verifyBankrCredentialAddress,
      withWalletSecretLock: (work) =>
        withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, work),
      assertCurrentMasterAuthorization,
      updateBankrAccountAddressWithCredentialUpdate,
      commitPreparedApiKeyUpdate,
      getActiveAccount,
      setSyncStorage: (values) => chrome.storage.sync.set(values),
      getTabAccounts,
      sendAccountToTab,
      sendRuntimeMessage: (runtimeMessage) =>
        chrome.runtime.sendMessage(runtimeMessage),
      getCachedApiKey,
      getAutoLockTimeout,
      tryRestoreSession,
      handleUnlockWallet,
      getPasswordType,
      warn: (warning, error) => console.warn(warning, error),
    });

  const routeBackgroundOnboardingMessage =
    createBackgroundOnboardingMessageRouter({
      resetWalletConnectForWalletReset: async () => {
        await resetWalletConnectForWalletReset();
      },
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

  return {
    routeBackgroundAuthMessage,
    routeBackgroundBankrCredentialMessage,
    routeBackgroundOnboardingMessage,
    routeBackgroundAccountStateMessage,
    routeBackgroundSettingsMessage,
  };
}
