import { useEffect, useState } from "react";

import { fetchOnchainBalances } from "@/chrome/portfolio/onchainBalances";
import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "@/chrome/pendingErc7715PermissionStorage";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolio/tokenCatalog";
import { formatUsd } from "@/lib/currencyFormatUtils";
import {
  resolveTokenMetadataClient,
  type TokenDisplayMetadata,
} from "@/lib/tokenMetadataClient";
import { formatTokenBalance } from "@/lib/tokenFormatUtils";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type Erc7715PermissionAsset = {
  symbol: string;
  name: string;
  decimals: number | null;
  decimalsStatus: "loading" | "verified" | "unverified";
  logoUrl?: string;
  priceUsd: number;
  balanceLabel: string;
  balanceUsdLabel: string;
  tokenExplorerUrl: string | null;
  tokenAddress: string | null;
};

function isNativePortfolioToken(token: PortfolioToken): boolean {
  return (
    token.contractAddress === "native" ||
    token.contractAddress.toLowerCase() === ZERO_ADDRESS
  );
}

function findPortfolioToken({
  tokens,
  chainId,
  tokenAddress,
  isNative,
}: {
  tokens: PortfolioToken[];
  chainId: number;
  tokenAddress: string | null;
  isNative: boolean;
}): PortfolioToken | null {
  return (
    tokens.find((token) => {
      if (token.chainId !== chainId) return false;
      if (isNative) return isNativePortfolioToken(token);
      return (
        !!tokenAddress &&
        token.contractAddress.toLowerCase() === tokenAddress.toLowerCase()
      );
    }) || null
  );
}

function fallbackPortfolioToken({
  chainId,
  tokenAddress,
  isNative,
  symbol,
  name,
  decimals,
  logoUrl,
}: {
  chainId: number;
  tokenAddress: string | null;
  isNative: boolean;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}): PortfolioToken {
  return {
    symbol,
    name,
    contractAddress: isNative ? "native" : tokenAddress || ZERO_ADDRESS,
    chainId,
    decimals,
    balance: "0",
    balanceFormatted: "0",
    priceUsd: 0,
    valueUsd: 0,
    logoUrl,
  };
}

export function useErc7715PermissionAsset({
  permissionRequest,
  editedRequest,
  explorer,
  nativeSymbol,
  tokenAddress,
  isNative,
  disabled = false,
}: {
  permissionRequest: PendingErc7715PermissionRequest;
  editedRequest: Erc7715PermissionRequest;
  explorer?: string;
  nativeSymbol: string;
  tokenAddress: string | null;
  isNative: boolean;
  disabled?: boolean;
}): Erc7715PermissionAsset {
  const [tokenInfo, setTokenInfo] = useState<
    TokenDisplayMetadata | null | undefined
  >(undefined);
  const [portfolioToken, setPortfolioToken] = useState<
    PortfolioToken | null | undefined
  >(undefined);

  const tokenExplorerUrl =
    tokenAddress && explorer
      ? `${explorer.replace(/\/+$/, "")}/address/${tokenAddress}`
      : null;
  const decimals = isNative
    ? 18
    : tokenInfo?.decimals ?? portfolioToken?.decimals ?? null;
  const decimalsStatus = isNative
    ? "verified"
    : typeof decimals === "number"
      ? "verified"
      : tokenInfo === undefined || portfolioToken === undefined
        ? "loading"
        : "unverified";
  const symbol = isNative
    ? nativeSymbol
    : tokenInfo?.symbol || portfolioToken?.symbol || "TOKEN";
  const name = isNative
    ? "Native asset"
    : tokenInfo?.name ||
      portfolioToken?.name ||
      (decimalsStatus === "unverified"
        ? "Unverified ERC-20 token"
        : "ERC-20 token");
  const logoUrl = tokenInfo?.logoUrl || portfolioToken?.logoUrl;
  const balanceLabel =
    portfolioToken === undefined
      ? "Loading..."
      : `${portfolioToken?.balanceFormatted || formatTokenBalance("0")} ${symbol}`;
  const balanceUsdLabel =
    portfolioToken === undefined
      ? ""
      : formatUsd(portfolioToken?.valueUsd || 0);
  const priceUsd = portfolioToken?.priceUsd || 0;

  useEffect(() => {
    let cancelled = false;
    if (disabled) {
      setTokenInfo(null);
      return () => {
        cancelled = true;
      };
    }
    setTokenInfo(undefined);
    resolveTokenMetadataClient(
      permissionRequest.chainId,
      tokenAddress || "native",
    ).then((metadata) => {
      if (!cancelled) setTokenInfo(metadata);
    });
    return () => {
      cancelled = true;
    };
  }, [disabled, permissionRequest.chainId, tokenAddress]);

  useEffect(() => {
    let cancelled = false;
    if (disabled) {
      setPortfolioToken(null);
      return () => {
        cancelled = true;
      };
    }
    setPortfolioToken(undefined);

    loadPortfolioTokenCatalog(editedRequest.from, { enrich: false })
      .then(async (catalog) => {
        if (cancelled) return;
        const catalogToken = findPortfolioToken({
          tokens: catalog.tokens,
          chainId: permissionRequest.chainId,
          tokenAddress,
          isNative,
        });

        if (!catalogToken && !isNative && typeof decimals !== "number") {
          setPortfolioToken(null);
          return;
        }

        const token =
          catalogToken ||
          fallbackPortfolioToken({
            chainId: permissionRequest.chainId,
            tokenAddress,
            isNative,
            symbol,
            name,
            decimals: decimals ?? 18,
            logoUrl,
          });

        const onchain = await fetchOnchainBalances(
          editedRequest.from,
          [token],
          { preserveZeroBalanceTokens: true },
        );
        if (!cancelled) setPortfolioToken(onchain.tokens[0] || token);
      })
      .catch(() => {
        if (!cancelled) setPortfolioToken(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    decimals,
    disabled,
    editedRequest.from,
    isNative,
    logoUrl,
    name,
    permissionRequest.chainId,
    symbol,
    tokenAddress,
  ]);

  if (disabled) {
    return {
      symbol: "Approvals",
      name: "Token approval methods",
      decimals: null,
      decimalsStatus: "verified",
      priceUsd: 0,
      balanceLabel: "",
      balanceUsdLabel: "",
      tokenExplorerUrl: null,
      tokenAddress: null,
    };
  }

  return {
    symbol,
    name,
    decimals,
    decimalsStatus,
    logoUrl,
    priceUsd,
    balanceLabel,
    balanceUsdLabel,
    tokenExplorerUrl,
    tokenAddress,
  };
}
