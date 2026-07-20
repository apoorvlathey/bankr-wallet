import {
  handleWalletGetCapabilities,
  handleWalletGetCallsStatus,
  handleWalletSendCalls,
  handleWalletShowCallsStatus,
} from "../batchTxHandlers";
import type { WalletSendCallsParams } from "../erc5792Types";
import {
  getSessionAccounts,
  getSessionMetadata,
  isAddress,
  parseWalletChainId,
  resolveSessionAccount,
} from "./sessionPolicy";
import {
  rejectSessionRequest,
  respondSessionRequest,
  type WalletKitLike,
} from "./protocol";
import { withWalletConnectPendingRoute } from "./storage";

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
  const account = await resolveSessionAccount(
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
  remoteClaimId?: string,
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
  const account = await resolveSessionAccount(
    kit.getActiveSessions()?.[args.topic],
    chainId,
    request.from || null,
  );

  const bundleId = crypto.randomUUID();
  const peer = getSessionMetadata(kit.getActiveSessions()?.[args.topic]);
  const peerOrigin = peer.url || peer.name;

  const intake = () => handleWalletSendCalls(
    request,
    bundleId,
    peerOrigin,
    peer.icon,
    undefined,
    peerOrigin,
    undefined,
    undefined,
    account,
    {
      topic: args.topic,
      requestId: args.id,
      method: "wallet_sendCalls",
    },
  );

  if (account.type === "safe") {
    await withWalletConnectPendingRoute({
      id: bundleId,
      kind: "batch",
      topic: args.topic,
      requestId: args.id,
      method: "wallet_sendCalls",
      timestamp: Date.now(),
    }, intake, remoteClaimId);
    return;
  }

  await intake();

  const ackKey = `batchTxAck:${bundleId}`;
  const storedAck = await chrome.storage.local.get(ackKey);
  const ack = storedAck[ackKey]?.result as {
    success: boolean;
    id?: string;
    error?: string;
    code?: number;
  } | undefined;
  await chrome.storage.local.remove(ackKey).catch(() => undefined);

  if (!ack) {
    throw new Error("Failed to persist batch acknowledgement");
  }

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
