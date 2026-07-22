/** Immediate service-worker recovery and browser-startup WalletConnect init. */

export type StartupRecoveryDependencies = {
  initSidePanel: () => unknown;
  cleanupStaleProcessingTxs: () => unknown;
  resumePendingPollers: () => unknown;
  resumePrivacyShieldTracking: () => unknown;
  resumePrivacyUnshieldTracking: () => unknown;
  resumePrivacyRagequitTracking: () => unknown;
  prunePendingBridges: () => Promise<unknown>;
  resumePendingBridgePollers: () => unknown;
  recoverStuckForceInclusionTxs: () => unknown;
  initEnsBrowsing: () => Promise<unknown>;
  initWalletConnect: () => Promise<unknown>;
  startupEvent: { addListener: (listener: () => void) => void };
  warn: (...args: unknown[]) => void;
};

export function startRecoveryLifecycle(
  dependencies: StartupRecoveryDependencies,
): void {
  dependencies.initSidePanel();
  dependencies.cleanupStaleProcessingTxs();
  dependencies.resumePendingPollers();
  dependencies.resumePrivacyShieldTracking();
  dependencies.resumePrivacyUnshieldTracking();
  dependencies.resumePrivacyRagequitTracking();

  void dependencies
    .prunePendingBridges()
    .then(() => dependencies.resumePendingBridgePollers())
    .catch((error) => dependencies.warn("[bridge] resume failed", error));

  dependencies.recoverStuckForceInclusionTxs();
  void dependencies
    .initEnsBrowsing()
    .catch((error) => dependencies.warn("[ens] init failed", error));
  void dependencies
    .initWalletConnect()
    .catch((error) => dependencies.warn("[WalletConnect] init failed", error));

  dependencies.startupEvent.addListener(() => {
    void dependencies
      .initWalletConnect()
      .catch((error) =>
        dependencies.warn("[WalletConnect] startup init failed", error),
      );
  });
}
