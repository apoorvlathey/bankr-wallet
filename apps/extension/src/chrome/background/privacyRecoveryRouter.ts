/** Trusted-UI transport for explicit Privacy Pools backup, restore, and rescan. */

import { rescanPrivacyCommitmentsWithActiveIdentity } from "../privacy/commitments/rescan";
import {
  PrivacyRecoveryError,
  readPrivacyRecoveryStatus,
  restorePrivacyRecovery,
  revealPrivacyRecovery,
} from "../privacy/recovery/operations";

export const BACKGROUND_PRIVACY_RECOVERY_MESSAGE_TYPES = [
  "privacyGetRecoveryStatus",
  "privacyRevealRecovery",
  "privacyRestoreRecovery",
  "privacyRescanRecovery",
] as const;

export type BackgroundPrivacyRecoveryRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  readPrivacyRecoveryStatus: typeof readPrivacyRecoveryStatus;
  revealPrivacyRecovery: typeof revealPrivacyRecovery;
  restorePrivacyRecovery: typeof restorePrivacyRecovery;
  rescanPrivacyCommitmentsWithActiveIdentity: typeof rescanPrivacyCommitmentsWithActiveIdentity;
};

const productionDependencies: Dependencies = {
  readPrivacyRecoveryStatus,
  revealPrivacyRecovery,
  restorePrivacyRecovery,
  rescanPrivacyCommitmentsWithActiveIdentity,
};

function exactRequest(message: unknown, type: string): boolean {
  return typeof message === "object" && message !== null &&
    !Array.isArray(message) && Object.keys(message).length === 1 &&
    (message as { type?: unknown }).type === type;
}

function revealRequest(
  message: unknown,
): message is { type: "privacyRevealRecovery"; password: string } {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return false;
  }
  const value = message as Record<string, unknown>;
  return Object.keys(value).length === 2 &&
    value.type === "privacyRevealRecovery" &&
    typeof value.password === "string";
}

function restoreRequest(message: unknown): message is {
  type: "privacyRestoreRecovery";
  requestId: string;
  phrase: string;
  password: string;
} {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return false;
  }
  const value = message as Record<string, unknown>;
  return Object.keys(value).length === 4 &&
    value.type === "privacyRestoreRecovery" &&
    typeof value.requestId === "string" &&
    typeof value.phrase === "string" && value.phrase.length <= 512 &&
    typeof value.password === "string";
}

function recoveryFailure(error: unknown): {
  success: false;
  code: string;
  error: string;
} {
  const code = error instanceof PrivacyRecoveryError
    ? error.code
    : "recovery-unavailable";
  const messages = {
    "invalid-request": "Enter a valid 12-word Shield recovery phrase.",
    "auth-required": "Enter your main password and try again.",
    "account-unavailable": "Switch to a wallet account and try again.",
    "recovery-missing": "No Shield recovery phrase exists yet.",
    "recovery-conflict":
      "A different Shield identity already exists. Reset before restoring another phrase.",
    "recovery-unavailable": "Shield recovery is unavailable. Try again.",
  } as const;
  return { success: false, code, error: messages[code] };
}

export function createBackgroundPrivacyRecoveryMessageRouter(
  overrides: Partial<Dependencies> = {},
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundPrivacyRecoveryRouteResult {
  const dependencies = { ...productionDependencies, ...overrides };
  return (message, sendResponse) => {
    switch (message?.type) {
      case "privacyGetRecoveryStatus":
        if (!exactRequest(message, "privacyGetRecoveryStatus")) {
          sendResponse({ success: false, error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.readPrivacyRecoveryStatus()
          .then(sendResponse)
          .catch(() => sendResponse({
            success: false,
            status: "attention",
            error: "Shield recovery needs attention.",
          }));
        return { handled: true, keepChannelOpen: true };

      case "privacyRevealRecovery":
        if (!revealRequest(message)) {
          sendResponse({ success: false, error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.revealPrivacyRecovery(message.password)
          .then((result) => sendResponse({ success: true, ...result }))
          .catch((error: unknown) => sendResponse(recoveryFailure(error)));
        return { handled: true, keepChannelOpen: true };

      case "privacyRestoreRecovery":
        if (!restoreRequest(message)) {
          sendResponse({
            success: false,
            code: "invalid-request",
            error: "Enter a valid 12-word Shield recovery phrase.",
          });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.restorePrivacyRecovery({
          requestId: message.requestId,
          phrase: message.phrase,
          password: message.password,
        }).then((result) => sendResponse({ success: true, ...result }))
          .catch((error: unknown) => sendResponse(recoveryFailure(error)));
        return { handled: true, keepChannelOpen: true };

      case "privacyRescanRecovery":
        if (!exactRequest(message, "privacyRescanRecovery")) {
          sendResponse({ success: false, error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.rescanPrivacyCommitmentsWithActiveIdentity()
          .then((result) => sendResponse({ success: true, result }))
          .catch(() => sendResponse({
            success: false,
            code: "recovery-unavailable",
            error: "Couldn’t scan Sepolia right now. Your recovery phrase is still saved.",
          }));
        return { handled: true, keepChannelOpen: true };

      default:
        return { handled: false };
    }
  };
}
