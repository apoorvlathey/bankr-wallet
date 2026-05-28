import {
  handleWalletGetCapabilities,
  handleWalletGetCallsStatus,
  handleWalletSendCalls,
  handleWalletShowCallsStatus,
} from "./batchTxHandlers";
import type { WalletSendCallsParams } from "./erc5792Types";
import {
  getSessionAccounts,
  getSessionMetadata,
  isAddress,
  parseWalletChainId,
  resolveSessionSigningAccount,
} from "./walletConnectHelpers";
import {
  rejectSessionRequest,
  respondSessionRequest,
  type WalletKitLike,
} from "./walletConnectProtocol";

export async function handleWalletConnectGetCapabilities(
  kit: WalletKitLike,
  args: any,
  params: any[],
  chainId: number,
): Promise<void> {
  const first = params[0];
  const address =
    isAddress(first)
      ? first
      : typeof first === "object" && isAddress(first?.address)
        ? first.address
        : typeof first === "object" && isAddress(first?.account)
          ? first.account
          : getSessionAccounts(kit.getActiveSessions()?.[args.topic], chainId)[0];
  const chainIds = Array.isArray(params[1])
    ? params[1]
    : typeof first === "object" && Array.isArray(first?.chainIds)
      ? first.chainIds
      : undefined;

  if (!isAddress(address)) {
    throw new Error("No authorized account for this session");
  }
  const account = await resolveSessionSigningAccount(
    kit.getActiveSessions()?.[args.topic],
    chainId,
    address,
  );

  await respondSessionRequest(
    kit,
    args,
    await handleWalletGetCapabilities(address, chainIds, account),
  );
}

export async function handleWalletConnectSendCalls(
  kit: WalletKitLike,
  args: any,
  params: any[],
  chainId: number,
): Promise<void> {
  const request = (params[0] || params) as WalletSendCallsParams;
  const requestChainId = parseWalletChainId(request?.chainId);
  if (!requestChainId) {
    throw new Error("Invalid batch chainId");
  }
  if (requestChainId !== chainId) {
    throw new Error("Batch chainId does not match session chain");
  }
  if (request.from && !isAddress(request.from)) {
    throw new Error("Invalid from address");
  }
  const account = await resolveSessionSigningAccount(
    kit.getActiveSessions()?.[args.topic],
    chainId,
    request.from || null,
  );

  const bundleId = crypto.randomUUID();
  const peer = getSessionMetadata(kit.getActiveSessions()?.[args.topic]);
  const peerOrigin = peer.url || peer.name;

  handleWalletSendCalls(
    request,
    bundleId,
    peerOrigin,
    peer.icon,
    undefined,
    peerOrigin,
    undefined,
    undefined,
    account,
  );

  const ack = await waitForStorageResult<{
    success: boolean;
    id?: string;
    error?: string;
    code?: number;
  }>(`batchTxAck:${bundleId}`, 15_000);

  if (ack.success && ack.id) {
    await respondSessionRequest(kit, args, { id: ack.id });
    return;
  }

  await rejectSessionRequest(
    kit,
    args,
    ack.code || -32000,
    ack.error || "Failed to create batch request",
  );
}

export async function handleWalletConnectGetCallsStatus(
  kit: WalletKitLike,
  args: any,
  params: any[],
): Promise<void> {
  const bundleId = getBundleIdParam(params);
  if (!bundleId) {
    throw new Error("Missing bundle ID");
  }
  const peer = getSessionMetadata(kit.getActiveSessions()?.[args.topic]);
  const result = await handleWalletGetCallsStatus(bundleId, peer.url || peer.name);
  if ("error" in result) {
    await rejectSessionRequest(kit, args, result.code, result.error);
    return;
  }
  await respondSessionRequest(kit, args, result);
}

export async function handleWalletConnectShowCallsStatus(
  kit: WalletKitLike,
  args: any,
  params: any[],
): Promise<void> {
  const bundleId = getBundleIdParam(params);
  if (!bundleId) {
    throw new Error("Missing bundle ID");
  }
  const peer = getSessionMetadata(kit.getActiveSessions()?.[args.topic]);
  await handleWalletShowCallsStatus(bundleId, peer.url || peer.name);
  await respondSessionRequest(kit, args, null);
}

function getBundleIdParam(params: any[]): string | null {
  const first = params[0];
  if (typeof first === "string" && first.length > 0) return first;
  if (first && typeof first === "object" && typeof first.id === "string") {
    return first.id;
  }
  return null;
}

function waitForStorageResult<T>(key: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      chrome.storage.onChanged.removeListener(listener);
      clearTimeout(timeout);
    };
    const finish = (result: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      chrome.storage.local.remove(key).catch(() => {});
      resolve(result);
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("WalletConnect batch request timed out"));
    }, timeoutMs);

    function listener(
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) {
      if (areaName !== "local" || !changes[key]?.newValue?.result) return;
      finish(changes[key].newValue.result as T);
    }

    chrome.storage.onChanged.addListener(listener);
    chrome.storage.local
      .get(key)
      .then((items) => {
        if (items[key]?.result) {
          finish(items[key].result as T);
        }
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
  });
}
