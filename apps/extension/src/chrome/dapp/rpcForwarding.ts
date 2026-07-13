const DAPP_RPC_FORWARD_TIMEOUT_MS = 3000;
const DAPP_RPC_PROBE_TIMEOUT_MS = 2000;
const MAX_TRACKED_DAPP_RPC_URLS = 8;

/**
 * Methods eligible for the page-local dapp RPC fast path.
 *
 * Keep this intentionally narrow: signing, transaction submission, wallet_*,
 * chain/account state, gas estimation, nonce reads, code/delegation reads, raw
 * tx broadcast, and stateful filter lifecycle methods must continue through
 * WalletChan's extension-controlled RPC path.
 */
const DAPP_RPC_FORWARDABLE_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getLogs",
  "eth_getMaxPriorityFeePerGas",
  "eth_getStorageAt",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
]);

const discoveredDappRpcUrls: string[] = [];
let isDiscoveryInstalled = false;

type DappRpcForwardResult =
  | { forwarded: true; result: any }
  | { forwarded: false };

function isForwardableDappRpcMethod(method: string): boolean {
  return DAPP_RPC_FORWARDABLE_METHODS.has(method);
}

function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function isJsonRpcPayload(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return payload.some(isJsonRpcPayload);
  }

  return (
    !!payload &&
    typeof payload === "object" &&
    "method" in payload &&
    typeof (payload as { method?: unknown }).method === "string" &&
    ("jsonrpc" in payload || "id" in payload)
  );
}

function parseRpcRequestBody(body: unknown): unknown | null {
  if (!body) return null;

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  if (body instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder("utf-8").decode(body));
    } catch {
      return null;
    }
  }

  if (body instanceof ArrayBuffer) {
    try {
      return JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(body)));
    } catch {
      return null;
    }
  }

  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    try {
      return JSON.parse(
        new TextDecoder("utf-8").decode(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
        ),
      );
    } catch {
      return null;
    }
  }

  if (typeof body === "object" && isJsonRpcPayload(body)) {
    return body;
  }

  return null;
}

function rememberDappRpcUrl(rawUrl: string): void {
  const url = normalizeUrl(rawUrl);
  if (!url || discoveredDappRpcUrls.includes(url)) return;
  if (discoveredDappRpcUrls.length >= MAX_TRACKED_DAPP_RPC_URLS) return;
  discoveredDappRpcUrls.push(url);
}

async function inspectFetchForRpcUrl(resource: unknown, config?: RequestInit): Promise<void> {
  let requestUrl = "";
  let requestBody: unknown = config?.body;

  if (typeof resource === "string") {
    requestUrl = resource;
  } else if (resource instanceof URL) {
    requestUrl = resource.href;
  } else if (resource instanceof Request) {
    requestUrl = resource.url;
    if (!requestBody) {
      try {
        requestBody = await resource.clone().text();
      } catch {
        return;
      }
    }
  }

  if (!requestUrl || !requestBody) return;

  const parsedBody = parseRpcRequestBody(requestBody);
  if (isJsonRpcPayload(parsedBody)) {
    rememberDappRpcUrl(requestUrl);
  }
}

export function installDappRpcDiscovery(): void {
  if (isDiscoveryInstalled) return;
  isDiscoveryInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((resource: RequestInfo | URL, config?: RequestInit) => {
    inspectFetchForRpcUrl(resource, config).catch(() => {});
    return originalFetch(resource, config);
  }) as typeof window.fetch;
}

async function fetchJsonRpc(
  rpcUrl: string,
  method: string,
  params: any[],
  timeoutMs: number,
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await window.fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Dapp RPC request failed: ${response.status}`);
    }

    const data = await response.json();
    if (data?.error) {
      throw new Error(data.error.message || "Dapp RPC error");
    }
    if (!Object.prototype.hasOwnProperty.call(data, "result")) {
      throw new Error("Dapp RPC response missing result");
    }

    return data.result;
  } finally {
    clearTimeout(timeout);
  }
}

function chainIdFromRpcResult(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const chainId = Number(value);
  return Number.isFinite(chainId) && chainId > 0 ? chainId : null;
}

export class DappRpcForwarder {
  private urlsByChainId = new Map<number, string>();
  private checkedUrls = new Set<string>();
  private probePromise: Promise<void> | null = null;

  private probeUrls(): void {
    if (this.probePromise) return;

    this.probePromise = (async () => {
      for (const rpcUrl of discoveredDappRpcUrls) {
        if (this.checkedUrls.has(rpcUrl)) continue;
        this.checkedUrls.add(rpcUrl);

        try {
          const rpcChainId = chainIdFromRpcResult(
            await fetchJsonRpc(rpcUrl, "eth_chainId", [], DAPP_RPC_PROBE_TIMEOUT_MS),
          );
          if (rpcChainId) {
            this.urlsByChainId.set(rpcChainId, rpcUrl);
          }
        } catch {
          // Ignore bad or incompatible dapp RPC URLs. The extension RPC remains
          // the authoritative fallback for every provider request.
        }
      }
    })().finally(() => {
      this.probePromise = null;
    });
  }

  async tryRequest(
    chainId: number,
    method: string,
    params: any[],
  ): Promise<DappRpcForwardResult> {
    this.probeUrls();

    if (!isForwardableDappRpcMethod(method)) {
      return { forwarded: false };
    }

    const dappRpcUrl = this.urlsByChainId.get(chainId);
    if (!dappRpcUrl) {
      return { forwarded: false };
    }

    try {
      return {
        forwarded: true,
        result: await fetchJsonRpc(
          dappRpcUrl,
          method,
          params,
          DAPP_RPC_FORWARD_TIMEOUT_MS,
        ),
      };
    } catch {
      return { forwarded: false };
    }
  }
}
