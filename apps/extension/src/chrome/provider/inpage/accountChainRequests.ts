import { makeProviderError } from "../errors";
import {
  pendingAccountCallbacks,
  pendingSignatureCallbacks,
  pendingWatchAssetCallbacks,
} from "./pendingRequests";
import type { ProviderRequestContext } from "./requestContext";

export function requestDappAccounts(
  method: "eth_accounts" | "eth_requestAccounts",
): Promise<string[]> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pendingAccountCallbacks.set(id, { resolve, reject, method });
    window.postMessage({ type: "i_dappAccounts", msg: { id, method } }, "*");
  });
}

export async function requestAddEthereumChain(
  context: ProviderRequestContext,
  params: any[],
): Promise<null> {
  const addParams = params[0];
  const chainId = Number(addParams.chainId as string);
  const requestId = crypto.randomUUID();
  const result = new Promise<null>((resolve, reject) => {
    window.postMessage(
      {
        type: "i_addEthereumChain",
        msg: {
          id: requestId,
          chainId,
          chainName: addParams.chainName,
          nativeCurrency: addParams.nativeCurrency,
          rpcUrls: addParams.rpcUrls,
          blockExplorerUrls: addParams.blockExplorerUrls,
        },
      },
      "*",
    );
    const controller = new AbortController();
    window.addEventListener(
      "message",
      (event: any) => {
        if (event.source !== window || event.data?.type !== "addEthereumChainResult") {
          return;
        }
        const message = event.data.msg;
        if (message.id !== requestId) return;
        controller.abort();
        if (message.success) {
          if (message.shouldSwitch !== false) context.setChainId(message.chainId);
          resolve(null);
        } else {
          reject(
            makeProviderError(
              message.error || `Failed to add chain ${chainId}`,
              message.code,
            ),
          );
        }
      },
      { signal: controller.signal } as AddEventListenerOptions,
    );
  });
  await result;
  return null;
}

export async function requestSwitchEthereumChain(
  context: ProviderRequestContext,
  params: any[],
): Promise<null> {
  const chainId = Number(params[0].chainId as string);
  const result = new Promise<null>((resolve, reject) => {
    window.postMessage({ type: "i_switchEthereumChain", msg: { chainId } }, "*");
    const controller = new AbortController();
    window.addEventListener(
      "message",
      (event: any) => {
        if (event.source !== window || !event.data?.type) return;
        if (event.data.type === "switchEthereumChain") {
          context.setChainId(event.data.msg.chainId as number);
          controller.abort();
          resolve(null);
        } else if (
          event.data.type === "switchEthereumChainError" &&
          event.data.msg.chainId === chainId
        ) {
          controller.abort();
          reject(
            makeProviderError(
              event.data.msg.error || `Chain ${chainId} is not supported`,
              event.data.msg.code,
            ),
          );
        }
      },
      { signal: controller.signal } as AddEventListenerOptions,
    );
  });
  await result;
  return null;
}

export function requestSignature(
  context: ProviderRequestContext,
  method: string,
  params: any[],
): Promise<string> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pendingSignatureCallbacks.set(id, { resolve, reject });
    window.postMessage(
      {
        type: "i_signatureRequest",
        msg: { id, method, params: params || [], chainId: context.chainId },
      },
      "*",
    );
  });
}

export function requestWatchAsset(
  context: ProviderRequestContext,
  params: any,
): Promise<boolean> {
  let assetType: string;
  let asset: { address: string; symbol: string; decimals: number; image?: string };
  if (Array.isArray(params) && typeof params[0] === "string") {
    assetType = params[0];
    asset = params[1];
  } else {
    assetType = params.type;
    asset = params.options;
  }
  if (assetType !== "ERC20") {
    throw makeProviderError("Only ERC20 tokens are supported");
  }
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pendingWatchAssetCallbacks.set(id, { resolve, reject });
    window.postMessage(
      { type: "i_watchAsset", msg: { id, asset, chainId: context.chainId } },
      "*",
    );
  });
}
