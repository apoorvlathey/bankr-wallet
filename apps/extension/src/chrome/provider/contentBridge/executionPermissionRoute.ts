import { waitForStorageResult } from "../../storageResultWaiter";
import { validateProviderChainBoundary } from "../chainBoundary";
import {
  getAttestedProviderChainId,
  pageFaviconUrl,
} from "./bridgeState";

const RESULT_PREFIX = "erc7715PermissionResult:";
const RESULT_TIMEOUT_MS = 5 * 60 * 1000;

function post(msg: Record<string, unknown>): void {
  window.postMessage({ type: "walletExecutionPermissionsResult", msg }, "*");
}

export async function handleExecutionPermissionPageMessage(
  type: string,
  msg: any,
): Promise<boolean> {
  if (type !== "i_walletExecutionPermissions") return false;
  const { id, method, params, chainId } = msg;
  const boundary = validateProviderChainBoundary(
    chainId,
    await getAttestedProviderChainId(),
  );
  if (!boundary.valid) {
    post({ id, success: false, error: boundary.error, code: 4901 });
    return true;
  }

  try {
    if (method === "wallet_requestExecutionPermissions") {
      const requestId = crypto.randomUUID();
      const enqueueResult = await chrome.runtime.sendMessage({
        type: "walletExecutionPermissions",
        requestId,
        method,
        params,
        chainId: boundary.chainId,
        providerChainId: boundary.chainId,
        origin: window.location.origin,
        favicon: pageFaviconUrl(),
      });
      if (enqueueResult?.success !== true) {
        post({
          id,
          success: false,
          error: enqueueResult?.error || `${method} failed`,
        });
        return true;
      }
      const result = await waitForStorageResult<{
        success: boolean;
        result?: unknown;
        error?: string;
      }>(
        `${RESULT_PREFIX}${requestId}`,
        RESULT_TIMEOUT_MS,
        () =>
          chrome.runtime.sendMessage({
            type: "expireProviderRequest",
            requestKind: "erc7715Permission",
            requestId,
          }),
      );
      post({
        id,
        success: result.success === true,
        result: result.result,
        error:
          result.success === true
            ? undefined
            : result.error || `${method} failed`,
      });
      return true;
    }

    const result = await chrome.runtime.sendMessage({
      type: "walletExecutionPermissions",
      method,
      params,
      chainId: boundary.chainId,
      providerChainId: boundary.chainId,
      origin: window.location.origin,
      favicon: pageFaviconUrl(),
    });
    post({
      id,
      success: result?.success === true,
      result: result?.result,
      error: result?.success === true ? undefined : result?.error || `${method} failed`,
    });
  } catch (error) {
    post({
      id,
      success: false,
      error: error instanceof Error ? error.message : `${method} failed`,
    });
  }
  return true;
}
