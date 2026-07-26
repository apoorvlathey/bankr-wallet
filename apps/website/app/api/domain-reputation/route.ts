import { NextRequest, NextResponse } from "next/server";
import {
  normalizeReputationHostname,
  parseMetaMaskDomainReputationResponse,
  parseReputationServiceBaseUrl,
} from "./policy";

export const dynamic = "force-dynamic";

const REQUEST_MAX_BYTES = 1_024;
const RESPONSE_MAX_BYTES = 16 * 1_024;
const REQUEST_TIMEOUT_MS = 4_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const rateLimitState = new Map<string, number[]>();

async function readTextBounded(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RangeError("Body is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function clientKey(request: NextRequest): string {
  return (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function consumeRateLimit(key: string): boolean {
  const now = Date.now();
  const live = (rateLimitState.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_WINDOW_MS,
  );
  if (live.length >= RATE_LIMIT) return false;
  live.push(now);
  rateLimitState.set(key, live);
  if (rateLimitState.size > 10_000) rateLimitState.clear();
  return true;
}

export async function POST(request: NextRequest) {
  if (!consumeRateLimit(clientKey(request))) {
    return jsonError("Rate limit exceeded", 429);
  }
  const serviceUrl = parseReputationServiceBaseUrl(
    process.env.DOMAIN_REPUTATION_SERVICE_URL?.trim(),
  );
  const serviceToken =
    process.env.DOMAIN_REPUTATION_SERVICE_TOKEN?.trim() ?? "";
  if (!serviceUrl || serviceToken.length < 32) {
    return jsonError("Domain reputation is not configured", 503);
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > REQUEST_MAX_BYTES) {
    return jsonError("Request body is too large", 413);
  }
  let body: unknown;
  try {
    const text = await readTextBounded(request.body, REQUEST_MAX_BYTES);
    body = JSON.parse(text);
  } catch (error) {
    if (error instanceof RangeError) {
      return jsonError("Request body is too large", 413);
    }
    return jsonError("Invalid JSON", 400);
  }
  const hostname = normalizeReputationHostname(
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).hostname
      : null,
  );
  if (!hostname) return jsonError("Invalid hostname", 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(
      new URL("/v1/domain/check", serviceUrl).href,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ hostname }),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      },
    );
    const declaredResponse = Number(
      upstream.headers.get("content-length") || 0,
    );
    if (declaredResponse > RESPONSE_MAX_BYTES) {
      return jsonError("Domain reputation service returned an invalid response", 502);
    }
    let text: string;
    try {
      text = await readTextBounded(upstream.body, RESPONSE_MAX_BYTES);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return jsonError("Domain reputation service returned an invalid response", 502);
    }
    if (!upstream.ok) {
      return jsonError("Domain reputation service is unavailable", 503);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return jsonError("Domain reputation service returned an invalid response", 502);
    }
    const parsed = parseMetaMaskDomainReputationResponse(payload);
    if (!parsed) {
      return jsonError("Domain reputation service returned an invalid response", 502);
    }
    return NextResponse.json(parsed, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error && error.name === "AbortError"
        ? "Domain reputation service timed out"
        : "Domain reputation service is unavailable",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
