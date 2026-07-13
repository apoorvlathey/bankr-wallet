/**
 * Public, read-only JSON-RPC methods that a webpage may proxy through the
 * extension-selected HTTP endpoint. Wallet/signing, submission, debug/admin,
 * and stateful filter methods must use their dedicated wallet paths or fail.
 */
import { assertRpcEndpointAllowedForOrigin } from "./rpcClient";

const SAFE_RPC_FORWARDING_METHODS = new Set([
  "web3_clientVersion",
  "web3_sha3",
  "net_listening",
  "net_peerCount",
  "net_version",
  "eth_chainId",
  "eth_syncing",
  "eth_blockNumber",
  "eth_call",
  "eth_createAccessList",
  "eth_estimateGas",
  "estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_blobBaseFee",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockReceipts",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getMaxPriorityFeePerGas",
  "eth_getProof",
  "eth_getStorageAt",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getUncleByBlockHashAndIndex",
  "eth_getUncleByBlockNumberAndIndex",
  "eth_getUncleCountByBlockHash",
  "eth_getUncleCountByBlockNumber",
  "eth_maxPriorityFeePerGas",
]);

const MAX_RPC_REQUEST_CHARS = 524_288;
const MAX_RPC_RESPONSE_BYTES = 8_000_000;
const MAX_CONCURRENT_RPC_REQUESTS = 16;
let activeRpcRequests = 0;

function validateRpcNetworkBoundary(rpcUrl: string, requestOrigin?: string): void {
  assertRpcEndpointAllowedForOrigin(rpcUrl, requestOrigin);
}

async function readLimitedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RPC_RESPONSE_BYTES
  ) {
    throw new Error("RPC response is too large");
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RPC_RESPONSE_BYTES) {
      throw new Error("RPC response is too large");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RPC_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("RPC response is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export function isSafeRpcForwardingMethod(method: unknown): method is string {
  return typeof method === "string" && SAFE_RPC_FORWARDING_METHODS.has(method);
}

export async function handleSafeRpcRequest(
  rpcUrl: unknown,
  method: unknown,
  params: unknown,
  requestOrigin?: string,
): Promise<unknown> {
  if (!isSafeRpcForwardingMethod(method)) {
    throw new Error("RPC method is not allowed through the provider proxy");
  }
  if (typeof rpcUrl !== "string" || !Array.isArray(params)) {
    throw new Error("Invalid RPC request");
  }
  // The target is selected by the extension content script, then checked again
  // against extension-owned network configuration in the service worker.
  const { networksInfo } = (await chrome.storage.sync.get("networksInfo")) as {
    networksInfo: Record<string, { rpcUrl?: unknown }> | undefined;
  };
  const allowedUrls = new Set(
    Object.values(networksInfo || {})
      .map((network) => network.rpcUrl)
      .filter((value): value is string => typeof value === "string"),
  );
  if (!allowedUrls.has(rpcUrl)) {
    throw new Error("RPC URL not in allowed list");
  }

  return forwardSafeRpcRequestToTrustedUrl(
    rpcUrl,
    method,
    params,
    requestOrigin,
  );
}

/**
 * Bounded read-only forwarding for a target already resolved from
 * extension-owned chain configuration. This is shared with WalletConnect so
 * relay peers receive the same method, SSRF, size, timeout, and concurrency
 * protections as injected-provider callers.
 */
export async function forwardSafeRpcRequestToTrustedUrl(
  rpcUrl: string,
  method: string,
  params: unknown[],
  requestOrigin?: string,
): Promise<unknown> {
  if (!isSafeRpcForwardingMethod(method) || !Array.isArray(params)) {
    throw new Error("Invalid or disallowed RPC request");
  }
  validateRpcNetworkBoundary(rpcUrl, requestOrigin);

  let requestBody: string;
  try {
    requestBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });
  } catch {
    throw new Error("Invalid RPC request");
  }
  if (requestBody.length > MAX_RPC_REQUEST_CHARS) {
    throw new Error("RPC request is too large");
  }
  if (activeRpcRequests >= MAX_CONCURRENT_RPC_REQUESTS) {
    throw new Error("Too many concurrent RPC requests");
  }

  activeRpcRequests += 1;
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
      // Never let a configured public endpoint redirect the extension's
      // privileged fetch onto loopback/private infrastructure after the URL
      // boundary check above.
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status}`);
    }

    let data: any;
    try {
      data = JSON.parse(await readLimitedResponseText(response));
    } catch (error) {
      if (error instanceof Error && error.message === "RPC response is too large") {
        throw error;
      }
      throw new Error("Invalid RPC response");
    }
    if (!data || typeof data !== "object") {
      throw new Error("Invalid RPC response");
    }
    if (data.error) {
      throw new Error(
        typeof data.error.message === "string"
          ? data.error.message.slice(0, 1_000)
          : "RPC error",
      );
    }
    if (!Object.prototype.hasOwnProperty.call(data, "result")) {
      throw new Error("RPC response missing result");
    }

    return data.result;
  } finally {
    activeRpcRequests -= 1;
  }
}
