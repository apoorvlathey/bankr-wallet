/**
 * Focused Wallet-UI transport for fresh-wallet onboarding lifecycle messages.
 *
 * Cryptography, persistence, rollback, and secret-operation locking remain in
 * onboardingInitialization.ts. This module owns only message normalization,
 * response shapes, transition serialization, broadcasts, and channel lifetime.
 */

import {
  beginOnboardingInitialization,
  completeOnboardingInitialization,
  getOnboardingInitializationStatus,
  initializeOnboardingCredential,
  rollbackOnboardingInitialization,
} from "../onboardingInitialization";
import { runSerializedAuthTransition } from "../authTransition";

export const BACKGROUND_ONBOARDING_MESSAGE_TYPES = [
  "getOnboardingInitializationStatus",
  "beginOnboardingInitialization",
  "initializeOnboardingCredential",
  "completeOnboardingInitialization",
  "rollbackOnboardingInitialization",
  "onboardingComplete",
] as const;

export type BackgroundOnboardingRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  beginOnboardingInitialization: typeof beginOnboardingInitialization;
  completeOnboardingInitialization: typeof completeOnboardingInitialization;
  getOnboardingInitializationStatus: typeof getOnboardingInitializationStatus;
  initializeOnboardingCredential: typeof initializeOnboardingCredential;
  rollbackOnboardingInitialization: typeof rollbackOnboardingInitialization;
  runSerializedAuthTransition: typeof runSerializedAuthTransition;
  resetWalletConnectForWalletReset: () => Promise<void>;
  invalidateAvatarImageCacheForWalletReset: () => void;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
};

type EnvironmentDependencies = Pick<
  Dependencies,
  | "resetWalletConnectForWalletReset"
  | "invalidateAvatarImageCacheForWalletReset"
  | "sendRuntimeMessage"
>;

const productionDomainDependencies: Omit<
  Dependencies,
  keyof EnvironmentDependencies
> = {
  beginOnboardingInitialization,
  completeOnboardingInitialization,
  getOnboardingInitializationStatus,
  initializeOnboardingCredential,
  rollbackOnboardingInitialization,
  runSerializedAuthTransition,
};

const HANDLED_ASYNC: BackgroundOnboardingRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_SYNC: BackgroundOnboardingRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

function initializationId(value: unknown): string {
  return typeof value === "string" && value.length <= 128 ? value : "";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createBackgroundOnboardingMessageRouter(
  environment: EnvironmentDependencies,
  overrides: Partial<Dependencies> = {},
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundOnboardingRouteResult {
  const dependencies: Dependencies = {
    ...productionDomainDependencies,
    ...environment,
    ...overrides,
  };

  return (message, sendResponse) => {
    switch (message?.type) {
      case "getOnboardingInitializationStatus": {
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.getOnboardingInitializationStatus(
              initializationId(message.initializationId),
            ),
          )
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              configured: false,
              recoveryRequired: true,
              error: errorMessage(error, "Failed to inspect wallet setup"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "beginOnboardingInitialization": {
        dependencies
          .beginOnboardingInitialization(
            initializationId(message.initializationId),
            async () => {
              await dependencies.resetWalletConnectForWalletReset();
            },
            dependencies.invalidateAvatarImageCacheForWalletReset,
          )
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to start wallet setup"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "initializeOnboardingCredential": {
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.initializeOnboardingCredential(
              initializationId(message.initializationId),
              typeof message.credential === "string" ? message.credential : "",
              typeof message.password === "string" ? message.password : "",
            ),
          )
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(
                error,
                "Failed to initialize wallet credentials",
              ),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "completeOnboardingInitialization": {
        dependencies
          .completeOnboardingInitialization(
            initializationId(message.initializationId),
          )
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to complete wallet setup"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "rollbackOnboardingInitialization": {
        dependencies
          .runSerializedAuthTransition(() =>
            dependencies.rollbackOnboardingInitialization(
              initializationId(message.initializationId),
            ),
          )
          .then(sendResponse)
          .catch(() => sendResponse({ success: false }));
        return HANDLED_ASYNC;
      }

      case "onboardingComplete": {
        void dependencies
          .sendRuntimeMessage({ type: "onboardingComplete" })
          .catch(() => {});
        sendResponse({ success: true });
        return HANDLED_SYNC;
      }

      default:
        return { handled: false };
    }
  };
}
