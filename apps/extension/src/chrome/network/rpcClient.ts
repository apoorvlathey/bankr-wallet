import { http, type HttpTransportConfig } from "viem";
import {
  classifyPrivateNetworkHostname,
  type PrivateNetworkClass,
} from "@/lib/privateNetworkPolicy";
import {
  fetchTextBounded,
  parseJsonObjectBounded,
} from "./boundedHttp";

export const DEFAULT_RPC_TIMEOUT_MS = 15_000;
export const MAX_RPC_REQUEST_BYTES = 1_000_000;
export const MAX_RPC_RESPONSE_BYTES = 8_000_000;
const MAX_RPC_TIMEOUT_MS = 60_000;
const MAX_CONCURRENT_RPC_REQUESTS = 24;

let activeRpcRequests = 0;

export class RpcResponseError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "RpcResponseError";
    this.code = code;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

/**
 * Parse a configured RPC target without allowing URL userinfo or non-HTTP
 * schemes. This runs at the final egress boundary as well as during network
 * metadata writes so malformed/corrupt legacy sync state fails closed.
 */
export function parseRpcEndpoint(rpcUrl: unknown): URL {
  if (typeof rpcUrl !== "string" || rpcUrl.length === 0 || rpcUrl.length > 2_048) {
    throw new Error("Invalid RPC URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new Error("Invalid RPC URL");
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("RPC URL must be an HTTP(S) URL without credentials");
  }
  return parsed;
}

/** New RPC configuration must use TLS unless it is explicitly local/private. */
export function assertSecureRpcConfigurationUrl(rpcUrl: unknown): URL {
  const parsed = parseRpcEndpoint(rpcUrl);
  if (
    parsed.protocol === "http:" &&
    classifyPrivateNetworkHostname(parsed.hostname) === null
  ) {
    throw new Error("Public RPC URLs must use HTTPS");
  }
  return parsed;
}

function parseRequestOrigin(requestOrigin: string | undefined): {
  url: URL;
  networkClass: PrivateNetworkClass;
} | null {
  if (!requestOrigin) return null;
  try {
    const url = new URL(requestOrigin);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return {
      url,
      networkClass: classifyPrivateNetworkHostname(url.hostname),
    };
  } catch {
    return null;
  }
}

/**
 * Prevent an untrusted remote dapp from using the extension's broad host
 * permission as a private-network proxy. Explicit Settings operations may opt
 * into private targets; dapp requests must be network-local and origin-bound.
 */
export function assertRpcEndpointAllowedForOrigin(
  rpcUrl: unknown,
  requestOrigin?: string,
  options: { allowPrivateWithoutOrigin?: boolean } = {},
): URL {
  const rpc = parseRpcEndpoint(rpcUrl);
  const rpcClass = classifyPrivateNetworkHostname(rpc.hostname);
  if (!rpcClass) return rpc;
  if (options.allowPrivateWithoutOrigin === true && !requestOrigin) return rpc;

  const origin = parseRequestOrigin(requestOrigin);
  if (!origin) {
    throw new Error("Private-network RPC access is not allowed for this site");
  }

  if (rpcClass === "loopback") {
    if (origin.networkClass !== "loopback") {
      throw new Error("Private-network RPC access is not allowed for this site");
    }
    return rpc;
  }

  // A LAN-hosted dapp may use another port on its own host, but it must not
  // scan or invoke services on other private hosts through extension fetch.
  if (
    origin.networkClass !== "private" ||
    normalizeHostname(origin.url.hostname) !== normalizeHostname(rpc.hostname)
  ) {
    throw new Error("Private-network RPC access is not allowed for this site");
  }
  return rpc;
}

const SECURE_RPC_FETCH_OPTIONS: RequestInit = {
  credentials: "omit",
  redirect: "error",
  referrerPolicy: "no-referrer",
  cache: "no-store",
};

function rpcRequestBodyByteLength(body: BodyInit | null | undefined): number {
  if (typeof body === "string") {
    return new TextEncoder().encode(body).byteLength;
  }
  if (body instanceof URLSearchParams) {
    return new TextEncoder().encode(body.toString()).byteLength;
  }
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;

  // Viem currently serializes JSON-RPC bodies to strings. Reject rather than
  // attempting to buffer an unbounded FormData or ReadableStream if that
  // implementation detail changes or an onRequest hook replaces the body.
  throw new Error("Invalid RPC request body");
}

function rpcTimeoutMs(timeout: number | undefined): number {
  if (!Number.isFinite(timeout) || !timeout || timeout < 1) {
    return DEFAULT_RPC_TIMEOUT_MS;
  }
  return Math.min(Math.floor(timeout), MAX_RPC_TIMEOUT_MS);
}

function rpcFetchInputUrl(input: string | URL | Request): URL {
  return new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
}

/**
 * Viem consumes response bodies itself, so this fetch adapter first consumes
 * the remote stream under our byte/deadline ceiling and then returns a small,
 * in-memory Response for viem to parse. The URL equality check prevents an
 * onRequest callback from turning a validated transport into arbitrary egress.
 */
function createBoundedViemFetch(
  endpoint: URL,
  timeout: number | undefined,
): NonNullable<HttpTransportConfig["fetchFn"]> {
  const timeoutMs = rpcTimeoutMs(timeout);
  return async (input, init = {}) => {
    const requestedUrl = rpcFetchInputUrl(input);
    if (requestedUrl.href !== endpoint.href) {
      throw new Error("RPC transport target changed unexpectedly");
    }
    if ((init.method || "POST").toUpperCase() !== "POST") {
      throw new Error("Invalid RPC request method");
    }
    if (rpcRequestBodyByteLength(init.body) > MAX_RPC_REQUEST_BYTES) {
      throw new Error("RPC request is too large");
    }
    if (activeRpcRequests >= MAX_CONCURRENT_RPC_REQUESTS) {
      throw new Error("Too many concurrent RPC requests");
    }

    activeRpcRequests += 1;
    try {
      const { response, text } = await fetchTextBounded(
        requestedUrl,
        {
          ...init,
          ...SECURE_RPC_FETCH_OPTIONS,
        },
        { timeoutMs, maxBytes: MAX_RPC_RESPONSE_BYTES },
      );
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } finally {
      activeRpcRequests -= 1;
    }
  };
}

/**
 * Viem transport for configured RPC endpoints. It preserves viem's request
 * semantics while rejecting redirects and ambient browser credentials.
 */
export function secureHttpTransport(
  rpcUrl: string,
  config: HttpTransportConfig = {},
): ReturnType<typeof http> {
  const endpoint = parseRpcEndpoint(rpcUrl);
  return http(rpcUrl, {
    ...config,
    fetchFn: createBoundedViemFetch(endpoint, config.timeout),
    fetchOptions: {
      ...config.fetchOptions,
      ...SECURE_RPC_FETCH_OPTIONS,
    },
  });
}

function boundedErrorMessage(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.slice(0, 1_000)
    : "RPC request failed";
}

export async function fetchRpcEnvelope(
  rpcUrl: string,
  method: string,
  params: unknown[],
  options: {
    timeoutMs?: number;
    maxResponseBytes?: number;
    requestOrigin?: string;
    allowPrivateWithoutOrigin?: boolean;
  } = {},
): Promise<Record<string, unknown>> {
  const endpoint = assertRpcEndpointAllowedForOrigin(
    rpcUrl,
    options.requestOrigin,
    { allowPrivateWithoutOrigin: options.allowPrivateWithoutOrigin },
  );
  if (!method || typeof method !== "string" || !Array.isArray(params)) {
    throw new Error("Invalid RPC request");
  }

  let body: string;
  try {
    body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  } catch {
    throw new Error("Invalid RPC request");
  }
  if (new TextEncoder().encode(body).byteLength > MAX_RPC_REQUEST_BYTES) {
    throw new Error("RPC request is too large");
  }
  if (activeRpcRequests >= MAX_CONCURRENT_RPC_REQUESTS) {
    throw new Error("Too many concurrent RPC requests");
  }

  activeRpcRequests += 1;
  try {
    const { response, text } = await fetchTextBounded(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        ...SECURE_RPC_FETCH_OPTIONS,
      },
      {
        timeoutMs: options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
        maxBytes: options.maxResponseBytes ?? MAX_RPC_RESPONSE_BYTES,
      },
    );
    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status}`);
    }
    return parseJsonObjectBounded(text, "Invalid RPC response");
  } finally {
    activeRpcRequests -= 1;
  }
}

export async function fetchRpcResult(
  rpcUrl: string,
  method: string,
  params: unknown[],
  options: Parameters<typeof fetchRpcEnvelope>[3] = {},
): Promise<unknown> {
  const envelope = await fetchRpcEnvelope(rpcUrl, method, params, options);
  if (envelope.error) {
    const error = envelope.error as Record<string, unknown>;
    throw new RpcResponseError(
      boundedErrorMessage(error?.message),
      typeof error?.code === "number" ? error.code : undefined,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(envelope, "result")) {
    throw new Error("RPC response missing result");
  }
  return envelope.result;
}

export async function probeRpcChainId(
  rpcUrl: string,
  options: {
    requestOrigin?: string;
    allowPrivateWithoutOrigin?: boolean;
  } = {},
): Promise<number | null> {
  try {
    const result = await fetchRpcResult(rpcUrl, "eth_chainId", [], {
      timeoutMs: 8_000,
      maxResponseBytes: 64_000,
      ...options,
    });
    if (typeof result !== "string" && typeof result !== "number") return null;
    const chainId = Number(result);
    return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
  } catch {
    return null;
  }
}
