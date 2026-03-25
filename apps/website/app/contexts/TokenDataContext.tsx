"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { formatMarketCap } from "../utils/formatters";

const POLLING_INTERVAL = 5000; // 5 seconds

export interface TokenData {
  price: string;
  priceRaw: number;
  change1d: number;
  marketCap: string;
  marketCapRaw: number;
}

interface TokenDataContextType {
  tokenData: TokenData | null;
  isLoading: boolean;
}

const TokenDataContext = createContext<TokenDataContextType>({
  tokenData: null,
  isLoading: true,
});

// Format small prices nicely (e.g., $0.0000038 -> $0.0₆38)
function formatPrice(priceValue: number): string {
  if (priceValue === 0) return "$0";
  if (priceValue >= 1) return `$${priceValue.toFixed(2)}`;
  if (priceValue >= 0.01) return `$${priceValue.toFixed(4)}`;

  const priceStr = priceValue.toFixed(20);
  const match = priceStr.match(/^0\.(0+)(\d+)/);
  if (match) {
    const zeros = match[1].length;
    const significantDigits = match[2].slice(0, 4);
    const subscriptDigits = "₀₁₂₃₄₅₆₇₈₉";
    const subscript = zeros
      .toString()
      .split("")
      .map((d) => subscriptDigits[parseInt(d)])
      .join("");
    return `$0.0${subscript}${significantDigits}`;
  }
  return `$${priceValue.toFixed(8)}`;
}

export function TokenDataProvider({ children }: { children: ReactNode }) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function fetchTokenData() {
      try {
        const res = await fetch("/api/token-data");
        const data = await res.json();
        if (data.data?.attributes) {
          const attrs = data.data.attributes;

          // Get market cap - use fdv_usd if market_cap_usd is 0 or missing
          const mcapValue =
            parseFloat(attrs.market_cap_usd || "0") > 0
              ? parseFloat(attrs.market_cap_usd)
              : parseFloat(attrs.fdv_usd || "0");

          // Get price
          const priceValue = parseFloat(attrs.base_token_price_usd || "0");

          // Get 24h change
          const change1d = parseFloat(attrs.price_change_percentage?.h24 || "0");

          setTokenData({
            price: formatPrice(priceValue),
            priceRaw: priceValue,
            change1d,
            marketCap: formatMarketCap(mcapValue),
            marketCapRaw: mcapValue,
          });
          setIsLoading(false);
        } else {
          throw new Error("Invalid API response");
        }
      } catch (error) {
        console.error("Failed to fetch token data:", error);
        // Don't set error state, keep loading and retry after 3 seconds
        retryTimeoutRef.current = setTimeout(() => {
          fetchTokenData();
        }, 3000);
      }
    }

    fetchTokenData();
    const interval = setInterval(() => fetchTokenData(), POLLING_INTERVAL);

    return () => {
      clearInterval(interval);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return (
    // @ts-ignore React 19 types conflict with monorepo React 18 types on Vercel
    <TokenDataContext.Provider value={{ tokenData, isLoading }}>
      {children}
    </TokenDataContext.Provider>
  );
}

export function useTokenData() {
  return useContext(TokenDataContext);
}
