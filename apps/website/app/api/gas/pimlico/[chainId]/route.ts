import { NextRequest, NextResponse } from "next/server";
import {
  parsePimlicoProxyEnvelope,
  verifyPimlicoSendEnvelope,
} from "./policy";

export const dynamic = "force-dynamic";

const REQUEST_MAX_BYTES = 256_000;
const RESPONSE_MAX_BYTES = 256_000;
const REQUEST_TIMEOUT_MS = 20_000;
const RATE_WINDOW_MS = 60_000;
const READ_RATE_LIMIT = 60;
const SEND_RATE_LIMIT = 10;
const rateLimitState = new Map<string, number[]>();

function logUpstreamDiagnostic(
  chainId: number,
  method: string,
  status: number,
  responseBody: unknown,
  requestParams: unknown[],
) {
  if (process.env.NODE_ENV === "production") return;
  const body = responseBody && typeof responseBody === "object"
    ? responseBody as Record<string, unknown>
    : null;
  const error = body?.error && typeof body.error === "object"
    ? body.error as Record<string, unknown>
    : null;
  const result = body?.result && typeof body.result === "object"
    ? body.result as Record<string, unknown>
    : null;
  const paymasterData = typeof result?.paymasterData === "string"
    ? result.paymasterData
    : null;
  const requestOperation = requestParams[0] &&
    typeof requestParams[0] === "object" &&
    !Array.isArray(requestParams[0])
    ? requestParams[0] as Record<string, unknown>
    : null;
  console.info("[pimlico-proxy]", {
    chainId,
    method,
    status,
    outcome: error ? "rpc-error" : "success",
    rpcCode: typeof error?.code === "number" ? error.code : undefined,
    rpcMessage: typeof error?.message === "string"
      ? error.message.slice(0, 240)
      : undefined,
    paymaster: typeof result?.paymaster === "string"
      ? result.paymaster
      : undefined,
    paymasterDataBytes: paymasterData
      ? Math.max(0, (paymasterData.length - 2) / 2)
      : undefined,
    paymasterDataPrefix: paymasterData?.slice(0, 22),
    responsePaymasterVerificationGasLimit:
      typeof result?.paymasterVerificationGasLimit === "string"
        ? result.paymasterVerificationGasLimit
        : undefined,
    responsePaymasterPostOpGasLimit:
      typeof result?.paymasterPostOpGasLimit === "string"
        ? result.paymasterPostOpGasLimit
        : undefined,
    requestPaymasterVerificationGasLimit:
      typeof requestOperation?.paymasterVerificationGasLimit === "string"
        ? requestOperation.paymasterVerificationGasLimit
        : undefined,
    requestPaymasterPostOpGasLimit:
      typeof requestOperation?.paymasterPostOpGasLimit === "string"
        ? requestOperation.paymasterPostOpGasLimit
        : undefined,
  });
}

function clientKey(request: NextRequest): string {
  return (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function consumeRateLimit(key: string, maximum: number): boolean {
  const now = Date.now();
  const prior = rateLimitState.get(key) ?? [];
  const live = prior.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (live.length >= maximum) return false;
  live.push(now);
  rateLimitState.set(key, live);
  if (rateLimitState.size > 10_000) rateLimitState.clear();
  return true;
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ chainId: string }> },
) {
  if (process.env.PIMLICO_PROXY_DISABLED?.toLowerCase() === "true") {
    return jsonError("Token gas payment is temporarily disabled", 503);
  }
  const apiKey = process.env.PIMLICO_API_KEY?.trim();
  if (!apiKey) return jsonError("Gas-payment provider is not configured", 503);

  const { chainId: chainIdParam } = await context.params;
  const chainId = Number(chainIdParam);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return jsonError("Invalid chain ID", 400);
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > REQUEST_MAX_BYTES) {
    return jsonError("Request body is too large", 413);
  }

  let bodyText: string;
  let body: unknown;
  try {
    bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > REQUEST_MAX_BYTES) {
      return jsonError("Request body is too large", 413);
    }
    body = JSON.parse(bodyText);
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const parsed = parsePimlicoProxyEnvelope(body, chainId);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const isSend = parsed.envelope.method === "eth_sendUserOperation";
  if (isSend && !(await verifyPimlicoSendEnvelope(parsed.envelope, chainId))) {
    return jsonError("UserOperation signature is invalid", 401);
  }
  const rateKey = `${clientKey(request)}:${isSend ? "send" : "read"}`;
  if (!consumeRateLimit(rateKey, isSend ? SEND_RATE_LIMIT : READ_RATE_LIMIT)) {
    return jsonError("Rate limit exceeded", 429);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(
      `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.envelope),
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      },
    );
    const declaredResponseLength = Number(
      upstream.headers.get("content-length") || 0,
    );
    if (declaredResponseLength > RESPONSE_MAX_BYTES) {
      return jsonError("Gas-payment provider response is too large", 502);
    }
    const text = await upstream.text();
    if (new TextEncoder().encode(text).byteLength > RESPONSE_MAX_BYTES) {
      return jsonError("Gas-payment provider response is too large", 502);
    }
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(text);
    } catch {
      return jsonError("Gas-payment provider returned invalid JSON", 502);
    }
    logUpstreamDiagnostic(
      chainId,
      parsed.envelope.method,
      upstream.status,
      responseBody,
      parsed.envelope.params,
    );
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error && error.name === "AbortError"
        ? "Gas-payment provider timed out"
        : "Gas-payment provider is unavailable",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
