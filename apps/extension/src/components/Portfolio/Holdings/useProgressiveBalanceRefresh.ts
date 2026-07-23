import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { fetchOnchainBalances } from "@/chrome/portfolio/onchainBalances";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import { recordSnapshot } from "@/chrome/portfolio/snapshotStorage";
import { enrichPortfolioTokenPage } from "@/chrome/portfolio/tokenPageEnrichment";
import {
  logPortfolioPerformance,
  portfolioPerformanceNow,
} from "@/components/Portfolio/performanceDebug";
import {
  getDefiTotal,
  getWalletTokenTotal,
  mergeVerifiedTokenBalances,
} from "@/components/tokenHoldingsUtils";
import {
  holdingsCacheKey,
  writeProgressiveHoldingsSnapshot,
} from "./cache";
import { selectPendingVisibleBalanceRefreshTokens } from "./progressiveRefreshModel";
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
  const attemptedTokenKeysRef = useRef(new Set<string>());
  const attemptedLoadVersionRef = useRef(state.loadVersionRef.current);
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
    if (attemptedLoadVersionRef.current !== state.loadVersionRef.current) {
      attemptedLoadVersionRef.current = state.loadVersionRef.current;
      attemptedTokenKeysRef.current.clear();
    }

    const tokensToRefresh = selectPendingVisibleBalanceRefreshTokens({
      visibleTokens,
      hiddenTokenKeys: state.hiddenTokenKeys,
      onchainFetchedTokenKeys: state.onchainFetchedTokenKeys,
      attemptedTokenKeys: attemptedTokenKeysRef.current,
    });
    if (tokensToRefresh.length === 0) return;
    for (const token of tokensToRefresh) {
      attemptedTokenKeysRef.current.add(
        getPortfolioTokenKey(token.chainId, token.contractAddress),
      );
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const includesLowValueRows = tokensToRefresh.some((token) =>
      visibleLowValueTokenKeys.has(
        getPortfolioTokenKey(token.chainId, token.contractAddress),
      ),
    );
    const startedAt = portfolioPerformanceNow();
    logPortfolioPerformance("visible-balance-refresh-start", {
      visibleTokenCount: visibleTokens.length,
      visibleLowValueTokenCount: visibleLowValueTokens.length,
      refreshTokenCount: tokensToRefresh.length,
      includesLowValueRows,
    });
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
        getWalletTokenTotal(nextTokens) +
        getDefiTotal(state.defiPositions) +
        state.omittedTokenValueUsd;
      const fetchedAt = Date.now();

      state.setTokens(nextTokens);
      state.setOnchainFetchedTokenKeys(nextFetchedKeys);
      state.setTotalValueUsd(total);
      state.setLastFetched(fetchedAt);
      logPortfolioPerformance("visible-balance-refresh-complete", {
        visibleTokenCount: visibleTokens.length,
        visibleLowValueTokenCount: visibleLowValueTokens.length,
        refreshTokenCount: tokensToRefresh.length,
        verifiedTokenCount: onchain.verifiedTokenKeys.size,
        failedTokenCount:
          tokensToRefresh.length - onchain.verifiedTokenKeys.size,
        portfolioTokenCount: nextTokens.length,
        durationMs: Number(
          (portfolioPerformanceNow() - startedAt).toFixed(2),
        ),
      });
      writeProgressiveHoldingsSnapshot(holdingsCacheKey(address, chainReloadKey), {
        tokens: nextTokens,
        defiPositions: state.defiPositions,
        totalValueUsd: total,
        omittedTokenCount: state.omittedTokenCount,
        omittedTokenValueUsd: state.omittedTokenValueUsd,
        omittedTokenValueUsdByChain: state.omittedTokenValueUsdByChain,
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
          .then((snapshotChanged) => {
            if (snapshotChanged) onSnapshotsChanged?.();
          })
          .catch(() => undefined);
      }, 1_000);
    } catch {
      // Keep the provider/API value when a visible token cannot be verified.
      logPortfolioPerformance("visible-balance-refresh-failed", {
        visibleTokenCount: visibleTokens.length,
        visibleLowValueTokenCount: visibleLowValueTokens.length,
        refreshTokenCount: tokensToRefresh.length,
        durationMs: Number(
          (portfolioPerformanceNow() - startedAt).toFixed(2),
        ),
      });
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
    visibleLowValueTokens.length,
    visibleTokens,
  ]);

  useEffect(() => {
    requestVersionRef.current += 1;
    attemptedLoadVersionRef.current = state.loadVersionRef.current;
    attemptedTokenKeysRef.current.clear();
    setRefreshing(false);
    setLowValueRefreshing(false);
    return () => {
      if (snapshotTimerRef.current != null) {
        window.clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
    };
  }, [address, chainReloadKey, state.loadVersionRef]);

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
