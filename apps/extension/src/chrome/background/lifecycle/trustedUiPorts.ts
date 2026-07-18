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
      port.onMessage.addListener((message: unknown) => {
        // Receiving this exact secret-free pulse resets Chrome's MV3 worker
        // idle timer. Authentication timestamps remain untouched, so the
        // configured finite auto-lock duration is still authoritative.
        if (
          typeof message !== "object" ||
          message === null ||
          (message as { type?: unknown }).type !== "wallet-ui-keepalive" ||
          Object.keys(message).length !== 1
        ) {
          port.disconnect();
        }
      });
      port.onDisconnect.addListener(() => {
        dependencies.decrementUIConnections();
      });
    }
  });
}
