/** Durable injected/WalletConnect result bridge and exact-request waiter. */

import {
  ERC7715_PERMISSION_RESULT_PREFIX,
  ERC7715_PERMISSION_RESULT_TIMEOUT_MS,
  type Erc7715PermissionResult,
} from "./types";
import { removePendingErc7715PermissionRequest } from "./pendingRequestStorage";

export async function writeErc7715PermissionResult(
  requestId: string,
  result: Erc7715PermissionResult,
): Promise<void> {
  const key = `${ERC7715_PERMISSION_RESULT_PREFIX}${requestId}`;
  await chrome.storage.local.set({ [key]: { result, timestamp: Date.now() } });
  try {
    const {
      getWalletConnectPendingRequest,
      saveWalletConnectTerminalResponse,
    } = await import("../walletConnectStorage");
    const route = await getWalletConnectPendingRequest(requestId);
    if (!route) return;
    await saveWalletConnectTerminalResponse(
      route.topic,
      route.requestId,
      result.success
        ? { kind: "result", value: result.result }
        : { kind: "error", code: -32000, message: result.error },
    );
    const { completeWalletConnectRequestIfNeeded } = await import(
      "../walletConnectHandlers"
    );
    await completeWalletConnectRequestIfNeeded(key, result);
  } catch (error) {
    console.warn("[WalletConnect] ERC-7715 result bridge failed", error);
  }
}

export async function waitForErc7715PermissionResult(
  requestId: string,
): Promise<Erc7715PermissionResult> {
  const key = `${ERC7715_PERMISSION_RESULT_PREFIX}${requestId}`;
  const existing = (await chrome.storage.local.get(key)) as Record<
    string,
    { result?: Erc7715PermissionResult } | undefined
  >;
  if (existing[key]?.result) {
    await chrome.storage.local.remove(key);
    return existing[key].result;
  }

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      chrome.storage.onChanged.removeListener(listener);
      globalThis.clearTimeout(timeout);
    };
    const finish = async (result: Erc7715PermissionResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      await chrome.storage.local.remove(key);
      resolve(result);
    };
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[key]?.newValue?.result) return;
      void finish(changes[key].newValue.result as Erc7715PermissionResult);
    };
    const timeout = globalThis.setTimeout(() => {
      void (async () => {
        await removePendingErc7715PermissionRequest(requestId);
        await finish({
          success: false,
          error: "wallet_requestExecutionPermissions timeout",
        });
      })();
    }, ERC7715_PERMISSION_RESULT_TIMEOUT_MS);
    chrome.storage.onChanged.addListener(listener);
  });
}
