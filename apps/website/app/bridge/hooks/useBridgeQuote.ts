import { useCallback, useEffect, useRef, useState } from "react";
import type { BungeeQuoteResponse } from "../types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface UseBridgeQuoteParams {
  userAddress?: string;
  receiverAddress?: string;
  originChainId?: number;
  destinationChainId?: number;
  inputToken?: string;
  outputToken?: string;
  /** Wei string. */
  inputAmount?: string;
  /** Percentage as a decimal string, e.g. "0.5". Defaults to "0.5". */
  slippage?: string;
  enabled?: boolean;
}

export function useBridgeQuote(params: UseBridgeQuoteParams) {
  const {
    userAddress,
    receiverAddress,
    originChainId,
    destinationChainId,
    inputToken,
    outputToken,
    inputAmount,
    slippage,
    enabled = true,
  } = params;

  const [quote, setQuote] = useState<BungeeQuoteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const buildSearchParams = useCallback(
    (taker: string) => {
      const sp = new URLSearchParams({
        userAddress: taker,
        receiverAddress: receiverAddress || taker,
        originChainId: String(originChainId),
        destinationChainId: String(destinationChainId),
        inputToken: inputToken ?? "",
        outputToken: outputToken ?? "",
        inputAmount: inputAmount ?? "",
      });
      if (slippage) sp.set("slippage", slippage);
      return sp;
    },
    [
      receiverAddress,
      originChainId,
      destinationChainId,
      inputToken,
      outputToken,
      inputAmount,
      slippage,
    ],
  );

  const fetchQuote = useCallback(async () => {
    if (
      !enabled ||
      !originChainId ||
      !destinationChainId ||
      !inputToken ||
      !outputToken ||
      !inputAmount ||
      inputAmount === "0"
    ) {
      setQuote(null);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const sp = buildSearchParams(userAddress || ZERO_ADDRESS);
      const response = await fetch(`/api/bridge/quote?${sp.toString()}`, {
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          (data as { error?: string; message?: string }).error ||
            (data as { error?: string; message?: string }).message ||
            `API error: ${response.status}`,
        );
      }

      if (!data.success || !data.result?.manualRoutes?.length) {
        setError("No bridge routes available for this pair");
        setQuote(null);
      } else {
        setQuote(data as BungeeQuoteResponse);
        setError(null);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch quote");
      setQuote(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    enabled,
    originChainId,
    destinationChainId,
    inputToken,
    outputToken,
    inputAmount,
    userAddress,
    buildSearchParams,
  ]);

  // Debounced auto-fetch
  useEffect(() => {
    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  /** Re-quote at execute time so we have a fresh quoteId (TTL ~60s). */
  const fetchFirmQuote = useCallback(
    async (taker: string): Promise<BungeeQuoteResponse | null> => {
      if (
        !originChainId ||
        !destinationChainId ||
        !inputToken ||
        !outputToken ||
        !inputAmount
      ) {
        return null;
      }
      const sp = buildSearchParams(taker);
      const response = await fetch(`/api/bridge/quote?${sp.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`);
      }
      if (!data.success || !data.result?.manualRoutes?.length) {
        throw new Error("No bridge routes available");
      }
      return data as BungeeQuoteResponse;
    },
    [
      originChainId,
      destinationChainId,
      inputToken,
      outputToken,
      inputAmount,
      buildSearchParams,
    ],
  );

  return { quote, isLoading, error, refetch: fetchQuote, fetchFirmQuote };
}
