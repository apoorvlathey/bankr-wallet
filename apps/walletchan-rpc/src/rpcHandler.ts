import { randomUUID } from "node:crypto";
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

export interface LocalCallBundleCall {
  index: number;
  status: "waiting" | "awaiting_approval" | "pending_receipt" | "confirmed" | "failed";
  to: string;
  value: string;
  data: string;
  transactionHash?: string;
  receipt?: unknown;
  error?: string;
}

export interface LocalCallBundle {
  id: string;
  chainId: string;
  from: string;
  atomic: false;
  atomicRequired: boolean;
  status: number;
  mode: "sequential_fallback";
  reason: string;
  submittedAt: number;
  completedAt?: number;
  transactionHashes: string[];
  calls: LocalCallBundleCall[];
  error?: string;
}

export interface RpcContext {
  bundleChains: Map<string, number>;
  chains: RuntimeChain[];
  getActiveChain: () => RuntimeChain;
  includeBatching: boolean;
  localBundles: Map<string, LocalCallBundle>;
  sequentialReceiptTimeoutMs: number;
  setActiveChain: (chain: RuntimeChain) => void;
  upstreamTimeoutMs: number;
  wallet: WalletConnectBridge;
}

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

  switch (method) {
    case "eth_accounts":
    case "eth_requestAccounts":
      return successResponse(id, context.wallet.getAccounts());
    case "eth_chainId":
      return successResponse(id, toHexChainId(context.getActiveChain().chainId));
    case "net_version":
      return successResponse(id, String(context.getActiveChain().chainId));
    case "web3_clientVersion":
      return successResponse(id, "WalletChanRPC/0.1.4");
    case "wallet_switchEthereumChain":
      return successResponse(id, await switchEthereumChain(request, context));
    case "eth_sendTransaction":
      return successResponse(id, await sendTransaction(request, context));
    case "personal_sign":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4":
      return successResponse(id, await sendWalletRequest(request, context, resolveSignatureChain(request, context)));
    case "wallet_getCapabilities":
      return successResponse(id, await getCapabilities(request, context));
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
  if (!context.wallet.connected) {
    throw walletDisconnectedError();
  }

  const params = getParamsArray(request);
  const calls = params[0];
  if (!isRecord(calls)) {
    throw new RpcError(-32602, "wallet_sendCalls requires a calls object");
  }
  const chain = resolveChainFromValue(calls.chainId, context);
  if (!chain) {
    throw new RpcError(-32602, "wallet_sendCalls requires a configured chainId");
  }

  if (context.wallet.supportsBatching()) {
    try {
      const result = await sendWalletRequest(request, context, chain);
      const bundleId = getBundleId(result);
      if (bundleId) {
        context.bundleChains.set(bundleId, chain.chainId);
      }
      return result;
    } catch (error) {
      if (!isBatchingUnsupportedError(error)) throw error;
    }
  }

  return sendCallsSequentially(calls, context, chain);
}

async function getCapabilities(
  request: JsonRpcRequest,
  context: RpcContext,
): Promise<unknown> {
  if (!context.wallet.connected) {
    throw walletDisconnectedError();
  }

  if (context.wallet.supportsMethod("wallet_getCapabilities")) {
    try {
      return await sendWalletRequest(request, context, resolveCapabilitiesChain(request, context));
    } catch (error) {
      if (!isBatchingUnsupportedError(error)) throw error;
    }
  }

  return localCapabilities(request, context);
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
  const localBundle = context.localBundles.get(bundleId);
  if (localBundle) {
    return localBundle;
  }
  if (!context.wallet.connected) {
    throw walletDisconnectedError();
  }
  if (!context.wallet.supportsMethod(request.method as string)) {
    throw new RpcError(
      -32601,
      `${request.method as string} is not approved by the connected wallet and no local WalletChan bundle exists for ${bundleId}`,
    );
  }
  const chainId = context.bundleChains.get(bundleId) || context.getActiveChain().chainId;
  const chain = requireConfiguredChain(context, chainId);
  return sendWalletRequest(request, context, chain);
}

