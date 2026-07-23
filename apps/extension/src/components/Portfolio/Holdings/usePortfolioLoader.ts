import { useCallback } from "react";
import { fetchOnchainBalances } from "@/chrome/portfolio/onchainBalances";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolio/tokenCatalog";
import { recordSnapshot } from "@/chrome/portfolio/snapshotStorage";
import { enrichPortfolioTokenPage } from "@/chrome/portfolio/tokenPageEnrichment";
import {
  logPortfolioPerformance,
  portfolioPerformanceNow,
} from "@/components/Portfolio/performanceDebug";
import {
  getDefiTotal,
  getTokenKeySet,
  getWalletTokenTotal,
  mergeVerifiedTokenBalances,
  selectInitialBalanceRefreshTokens,
} from "@/components/tokenHoldingsUtils";
import {
  clearHoldingsCaches,
  holdingsCacheKey,
  schedulePortfolioBackgroundTask,
  writeHoldingsSnapshot,
} from "./cache";
import { hasRenderablePortfolioToken, mergeTokenEnrichment } from "./transforms";
import type { LoadPortfolioOptions } from "./types";
import type { HoldingsState } from "./useHoldingsState";
import type { RpcHealthReport } from "@/types";

interface UsePortfolioLoaderOptions {
  address: string;
  chainReloadKey: string;
  state: HoldingsState;
  onRpcIssuesChange?: (report: RpcHealthReport) => void;
  onSnapshotsChanged?: () => void;
}

