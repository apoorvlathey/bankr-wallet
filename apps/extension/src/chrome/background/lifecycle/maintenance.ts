/** Suspend handling, transient-route cleanup, and immediate cache maintenance. */

export type MaintenanceLifecycleDependencies = {
  suspendTarget: {
    addEventListener: (type: "suspend", listener: () => void) => void;
  };
  setInterval: (callback: () => void, milliseconds: number) => unknown;
  invalidateAuthCeremonies: () => void;
  clearInMemoryAuthCache: () => void;
  clearExpiredWalletConnectPendingRequests: () => unknown;
  getAllLocalStorage: () => Promise<Record<string, any>>;
  getStorageKeysWithPrefixes: (
    storage: Record<string, unknown>,
    prefixes: readonly string[],
  ) => string[];
  walletResultStoragePrefixes: readonly string[];
  removeLocalStorage: (keys: string[]) => unknown;
  pruneNonCriticalStorageCaches: () => Promise<unknown>;
  cachePruneIntervalMs: number;
  cleanupOldBundleStatuses: () => unknown;
  updateBadge: () => unknown;
  getAutoLockTimeout: () => unknown;
  now: () => number;
  warn: (message: string, error: unknown) => void;
};

export function startMaintenanceLifecycle(
  dependencies: MaintenanceLifecycleDependencies,
): void {
  dependencies.suspendTarget.addEventListener("suspend", () => {
    dependencies.invalidateAuthCeremonies();
    dependencies.clearInMemoryAuthCache();
  });

  dependencies.setInterval(() => {
    dependencies.clearExpiredWalletConnectPendingRequests();
  }, 60_000);

  void dependencies.getAllLocalStorage().then((items) => {
    const staleKeys = dependencies
      .getStorageKeysWithPrefixes(
        items,
        dependencies.walletResultStoragePrefixes,
      )
      .filter((key) => {
        const entry = items[key];
        return (
          entry?.timestamp &&
          dependencies.now() - entry.timestamp > 30 * 60 * 1_000
        );
      });
    if (staleKeys.length > 0) dependencies.removeLocalStorage(staleKeys);
  });

  const pruneStorageCachesBestEffort = (): void => {
    dependencies.pruneNonCriticalStorageCaches().catch((error) => {
      dependencies.warn("[storage-cache] prune failed:", error);
    });
  };
  pruneStorageCachesBestEffort();
  dependencies.setInterval(
    pruneStorageCachesBestEffort,
    dependencies.cachePruneIntervalMs,
  );

  dependencies.cleanupOldBundleStatuses();
  dependencies.updateBadge();
  dependencies.getAutoLockTimeout();
}
