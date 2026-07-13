/** Wallet-UI wake and keepalive port registration. */

export type TrustedUiPortLifecycleDependencies = {
  connectEvent: { addListener: (listener: (port: any) => void) => void };
  isTrustedWalletUiSender: (sender: chrome.runtime.MessageSender) => boolean;
  incrementUIConnections: () => void;
  decrementUIConnections: () => void;
  log: (message: string) => void;
};

export function registerTrustedUiPortLifecycle(
  dependencies: TrustedUiPortLifecycleDependencies,
): void {
  dependencies.connectEvent.addListener((port) => {
    if (!dependencies.isTrustedWalletUiSender(port.sender || {})) {
      port.disconnect();
      return;
    }
    if (port.name === "popup-wake") {
      dependencies.log("Service worker woken up by popup");
    } else if (port.name === "ui-keepalive") {
      dependencies.incrementUIConnections();
      port.onDisconnect.addListener(() => {
        dependencies.decrementUIConnections();
      });
    }
  });
}
