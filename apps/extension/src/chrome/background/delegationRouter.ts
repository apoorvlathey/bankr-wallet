/** Trusted-UI EIP-7702 status, probe, set, and revoke transport. */

export const BACKGROUND_DELEGATION_MESSAGE_TYPES = [
  "getDelegationStatus",
  "probeDelegateContract",
  "initiateRevokeDelegation",
  "initiateSetDelegation",
] as const;

export type BackgroundDelegationRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: true };

export type BackgroundDelegationDependencies = {
  handleGetDelegationStatus: (...args: any[]) => Promise<any>;
  handleProbeDelegateContract: (...args: any[]) => Promise<any>;
  handleInitiateRevokeDelegation: (...args: any[]) => Promise<any>;
  handleInitiateSetDelegation: (...args: any[]) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundDelegationRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

export function createBackgroundDelegationMessageRouter(
  dependencies: BackgroundDelegationDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundDelegationRouteResult {
  return (message, sendResponse) => {
    switch (message?.type) {
      case "getDelegationStatus":
        dependencies
          .handleGetDelegationStatus(message.accountId, message.chainId)
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "probeDelegateContract":
        dependencies
          .handleProbeDelegateContract(message.chainId, message.address)
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "initiateRevokeDelegation":
        dependencies
          .handleInitiateRevokeDelegation(message.accountId, message.chainId)
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "initiateSetDelegation":
        dependencies
          .handleInitiateSetDelegation(
            message.accountId,
            message.chainId,
            message.targetDelegate,
          )
          .then(sendResponse);
        return HANDLED_ASYNC;
      default:
        return { handled: false };
    }
  };
}
