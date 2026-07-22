/** Trusted-UI wallet reset transport and destructive-effect ordering. */

import {
  executeWalletReset,
  type WalletResetExecutionDependencies,
} from "./reset/execution";

export const BACKGROUND_RESET_MESSAGE_TYPES = [
  "privacyGetResetRisk",
  "resetExtension",
] as const;

export type BackgroundResetRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: true };

export type BackgroundResetDependencies = WalletResetExecutionDependencies & {
  runWalletResetAgainstPendingResolutions: (options: {
    resolve: () => Promise<any>;
    conflictResult: () => any;
  }) => Promise<any>;
  error: (message: string, error: unknown) => void;
};

const RESET_CONFLICT_ERROR =
  "A wallet request is currently being resolved. Wait for it to finish before resetting WalletChan.";

export function createBackgroundResetMessageRouter(
  dependencies: BackgroundResetDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundResetRouteResult {
  return (message, sendResponse) => {
    if (message?.type === "privacyGetResetRisk") {
      if (
        typeof message !== "object" || message === null ||
        Array.isArray(message) || Object.keys(message).length !== 1
      ) {
        sendResponse({ success: false, error: "Invalid request" });
        return { handled: true, keepChannelOpen: true };
      }
      dependencies.readPrivacyResetRisk()
        .then((risk) => sendResponse({ success: true, ...risk }))
        .catch(() => sendResponse({
          success: true,
          hasShieldData: true,
          backupVerified: false,
        }));
      return { handled: true, keepChannelOpen: true };
    }
    if (message?.type !== "resetExtension") return { handled: false };
    if (
      typeof message !== "object" || message === null ||
      Array.isArray(message) || Object.keys(message).length !== 2 ||
      typeof message.privacyAcknowledged !== "boolean"
    ) {
      sendResponse({ success: false, error: "Invalid request" });
      return { handled: true, keepChannelOpen: true };
    }

    // This call installs the global reset claim synchronously, before session
    // restoration or any destructive async work can begin.
    dependencies
      .runWalletResetAgainstPendingResolutions({
        resolve: () => executeWalletReset(
          dependencies,
          message.privacyAcknowledged,
        ),
        conflictResult: () => ({
          success: false,
          error: RESET_CONFLICT_ERROR,
        }),
      })
      .then(sendResponse)
      .catch((error) => {
        dependencies.error("Failed to reset extension:", error);
        sendResponse({ success: false, error: "Failed to reset extension" });
      });
    return { handled: true, keepChannelOpen: true };
  };
}
