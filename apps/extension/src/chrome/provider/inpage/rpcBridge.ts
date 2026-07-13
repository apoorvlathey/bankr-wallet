import { isSafeRpcForwardingMethod } from "../../network/safeRpcForwarding";
import { makeProviderError } from "../errors";
import { pendingRpcCallbacks } from "./pendingRequests";

export function requestRpcThroughContentScript(
  method: string,
  params: any[],
): Promise<any> {
  if (!isSafeRpcForwardingMethod(method)) {
    return Promise.reject(
      makeProviderError(
        "RPC method is not supported by the WalletChan provider proxy",
        -32601,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pendingRpcCallbacks.set(id, { resolve, reject });
    window.postMessage({ type: "i_rpcRequest", msg: { id, method, params } }, "*");
    setTimeout(() => {
      if (!pendingRpcCallbacks.has(id)) return;
      pendingRpcCallbacks.delete(id);
      reject(makeProviderError("RPC request timeout"));
    }, 30_000);
  });
}
