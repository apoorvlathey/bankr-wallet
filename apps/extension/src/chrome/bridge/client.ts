import { WALLETCHAN_BRIDGE_API_BASE } from "@/constants/externalUrls";
import type {
  BungeeQuoteResponse,
  BungeeStatusResponse,
} from "@walletchan/shared/bungee";
import { fetchTextBounded } from "../network/boundedHttp";

export const BRIDGE_REQUEST_TIMEOUT_MS = 15_000;
export const BRIDGE_QUOTE_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const BRIDGE_CATALOG_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;

/** Bounded, redirect-safe GET used by every WalletChan bridge endpoint. */
export async function fetchBridgeJson<T>(
  url: string,
  maxBytes: number,
): Promise<{ response: Response; data: T }> {
  const { response, text } = await fetchTextBounded(
    url,
    { method: "GET" },
    { timeoutMs: BRIDGE_REQUEST_TIMEOUT_MS, maxBytes },
  );
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Bridge API returned invalid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Bridge API returned an invalid response");
  }
  return { response, data: data as T };
}

function bridgeApiError(
  data: { error?: unknown; reason?: unknown },
  status: number,
): string {
  const remote =
    typeof data.error === "string"
      ? data.error
      : typeof data.reason === "string"
        ? data.reason
        : `API error ${status}`;
  return remote.slice(0, 1_000);
}

export interface BridgeQuoteParams {
  userAddress: string;
  receiverAddress?: string;
  originChainId: number;
  destinationChainId: number;
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  slippage?: number;
}

export async function fetchBridgeQuote(
  params: BridgeQuoteParams,
): Promise<BungeeQuoteResponse> {
  const query = new URLSearchParams({
    userAddress: params.userAddress,
    receiverAddress: params.receiverAddress ?? params.userAddress,
    originChainId: params.originChainId.toString(),
    destinationChainId: params.destinationChainId.toString(),
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    inputAmount: params.inputAmount,
  });
  if (params.slippage !== undefined) {
    query.set("slippage", String(params.slippage));
  }

  const { response, data } = await fetchBridgeJson<
    BungeeQuoteResponse & { error?: string; reason?: string }
  >(
    `${WALLETCHAN_BRIDGE_API_BASE}/quote?${query}`,
    BRIDGE_QUOTE_RESPONSE_MAX_BYTES,
  );
  if (!response.ok) throw new Error(bridgeApiError(data, response.status));
  return data;
}

export interface BridgeStatusParams {
  /** Historical name; the Socket V3 value is the quote ID. */
  requestHash?: string;
  txHash?: string;
}

export async function fetchBridgeStatus(
  params: BridgeStatusParams,
): Promise<BungeeStatusResponse> {
  const query = new URLSearchParams();
  if (params.requestHash) query.set("requestHash", params.requestHash);
  if (params.txHash) query.set("txHash", params.txHash);
  const { response, data } = await fetchBridgeJson<
    BungeeStatusResponse & { error?: string; reason?: string }
  >(
    `${WALLETCHAN_BRIDGE_API_BASE}/status?${query}`,
    BRIDGE_QUOTE_RESPONSE_MAX_BYTES,
  );
  if (!response.ok) throw new Error(bridgeApiError(data, response.status));
  return data;
}
