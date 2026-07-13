/**
 * Focused trusted-UI transport for WalletConnect listing, pairing, disconnect,
 * and active-chain selection. SDK lifecycle and teardown stay in the injected
 * WalletConnect handlers so this module has no relay SDK import side effects.
 */

export const BACKGROUND_WALLETCONNECT_SESSION_MESSAGE_TYPES = [
  "walletConnectGetSessions",
  "walletConnectPair",
  "walletConnectDisconnectSession",
  "walletConnectSwitchChain",
] as const;

export type BackgroundWalletConnectSessionRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  handleWalletConnectGetSessions: () => Promise<any>;
  handleWalletConnectPair: (uri: string) => Promise<any>;
  handleWalletConnectDisconnectSession: (topic: string) => Promise<any>;
  handleWalletConnectSwitchChain: (chainName: string) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundWalletConnectSessionRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

export function createBackgroundWalletConnectSessionMessageRouter(
  dependencies: Dependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundWalletConnectSessionRouteResult {
  return (message, sendResponse) => {
    let result: Promise<any>;
    switch (message?.type) {
      case "walletConnectGetSessions":
        result = dependencies.handleWalletConnectGetSessions();
        break;
      case "walletConnectPair":
        result = dependencies.handleWalletConnectPair(message.uri || "");
        break;
      case "walletConnectDisconnectSession":
        result = dependencies.handleWalletConnectDisconnectSession(
          message.topic || "",
        );
        break;
      case "walletConnectSwitchChain":
        result = dependencies.handleWalletConnectSwitchChain(
          message.chainName || "",
        );
        break;
      default:
        return { handled: false };
    }
    result.then(sendResponse);
    return HANDLED_ASYNC;
  };
}
