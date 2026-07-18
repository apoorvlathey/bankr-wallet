import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { fetchOnchainBalances } from "@/chrome/portfolio/onchainBalances";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolio/tokenCatalog";
import { secureHttpTransport } from "@/chrome/network/rpcClient";
import { getStoredRpcUrl } from "@/lib/chains";

interface UseSellTokenDataOptions {
  fromAddress: string;
  chainId: number;
  isSwapSupported: boolean;
  initialSellToken?: PortfolioToken;
}

export function useSellTokenData({
  fromAddress,
  chainId,
  isSwapSupported,
  initialSellToken,
}: UseSellTokenDataOptions) {
  const [holdingsAllChains, setHoldingsAllChains] = useState<PortfolioToken[]>(
    [],
  );
  const [sellToken, setSellToken] = useState<PortfolioToken | null>(null);
  const verifiedZeroBalancesRef = useRef<Set<string>>(new Set());
  const resolvedSellPriceRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isSwapSupported) return;
    let cancelled = false;
    (async () => {
      try {
        const catalog = await loadPortfolioTokenCatalog(fromAddress);
        if (cancelled) return;

        setHoldingsAllChains(catalog.tokens);
        if (initialSellToken) {
          const cachedMatch = catalog.tokens.find(
            (token) =>
              token.chainId === initialSellToken.chainId &&
              token.contractAddress.toLowerCase() ===
                initialSellToken.contractAddress.toLowerCase(),
          );
          setSellToken(cachedMatch ?? initialSellToken);
        }

        let tokens = catalog.tokens;
        try {
          const onchain = await fetchOnchainBalances(fromAddress, catalog.tokens, {
            preserveZeroBalanceTokens: true,
          });
          if (!cancelled) tokens = onchain.tokens;
        } catch {
          // Fall back to API/catalog tokens.
        }
        if (cancelled) return;

        const chainTokens = tokens.filter((token) => token.chainId === chainId);
        setHoldingsAllChains(tokens);
        if (initialSellToken) {
          const match = chainTokens.find(
            (token) =>
              token.contractAddress.toLowerCase() ===
              initialSellToken.contractAddress.toLowerCase(),
          );
          setSellToken(match ?? initialSellToken);
        } else {
          setSellToken((current) => {
            if (!current) return current;
            return (
              tokens.find(
                (token) =>
                  token.chainId === current.chainId &&
                  token.contractAddress.toLowerCase() ===
                    current.contractAddress.toLowerCase(),
              ) ?? current
            );
          });
        }
      } catch {
        // Portfolio failures do not block manual token selection.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Initial sell token is applied only while loading the holdings snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAddress, chainId, isSwapSupported]);

  useEffect(() => {
    if (!sellToken || !fromAddress || parseFloat(sellToken.balance) > 0) return;

    const tokenAddress = sellToken.contractAddress;
    const tokenChainId = sellToken.chainId;
    const tokenDecimals = sellToken.decimals;
    const key = `${tokenChainId}:${tokenAddress.toLowerCase()}:${fromAddress.toLowerCase()}`;
    if (verifiedZeroBalancesRef.current.has(key)) return;
    verifiedZeroBalancesRef.current.add(key);

    let cancelled = false;
    (async () => {
      try {
        const rpcUrl = await getStoredRpcUrl(tokenChainId);
        if (!rpcUrl || cancelled) return;
        const { createPublicClient, erc20Abi } = await import("viem");
        const client = createPublicClient({
          transport: secureHttpTransport(rpcUrl, {
            timeout: 8000,
            retryCount: 0,
          }),
        });
        const rawBalance =
          tokenAddress === "native"
            ? await client.getBalance({ address: fromAddress as `0x${string}` })
            : ((await client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [fromAddress as `0x${string}`],
              })) as bigint);
        if (cancelled || rawBalance === 0n) return;

        const balance = formatUnits(rawBalance, tokenDecimals);
        const balanceNumber = parseFloat(balance);
        const balanceFormatted =
          balanceNumber > 0 && balanceNumber < 0.0001
            ? "<0.0001"
            : parseFloat(balanceNumber.toPrecision(6)).toString();

        setSellToken((current) => {
          if (
            !current ||
            current.contractAddress.toLowerCase() !==
              tokenAddress.toLowerCase() ||
            current.chainId !== tokenChainId
          ) {
            return current;
          }
          return {
            ...current,
            balance,
            balanceFormatted,
            valueUsd: balanceNumber * current.priceUsd,
          };
        });
      } catch {
        // Keep the catalog balance when direct RPC verification fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sellToken, fromAddress]);

  useEffect(() => {
    if (
      !sellToken ||
      sellToken.priceUsd > 0 ||
      sellToken.contractAddress === "native" ||
      !/^0x[a-fA-F0-9]{40}$/.test(sellToken.contractAddress)
    ) {
      return;
    }

    const tokenAddress = sellToken.contractAddress;
    const tokenChainId = sellToken.chainId;
    const key = `${tokenChainId}:${tokenAddress.toLowerCase()}`;
    if (resolvedSellPriceRef.current.has(key)) return;
    resolvedSellPriceRef.current.add(key);

    chrome.runtime.sendMessage(
      { type: "fetchTokenPrice", chainId: tokenChainId, address: tokenAddress },
      (response) => {
        const priceUsd = Number(response?.priceUsd ?? 0);
        if (!response?.success || !(priceUsd > 0)) return;
        setSellToken((current) => {
          if (
            !current ||
            current.contractAddress.toLowerCase() !==
              tokenAddress.toLowerCase() ||
            current.chainId !== tokenChainId
          ) {
            return current;
          }
          const balance = parseFloat(current.balance || "0");
          return {
            ...current,
            priceUsd,
            valueUsd: balance > 0 ? balance * priceUsd : 0,
          };
        });
      },
    );
  }, [sellToken]);

  return {
    holdingsAllChains,
    sellToken,
    setSellToken,
  };
}
