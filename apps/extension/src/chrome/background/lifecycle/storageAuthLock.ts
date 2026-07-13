/** Storage listeners that refresh only in-memory auth/permission policy. */

export type StorageAuthLockLifecycleDependencies = {
  storageOnChanged: {
    addListener: (
      listener: (changes: any, areaName: string) => Promise<void>,
    ) => void;
  };
  autoLockStorageKey: string;
  refreshErc7715PermissionRequestLockFromStorage: () => Promise<unknown>;
  handleAutoLockTimeoutStorageChange: (
    oldValue: unknown,
    newValue: unknown,
  ) => Promise<unknown>;
};

export function registerStorageAuthLockLifecycle(
  dependencies: StorageAuthLockLifecycleDependencies,
): void {
  dependencies.storageOnChanged.addListener(async (changes, areaName) => {
    if (
      areaName === "local" &&
      changes.pendingErc7715PermissionRequests
    ) {
      void dependencies.refreshErc7715PermissionRequestLockFromStorage();
    }

    if (
      areaName === "sync" &&
      changes[dependencies.autoLockStorageKey]
    ) {
      const change = changes[dependencies.autoLockStorageKey];
      void dependencies.handleAutoLockTimeoutStorageChange(
        change.oldValue,
        change.newValue,
      );
    }
  });
}
