import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { fetchOnchainBalances } from "@/chrome/portfolio/onchainBalances";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import { recordSnapshot } from "@/chrome/portfolio/snapshotStorage";
import { enrichPortfolioTokenPage } from "@/chrome/portfolio/tokenPageEnrichment";
import {
  getDefiTotal,
  getWalletTokenTotal,
  mergeVerifiedTokenBalances,
} from "@/components/tokenHoldingsUtils";
import {
  holdingsCacheKey,
  writeProgressiveHoldingsSnapshot,
} from "./cache";
import { mergeTokenEnrichment } from "./transforms";
import type { HoldingsState } from "./useHoldingsState";
import type { RpcHealthReport } from "@/types";

interface ProgressiveBalanceRefreshOptions {
  address: string;
  chainReloadKey: string;
  visibleTokens: PortfolioToken[];
  visibleLowValueTokens: PortfolioToken[];
  state: HoldingsState;
  onRpcIssuesChange?: (report: RpcHealthReport) => void;
  onSnapshotsChanged?: () => void;
}

export function useProgressiveBalanceRefresh({
  address,
  chainReloadKey,
  visibleTokens,
  visibleLowValueTokens,
  state,
  onRpcIssuesChange,
  onSnapshotsChanged,
}: ProgressiveBalanceRefreshOptions): boolean {
  const requestVersionRef = useRef(0);
  const snapshotTimerRef = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lowValueRefreshing, setLowValueRefreshing] = useState(false);
  const visibleTokenKeys = useMemo(
    () =>
      visibleTokens
        .map((token) => getPortfolioTokenKey(token.chainId, token.contractAddress))
        .sort()
        .join("|"),
    [visibleTokens],
  );
  const visibleLowValueTokenKeys = useMemo(
    () =>
      new Set(
        visibleLowValueTokens.map((token) =>
          getPortfolioTokenKey(token.chainId, token.contractAddress),
        ),
      ),
    [visibleLowValueTokens],
  );

  const refreshVisibleBalances = useCallback(async () => {
    if (
      !address ||
      state.portfolioBalanceRefreshing ||
      refreshing
    ) {
      return;
    }

    const tokensToRefresh = visibleTokens.filter((token) => {
      const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
      return (
        !state.hiddenTokenKeys.has(key) &&
        !state.onchainFetchedTokenKeys.has(key)
      );
    });
    if (tokensToRefresh.length === 0) return;

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const includesLowValueRows = tokensToRefresh.some((token) =>
      visibleLowValueTokenKeys.has(
        getPortfolioTokenKey(token.chainId, token.contractAddress),
      ),
    );
    setRefreshing(true);
    setLowValueRefreshing(includesLowValueRows);
    try {
      const [onchain, enrichedPage] = await Promise.all([
        fetchOnchainBalances(address, tokensToRefresh, {
          preserveZeroBalanceTokens: true,
        }),
        enrichPortfolioTokenPage(tokensToRefresh).catch(() => tokensToRefresh),
      ]);
      if (requestVersionRef.current !== requestVersion) return;
      onRpcIssuesChange?.(onchain.rpcHealth);

      for (const token of onchain.tokens) {
        const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
        if (!onchain.verifiedTokenKeys.has(key)) continue;
        state.verifiedBalanceTokensRef.current.set(key, token);
        state.verifiedBalanceKeysRef.current.add(key);
      }
      const nextFetchedKeys = new Set(state.verifiedBalanceKeysRef.current);
      const enrichedTokens = mergeTokenEnrichment(
        state.tokensRef.current,
        enrichedPage,
      );
      const nextTokens = mergeVerifiedTokenBalances(
        enrichedTokens,
        Array.from(state.verifiedBalanceTokensRef.current.values()),
        nextFetchedKeys,
      );
      const total =
        getWalletTokenTotal(nextTokens) + getDefiTotal(state.defiPositions);
      const fetchedAt = Date.now();

      state.setTokens(nextTokens);
      state.setOnchainFetchedTokenKeys(nextFetchedKeys);
      state.setTotalValueUsd(total);
      state.setLastFetched(fetchedAt);
      writeProgressiveHoldingsSnapshot(holdingsCacheKey(address, chainReloadKey), {
        tokens: nextTokens,
        defiPositions: state.defiPositions,
        totalValueUsd: total,
        customTokenKeys: state.customTokenKeys,
        allTokenKeys: state.allTokenKeys,
        hiddenTokenKeys: state.hiddenTokenKeys,
        onchainFetchedTokenKeys: nextFetchedKeys,
        rpcIssueChainIds: onchain.rpcHealth.unhealthyChainIds,
        apiUnavailable: state.apiUnavailable,
        timestamp: fetchedAt,
      });

      if (snapshotTimerRef.current != null) {
        window.clearTimeout(snapshotTimerRef.current);
      }
      snapshotTimerRef.current = window.setTimeout(() => {
        snapshotTimerRef.current = null;
        void recordSnapshot(address, total)
          .then(() => onSnapshotsChanged?.())
          .catch(() => undefined);
      }, 1_000);
    } catch {
      // Keep the provider/API value when a visible token cannot be verified.
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setRefreshing(false);
        setLowValueRefreshing(false);
      }
    }
  }, [
    address,
    chainReloadKey,
    onRpcIssuesChange,
    onSnapshotsChanged,
    state,
    refreshing,
    visibleLowValueTokenKeys,
    visibleTokens,
  ]);

  useEffect(() => {
    requestVersionRef.current += 1;
    setRefreshing(false);
    setLowValueRefreshing(false);
    return () => {
      if (snapshotTimerRef.current != null) {
        window.clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
    };
  }, [address]);

  useEffect(() => {
    if (state.portfolioBalanceRefreshing) return;
    void refreshVisibleBalances();
  }, [
    refreshVisibleBalances,
    refreshing,
    state.portfolioBalanceRefreshing,
    visibleTokenKeys,
  ]);

  return lowValueRefreshing;
}
