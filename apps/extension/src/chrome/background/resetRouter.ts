/** Trusted-UI wallet reset transport and destructive-effect ordering. */

export const BACKGROUND_RESET_MESSAGE_TYPES = ["resetExtension"] as const;

export type BackgroundResetRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: true };

export type BackgroundResetDependencies = {
  runWalletResetAgainstPendingResolutions: (options: {
    resolve: () => Promise<any>;
    conflictResult: () => any;
  }) => Promise<any>;
  runSerializedAuthTransition: <T>(work: () => Promise<T>) => Promise<T>;
  resolvePasswordType: (unlock: any, allowRestore: boolean) => Promise<any>;
  handleUnlockWallet: (...args: any[]) => Promise<any>;
  hasUnresolvedSponsoredTransferIntent: () => Promise<boolean>;
  hasUnresolvedSafeEffects: () => Promise<boolean>;
  invalidateAuthCeremonies: () => void;
  invalidateAvatarImageCacheForWalletReset: () => void;
  clearAllAuthState: () => Promise<void>;
  resetWalletConnectForWalletReset: () => Promise<void>;
  withWalletSecretLock: <T>(work: () => Promise<T>) => Promise<T>;
  performSecurityReset: () => Promise<void>;
  getAllLocalStorage: () => Promise<Record<string, unknown>>;
  getWalletLocalStorageKeysToRemove: (
    storage: Record<string, unknown>,
  ) => string[];
  removeLocalStorage: (keys: string[]) => Promise<void>;
  walletSyncStorageKeys: readonly string[];
  removeSyncStorage: (keys: string[]) => Promise<void>;
  clearBadge: () => Promise<void>;
  getNotificationIds: () => Promise<string[]>;
  clearNotification: (notificationId: string) => void;
  error: (message: string, error: unknown) => void;
};

const RESET_CONFLICT_ERROR =
  "A wallet request is currently being resolved. Wait for it to finish before resetting WalletChan.";

async function resetWallet(
  dependencies: BackgroundResetDependencies,
): Promise<{ success: boolean; error?: string }> {
  return dependencies.runSerializedAuthTransition(async () => {
    // Resolve through Never-session restoration so an agent session restored
    // after a service-worker restart remains unable to reset the wallet.
    const passwordType = await dependencies.resolvePasswordType(
      dependencies.handleUnlockWallet,
      true,
    );
    if (passwordType !== "master") {
      return {
        success: false,
        error: "Extension reset requires master password",
      };
    }

    if (await dependencies.hasUnresolvedSponsoredTransferIntent()) {
      return {
        success: false,
        error: "Check pending sponsored transfers before resetting WalletChan",
      };
    }
    if (await dependencies.hasUnresolvedSafeEffects()) {
      return {
        success: false,
        error: "Reconcile pending Safe publications or executions before resetting WalletChan",
      };
    }

    dependencies.invalidateAuthCeremonies();
    dependencies.invalidateAvatarImageCacheForWalletReset();
    await dependencies.clearAllAuthState();

    // Retire the old relay identity before deleting persisted wallet secrets.
    await dependencies.resetWalletConnectForWalletReset();

    await dependencies.withWalletSecretLock(async () => {
      await dependencies.performSecurityReset();
      const allLocalStorage = await dependencies.getAllLocalStorage();
      const localKeys =
        dependencies.getWalletLocalStorageKeysToRemove(allLocalStorage);
      await Promise.all([
        dependencies.removeLocalStorage(localKeys),
        dependencies.removeSyncStorage([...dependencies.walletSyncStorageKeys]),
      ]);
      await dependencies.clearBadge();
    });

    for (const notificationId of await dependencies.getNotificationIds()) {
      dependencies.clearNotification(notificationId);
    }
    return { success: true };
  });
}

export function createBackgroundResetMessageRouter(
  dependencies: BackgroundResetDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundResetRouteResult {
  return (message, sendResponse) => {
    if (message?.type !== "resetExtension") return { handled: false };

    // This call installs the global reset claim synchronously, before session
    // restoration or any destructive async work can begin.
    dependencies
      .runWalletResetAgainstPendingResolutions({
        resolve: () => resetWallet(dependencies),
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
