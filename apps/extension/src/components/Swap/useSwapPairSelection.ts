import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { NATIVE_TOKEN_ADDRESS } from "@/chrome/swapApi";
import { pickDefaultSwapSellToken, to0xToken } from "./swapViewUtils";
import type { useBuyTokenData } from "./useBuyTokenData";
import type { useSwapAmount } from "./useSwapAmount";
import type { useSwapQuotes } from "./useSwapQuotes";

interface UseSwapPairSelectionOptions {
  initialSellToken?: PortfolioToken;
  holdingsAllChains: PortfolioToken[];
  sellToken: PortfolioToken | null;
  setSellToken: Dispatch<SetStateAction<PortfolioToken | null>>;
  sellChainId: number;
  setSellChainId: Dispatch<SetStateAction<number>>;
  buyChainId: number;
  setBuyChainId: Dispatch<SetStateAction<number>>;
  pickerSide?: "sell" | "buy";
  buyToken: ReturnType<typeof useBuyTokenData>;
  amount: ReturnType<typeof useSwapAmount>;
  quotes: ReturnType<typeof useSwapQuotes>;
}

export function useSwapPairSelection({
  initialSellToken,
  holdingsAllChains,
  sellToken,
  setSellToken,
  sellChainId,
  setSellChainId,
  buyChainId,
  setBuyChainId,
  pickerSide,
  buyToken,
  amount,
  quotes,
}: UseSwapPairSelectionOptions) {
  const autoSelectedSellRef = useRef(Boolean(initialSellToken));

  useEffect(() => {
    if (
      autoSelectedSellRef.current ||
      initialSellToken ||
      sellToken ||
      holdingsAllChains.length === 0
    ) {
      return;
    }
    const cachedTopToken = pickDefaultSwapSellToken(holdingsAllChains);
    if (!cachedTopToken) return;
    autoSelectedSellRef.current = true;
    setSellChainId(cachedTopToken.chainId);
    setBuyChainId(cachedTopToken.chainId);
    setSellToken(cachedTopToken);
  }, [
    holdingsAllChains,
    initialSellToken,
    sellToken,
    setBuyChainId,
    setSellChainId,
    setSellToken,
  ]);

  const handleFlip = () => {
    const address = buyToken.buyTokenAddress.trim();
    const isNative =
      Boolean(address) &&
      address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
    const heldBuyToken =
      buyToken.buyTokenInfo && address
        ? holdingsAllChains.find(
            (token) =>
              token.chainId === buyChainId &&
              (token.contractAddress.toLowerCase() === address.toLowerCase() ||
                (isNative && token.contractAddress === "native")),
          )
        : undefined;
    const nextSellToken: PortfolioToken | null = buyToken.buyTokenInfo && address
      ? heldBuyToken ?? {
          symbol: buyToken.buyTokenInfo.symbol,
          name: buyToken.buyTokenInfo.name,
          contractAddress: isNative ? "native" : address,
          chainId: buyChainId,
          decimals: buyToken.buyTokenInfo.decimals,
          balance: "0",
          balanceFormatted: "0",
          priceUsd: buyToken.buyTokenPriceUsd,
          valueUsd: 0,
          logoUrl: buyToken.buyTokenLogoURI,
        }
      : null;
    const previousSellToken = sellToken;
    const previousSellChainId = sellChainId;
    setSellChainId(buyChainId);
    setBuyChainId(previousSellChainId);
    setSellToken(nextSellToken);
    if (previousSellToken) {
      buyToken.setKnownBuyToken(
        to0xToken(previousSellToken),
        {
          name: previousSellToken.name,
          symbol: previousSellToken.symbol,
          decimals: previousSellToken.decimals,
        },
        previousSellToken.logoUrl,
      );
    } else {
      buyToken.clearBuyToken();
    }
    amount.resetAmount();
    quotes.clearQuotes();
  };

  const handleTokenSelect = (pickedChainId: number, picked: PortfolioToken) => {
    if (pickerSide === "sell") {
      setSellChainId(pickedChainId);
      const buyWasImplicit =
        buyChainId === sellChainId && !buyToken.buyTokenAddress;
      if (buyWasImplicit && pickedChainId !== sellChainId) {
        setBuyChainId(pickedChainId);
      }
      setSellToken(picked);
      amount.resetAmount();
      amount.setIsUsdMode(false);
      quotes.setQuote(null);
    } else if (pickerSide === "buy") {
      if (pickedChainId !== buyChainId) setBuyChainId(pickedChainId);
      buyToken.setSelectedBuyToken(picked);
      quotes.setQuote(null);
    }
  };

  return { handleFlip, handleTokenSelect };
}
