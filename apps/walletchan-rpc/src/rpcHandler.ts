import {
  getChainById,
  parseChainId,
  toHexChainId,
  type RuntimeChain,
} from "./chains.js";
import {
  errorResponse,
  getErrorCode,
  getErrorMessage,
  getParamsArray,
  RpcError,
  successResponse,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./rpcTypes.js";
import { forwardToUpstream } from "./upstream.js";
import type { WalletConnectBridge } from "./walletConnect.js";

export interface RpcContext {
  bundleChains: Map<string, number>;
  chains: RuntimeChain[];
  getActiveChain: () => RuntimeChain;
  includeBatching: boolean;
  setActiveChain: (chain: RuntimeChain) => void;
  upstreamTimeoutMs: number;
  wallet: WalletConnectBridge;
}

const BATCH_METHODS = new Set([
  "wallet_getCapabilities",
  "wallet_sendCalls",
  "wallet_getCallsStatus",
  "wallet_showCallsStatus",
]);

const UNSUPPORTED_WALLET_METHODS = new Set([
  "eth_sign",
  "eth_signTransaction",
]);

export async function handleRpcRequest(
  request: JsonRpcRequest,
  context: RpcContext,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  if (typeof request.method !== "string" || request.method.length === 0) {
    return errorResponse(id, -32600, "Invalid JSON-RPC request");
  }

  const isNotification = request.id === undefined;
  try {
    const handled = await handleMethod(request, context);
    if (isNotification) return null;
    if (handled) return handled;
    return await forwardToUpstream(request, context.getActiveChain(), context.upstreamTimeoutMs);
  } catch (error) {
    if (isNotification) return null;
    return errorResponse(
      id,
      getErrorCode(error),
      getErrorMessage(error),
      error instanceof RpcError ? error.data : undefined,
    );
  }
}

async function handleMethod(
  request: JsonRpcRequest,
  context: RpcContext,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  const method = request.method as string;

  if (UNSUPPORTED_WALLET_METHODS.has(method)) {
    throw new RpcError(-32601, `${method} is unsafe or unsupported`);
  }

  if (method === "eth_sendRawTransaction") {
    throw new RpcError(
      -32000,
      "eth_sendRawTransaction is rejected because it bypasses WalletChan approval. Use Foundry --unlocked --sender so the tool sends eth_sendTransaction.",
    );
  }

  if (BATCH_METHODS.has(method) && !context.includeBatching) {
    throw new RpcError(-32601, `${method} is disabled because --skip-batching was set`);
  }

  switch (method) {
    case "eth_accounts":
    case "eth_requestAccounts":
      return successResponse(id, context.wallet.getAccounts());
    case "eth_chainId":
      return successResponse(id, toHexChainId(context.getActiveChain().chainId));
    case "net_version":
      return successResponse(id, String(context.getActiveChain().chainId));
    case "web3_clientVersion":
      return successResponse(id, "WalletChanRPC/0.1.0");
    case "wallet_switchEthereumChain":
      return successResponse(id, await switchEthereumChain(request, context));
    case "eth_sendTransaction":
      return successResponse(id, await sendTransaction(request, context));
    case "personal_sign":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4":
      return successResponse(id, await sendWalletRequest(request, context, resolveSignatureChain(request, context)));
    case "wallet_getCapabilities":
      return successResponse(id, await sendWalletRequest(request, context, resolveCapabilitiesChain(request, context)));
    case "wallet_sendCalls":
      return successResponse(id, await sendCalls(request, context));
    case "wallet_getCallsStatus":
    case "wallet_showCallsStatus":
      return successResponse(id, await sendBundleStatusRequest(request, context));
    default:
      return null;
  }
}

async function switchEthereumChain(
  request: JsonRpcRequest,
  context: RpcContext,
): Promise<null> {
  const params = getParamsArray(request);
  const targetChainId = parseChainId((params[0] as { chainId?: unknown } | undefined)?.chainId);
  if (!targetChainId) {
    throw new RpcError(-32602, "wallet_switchEthereumChain requires params[0].chainId");
  }
  const target = requireConfiguredChain(context, targetChainId);
  context.setActiveChain(target);
  return null;
}

async function sendTransaction(
  request: JsonRpcRequest,
  context: RpcContext,
): Promise<unknown> {
  if (!context.wallet.connected) {
    throw walletDisconnectedError();
  }

  const params = getParamsArray(request);
  const tx = params[0];
  if (!isRecord(tx)) {
    throw new RpcError(-32602, "eth_sendTransaction requires a transaction object");
  }

  const chain = resolveChainFromValue(tx.chainId, context) || context.getActiveChain();
  const from = typeof tx.from === "string" ? tx.from.toLowerCase() : null;
  if (from && !context.wallet.getAccounts(chain.chainId).includes(from)) {
    throw new RpcError(4100, `Account ${tx.from} is not approved for chain ${chain.chainId}`);
  }

  return sendWalletRequest(request, context, chain);
}

async function sendCalls(
  request: JsonRpcRequest,
  context: RpcContext,
): Promise<unknown> {
  const params = getParamsArray(request);
  const calls = params[0];
  if (!isRecord(calls)) {
    throw new RpcError(-32602, "wallet_sendCalls requires a calls object");
  }
  const chain = resolveChainFromValue(calls.chainId, context);
  if (!chain) {
    throw new RpcError(-32602, "wallet_sendCalls requires a configured chainId");
  }

  const result = await sendWalletRequest(request, context, chain);
  const bundleId = getBundleId(result);
  if (bundleId) {
    context.bundleChains.set(bundleId, chain.chainId);
  }
  return result;
}

async function sendBundleStatusRequest(
  request: JsonRpcRequest,
  context: RpcContext,
): Promise<unknown> {
  const params = getParamsArray(request);
  const bundleId = getBundleIdParam(params);
  if (!bundleId) {
    throw new RpcError(-32602, `${request.method as string} requires a bundle ID`);
  }
  const chainId = context.bundleChains.get(bundleId) || context.getActiveChain().chainId;
  const chain = requireConfiguredChain(context, chainId);
  return sendWalletRequest(request, context, chain);
}

async function sendWalletRequest(
  request: JsonRpcRequest,
  context: RpcContext,
  chain: RuntimeChain,
): Promise<unknown> {
  if (!context.wallet.connected) {
    throw walletDisconnectedError();
  }

  try {
    return await context.wallet.request(
      chain.chainId,
      request.method as string,
      getParamsArray(request),
    );
  } catch (error) {
    if (isWalletConnectDisconnectedError(error)) {
      throw walletDisconnectedError(error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

function resolveSignatureChain(
  request: JsonRpcRequest,
  context: RpcContext,
): RuntimeChain {
  if (
    request.method !== "eth_signTypedData_v3" &&
    request.method !== "eth_signTypedData_v4"
  ) {
    return context.getActiveChain();
  }

  const params = getParamsArray(request);
  const typedData = parseTypedData(params[1]);
  const domainChain = parseChainId(typedData?.domain?.chainId);
  return domainChain ? requireConfiguredChain(context, domainChain) : context.getActiveChain();
}

function resolveCapabilitiesChain(
  request: JsonRpcRequest,
  context: RpcContext,
): RuntimeChain {
  const params = getParamsArray(request);
  const first = params[0];
  const chainIds =
    Array.isArray(params[1])
      ? params[1]
      : isRecord(first) && Array.isArray(first.chainIds)
        ? first.chainIds
        : [];

  for (const value of chainIds) {
    const chain = resolveChainFromValue(value, context);
    if (chain) return chain;
  }
  return context.getActiveChain();
}

function resolveChainFromValue(value: unknown, context: RpcContext): RuntimeChain | null {
  const chainId = parseChainId(value);
  return chainId ? requireConfiguredChain(context, chainId) : null;
}

function requireConfiguredChain(context: RpcContext, chainId: number): RuntimeChain {
  const chain = getChainById(context.chains, chainId);
  if (!chain) {
    throw new RpcError(4902, `Chain ${chainId} is not configured in walletchan-rpc`);
  }
  return chain;
}

function parseTypedData(value: unknown): { domain?: { chainId?: unknown } } | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    throw new RpcError(-32602, "Invalid EIP-712 typed data JSON");
  }
}

function getBundleId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (isRecord(value) && typeof value.id === "string" && value.id.length > 0) {
    return value.id;
  }
  return null;
}

function getBundleIdParam(params: unknown[]): string | null {
  const first = params[0];
  if (typeof first === "string" && first.length > 0) return first;
  if (isRecord(first) && typeof first.id === "string" && first.id.length > 0) {
    return first.id;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walletDisconnectedError(reason?: string): RpcError {
  return new RpcError(
    4900,
    "WalletConnect session is disconnected. Pair WalletChan again using /pairing or WalletChan MCP get_pairing_uri.",
    {
      code: "walletconnect_disconnected",
      needsPairing: true,
      reason,
    },
  );
}

function isWalletConnectDisconnectedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /WalletConnect session is not connected/i.test(message) ||
    /WalletConnect session .*disconnected/i.test(message) ||
    /session .*expired/i.test(message) ||
    /session .*removed/i.test(message) ||
    /session topic/i.test(message) ||
    /No matching key/i.test(message);
}
