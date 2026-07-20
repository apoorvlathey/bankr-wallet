export type WalletResetExecutionDependencies = {
  runSerializedAuthTransition: <T>(work: () => Promise<T>) => Promise<T>;
  resolvePasswordType: (unlock: any, allowRestore: boolean) => Promise<any>;
  handleUnlockWallet: (...args: any[]) => Promise<any>;
  hasUnresolvedSponsoredTransferIntent: () => Promise<boolean>;
  readPrivacyResetRisk: () => Promise<{ hasShieldData: boolean; backupVerified: boolean }>;
  invalidateAuthCeremonies: () => void;
  invalidateAvatarImageCacheForWalletReset: () => void;
  clearAllAuthState: () => Promise<void>;
  resetWalletConnectForWalletReset: () => Promise<void>;
  withWalletSecretLock: <T>(work: () => Promise<T>) => Promise<T>;
  performSecurityReset: () => Promise<void>;
  deletePrivacyOperationsDatabase: () => Promise<void>;
  deletePrivacyCommitmentsDatabase: () => Promise<void>;
  deletePrivacyWithdrawalsDatabase: () => Promise<void>;
  deletePrivacyRagequitsDatabase: () => Promise<void>;
  clearPrivacyPublicEventCache: () => Promise<void>;
  getAllLocalStorage: () => Promise<Record<string, unknown>>;
  getWalletLocalStorageKeysToRemove: (storage: Record<string, unknown>) => string[];
  removeLocalStorage: (keys: string[]) => Promise<void>;
  walletSyncStorageKeys: readonly string[];
  removeSyncStorage: (keys: string[]) => Promise<void>;
  clearBadge: () => Promise<void>;
  getNotificationIds: () => Promise<string[]>;
  clearNotification: (notificationId: string) => void;
};

export async function executeWalletReset(
  dependencies: WalletResetExecutionDependencies,
  privacyAcknowledged: boolean,
): Promise<{ success: boolean; error?: string }> {
  return dependencies.runSerializedAuthTransition(async () => {
    const passwordType = await dependencies.resolvePasswordType(
      dependencies.handleUnlockWallet,
      true,
    );
    if (passwordType !== "master") {
      return { success: false, error: "Extension reset requires master password" };
    }
    const privacyRisk = await dependencies.readPrivacyResetRisk();
    if (privacyRisk.hasShieldData && !privacyAcknowledged) {
      return {
        success: false,
        error: "Confirm that you saved the Shield recovery phrase or accept that Shield funds cannot be restored",
      };
    }
    if (await dependencies.hasUnresolvedSponsoredTransferIntent()) {
      return {
        success: false,
        error: "Check pending sponsored transfers before resetting WalletChan",
      };
    }

    dependencies.invalidateAuthCeremonies();
    dependencies.invalidateAvatarImageCacheForWalletReset();
    await dependencies.clearAllAuthState();
    await dependencies.resetWalletConnectForWalletReset();
    await dependencies.withWalletSecretLock(async () => {
      await dependencies.performSecurityReset();
      await dependencies.deletePrivacyOperationsDatabase();
      await dependencies.deletePrivacyCommitmentsDatabase();
      await dependencies.deletePrivacyWithdrawalsDatabase();
      await dependencies.deletePrivacyRagequitsDatabase();
      await dependencies.clearPrivacyPublicEventCache();
      const allLocalStorage = await dependencies.getAllLocalStorage();
      const localKeys = dependencies.getWalletLocalStorageKeysToRemove(allLocalStorage);
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
