import type { NetworksInfo } from "@/types";
import { waitForStorageResult } from "../../storageResultWaiter";
import { validateProviderChainBoundary } from "../chainBoundary";
import {
  bridgeState,
  getAttestedProviderChainId,
  pageFaviconUrl,
} from "./bridgeState";

function post(type: string, msg: Record<string, unknown>): void {
  window.postMessage({ type, msg }, "*");
}

async function chainPin(
  chainId: unknown,
): Promise<ReturnType<typeof validateProviderChainBoundary>> {
  return validateProviderChainBoundary(
    chainId,
    await getAttestedProviderChainId(),
  );
}

async function handleSendTransaction(msg: any): Promise<void> {
  const {
    id,
    from,
    to,
    data,
    value,
    chainId,
    gas,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
  } = msg;
  const boundary = await chainPin(chainId);
  if (!boundary.valid) {
    post("sendTransactionResult", {
      id,
      success: false,
      error: boundary.error,
      code: 4901,
    });
    return;
  }
  const txId = crypto.randomUUID();
  waitForStorageResult<{
    success: boolean;
    txHash?: string;
    error?: string;
    code?: number;
  }>(
    `txResult:${txId}`,
    null,
  )
    .then((result) =>
      post("sendTransactionResult", {
        id,
        success: result.success,
        txHash: result.txHash,
        error: result.error,
        code: result.code,
      }),
    )
    .catch((error) =>
      post("sendTransactionResult", {
        id,
        success: false,
        error: error.message,
      }),
    );
  chrome.runtime.sendMessage({
    type: "sendTransaction",
    txId,
    tx: {
      from,
      to,
      data,
      value,
      chainId: boundary.chainId,
      ...(gas ? { gas } : {}),
      ...(gasPrice ? { gasPrice } : {}),
      ...(maxFeePerGas ? { maxFeePerGas } : {}),
      ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
    },
    providerChainId: boundary.chainId,
    origin: window.location.origin,
    favicon: pageFaviconUrl(),
  });
}

async function handleSignature(msg: any): Promise<void> {
  const { id, method, params, chainId } = msg;
  const boundary = await chainPin(chainId);
  if (!boundary.valid) {
    post("signatureRequestResult", {
      id,
      success: false,
      error: boundary.error,
      code: 4901,
    });
    return;
  }
  const sigId = crypto.randomUUID();
  waitForStorageResult<{
    success: boolean;
    signature?: string;
    error?: string;
    code?: number;
  }>(
    `sigResult:${sigId}`,
    null,
  )
    .then((result) =>
      post("signatureRequestResult", {
        id,
        success: result.success,
        signature: result.signature,
        error: result.error,
        code: result.code,
      }),
    )
    .catch((error) =>
      post("signatureRequestResult", {
        id,
        success: false,
        error: error.message,
      }),
    );
  chrome.runtime.sendMessage({
    type: "signatureRequest",
    sigId,
    signature: { method, params, chainId: boundary.chainId },
    providerChainId: boundary.chainId,
    origin: window.location.origin,
    favicon: pageFaviconUrl(),
  });
}

async function handleWatchAsset(msg: any): Promise<void> {
  const { id, asset, chainId } = msg;
  const boundary = await chainPin(chainId);
  if (!boundary.valid) {
    post("watchAssetResult", {
      id,
      success: false,
      error: boundary.error,
      code: 4901,
    });
    return;
  }
  const watchAssetId = crypto.randomUUID();
  waitForStorageResult<{ success: boolean; error?: string; code?: number }>(
    `watchAssetResult:${watchAssetId}`,
    null,
  )
    .then((result) =>
      post("watchAssetResult", {
        id,
        success: result.success,
        error: result.error,
        code: result.code,
      }),
    )
    .catch((error) =>
      post("watchAssetResult", {
        id,
        success: false,
        error: error.message,
      }),
    );
  chrome.runtime.sendMessage({
    type: "watchAsset",
    watchAssetId,
    asset,
    chainId: boundary.chainId,
    providerChainId: boundary.chainId,
    origin: window.location.origin,
    favicon: pageFaviconUrl(),
  });
}

async function handleRpcRequest(msg: any): Promise<void> {
  const { id, method, params } = msg;
  const { networksInfo } = (await chrome.storage.sync.get(
    "networksInfo",
  )) as { networksInfo?: NetworksInfo };
  const rpcUrl =
    networksInfo && bridgeState.chainName
      ? networksInfo[bridgeState.chainName]?.rpcUrl
      : undefined;
  if (!rpcUrl) {
    post("rpcResponse", {
      id,
      result: undefined,
      error: "No RPC URL configured for current chain",
    });
    return;
  }
  const rpcId = crypto.randomUUID();
  waitForStorageResult<{ result?: unknown; error?: string }>(
    `rpcResult:${rpcId}`,
    30_000,
  )
    .then((response) =>
      post("rpcResponse", {
        id,
        result: response.result,
        error: response.error,
      }),
    )
    .catch((error) =>
      post("rpcResponse", { id, result: undefined, error: error.message }),
    );
  chrome.runtime.sendMessage({ type: "rpcRequest", rpcId, rpcUrl, method, params });
}

export async function handleSigningPageMessage(
  type: string,
  msg: any,
): Promise<boolean> {
  switch (type) {
    case "i_sendTransaction":
      await handleSendTransaction(msg);
      return true;
    case "i_signatureRequest":
      await handleSignature(msg);
      return true;
    case "i_watchAsset":
      await handleWatchAsset(msg);
      return true;
    case "i_rpcRequest":
      await handleRpcRequest(msg);
      return true;
    default:
      return false;
  }
}
