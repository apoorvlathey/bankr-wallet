import { WALLETCHAN_DEFAULT_RPC_HOSTS } from "./walletchanRpcDefaults.js";

export interface WebRequestInput {
  url: string;
  method?: string;
  headers?: unknown;
  body?: unknown;
  timeoutMs?: number;
}

export interface WebRequestResult {
  url: string;
  method: string;
  status: number;
  ok: boolean;
  contentType?: string;
  body: string;
  json?: unknown;
}

export interface WebRequestConfig {
  enabled: boolean;
  allowedHosts: string[];
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REQUEST_BODY_BYTES = 512 * 1024;
const MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024;
const ALLOWED_METHODS = new Set(["GET", "POST"]);
const BLOCKED_HEADERS = new Set([
  "authorization",
  "cookie",
  "host",
  "proxy-authorization",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
]);

export const DEFAULT_WEB_REQUEST_HOSTS = [
  "api.morpho.org",
  "blue-api.morpho.org",
  "api.moonwell.fi",
  "trade-api.gateway.uniswap.org",
  "liquidity.api.uniswap.org",
  "data.avantisfi.com",
  "core.avantisfi.com",
  "api.avantisfi.com",
  "tx-builder.avantisfi.com",
  "feed-v3.avantisfi.com",
  "api.bankr.bot",
  ...WALLETCHAN_DEFAULT_RPC_HOSTS,
] as const;

export class WebRequestTool {
  private readonly allowedHosts: Set<string>;

  constructor(private readonly config: WebRequestConfig) {
    this.allowedHosts = new Set(config.allowedHosts.map((host) => host.toLowerCase()));
  }

  listAllowedHosts(): string[] {
    return Array.from(this.allowedHosts).sort();
  }

  async request(input: WebRequestInput): Promise<WebRequestResult> {
    if (!this.config.enabled) {
      throw new Error("web_request is disabled.");
    }

    const url = new URL(input.url);
    if (url.protocol !== "https:") {
      throw new Error("web_request only supports https URLs.");
    }
    if (!this.allowedHosts.has(url.hostname.toLowerCase())) {
      throw new Error(
        `Host not allowed: ${url.hostname}. Allowed hosts: ${this.listAllowedHosts().join(", ")}`,
      );
    }

    const method = (input.method || "GET").toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      throw new Error(`web_request method must be one of: ${Array.from(ALLOWED_METHODS).join(", ")}`);
    }

    const headers = normalizeHeaders(input.headers);
    const body = normalizeBody(input.body, headers);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      normalizeTimeout(input.timeoutMs) ?? DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method === "GET" ? undefined : body,
        redirect: "error",
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") || undefined;
      const text = await readLimited(response, MAX_RESPONSE_BODY_BYTES);
      const json = parseJson(text);

      return {
        url: url.toString(),
        method,
        status: response.status,
        ok: response.ok,
        ...(contentType ? { contentType } : {}),
        body: text,
        ...(json === undefined ? {} : { json }),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeHeaders(input: unknown): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json, text/plain;q=0.9, */*;q=0.8",
  };
  if (input === undefined || input === null) return headers;
  if (!isRecord(input)) throw new Error("headers must be an object");

  for (const [rawName, rawValue] of Object.entries(input)) {
    const name = rawName.trim().toLowerCase();
    if (!name || BLOCKED_HEADERS.has(name)) {
      throw new Error(`Header not allowed: ${rawName}`);
    }
    if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
      throw new Error(`Invalid header name: ${rawName}`);
    }
    if (typeof rawValue !== "string") {
      throw new Error(`Header ${rawName} must be a string`);
    }
    headers[name] = rawValue;
  }

  return headers;
}

function normalizeBody(input: unknown, headers: Record<string, string>): BodyInit | undefined {
  if (input === undefined || input === null || input === "") return undefined;

  let body: string;
  if (typeof input === "string") {
    body = input;
  } else {
    body = JSON.stringify(input);
    headers["content-type"] = headers["content-type"] || "application/json";
  }

  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BODY_BYTES) {
    throw new Error(`web_request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`);
  }
  return body;
}

function normalizeTimeout(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1000 || value > 120_000) {
    throw new Error("timeoutMs must be an integer between 1000 and 120000");
  }
  return value;
}

async function readLimited(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) throw new Error(`web_request response exceeds ${limit} bytes`);
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
