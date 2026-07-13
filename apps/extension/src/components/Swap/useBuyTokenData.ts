import { useEffect, useRef, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { NATIVE_TOKEN_ADDRESS, type TokenInfo } from "@/chrome/swapApi";

interface InitialBuyToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface UseBuyTokenDataOptions {
  buyChainId: number;
  holdingsAllChains: PortfolioToken[];
  initialBuyToken?: InitialBuyToken;
}

export function useBuyTokenData({
  buyChainId,
  holdingsAllChains,
  initialBuyToken,
}: UseBuyTokenDataOptions) {
  const [buyTokenAddress, setBuyTokenAddress] = useState(
    initialBuyToken?.address ?? "",
  );
  const [buyTokenInfo, setBuyTokenInfo] = useState<TokenInfo | null>(
    initialBuyToken
      ? {
          name: initialBuyToken.name,
          symbol: initialBuyToken.symbol,
          decimals: initialBuyToken.decimals,
        }
      : null,
  );
  const [buyTokenLogoURI, setBuyTokenLogoURI] = useState<string | undefined>(
    initialBuyToken?.logoURI,
  );
  const [buyTokenPriceUsd, setBuyTokenPriceUsd] = useState(0);
  const tokenInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buyInfoSetBySelectRef = useRef(false);

  useEffect(() => {
    if (tokenInfoTimerRef.current) clearTimeout(tokenInfoTimerRef.current);
    if (buyInfoSetBySelectRef.current) {
      buyInfoSetBySelectRef.current = false;
      return;
    }

    setBuyTokenInfo(null);
    const address = buyTokenAddress.trim();
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return;

    let cancelled = false;
    const timerId = setTimeout(() => {
      chrome.runtime.sendMessage(
        {
          type: "fetchTokenInfo",
          tokenAddress: address,
          chainId: buyChainId,
        },
        (response) => {
          if (cancelled) return;
          setBuyTokenInfo(response?.success && response.data ? response.data : null);
        },
      );
    }, 300);
    tokenInfoTimerRef.current = timerId;
    return () => {
      cancelled = true;
      clearTimeout(timerId);
      if (tokenInfoTimerRef.current === timerId) {
        tokenInfoTimerRef.current = null;
      }
    };
  }, [buyTokenAddress, buyChainId]);

  useEffect(() => {
    setBuyTokenPriceUsd(0);
    const address = buyTokenAddress.trim();
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return;

    const isNative =
      address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
    const held = holdingsAllChains.find(
      (token) =>
        token.chainId === buyChainId &&
        (token.contractAddress.toLowerCase() === address.toLowerCase() ||
          (isNative && token.contractAddress === "native")),
    );
    if (held && held.priceUsd > 0) {
      setBuyTokenPriceUsd(held.priceUsd);
      return;
    }

    chrome.runtime.sendMessage(
      { type: "fetchTokenPrice", chainId: buyChainId, address },
      (response) => {
        if (response?.success && response.priceUsd > 0) {
          setBuyTokenPriceUsd(response.priceUsd);
        }
      },
    );
  }, [buyTokenAddress, buyChainId, holdingsAllChains]);

  const setSelectedBuyToken = (token: PortfolioToken) => {
    buyInfoSetBySelectRef.current = true;
    setBuyTokenAddress(
      token.contractAddress === "native"
        ? NATIVE_TOKEN_ADDRESS
        : token.contractAddress,
    );
    setBuyTokenInfo({
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
    });
    setBuyTokenLogoURI(token.logoUrl);
    setBuyTokenPriceUsd(0);
  };

  const setKnownBuyToken = (
    address: string,
    info: TokenInfo,
    logoURI?: string,
  ) => {
    buyInfoSetBySelectRef.current = true;
    setBuyTokenAddress(address);
    setBuyTokenInfo(info);
    setBuyTokenLogoURI(logoURI);
  };

  const clearBuyToken = () => {
    setBuyTokenAddress("");
    setBuyTokenInfo(null);
    setBuyTokenLogoURI(undefined);
  };

  return {
    buyTokenAddress,
    setBuyTokenAddress,
    buyTokenInfo,
    setBuyTokenInfo,
    buyTokenLogoURI,
    setBuyTokenLogoURI,
    buyTokenPriceUsd,
    setBuyTokenPriceUsd,
    setSelectedBuyToken,
    setKnownBuyToken,
    clearBuyToken,
  };
}