async function sendCallsSequentially(
  callsObject: Record<string, unknown>,
  context: RpcContext,
  chain: RuntimeChain,
): Promise<LocalCallBundle> {
  const from = resolveCallSender(callsObject.from, context, chain);
  const calls = normalizeWalletCalls(callsObject.calls);
  const bundle: LocalCallBundle = {
    id: `walletchan-seq-${randomUUID()}`,
    chainId: toHexChainId(chain.chainId),
    from,
    atomic: false,
    atomicRequired: callsObject.atomicRequired === true,
    status: 100,
    mode: "sequential_fallback",
    reason: "Connected wallet did not approve ERC-5792 wallet_sendCalls; WalletChan RPC is sending each call as an eth_sendTransaction.",
    submittedAt: Date.now(),
    transactionHashes: [],
    calls: calls.map((call, index) => ({
      index,
      status: "waiting",
      ...call,
    })),
  };
  context.localBundles.set(bundle.id, bundle);
  context.bundleChains.set(bundle.id, chain.chainId);

  for (const entry of bundle.calls) {
    entry.status = "awaiting_approval";
    try {
      const txHash = await sendWalletRequest(
        {
          method: "eth_sendTransaction",
          params: [
            {
              from,
              chainId: bundle.chainId,
              to: entry.to,
              value: entry.value,
              data: entry.data,
            },
          ],
        },
        context,
        chain,
      );
      if (typeof txHash !== "string" || !isHex(txHash)) {
        return failLocalBundle(bundle, entry, "Wallet returned an invalid transaction hash", 500);
      }

      entry.transactionHash = txHash;
      bundle.transactionHashes.push(txHash);
      entry.status = "pending_receipt";

      const receipt = await waitForTransactionReceipt(chain, txHash, context);
      if (!receipt) {
        return failLocalBundle(
          bundle,
          entry,
          `Timed out waiting for transaction receipt: ${txHash}`,
          408,
        );
      }
      entry.receipt = receipt;

      if (isFailedReceipt(receipt)) {
        return failLocalBundle(bundle, entry, `Sequential transaction reverted: ${txHash}`, 500);
      }
      entry.status = "confirmed";
    } catch (error) {
      if (bundle.transactionHashes.length === 0 && error instanceof RpcError && error.code === 4900) {
        throw error;
      }
      return failLocalBundle(
        bundle,
        entry,
        error instanceof Error ? error.message : String(error),
        400,
      );
    }
  }

  bundle.status = 200;
  bundle.completedAt = Date.now();
  return bundle;
}

function localCapabilities(
  request: JsonRpcRequest,
  context: RpcContext,
): Record<string, unknown> {
  const batching = context.wallet.getBatchingInfo();
  const chains = resolveCapabilityChains(request, context);
  return Object.fromEntries(
    chains.map((chain) => [
      toHexChainId(chain.chainId),
      {
        atomic: {
          supported: batching.supported ? "ready" : "unsupported",
        },
        walletchanSequentialFallback: {
          supported: !batching.supported,
        },
      },
    ]),
  );
}

function resolveCallSender(
  value: unknown,
  context: RpcContext,
  chain: RuntimeChain,
): string {
  const accounts = context.wallet.getAccounts(chain.chainId);
  if (accounts.length === 0) {
    throw new RpcError(4100, `No approved account for chain ${chain.chainId}`);
  }
  if (value === undefined || value === null || value === "") return accounts[0];
  if (typeof value !== "string") {
    throw new RpcError(-32602, "wallet_sendCalls from must be an address string");
  }
  const normalized = value.toLowerCase();
  if (!accounts.includes(normalized)) {
    throw new RpcError(4100, `Account ${value} is not approved for chain ${chain.chainId}`);
  }
  return normalized;
}

function normalizeWalletCalls(value: unknown): Array<{ to: string; value: string; data: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RpcError(-32602, "wallet_sendCalls requires a non-empty calls array");
  }
  return value.map((call, index) => {
    if (!isRecord(call)) {
      throw new RpcError(-32602, `wallet_sendCalls calls[${index}] must be an object`);
    }
    return {
      to: normalizeAddress(call.to, `wallet_sendCalls calls[${index}].to`),
      value: normalizeHexQuantity(call.value ?? "0x0", `wallet_sendCalls calls[${index}].value`),
      data: normalizeHex(call.data ?? "0x", `wallet_sendCalls calls[${index}].data`),
    };
  });
}

