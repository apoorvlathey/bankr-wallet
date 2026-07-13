/** Trusted-UI transport for swap quotes and bridge discovery/status data. */

export const BACKGROUND_SWAP_BRIDGE_DATA_MESSAGE_TYPES = [
  "fetchSwapPrice",
  "fetchSwapQuote",
  "fetchBridgeQuote",
  "fetchBridgeStatus",
  "fetchBridgeChains",
  "fetchBridgeChainsRaw",
  "fetchBridgeTokens",
  "fetchSwapTokenList",
] as const;

export type BackgroundSwapBridgeDataRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  fetchSwapPrice: (input: any) => Promise<any>;
  fetchSwapQuote: (input: any) => Promise<any>;
  fetchBridgeQuote: (input: any) => Promise<any>;
  fetchBridgeStatus: (input: any) => Promise<any>;
  getBridgeSourceChains: (accountType: any) => Promise<any>;
  getBridgeDestinationChains: () => Promise<any>;
  getCachedBungeeChains: () => Promise<any>;
  getCachedBungeeTokens: (chainId: number) => Promise<any>;
  getCachedTokenList: (chainId: number) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundSwapBridgeDataRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function respondWithData(
  request: Promise<any>,
  sendResponse: (response?: any) => void,
): void {
  request
    .then((data) => sendResponse({ success: true, data }))
    .catch((error) =>
      sendResponse({ success: false, error: error?.message }),
    );
}

export function createBackgroundSwapBridgeDataMessageRouter(
  dependencies: Dependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundSwapBridgeDataRouteResult {
  return (message, sendResponse) => {
    switch (message?.type) {
      case "fetchSwapPrice":
        respondWithData(
          dependencies.fetchSwapPrice({
            chainId: message.chainId,
            sellToken: message.sellToken,
            buyToken: message.buyToken,
            sellAmount: message.sellAmount,
            taker: message.taker,
            slippageBps: message.slippageBps,
          }),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "fetchSwapQuote":
        respondWithData(
          dependencies.fetchSwapQuote({
            chainId: message.chainId,
            sellToken: message.sellToken,
            buyToken: message.buyToken,
            sellAmount: message.sellAmount,
            taker: message.taker,
            slippageBps: message.slippageBps,
          }),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "fetchBridgeQuote":
        respondWithData(
          dependencies.fetchBridgeQuote({
            userAddress: message.userAddress,
            receiverAddress: message.receiverAddress,
            originChainId: message.originChainId,
            destinationChainId: message.destinationChainId,
            inputToken: message.inputToken,
            outputToken: message.outputToken,
            inputAmount: message.inputAmount,
            slippage: message.slippage,
          }),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "fetchBridgeStatus":
        respondWithData(
          dependencies.fetchBridgeStatus({
            requestHash: message.requestHash,
            txHash: message.txHash,
          }),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "fetchBridgeChains":
        respondWithData(
          message.side === "destination"
            ? dependencies.getBridgeDestinationChains()
            : dependencies.getBridgeSourceChains(message.accountType),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "fetchBridgeChainsRaw":
        respondWithData(dependencies.getCachedBungeeChains(), sendResponse);
        return HANDLED_ASYNC;

      case "fetchBridgeTokens":
        respondWithData(
          dependencies.getCachedBungeeTokens(message.chainId),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "fetchSwapTokenList":
        respondWithData(
          dependencies.getCachedTokenList(message.chainId),
          sendResponse,
        );
        return HANDLED_ASYNC;

      default:
        return { handled: false };
    }
  };
}
