import { useCallback, useEffect, useRef, useState } from "react";
import { parseEther, parseUnits } from "viem";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  NATIVE_TOKEN_ADDRESS,
  type SwapQuoteResponse,
} from "@/chrome/swapApi";
import { getCachedBungeeTokens } from "@/chrome/bridgeApi";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import {
  getNativeAssetLogoUrl,
  getNativeAssetMeta,
} from "@/lib/chains";
import { getBungeeChain } from "@/lib/bungeeChainCache";
import {
  BUNGEE_NATIVE_TOKEN,
  type BungeeQuoteResponse,
} from "@walletchan/shared/bungee";
import { getExecutableBridgeRoute } from "./bridgeRouteUtils";
import type { DestinationNativeInfo } from "./swapViewTypes";
import { to0xToken } from "./swapViewUtils";

interface UseSwapQuotesOptions {
  sellToken: PortfolioToken | null;
  buyTokenAddress: string;
  sellTokenAmount: string;
  fromAddress: string;
  slippageBps: number;
  sellChainId: number;
  buyChainId: number;
  isBridge: boolean;
}

export function useSwapQuotes({
  sellToken,
  buyTokenAddress,
  sellTokenAmount,
  fromAddress,
  slippageBps,
  sellChainId,
  buyChainId,
  isBridge,
}: UseSwapQuotesOptions) {
  const { networksInfo } = useNetworks();
  const [quote, setQuote] = useState<SwapQuoteResponse | null>(null);
  const [bridgeQuote, setBridgeQuote] = useState<BungeeQuoteResponse | null>(
    null,
  );
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [destNativeInfo, setDestNativeInfo] =
    useState<DestinationNativeInfo | null>(null);
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuote = useCallback(() => {
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);

    const buyAddress = buyTokenAddress.trim();
    if (
      !sellToken ||
      !buyAddress ||
      !/^0x[a-fA-F0-9]{40}$/.test(buyAddress) ||
      !sellTokenAmount
    ) {
      setQuote(null);
      setBridgeQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    let sellAmountWei: string;
    try {
      const parsed =
        sellToken.contractAddress === "native"
          ? parseEther(sellTokenAmount)
          : parseUnits(sellTokenAmount, sellToken.decimals);
      if (parsed <= 0n) {
        setQuote(null);
        setBridgeQuote(null);
        setQuoteError(null);
        setQuoteLoading(false);
        return;
      }
      sellAmountWei = parsed.toString();
    } catch {
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);
    setQuote(null);
    setBridgeQuote(null);

    quoteTimerRef.current = setTimeout(() => {
      if (isBridge) {
        chrome.runtime.sendMessage(
          {
            type: "fetchBridgeQuote",
            userAddress: fromAddress,
            receiverAddress: fromAddress,
            originChainId: sellChainId,
            destinationChainId: buyChainId,
            inputToken:
              sellToken.contractAddress === "native"
                ? BUNGEE_NATIVE_TOKEN
                : sellToken.contractAddress,
            outputToken:
              buyAddress.toLowerCase() ===
              NATIVE_TOKEN_ADDRESS.toLowerCase()
                ? BUNGEE_NATIVE_TOKEN
                : buyAddress,
            inputAmount: sellAmountWei,
            slippage: slippageBps / 100,
          },
          (response) => {
            setQuoteLoading(false);
            setQuote(null);
            if (
              response?.success &&
              getExecutableBridgeRoute(response.data)
            ) {
              setBridgeQuote(response.data);
              setQuoteError(null);
            } else {
              setBridgeQuote(null);
              setQuoteError(response?.error || "No bridge route available");
            }
          },
        );
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: "fetchSwapPrice",
          chainId: sellChainId,
          sellToken: to0xToken(sellToken),
          buyToken: buyAddress,
          sellAmount: sellAmountWei,
          taker: fromAddress,
          slippageBps,
        },
        (response) => {
          setQuoteLoading(false);
          setBridgeQuote(null);
          if (response?.success && response.data) {
            if (!response.data.liquidityAvailable) {
              setQuoteError("No liquidity available for this pair");
              setQuote(null);
            } else {
              setQuote(response.data);
              setQuoteError(null);
            }
          } else {
            setQuoteError("Unable to find swap quote");
            setQuote(null);
          }
        },
      );
    }, 500);
  }, [
    sellToken,
    buyTokenAddress,
    sellTokenAmount,
    fromAddress,
    slippageBps,
    sellChainId,
    buyChainId,
    isBridge,
  ]);

  useEffect(() => {
    fetchQuote();
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [fetchQuote]);

  useEffect(() => {
    if (!isBridge || !quoteError || quoteLoading) {
      setDestNativeInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const nativeMeta = getNativeAssetMeta(buyChainId, networksInfo);
      if (nativeMeta) {
        if (!cancelled) setDestNativeInfo(nativeMeta);
        return;
      }
      try {
        const tokens = await getCachedBungeeTokens(buyChainId);
        const native = tokens.find(
          (token) =>
            (token.address ?? "").toLowerCase() ===
            BUNGEE_NATIVE_TOKEN.toLowerCase(),
        );
        if (cancelled || !native) return;
        const bungeeChain = getBungeeChain(buyChainId);
        setDestNativeInfo({
          symbol: native.symbol || "",
          name: native.name || native.symbol || "",
          decimals: native.decimals ?? 18,
          logoUrl: getNativeAssetLogoUrl(
            native.symbol,
            native.logoURI || native.icon,
          ),
          chainName: bungeeChain?.name ?? getChainConfig(buyChainId).name,
        });
      } catch {
        // Missing cache/proxy data only hides the recovery suggestion.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isBridge, quoteError, quoteLoading, buyChainId, networksInfo]);

  const clearQuotes = () => {
    setQuote(null);
    setBridgeQuote(null);
  };

  return {
    quote,
    setQuote,
    bridgeQuote,
    setBridgeQuote,
    quoteLoading,
    quoteError,
    setQuoteError,
    destNativeInfo,
    clearQuotes,
  };
}