export function usePortfolioLoader({
  address,
  chainReloadKey,
  state,
  onRpcIssuesChange,
  onSnapshotsChanged,
}: UsePortfolioLoaderOptions) {
  const {
    tokens,
    lastFetched,
    loadVersionRef,
    portfolioAbortControllerRef,
    verifiedBalanceKeysRef,
    verifiedBalanceTokensRef,
    setApiUnavailable,
    setAllTokenKeys,
    setCustomTokenKeys,
    setDefiPositions,
    setError,
    setHiddenTokenKeys,
    setLastFetched,
    setLoading,
    setOnchainFetchedTokenKeys,
    setOmittedTokenCount,
    setOmittedTokenValueUsd,
    setOmittedTokenValueUsdByChain,
    setPortfolioBalanceRefreshing,
    setTokens,
    setTotalValueUsd,
  } = state;
  return useCallback(
    async (force = false, options: LoadPortfolioOptions = {}) => {
      if (!address) return;
      if (options.forceSnapshot) await clearHoldingsCaches();
      if (!force && Date.now() - lastFetched < 60_000 && tokens.length > 0) {
        return;
      }
      const loadStartedAt = portfolioPerformanceNow();
      const elapsedLoadMs = () =>
        Number((portfolioPerformanceNow() - loadStartedAt).toFixed(2));
      logPortfolioPerformance("portfolio-load-start", {
        force,
        existingTokenCount: tokens.length,
        forcedTokenCount: options.forceRefreshTokenKeys?.size ?? 0,
        suppressSkeleton: options.suppressSkeleton ?? false,
      });

      const loadVersion = loadVersionRef.current + 1;
      loadVersionRef.current = loadVersion;
      portfolioAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      portfolioAbortControllerRef.current = abortController;
      const isCurrentLoad = () => loadVersionRef.current === loadVersion;
      const hasExistingData = tokens.length > 0 || options.suppressSkeleton;
      if (!hasExistingData) setLoading(true);
      setError(null);

      try {
        const catalog = await loadPortfolioTokenCatalog(address, {
          enrich: false,
          signal: abortController.signal,
        });
        if (!isCurrentLoad()) return;
        logPortfolioPerformance("portfolio-catalog-loaded", {
          catalogTokenCount: catalog.tokens.length,
          omittedTokenCount: catalog.omittedTokenCount,
          positionCount: catalog.defiPositions?.length ?? 0,
          durationMs: elapsedLoadMs(),
        });

        const catalogTokenKeys = getTokenKeySet(catalog.tokens);
        const receiptTokenStubs = (options.forceRefreshTokens ?? []).filter(
          (token) =>
            !catalogTokenKeys.has(
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ) &&
            !catalog.hiddenTokenKeys.has(
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ),
        );
        const mergedTokens = [...catalog.tokens, ...receiptTokenStubs].filter(
          (token) =>
            !catalog.hiddenTokenKeys.has(
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ),
        );
        const forcedRefreshTokenKeys = new Set([
          ...catalog.recentReceivedTokenKeys,
          ...(options.forceRefreshTokenKeys ?? []),
        ]);
        const applyVerifiedBalances = (baseTokens: typeof mergedTokens) =>
          mergeVerifiedTokenBalances(
            baseTokens,
            Array.from(verifiedBalanceTokensRef.current.values()),
            verifiedBalanceKeysRef.current,
          );

        setCustomTokenKeys(catalog.customTokenKeys);
        setAllTokenKeys(catalog.allTokenKeys);
        setHiddenTokenKeys(catalog.hiddenTokenKeys);
        setOnchainFetchedTokenKeys(new Set(verifiedBalanceKeysRef.current));
        setApiUnavailable(catalog.apiUnavailable);
        setOmittedTokenCount(catalog.omittedTokenCount);
        setOmittedTokenValueUsd(catalog.omittedTokenValueUsd);
        setOmittedTokenValueUsdByChain(catalog.omittedTokenValueUsdByChain);

        // Paint catalog rows immediately; detached RPC work must never hold the
        // first useful render behind a skeleton.
        const initialDisplayTokens = applyVerifiedBalances(
          mergedTokens.filter(hasRenderablePortfolioToken),
        );
        const defiPositions = catalog.defiPositions || [];
        const initialTotal =
          getWalletTokenTotal(initialDisplayTokens) +
          getDefiTotal(defiPositions) +
          catalog.omittedTokenValueUsd;
        setTokens(initialDisplayTokens);
        setDefiPositions(defiPositions);
        setTotalValueUsd(initialTotal);
        setLoading(false);
        const fetchedAt = Date.now();
        setLastFetched(fetchedAt);
        const cacheKey = holdingsCacheKey(address, chainReloadKey);

        const applyEnrichedCatalog = async (
          baseTokens: typeof mergedTokens,
          fetchedTokenKeys: Set<string>,
          rpcIssueChainIds: number[],
          enrichmentTokenKeys: Set<string>,
        ) => {
          try {
            const enrichedPage = await enrichPortfolioTokenPage(
              baseTokens.filter((token) =>
                enrichmentTokenKeys.has(
                  getPortfolioTokenKey(token.chainId, token.contractAddress),
                ),
              ),
            );
            if (!isCurrentLoad()) return;
            const enrichedTokens = applyVerifiedBalances(
              mergeTokenEnrichment(baseTokens, enrichedPage),
            );
            const enrichedTotal =
              getWalletTokenTotal(enrichedTokens) +
              getDefiTotal(defiPositions) +
              catalog.omittedTokenValueUsd;
            const enrichedAt = Date.now();

            setTokens(enrichedTokens);
            setTotalValueUsd(enrichedTotal);
            setLastFetched(enrichedAt);
            writeHoldingsSnapshot(cacheKey, {
              tokens: enrichedTokens,
              defiPositions,
              totalValueUsd: enrichedTotal,
              omittedTokenCount: catalog.omittedTokenCount,
              omittedTokenValueUsd: catalog.omittedTokenValueUsd,
              omittedTokenValueUsdByChain: catalog.omittedTokenValueUsdByChain,
              customTokenKeys: catalog.customTokenKeys,
              allTokenKeys: catalog.allTokenKeys,
              hiddenTokenKeys: catalog.hiddenTokenKeys,
              onchainFetchedTokenKeys: fetchedTokenKeys,
              rpcIssueChainIds,
              apiUnavailable: catalog.apiUnavailable,
              timestamp: enrichedAt,
            });
          } catch {
            // Metadata/price enrichment is best-effort; keep the fast catalog.
          }
        };

        const recordLoadedSnapshot = (total: number) => {
          schedulePortfolioBackgroundTask(async () => {
            try {
              const snapshotChanged = await recordSnapshot(address, total, {
                force: options.forceSnapshot,
              });
              if (snapshotChanged) onSnapshotsChanged?.();
            } catch {
              // Snapshot failures should not block holdings rendering.
            }
          });
        };

        const tokensToRefresh = selectInitialBalanceRefreshTokens(
          mergedTokens,
          forcedRefreshTokenKeys,
          false,
        );
        logPortfolioPerformance("initial-balance-refresh-selected", {
          catalogTokenCount: mergedTokens.length,
          refreshTokenCount: tokensToRefresh.length,
          priorityTokenCount: forcedRefreshTokenKeys.size,
          collapsedLowValueIncluded: false,
        });
        const enrichmentTokenKeys = getTokenKeySet(tokensToRefresh);
        if (tokensToRefresh.length === 0) {
          setLoading(false);
          setPortfolioBalanceRefreshing(false);
          const verifiedKeys = new Set(verifiedBalanceKeysRef.current);
          writeHoldingsSnapshot(cacheKey, {
            tokens: initialDisplayTokens,
            defiPositions,
            totalValueUsd: initialTotal,
            omittedTokenCount: catalog.omittedTokenCount,
            omittedTokenValueUsd: catalog.omittedTokenValueUsd,
            omittedTokenValueUsdByChain: catalog.omittedTokenValueUsdByChain,
            customTokenKeys: catalog.customTokenKeys,
            allTokenKeys: catalog.allTokenKeys,
            hiddenTokenKeys: catalog.hiddenTokenKeys,
            onchainFetchedTokenKeys: verifiedKeys,
            rpcIssueChainIds: [],
            apiUnavailable: catalog.apiUnavailable,
            timestamp: fetchedAt,
          });
          recordLoadedSnapshot(initialTotal);
          schedulePortfolioBackgroundTask(() =>
            applyEnrichedCatalog(
              initialDisplayTokens,
              verifiedKeys,
              [],
              enrichmentTokenKeys,
            ),
          );
          return;
        }

        setPortfolioBalanceRefreshing(true);
        schedulePortfolioBackgroundTask(async () => {
          try {
            const onchain = await fetchOnchainBalances(
              address,
              tokensToRefresh,
              { preserveZeroBalanceTokens: true },
            );
            if (!isCurrentLoad()) return;
            onRpcIssuesChange?.(onchain.rpcHealth);
            for (const token of onchain.tokens) {
              const key = getPortfolioTokenKey(
                token.chainId,
                token.contractAddress,
              );
              if (!onchain.verifiedTokenKeys.has(key)) continue;
              verifiedBalanceTokensRef.current.set(key, token);
              verifiedBalanceKeysRef.current.add(key);
            }
            const verifiedKeys = new Set(verifiedBalanceKeysRef.current);
            const displayTokens = mergeVerifiedTokenBalances(
              mergedTokens,
              Array.from(verifiedBalanceTokensRef.current.values()),
              verifiedKeys,
            );
            setTokens(displayTokens);
            setOnchainFetchedTokenKeys(verifiedKeys);
            setLoading(false);
            const total =
              getWalletTokenTotal(displayTokens) +
              getDefiTotal(defiPositions) +
              catalog.omittedTokenValueUsd;
            setTotalValueUsd(total);
            writeHoldingsSnapshot(cacheKey, {
              tokens: displayTokens,
              defiPositions,
              totalValueUsd: total,
              omittedTokenCount: catalog.omittedTokenCount,
              omittedTokenValueUsd: catalog.omittedTokenValueUsd,
              omittedTokenValueUsdByChain: catalog.omittedTokenValueUsdByChain,
              customTokenKeys: catalog.customTokenKeys,
              allTokenKeys: catalog.allTokenKeys,
              hiddenTokenKeys: catalog.hiddenTokenKeys,
              onchainFetchedTokenKeys: verifiedKeys,
              rpcIssueChainIds: onchain.rpcHealth.unhealthyChainIds,
              apiUnavailable: catalog.apiUnavailable,
              timestamp: fetchedAt,
            });
            recordLoadedSnapshot(total);
            logPortfolioPerformance("initial-balance-refresh-complete", {
              catalogTokenCount: mergedTokens.length,
              refreshTokenCount: tokensToRefresh.length,
              verifiedTokenCount: onchain.verifiedTokenKeys.size,
              durationMs: elapsedLoadMs(),
            });
            void applyEnrichedCatalog(
              displayTokens,
              verifiedKeys,
              onchain.rpcHealth.unhealthyChainIds,
              enrichmentTokenKeys,
            );
          } catch {
            if (!isCurrentLoad()) return;
            logPortfolioPerformance("initial-balance-refresh-failed", {
              catalogTokenCount: mergedTokens.length,
              refreshTokenCount: tokensToRefresh.length,
              durationMs: elapsedLoadMs(),
            });
            setLoading(false);
            const verifiedKeys = new Set(verifiedBalanceKeysRef.current);
            setOnchainFetchedTokenKeys(verifiedKeys);
            writeHoldingsSnapshot(cacheKey, {
              tokens: initialDisplayTokens,
              defiPositions,
              totalValueUsd: initialTotal,
              omittedTokenCount: catalog.omittedTokenCount,
              omittedTokenValueUsd: catalog.omittedTokenValueUsd,
              omittedTokenValueUsdByChain: catalog.omittedTokenValueUsdByChain,
              customTokenKeys: catalog.customTokenKeys,
              allTokenKeys: catalog.allTokenKeys,
              hiddenTokenKeys: catalog.hiddenTokenKeys,
              onchainFetchedTokenKeys: verifiedKeys,
              rpcIssueChainIds: [],
              apiUnavailable: catalog.apiUnavailable,
              timestamp: fetchedAt,
            });
            recordLoadedSnapshot(initialTotal);
            schedulePortfolioBackgroundTask(() =>
              applyEnrichedCatalog(
                initialDisplayTokens,
                verifiedKeys,
                [],
                enrichmentTokenKeys,
              ),
            );
          } finally {
            if (isCurrentLoad()) setPortfolioBalanceRefreshing(false);
          }
        });
      } catch (error) {
        if (!isCurrentLoad() || abortController.signal.aborted) return;
        setError(
          error instanceof Error ? error.message : "Failed to load portfolio",
        );
        setPortfolioBalanceRefreshing(false);
        setLoading(false);
      }
    },
    [
      address,
      chainReloadKey,
      lastFetched,
      loadVersionRef,
      portfolioAbortControllerRef,
      onRpcIssuesChange,
      onSnapshotsChanged,
      setAllTokenKeys,
      setApiUnavailable,
      setCustomTokenKeys,
      setDefiPositions,
      setError,
      setHiddenTokenKeys,
      setLastFetched,
      setLoading,
      setOnchainFetchedTokenKeys,
      setOmittedTokenCount,
      setOmittedTokenValueUsd,
      setOmittedTokenValueUsdByChain,
      setPortfolioBalanceRefreshing,
      setTokens,
      setTotalValueUsd,
      tokens.length,
      verifiedBalanceKeysRef,
      verifiedBalanceTokensRef,
    ],
  );
}
