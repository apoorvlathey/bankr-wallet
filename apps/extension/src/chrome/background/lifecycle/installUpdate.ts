/** Install/update migrations and fresh-install theme/onboarding lifecycle. */

export type InstallUpdateLifecycleDependencies = {
  installedEvent: {
    addListener: (listener: (details: any) => Promise<void>) => void;
  };
  initializeAutoLockTimeoutDefault: () => Promise<unknown>;
  getLocalStorage: (key: string) => Promise<Record<string, unknown>>;
  setLocalStorage: (values: Record<string, unknown>) => Promise<unknown>;
  selectedThemeStorageKey: string;
  freshInstallThemeId: string;
  isThemeId: (value: unknown) => boolean;
  migrateFromLegacyStorage: () => Promise<unknown>;
  getSyncStorage: (keys: string[]) => Promise<Record<string, any>>;
  setSyncStorage: (values: Record<string, unknown>) => Promise<unknown>;
  getRuntimeUrl: (path: string) => string;
  createTab: (options: { url: string }) => Promise<unknown>;
  log: (message: string) => void;
  error: (message: string, error: unknown) => void;
};

async function initializeThemeForFreshInstall(
  dependencies: InstallUpdateLifecycleDependencies,
): Promise<void> {
  const stored = await dependencies.getLocalStorage(
    dependencies.selectedThemeStorageKey,
  );
  if (
    dependencies.isThemeId(stored[dependencies.selectedThemeStorageKey])
  ) {
    return;
  }
  await dependencies.setLocalStorage({
    [dependencies.selectedThemeStorageKey]: dependencies.freshInstallThemeId,
  });
}

async function migrateCustomOptimismChain(
  dependencies: InstallUpdateLifecycleDependencies,
): Promise<void> {
  try {
    const { networksInfo, chainName } = await dependencies.getSyncStorage([
      "networksInfo",
      "chainName",
    ]);
    if (!networksInfo || typeof networksInfo !== "object") return;

    let oldName: string | null = null;
    for (const [name, entry] of Object.entries(
      networksInfo as Record<string, { chainId?: number }>,
    )) {
      if (entry?.chainId === 10 && name !== "Optimism") {
        oldName = name;
        break;
      }
    }
    if (!oldName) return;

    const oldEntry = (networksInfo as Record<string, any>)[oldName];
    const next = { ...(networksInfo as Record<string, any>) };
    delete next[oldName];
    next.Optimism = {
      chainId: 10,
      rpcUrl: oldEntry.rpcUrl,
      hidden: oldEntry.hidden,
    };

    const updates: Record<string, unknown> = { networksInfo: next };
    if (chainName === oldName) updates.chainName = "Optimism";
    await dependencies.setSyncStorage(updates);
    dependencies.log(
      `[WalletChan] Migrated custom chain "${oldName}" (chainId 10) → built-in "Optimism"`,
    );
  } catch (error) {
    dependencies.error("[WalletChan] OP Mainnet migration failed:", error);
  }
}

export function registerInstallUpdateLifecycle(
  dependencies: InstallUpdateLifecycleDependencies,
): void {
  dependencies.installedEvent.addListener(async (details) => {
    if (details.reason === "install") {
      await dependencies.initializeAutoLockTimeoutDefault().catch((error) =>
        dependencies.error(
          "[WalletChan] Auto-lock initialization failed:",
          error,
        ),
      );
      await initializeThemeForFreshInstall(dependencies).catch((error) =>
        dependencies.error("[WalletChan] Theme initialization failed:", error),
      );
      const onboardingUrl = dependencies.getRuntimeUrl("onboarding.html");
      await dependencies.createTab({ url: onboardingUrl }).catch((error) =>
        dependencies.error(
          "[WalletChan] Could not open onboarding:",
          error,
        ),
      );
    } else if (details.reason === "update") {
      await dependencies.initializeAutoLockTimeoutDefault().catch((error) =>
        dependencies.error("[WalletChan] Auto-lock migration failed:", error),
      );
      await dependencies.migrateFromLegacyStorage().catch((error) =>
        dependencies.error(
          "[WalletChan] Legacy account migration failed:",
          error,
        ),
      );
      await migrateCustomOptimismChain(dependencies).catch((error) =>
        dependencies.error("[WalletChan] Optimism migration failed:", error),
      );
    }
  });
}
