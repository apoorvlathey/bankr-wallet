/**
 * Focused Wallet-UI auth/session message transport.
 *
 * Domain modules retain authentication, persistence, and locking behavior;
 * this layer preserves arguments, responses, broadcasts, and channel lifetime.
 */

import {
  getCurrentSessionId,
  getAutoLockTimeout,
  getCachedPassword,
  isApiKeyCached,
  isWalletUnlocked,
  resolvePasswordType,
  setAutoLockTimeout,
  tryRestoreSession,
} from "../sessionCache";
import {
  handleChangePassword,
  handleRemoveAgentPassword,
  handleSetAgentPassword,
  handleUnlockWallet,
  verifyMasterPassword,
} from "../authHandlers";
import {
  handleCanSetupPasskeyUnlock,
  handleGetPasskeyUnlockStatus,
  handleRemovePasskeyUnlock,
  handleSetupPasskeyUnlock,
  handleSetupPasskeyUnlockWithPassword,
  handleUnlockWithPasskey,
  handleVerifyPasskeySetupPassword,
} from "../passkeyUnlock";
import {
  invalidateAuthCeremonies,
  runSerializedAuthTransition,
} from "../authTransition";
import { terminateActiveAuthSession } from "../auth/sessionTermination";

export const BACKGROUND_AUTH_MESSAGE_TYPES = [
  "isApiKeyCached",
  "clearApiKeyCache",
  "unlockWallet",
  "getPasskeyUnlockStatus",
  "canSetupPasskeyUnlock",
  "verifyPasskeySetupPassword",
  "setupPasskeyUnlock",
  "setupPasskeyUnlockWithPassword",
  "unlockWithPasskey",
  "removePasskeyUnlock",
  "lockWallet",
  "isWalletUnlocked",
  "validateSession",
  "tryRestoreSession",
  "getCachedPassword",
  "verifyMasterPassword",
  "changePassword",
  "setAgentPassword",
  "removeAgentPassword",
  "isAgentPasswordEnabled",
  "getPasswordType",
  "getAutoLockTimeout",
  "setAutoLockTimeout",
] as const;

export type BackgroundAuthRouteResult = { handled: false } | {
  handled: true;
  keepChannelOpen: boolean;
};

type Dependencies = {
  getCurrentSessionId: typeof getCurrentSessionId;
  getAutoLockTimeout: typeof getAutoLockTimeout;
  getCachedPassword: typeof getCachedPassword;
  isApiKeyCached: typeof isApiKeyCached;
  isWalletUnlocked: typeof isWalletUnlocked;
  resolvePasswordType: typeof resolvePasswordType;
  setAutoLockTimeout: typeof setAutoLockTimeout;
  tryRestoreSession: typeof tryRestoreSession;
  handleChangePassword: typeof handleChangePassword;
  handleRemoveAgentPassword: typeof handleRemoveAgentPassword;
  handleSetAgentPassword: typeof handleSetAgentPassword;
  handleUnlockWallet: typeof handleUnlockWallet;
  verifyMasterPassword: typeof verifyMasterPassword;
  handleCanSetupPasskeyUnlock: typeof handleCanSetupPasskeyUnlock;
  handleGetPasskeyUnlockStatus: typeof handleGetPasskeyUnlockStatus;
  handleRemovePasskeyUnlock: typeof handleRemovePasskeyUnlock;
  handleSetupPasskeyUnlock: typeof handleSetupPasskeyUnlock;
  handleSetupPasskeyUnlockWithPassword: typeof handleSetupPasskeyUnlockWithPassword;
  handleUnlockWithPasskey: typeof handleUnlockWithPasskey;
  handleVerifyPasskeySetupPassword: typeof handleVerifyPasskeySetupPassword;
  invalidateAuthCeremonies: typeof invalidateAuthCeremonies;
  runSerializedAuthTransition: typeof runSerializedAuthTransition;
  terminateActiveAuthSession: typeof terminateActiveAuthSession;
  readLocal: (key: string) => Promise<Record<string, unknown>>;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
};

const productionDependencies: Dependencies = {
  getCurrentSessionId,
  getAutoLockTimeout,
  getCachedPassword,
  isApiKeyCached,
  isWalletUnlocked,
  resolvePasswordType,
  setAutoLockTimeout,
  tryRestoreSession,
  handleChangePassword,
  handleRemoveAgentPassword,
  handleSetAgentPassword,
  handleUnlockWallet,
  verifyMasterPassword,
  handleCanSetupPasskeyUnlock,
  handleGetPasskeyUnlockStatus,
  handleRemovePasskeyUnlock,
  handleSetupPasskeyUnlock,
  handleSetupPasskeyUnlockWithPassword,
  handleUnlockWithPasskey,
  handleVerifyPasskeySetupPassword,
  invalidateAuthCeremonies,
  runSerializedAuthTransition,
  terminateActiveAuthSession,
  readLocal: (key) => chrome.storage.local.get(key),
  sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
};