async function waitForTransactionReceipt(
  chain: RuntimeChain,
  txHash: string,
  context: RpcContext,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + context.sequentialReceiptTimeoutMs;
  while (Date.now() < deadline) {
    const receipt = await callUpstreamRpc<Record<string, unknown> | null>(
      chain,
      "eth_getTransactionReceipt",
      [txHash],
      context.upstreamTimeoutMs,
    );
    if (receipt) return receipt;
    await sleep(3_000);
  }
  return null;
}

async function callUpstreamRpc<T>(
  chain: RuntimeChain,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<T> {
  const response = await fetch(chain.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method,
      params,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json()) as JsonRpcResponse;
  if (!response.ok) {
    throw new RpcError(-32603, `Upstream RPC error on ${chain.name}: ${response.status} ${response.statusText}`);
  }
  if (payload.error) {
    throw new RpcError(payload.error.code, payload.error.message, payload.error.data);
  }
  return payload.result as T;
}

function resolveCapabilityChains(
  request: JsonRpcRequest,
  context: RpcContext,
): RuntimeChain[] {
  const params = getParamsArray(request);
  const first = params[0];
  const values =
    Array.isArray(params[1])
      ? params[1]
      : isRecord(first) && Array.isArray(first.chainIds)
        ? first.chainIds
        : [];

  if (values.length === 0) return context.chains;

  const seen = new Set<number>();
  const chains: RuntimeChain[] = [];
  for (const value of values) {
    const chain = resolveChainFromValue(value, context);
    if (!chain || seen.has(chain.chainId)) continue;
    seen.add(chain.chainId);
    chains.push(chain);
  }
  return chains.length > 0 ? chains : context.chains;
}

function failLocalBundle(
  bundle: LocalCallBundle,
  entry: LocalCallBundleCall,
  message: string,
  status: number,
): LocalCallBundle {
  entry.status = "failed";
  entry.error = message;
  bundle.status = status;
  bundle.error = message;
  bundle.completedAt = Date.now();
  return bundle;
}

function isFailedReceipt(receipt: Record<string, unknown>): boolean {
  const status = receipt.status;
  if (typeof status === "string") return /^0x0+$/i.test(status);
  if (typeof status === "number") return status === 0;
  return false;
}

function isBatchingUnsupportedError(error: unknown): boolean {
  const code = error instanceof RpcError
    ? error.code
    : (error as { code?: unknown })?.code;
  if (code === -32601 || code === 4100 || code === 4200) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /wallet_sendCalls|wallet_getCapabilities|wallet_getCallsStatus|wallet_showCallsStatus/i.test(message) &&
    /not approved|not authorized|not supported|unsupported|unknown method|method not found/i.test(message);
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

function normalizeAddress(value: unknown, label: string): string {
  if (typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value;
  }
  throw new RpcError(-32602, `${label} must be an EVM address`);
}

function normalizeHex(value: unknown, label: string): string {
  if (typeof value === "string" && isHex(value)) return value;
  throw new RpcError(-32602, `${label} must be a hex string`);
}

function normalizeHexQuantity(value: unknown, label: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return `0x${value.toString(16)}`;
  }
  if (typeof value === "bigint" && value >= 0n) {
    return `0x${value.toString(16)}`;
  }
  if (typeof value === "string") {
    if (isHex(value)) return value;
    if (/^[0-9]+$/.test(value)) return `0x${BigInt(value).toString(16)}`;
  }
  throw new RpcError(-32602, `${label} must be a hex quantity`);
}

function isHex(value: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walletDisconnectedError(reason?: string): RpcError {
  return new RpcError(
    4900,
    "WalletConnect session is disconnected. Pair a wallet again using /pairing or WalletChan MCP get_pairing_uri.",
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
