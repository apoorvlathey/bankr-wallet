import { makeProviderError } from "../errors";
import {
  pendingBatchCallbacks,
  pendingCallsStatusCallbacks,
  pendingCapabilitiesCallbacks,
} from "./pendingRequests";
import type { ProviderRequestContext } from "./requestContext";

export function requestCapabilities(
  context: ProviderRequestContext,
  params: any[],
): Promise<any> {
  const id = crypto.randomUUID();
  const address = params?.[0] || context.address;
  const chainIds = params?.[1];
  return new Promise((resolve, reject) => {
    pendingCapabilitiesCallbacks.set(id, { resolve, reject });
    window.postMessage(
      { type: "i_walletGetCapabilities", msg: { id, address, chainIds } },
      "*",
    );
    setTimeout(() => {
      if (!pendingCapabilitiesCallbacks.has(id)) return;
      pendingCapabilitiesCallbacks.delete(id);
      reject(makeProviderError("wallet_getCapabilities timeout"));
    }, 15_000);
  });
}

export function requestSendCalls(params: any[]): Promise<any> {
  const id = crypto.randomUUID();
  const sendCallsParams = params?.[0] || params;
  return new Promise((resolve, reject) => {
    pendingBatchCallbacks.set(id, { resolve, reject, params: sendCallsParams });
    window.postMessage(
      { type: "i_walletSendCalls", msg: { id, params: sendCallsParams } },
      "*",
    );
  });
}

export function requestCallsStatus(params: any[]): Promise<any> {
  const id = crypto.randomUUID();
  const bundleId = params?.[0];
  if (!bundleId) return Promise.reject(makeProviderError("Missing bundle ID"));
  return new Promise((resolve, reject) => {
    pendingCallsStatusCallbacks.set(id, { resolve, reject });
    window.postMessage(
      { type: "i_walletGetCallsStatus", msg: { id, bundleId } },
      "*",
    );
    setTimeout(() => {
      if (!pendingCallsStatusCallbacks.has(id)) return;
      pendingCallsStatusCallbacks.delete(id);
      reject(makeProviderError("wallet_getCallsStatus timeout"));
    }, 15_000);
  });
}

export function showCallsStatus(params: any[]): Promise<void> {
  const bundleId = params?.[0];
  if (bundleId) {
    window.postMessage(
      { type: "i_walletShowCallsStatus", msg: { bundleId } },
      "*",
    );
  }
  return Promise.resolve();
}
