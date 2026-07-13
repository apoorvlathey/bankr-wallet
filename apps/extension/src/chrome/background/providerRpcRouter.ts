/** Provider transport for origin-authorized, read-only RPC forwarding. */

export const BACKGROUND_PROVIDER_RPC_MESSAGE_TYPES = ["rpcRequest"] as const;

export type BackgroundProviderRpcRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  authorizeConnectedDappRequest: (
    sender: chrome.runtime.MessageSender,
  ) => Promise<any>;
  handleSafeRpcRequest: (
    rpcUrl: string,
    method: string,
    params: unknown,
    origin: string,
  ) => Promise<any>;
  writeResultToStorage: (key: string, result: any) => Promise<void>;
};

const HANDLED_SYNC: BackgroundProviderRpcRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

export function createBackgroundProviderRpcMessageRouter(
  dependencies: Dependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
) => BackgroundProviderRpcRouteResult {
  return (message, sender) => {
    if (message?.type !== "rpcRequest") return { handled: false };

    const resultKey = `rpcResult:${message.rpcId}`;
    void dependencies
      .authorizeConnectedDappRequest(sender)
      .then(async (authorization) => {
        if (!authorization.authorized) {
          await dependencies.writeResultToStorage(resultKey, {
            error: authorization.error,
            code: authorization.code,
          });
          return;
        }
        await dependencies
          .handleSafeRpcRequest(
            message.rpcUrl,
            message.method,
            message.params,
            authorization.origin,
          )
          .then((result) =>
            dependencies.writeResultToStorage(resultKey, { result }),
          )
          .catch((error) =>
            dependencies.writeResultToStorage(resultKey, {
              error:
                error instanceof Error ? error.message : "RPC request failed",
            }),
          );
      });
    return HANDLED_SYNC;
  };
}
