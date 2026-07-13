import {
  SWAP_API_BASE,
  SWAP_QUOTE_RESPONSE_MAX_BYTES,
  SWAP_REQUEST_TIMEOUT_MS,
} from "./constants";
import { fetchSwapJson, swapApiError } from "./transport";
import type {
  SwapPriceParams,
  SwapQuoteParams,
  SwapQuoteResponse,
} from "./types";

export async function fetchSwapPrice(
  params: SwapPriceParams,
): Promise<SwapQuoteResponse> {
  const qs = new URLSearchParams({
    chainId: params.chainId.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
  });
  if (params.taker) qs.set("taker", params.taker);
  if (params.slippageBps !== undefined) {
    qs.set("slippageBps", params.slippageBps.toString());
  }

  const { response, data } = await fetchSwapJson<
    SwapQuoteResponse & { error?: unknown; reason?: unknown }
  >(`${SWAP_API_BASE}/price?${qs}`, {
    timeoutMs: SWAP_REQUEST_TIMEOUT_MS,
    maxBytes: SWAP_QUOTE_RESPONSE_MAX_BYTES,
  });
  if (!response.ok) throw new Error(swapApiError(data, response.status));
  return data;
}

export async function fetchSwapQuote(
  params: SwapQuoteParams,
): Promise<SwapQuoteResponse> {
  const qs = new URLSearchParams({
    chainId: params.chainId.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.taker,
  });
  if (params.slippageBps !== undefined) {
    qs.set("slippageBps", params.slippageBps.toString());
  }

  const { response, data } = await fetchSwapJson<
    SwapQuoteResponse & { error?: unknown; reason?: unknown }
  >(`${SWAP_API_BASE}/quote?${qs}`, {
    timeoutMs: SWAP_REQUEST_TIMEOUT_MS,
    maxBytes: SWAP_QUOTE_RESPONSE_MAX_BYTES,
  });
  if (!response.ok) throw new Error(swapApiError(data, response.status));
  return data;
}
