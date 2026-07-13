import { makeProviderError } from "../errors";
import {
  isExecutionPermissionRequestInProgress,
  pendingExecutionPermissionCallbacks,
  setExecutionPermissionRequestInProgress,
} from "./pendingRequests";
import type { ProviderRequestContext } from "./requestContext";

export function requestExecutionPermissions(
  context: ProviderRequestContext,
  method: string,
  params: any[],
): Promise<any> {
  const id = crypto.randomUUID();
  const isEffectful = method === "wallet_requestExecutionPermissions";
  if (isEffectful) {
    if (isExecutionPermissionRequestInProgress()) {
      return Promise.reject(
        makeProviderError(
          "Cannot process requests while a wallet_requestExecutionPermissions request is in process",
          -32002,
        ),
      );
    }
    setExecutionPermissionRequestInProgress(true);
  }

  const promise = new Promise<any>((resolve, reject) => {
    pendingExecutionPermissionCallbacks.set(id, { resolve, reject, method });
    window.postMessage(
      {
        type: "i_walletExecutionPermissions",
        msg: { id, method, params: params || [], chainId: context.chainId },
      },
      "*",
    );
    if (!isEffectful) {
      setTimeout(() => {
        if (!pendingExecutionPermissionCallbacks.has(id)) return;
        pendingExecutionPermissionCallbacks.delete(id);
        reject(makeProviderError(`${method} timeout`));
      }, 15_000);
    }
  });
  return isEffectful
    ? promise.finally(() => setExecutionPermissionRequestInProgress(false))
    : promise;
}
