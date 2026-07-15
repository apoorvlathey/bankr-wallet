import { useEffect, useMemo, useRef, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { fetchOnchainBalances } from "@/chrome/portfolio/onchainBalances";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolio/tokenCatalog";
import { secureHttpTransport } from "@/chrome/network/rpcClient";
import { chainHasNativeToken } from "@/constants/chainRegistry";
import { NATIVE_TOKEN_ADDRESS, type TokenListEntry } from "@/chrome/swapApi";
import { SWAP_SUPPORTED_CHAIN_IDS } from "@/constants/chainRegistry";
import {
  getNativeAssetMeta,
  getStoredRpcUrl,
} from "@/lib/chains";
import type { NetworksInfo } from "@/types";

interface UseTransferCatalogOptions {
  initialToken?: PortfolioToken | null;
  initialChainId: number;
  fromAddress: string;
  networksInfo?: NetworksInfo;
}

export function useTransferCatalog({
  initialToken,
  initialChainId,
  fromAddress,
  networksInfo,
}: UseTransferCatalogOptions) {
  const [selectedChainId, setSelectedChainId] = useState(
    initialToken?.chainId || initialChainId,
  );
  const [selectedToken, setSelectedToken] = useState<PortfolioToken | null>(
    initialToken || null,
  );
  const [allTokens, setAllTokens] = useState<PortfolioToken[]>([]);
  const [tokenList, setTokenList] = useState<TokenListEntry[]>([]);
  const [tokenListChainId, setTokenListChainId] = useState<number | null>(null);
  const [isTokenSelectorOpen, setIsTokenSelectorOpen] = useState(false);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [resolvedCustomToken, setResolvedCustomToken] =
    useState<PortfolioToken | null>(null);
  const [customTokenError, setCustomTokenError] = useState<string | null>(null);
  const [customTokenLoading, setCustomTokenLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHoldingsLoading(true);
    void (async () => {
      try {
        const catalog = await loadPortfolioTokenCatalog(fromAddress);
        if (cancelled) return;

        let tokens = catalog.tokens;
        try {
          const onchain = await fetchOnchainBalances(fromAddress, catalog.tokens, {
            preserveZeroBalanceTokens: true,
          });
          if (!cancelled) tokens = onchain.tokens;
        } catch {
          // Fall back to API/catalog tokens.
        }

        if (!cancelled) setAllTokens(tokens);
      } finally {
        if (!cancelled) setHoldingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromAddress]);

  const holdings = useMemo(
    () => allTokens.filter((token) => token.chainId === selectedChainId),
    [allTokens, selectedChainId],
  );

  useEffect(() => {
    if (!isTokenSelectorOpen) return;
    if (!SWAP_SUPPORTED_CHAIN_IDS.has(selectedChainId)) {
      setTokenList([]);
      setTokenListChainId(null);
      return;
    }
    if (tokenListChainId === selectedChainId) return;

    let cancelled = false;
    chrome.runtime.sendMessage(
      { type: "fetchSwapTokenList", chainId: selectedChainId },
      (response) => {
        if (cancelled) return;
        if (response?.success && Array.isArray(response.data)) {
          setTokenList(response.data);
          setTokenListChainId(selectedChainId);
        } else {
          setTokenList([]);
          setTokenListChainId(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isTokenSelectorOpen, selectedChainId, tokenListChainId]);

  const verifiedZeroBalancesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedToken || !fromAddress) return;
    if (parseFloat(selectedToken.balance) > 0) return;

    const tokenAddress = selectedToken.contractAddress;
    const tokenChainId = selectedToken.chainId;
    const tokenDecimals = selectedToken.decimals;
    const key = `${tokenChainId}:${tokenAddress.toLowerCase()}:${fromAddress.toLowerCase()}`;
    if (verifiedZeroBalancesRef.current.has(key)) return;
    verifiedZeroBalancesRef.current.add(key);

    let cancelled = false;
    void (async () => {
      try {
        const rpcUrl = await getStoredRpcUrl(tokenChainId);
        if (!rpcUrl || cancelled) return;
        const { createPublicClient, erc20Abi, formatUnits } = await import("viem");
        const client = createPublicClient({
          transport: secureHttpTransport(rpcUrl, {
            timeout: 8000,
            retryCount: 0,
          }),
        });
        const rawBalance =
          tokenAddress === "native"
            ? await client.getBalance({
                address: fromAddress as `0x${string}`,
              })
            : ((await client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [fromAddress as `0x${string}`],
              })) as bigint);
        if (cancelled || rawBalance === 0n) return;

        const balance = formatUnits(rawBalance, tokenDecimals);
        const balanceNum = parseFloat(balance);
        const balanceFormatted =
          balanceNum > 0 && balanceNum < 0.0001
            ? "<0.0001"
            : parseFloat(balanceNum.toPrecision(6)).toString();
        setSelectedToken((previous) => {
          if (
            !previous ||
            previous.contractAddress.toLowerCase() !==
              tokenAddress.toLowerCase() ||
            previous.chainId !== tokenChainId
          ) {
            return previous;
          }
          return {
            ...previous,
            balance,
            balanceFormatted,
            valueUsd: balanceNum * previous.priceUsd,
          };
        });
      } catch {
        // Keep showing zero when the direct RPC fallback fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromAddress, selectedToken]);

  const resolvedTokenPriceRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedToken || selectedToken.priceUsd > 0) return;
    if (selectedToken.contractAddress === "native") return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(selectedToken.contractAddress)) return;

    const tokenAddress = selectedToken.contractAddress;
    const tokenChainId = selectedToken.chainId;
    const key = `${tokenChainId}:${tokenAddress.toLowerCase()}`;
    if (resolvedTokenPriceRef.current.has(key)) return;
    resolvedTokenPriceRef.current.add(key);

    chrome.runtime.sendMessage(
      { type: "fetchTokenPrice", chainId: tokenChainId, address: tokenAddress },
      (response) => {
        const priceUsd = Number(response?.priceUsd ?? 0);
        if (!response?.success || !(priceUsd > 0)) return;
        setSelectedToken((previous) => {
          if (
            !previous ||
            previous.contractAddress.toLowerCase() !==
              tokenAddress.toLowerCase() ||
            previous.chainId !== tokenChainId
          ) {
            return previous;
          }
          const balanceNum = parseFloat(previous.balance || "0");
          return {
            ...previous,
            priceUsd,
            valueUsd: balanceNum > 0 ? balanceNum * priceUsd : 0,
          };
        });
      },
    );
  }, [selectedToken]);

  const changeChain = (chainId: number) => {
    setSelectedChainId(chainId);
    setTokenList([]);
    setTokenListChainId(null);
    const tokensOnChain = allTokens.filter((token) => token.chainId === chainId);
    setSelectedToken(tokensOnChain[0] || null);
  };

  const resolveCustomAddress = async (tokenAddress: string) => {
    setCustomTokenLoading(true);
    setResolvedCustomToken(null);
    setCustomTokenError(null);
    try {
      const result = await new Promise<{
        success: boolean;
        data?: { name: string; symbol: string; decimals: number };
      }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "fetchTokenInfo", tokenAddress, chainId: selectedChainId },
          resolve,
        );
      });
      if (!result.success || !result.data) {
        setCustomTokenError("Not a valid ERC20 contract");
        return;
      }

      const { name, symbol, decimals } = result.data;
      const addressLower = tokenAddress.toLowerCase();
      const isNative =
        addressLower === "0x0000000000000000000000000000000000000000" ||
        addressLower === NATIVE_TOKEN_ADDRESS.toLowerCase();
      if (isNative && !chainHasNativeToken(selectedChainId)) {
        setCustomTokenError("This chain does not have a native token");
        return;
      }
      const { createPublicClient, erc20Abi, formatUnits } = await import("viem");
      const rpcUrl = await getStoredRpcUrl(selectedChainId);
      if (!rpcUrl) {
        setCustomTokenError("No RPC for this chain");
        return;
      }
      const client = createPublicClient({
        transport: secureHttpTransport(rpcUrl, { timeout: 8000, retryCount: 0 }),
      });
      const rawBalance = isNative
        ? await client.getBalance({ address: fromAddress as `0x${string}` })
        : await client.readContract({
            address: tokenAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [fromAddress as `0x${string}`],
          });
      const balance = formatUnits(rawBalance, decimals);
      const balanceNum = parseFloat(balance);
      setResolvedCustomToken({
        contractAddress: isNative ? "native" : tokenAddress,
        name,
        symbol,
        decimals,
        balance,
        balanceFormatted:
          balanceNum < 0.0001 && balanceNum > 0
            ? "<0.0001"
            : parseFloat(balanceNum.toPrecision(6)).toString(),
        logoUrl: isNative
          ? getNativeAssetMeta(selectedChainId, networksInfo)?.logoUrl ?? ""
          : "",
        valueUsd: 0,
        priceUsd: 0,
        chainId: selectedChainId,
      });
    } catch {
      setCustomTokenError("Failed to fetch token info");
    } finally {
      setCustomTokenLoading(false);
    }
  };

  const selectCustomToken = (token: PortfolioToken) => {
    setSelectedToken(token);
    setResolvedCustomToken(null);
    setCustomTokenError(null);
  };

  return {
    selectedChainId,
    selectedToken,
    holdings,
    holdingsLoading,
    tokenList,
    setIsTokenSelectorOpen,
    changeChain,
    selectToken: setSelectedToken,
    resolveCustomAddress,
    selectCustomToken,
    resolvedCustomToken,
    customTokenLoading,
    customTokenError,
  };
}
