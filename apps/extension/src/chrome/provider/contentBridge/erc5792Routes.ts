import { waitForStorageResult } from "../../storageResultWaiter";
import { validateProviderChainBoundary } from "../chainBoundary";
import {
  getAttestedProviderChainId,
  pageFaviconUrl,
} from "./bridgeState";

function post(type: string, msg: Record<string, unknown>): void {
  window.postMessage({ type, msg }, "*");
}

async function handleGetCapabilities(msg: any): Promise<void> {
  const { id, address, chainIds } = msg;
  const requestId = crypto.randomUUID();
  waitForStorageResult<any>(`capabilitiesResult:${requestId}`, 15_000)
    .then((result) => {
      if (result?.success === false) {
        post("walletGetCapabilitiesResult", {
          id,
          success: false,
          error: result.error,
        });
      } else {
        post("walletGetCapabilitiesResult", { id, success: true, result });
      }
    })
    .catch((error) =>
      post("walletGetCapabilitiesResult", {
        id,
        success: false,
        error: error.message,
      }),
    );
  chrome.runtime.sendMessage({
    type: "walletGetCapabilities",
    requestId,
    address,
    chainIds,
  });
}

async function handleSendCalls(msg: any): Promise<void> {
  const { id, params } = msg;
  const boundary = validateProviderChainBoundary(
    params?.chainId,
    await getAttestedProviderChainId(),
  );
  if (!boundary.valid) {
    post("walletSendCallsResult", {
      id,
      success: false,
      error: boundary.error,
      code: 4901,
    });
    return;
  }
  const bundleId = crypto.randomUUID();
  waitForStorageResult<{
    success: boolean;
    id?: string;
    error?: string;
    code?: number;
  }>(
    `batchTxAck:${bundleId}`,
    null,
  )
    .then((result) => {
      if (result.success) {
        post("walletSendCallsResult", {
          id,
          success: true,
          result: { id: result.id },
        });
      } else {
        post("walletSendCallsResult", {
          id,
          success: false,
          error: result.error,
          code: result.code,
        });
      }
    })
    .catch((error) =>
      post("walletSendCallsResult", {
        id,
        success: false,
        error: error.message,
      }),
    );
  chrome.runtime.sendMessage({
    type: "walletSendCalls",
    bundleId,
    params: { ...params, chainId: `0x${boundary.chainId.toString(16)}` },
    providerChainId: boundary.chainId,
    origin: window.location.origin,
    favicon: pageFaviconUrl(),
  });
}

async function handleGetCallsStatus(msg: any): Promise<void> {
  const { id, bundleId } = msg;
  const requestId = crypto.randomUUID();
  waitForStorageResult<any>(`callsStatusResult:${requestId}`, 15_000)
    .then((result) => {
      if (result?.success === false) {
        post("walletGetCallsStatusResult", {
          id,
          success: false,
          error: result.error,
        });
      } else {
        post("walletGetCallsStatusResult", { id, success: true, result });
      }
    })
    .catch((error) =>
      post("walletGetCallsStatusResult", {
        id,
        success: false,
        error: error.message,
      }),
    );
  chrome.runtime.sendMessage({
    type: "walletGetCallsStatus",
    requestId,
    bundleId,
  });
}

export async function handleErc5792PageMessage(
  type: string,
  msg: any,
): Promise<boolean> {
  switch (type) {
    case "i_walletGetCapabilities":
      await handleGetCapabilities(msg);
      return true;
    case "i_walletSendCalls":
      await handleSendCalls(msg);
      return true;
    case "i_walletGetCallsStatus":
      await handleGetCallsStatus(msg);
      return true;
    case "i_walletShowCallsStatus":
      chrome.runtime.sendMessage({
        type: "walletShowCallsStatus",
        bundleId: msg.bundleId,
      });
      return true;
    default:
      return false;
  }
}