const HANDLED_ASYNC: BackgroundAuthRouteResult = { handled: true, keepChannelOpen: true };
const HANDLED_SYNC: BackgroundAuthRouteResult = { handled: true, keepChannelOpen: false };

function broadcastUnlocked(dependencies: Dependencies): void {
  void dependencies
    .sendRuntimeMessage({ type: "walletUnlockedExternal" })
    .catch(() => {});
}

export function createBackgroundAuthMessageRouter(
  overrides: Partial<Dependencies> = {},
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundAuthRouteResult {
  const dependencies: Dependencies = {
    ...productionDependencies,
    ...overrides,
  };

  return (message, sendResponse) => {
    switch (message?.type) {
      case "isApiKeyCached":
        sendResponse(dependencies.isApiKeyCached());
        return HANDLED_SYNC;

      case "clearApiKeyCache":
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.terminateActiveAuthSession(),
          )
          .then(sendResponse)
          .catch((error) => {
            console.error("Failed to clear authentication cache:", error);
            sendResponse({ success: false, error: "Failed to lock wallet" });
          });
        return HANDLED_ASYNC;

      case "unlockWallet":
        dependencies
          .runSerializedAuthTransition(async () => {
            const result = await dependencies.handleUnlockWallet(message.password);
            if (result.success) dependencies.invalidateAuthCeremonies();
            return result;
          })
          .then((result) => {
            if (result.success) broadcastUnlocked(dependencies);
            sendResponse(result);
          })
          .catch((error) => {
            console.error("Failed to unlock wallet:", error);
            sendResponse({ success: false, error: "Failed to unlock wallet" });
          });
        return HANDLED_ASYNC;

      case "getPasskeyUnlockStatus":
        dependencies.handleGetPasskeyUnlockStatus().then(sendResponse).catch((error) => {
          console.error("Failed to load biometric unlock status:", error);
          sendResponse({
            success: false,
            configured: false,
            error: "Failed to load biometric unlock status",
          });
        });
        return HANDLED_ASYNC;

      case "canSetupPasskeyUnlock":
        dependencies.handleCanSetupPasskeyUnlock().then(sendResponse).catch((error) => {
          console.error("Failed to preflight biometric setup:", error);
          sendResponse({ success: false, error: "Failed to verify biometric setup" });
        });
        return HANDLED_ASYNC;

      case "verifyPasskeySetupPassword":
        dependencies
          .handleVerifyPasskeySetupPassword(message.masterPassword || "")
          .then(sendResponse)
          .catch((error) => {
            console.error("Failed to verify biometric setup password:", error);
            sendResponse({ success: false, error: "Failed to verify master password" });
          });
        return HANDLED_ASYNC;

      case "setupPasskeyUnlock":
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.handleSetupPasskeyUnlock(message),
          )
          .then(sendResponse)
          .catch((error) => {
            console.error("Failed to set up biometric unlock:", error);
            sendResponse({ success: false, error: "Failed to set up biometric unlock" });
          });
        return HANDLED_ASYNC;

      case "setupPasskeyUnlockWithPassword":
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.handleSetupPasskeyUnlockWithPassword(
              message,
              message.masterPassword || "",
            ),
          )
          .then((result) => {
            if (result.success) broadcastUnlocked(dependencies);
            sendResponse(result);
          })
          .catch((error) => {
            console.error("Failed to set up biometric unlock:", error);
            sendResponse({ success: false, error: "Failed to set up biometric unlock" });
          });
        return HANDLED_ASYNC;

      case "unlockWithPasskey":
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.handleUnlockWithPasskey(message),
          )
          .then((result) => {
            if (result.success) broadcastUnlocked(dependencies);
            sendResponse(result);
          })
          .catch((error) => {
            console.error("Failed to unlock with biometrics:", error);
            sendResponse({ success: false, error: "Biometric unlock failed" });
          });
        return HANDLED_ASYNC;

      case "removePasskeyUnlock":
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.handleRemovePasskeyUnlock(message.masterPassword || ""),
          )
          .then(sendResponse)
          .catch((error) => {
            console.error("Failed to remove biometric unlock:", error);
            sendResponse({ success: false, error: "Failed to remove biometric unlock" });
          });
        return HANDLED_ASYNC;

      case "lockWallet":
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.terminateActiveAuthSession(true),
          )
          .then(sendResponse)
          .catch((error) => {
            console.error("Failed to lock wallet:", error);
            sendResponse({ success: false, error: "Failed to lock wallet" });
          });
        return HANDLED_ASYNC;

      case "isWalletUnlocked":
        void (async () => {
          await dependencies.getAutoLockTimeout();
          let unlocked = dependencies.isWalletUnlocked();
          if (!unlocked) {
            if (await dependencies.tryRestoreSession(dependencies.handleUnlockWallet)) {
              unlocked = true;
            }
          }
          sendResponse(unlocked);
        })();
        return HANDLED_ASYNC;

      case "validateSession":
        sendResponse({
          valid:
            dependencies.getCurrentSessionId() !== null &&
            dependencies.isWalletUnlocked(),
          sessionId: dependencies.getCurrentSessionId(),
        });
        return HANDLED_SYNC;

      case "tryRestoreSession":
        dependencies
          .tryRestoreSession(dependencies.handleUnlockWallet)
          .then(sendResponse);
        return HANDLED_ASYNC;

      case "getCachedPassword":
        void (async () => {
          let hasCached = dependencies.getCachedPassword() !== null;
          const shouldRestore = !hasCached && !dependencies.isWalletUnlocked();
          if (shouldRestore) {
            if (await dependencies.tryRestoreSession(dependencies.handleUnlockWallet)) {
              hasCached = dependencies.getCachedPassword() !== null;
            }
          }
          sendResponse({ hasCachedPassword: hasCached });
        })();
        return HANDLED_ASYNC;

      case "verifyMasterPassword":
        dependencies.verifyMasterPassword(message.masterPassword || "").then((valid) => {
          sendResponse({
            success: valid,
            error: valid ? undefined : "Invalid master password",
          });
        }).catch((error) => {
          console.error("Failed to verify master password:", error);
          sendResponse({ success: false, error: "Failed to verify master password" });
        });
        return HANDLED_ASYNC;

      case "changePassword":
        dependencies.runSerializedAuthTransition(async () => {
          const result = await dependencies.handleChangePassword(
            message.currentPassword || "",
            message.newPassword,
          );
          if (result.success) dependencies.invalidateAuthCeremonies();
          return result;
        }).then(sendResponse).catch((error) => {
          console.error("Failed to change password:", error);
          sendResponse({ success: false, error: "Failed to change password" });
        });
        return HANDLED_ASYNC;

      case "setAgentPassword":
      case "removeAgentPassword": {
        const operation = message.type === "setAgentPassword"
          ? () => dependencies.handleSetAgentPassword(
              typeof message.agentPassword === "string" ? message.agentPassword : "",
              typeof message.masterPassword === "string" ? message.masterPassword : "",
            )
          : () => dependencies.handleRemoveAgentPassword(message.masterPassword);
        dependencies.runSerializedAuthTransition(async () => {
          const result = await operation();
          if (result.success) dependencies.invalidateAuthCeremonies();
          return result;
        }).then(sendResponse).catch((error) => {
          console.error(`Failed to ${message.type === "setAgentPassword" ? "set" : "remove"} agent password:`, error);
          sendResponse({
            success: false,
            error: `Failed to ${message.type === "setAgentPassword" ? "set" : "remove"} agent password`,
          });
        });
        return HANDLED_ASYNC;
      }
      case "isAgentPasswordEnabled":
        void dependencies.readLocal("agentPasswordEnabled").then(({ agentPasswordEnabled }) => {
          sendResponse({ enabled: !!agentPasswordEnabled });
        });
        return HANDLED_ASYNC;
      case "getPasswordType":
        dependencies.resolvePasswordType(dependencies.handleUnlockWallet).then((passwordType) => {
          sendResponse({ passwordType });
        });
        return HANDLED_ASYNC;

      case "getAutoLockTimeout":
        dependencies.getAutoLockTimeout().then((timeout) => {
          sendResponse({ timeout });
        });
        return HANDLED_ASYNC;

      case "setAutoLockTimeout":
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.setAutoLockTimeout(message.timeout),
          )
          .then((success) => sendResponse({ success }))
          .catch(() => sendResponse({ success: false }));
        return HANDLED_ASYNC;

      default:
        return { handled: false };
    }
  };
}

export const routeBackgroundAuthMessage = createBackgroundAuthMessageRouter();
