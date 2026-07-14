/** Durable injected/WalletConnect result bridge and exact-request waiter. */

import {
  ERC7715_PERMISSION_RESULT_PREFIX,
  type Erc7715PermissionResult,
} from "./types";

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
    } = await import("../walletConnect/storage");
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
      "../walletConnect/resultBridge"
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
    chrome.storage.onChanged.addListener(listener);
  });
}
