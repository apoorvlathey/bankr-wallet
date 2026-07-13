import { useCallback, useEffect } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { fetchOnchainBalances } from "@/chrome/portfolio/onchainBalances";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import { recordSnapshot } from "@/chrome/portfolio/snapshotStorage";
import {
  getDefiTotal,
  getWalletTokenTotal,
  mergeVerifiedTokenBalances,
} from "@/components/tokenHoldingsUtils";
import { holdingsCacheKey, writeHoldingsSnapshot } from "./cache";
import type { HoldingsState } from "./useHoldingsState";

interface UseLowValueBalanceRefreshOptions {
  address: string;
  chainReloadKey: string;
  lowValueTokens: PortfolioToken[];
  showLowValueTokens: boolean;
  state: HoldingsState;
  onRpcIssuesChange?: (chainIds: number[]) => void;
  onSnapshotsChanged?: () => void;
}

export function useLowValueBalanceRefresh({
  address,
  chainReloadKey,
  lowValueTokens,
  showLowValueTokens,
  state,
  onRpcIssuesChange,
  onSnapshotsChanged,
} : UseLowValueBalanceRefreshOptions): void {
  const {
    allTokenKeys,
    apiUnavailable,
    customTokenKeys,
    defiPositions,
    hiddenTokenKeys,
    lowValueLoading,
    onchainFetchedTokenKeys,
    portfolioBalanceRefreshing,
    tokens,
    verifiedBalanceKeysRef,
    verifiedBalanceTokensRef,
    setLastFetched,
    setLowValueLoading,
    setOnchainFetchedTokenKeys,
    setTokens,
    setTotalValueUsd,
  } = state;

  const refreshLowValueTokenBalances = useCallback(async () => {
    if (!address || portfolioBalanceRefreshing || lowValueLoading) return;

    const tokensToRefresh = lowValueTokens.filter((token) => {
      const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
      return !hiddenTokenKeys.has(key) && !onchainFetchedTokenKeys.has(key);
    });
    if (tokensToRefresh.length === 0) return;

    setLowValueLoading(true);
    try {
      const onchain = await fetchOnchainBalances(address, tokensToRefresh, {
        preserveZeroBalanceTokens: true,
      });
      onRpcIssuesChange?.(onchain.rpcIssueChainIds);

      for (const token of onchain.tokens) {
        const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
        if (!onchain.verifiedTokenKeys.has(key)) continue;
        verifiedBalanceTokensRef.current.set(key, token);
        verifiedBalanceKeysRef.current.add(key);
      }
      const nextFetchedKeys = new Set(verifiedBalanceKeysRef.current);
      const nextTokens = mergeVerifiedTokenBalances(
        tokens,
        Array.from(verifiedBalanceTokensRef.current.values()),
        nextFetchedKeys,
      );
      const total = getWalletTokenTotal(nextTokens) + getDefiTotal(defiPositions);
      const fetchedAt = Date.now();
      const cacheKey = holdingsCacheKey(address, chainReloadKey);

      setTokens(nextTokens);
      setOnchainFetchedTokenKeys(nextFetchedKeys);
      setTotalValueUsd(total);
      setLastFetched(fetchedAt);
      writeHoldingsSnapshot(cacheKey, {
        tokens: nextTokens,
        defiPositions,
        totalValueUsd: total,
        customTokenKeys,
        allTokenKeys,
        hiddenTokenKeys,
        onchainFetchedTokenKeys: nextFetchedKeys,
        rpcIssueChainIds: onchain.rpcIssueChainIds,
        apiUnavailable,
        timestamp: fetchedAt,
      });

      try {
        await recordSnapshot(address, total);
        onSnapshotsChanged?.();
      } catch {
        // Snapshot failures should not block expanded low-value rows.
      }
    } catch {
      // Keep catalog/API balances for the collapsed group if RPC refresh fails.
    } finally {
      setLowValueLoading(false);
    }
  }, [
    address,
    allTokenKeys,
    apiUnavailable,
    chainReloadKey,
    customTokenKeys,
    defiPositions,
    hiddenTokenKeys,
    lowValueLoading,
    lowValueTokens,
    onRpcIssuesChange,
    onSnapshotsChanged,
    onchainFetchedTokenKeys,
    portfolioBalanceRefreshing,
    setLastFetched,
    setLowValueLoading,
    setOnchainFetchedTokenKeys,
    setTokens,
    setTotalValueUsd,
    tokens,
    verifiedBalanceKeysRef,
    verifiedBalanceTokensRef,
  ]);

  useEffect(() => {
    if (!showLowValueTokens || portfolioBalanceRefreshing) return;
    void refreshLowValueTokenBalances();
  }, [
    portfolioBalanceRefreshing,
    refreshLowValueTokenBalances,
    showLowValueTokens,
  ]);
}
