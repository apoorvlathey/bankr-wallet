/** Trusted-wallet gas estimation and asset-change simulation transport. */

export const BACKGROUND_GAS_SIMULATION_MESSAGE_TYPES = [
  "estimateGas",
  "estimateForceInclusionGas",
  "estimateBatchGasSequential",
  "simulateAssetChanges",
  "simulateBatchAssetChanges",
  "simulateBatchAssetChangesNonAtomic",
  "retryTokenMetadata",
] as const;

export type BackgroundGasSimulationRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: true };

export type BackgroundGasSimulationDependencies = {
  estimateGas: (...args: any[]) => Promise<any>;
  estimateForceInclusionGas: (...args: any[]) => Promise<any>;
  estimateBatchGasSequential: (...args: any[]) => Promise<any>;
  simulateAssetChanges: (...args: any[]) => Promise<any>;
  simulateBatchAssetChanges: (...args: any[]) => Promise<any>;
  simulateBatchAssetChangesNonAtomic: (...args: any[]) => Promise<any>;
  retryTokenMetadata: (...args: any[]) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundGasSimulationRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

export function createBackgroundGasSimulationMessageRouter(
  dependencies: BackgroundGasSimulationDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundGasSimulationRouteResult {
  return (message, sendResponse) => {
    switch (message?.type) {
      case "estimateGas":
        dependencies
          .estimateGas(message.tx, message.accountAddress, {
            eip7702Delegate: message.eip7702Delegate,
            eip7702AuthCount: message.eip7702AuthCount,
          })
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "estimateForceInclusionGas":
        dependencies
          .estimateForceInclusionGas(message.tx, message.accountAddress)
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "estimateBatchGasSequential":
        dependencies
          .estimateBatchGasSequential(
            message.calls,
            message.fromAddress,
            message.chainId,
          )
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "simulateAssetChanges":
        dependencies
          .simulateAssetChanges(message.tx, message.accountAddress)
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "simulateBatchAssetChanges":
        dependencies
          .simulateBatchAssetChanges(
            message.calls,
            message.fromAddress,
            message.chainId,
          )
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "simulateBatchAssetChangesNonAtomic":
        dependencies
          .simulateBatchAssetChangesNonAtomic(
            message.calls,
            message.fromAddress,
            message.chainId,
          )
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "retryTokenMetadata":
        dependencies
          .retryTokenMetadata(
            message.chainId,
            message.tokenChanges,
            message.accountAddress,
            message.nativeChange,
          )
          .then(sendResponse);
        return HANDLED_ASYNC;
      default:
        return { handled: false };
    }
  };
}
