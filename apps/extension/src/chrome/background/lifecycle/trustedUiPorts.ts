/** Wallet-UI wake, authenticated-surface, and onboarding keepalive ports. */
import {
  bindTrustedUiKeepalivePort,
  exactPortMessage,
  type TrustedUiPortProtocolDependencies,
} from "./trustedUiPortProtocol";

export type TrustedUiPortLifecycleDependencies =
  TrustedUiPortProtocolDependencies & {
  connectEvent: { addListener: (listener: (port: any) => void) => void };
  isTrustedWalletUiSender: (sender: chrome.runtime.MessageSender) => boolean;
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
      return;
    }
    if (port.name === "onboarding-keepalive") {
      port.onMessage.addListener((message: unknown) => {
        if (!exactPortMessage(message, "wallet-worker-keepalive", ["type"])) {
          port.disconnect();
        }
      });
      return;
    }
    if (port.name !== "ui-keepalive") return;
    bindTrustedUiKeepalivePort(port, dependencies);
  });
}
