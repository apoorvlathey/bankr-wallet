import { useCallback } from "react";
import { fetchOnchainBalances } from "@/chrome/portfolio/onchainBalances";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolio/tokenCatalog";
import { recordSnapshot } from "@/chrome/portfolio/snapshotStorage";
import {
  getDefiTotal,
  getTokenKeySet,
  getWalletTokenTotal,
  mergeVerifiedTokenBalances,
  shouldFetchOnInitialPortfolioLoad,
} from "@/components/tokenHoldingsUtils";
import {
  clearHoldingsCaches,
  holdingsCacheKey,
  schedulePortfolioBackgroundTask,
  writeHoldingsSnapshot,
} from "./cache";
import {
  getVisibleTokenKeySet,
  hasRenderablePortfolioToken,
  mergeTokenEnrichment,
} from "./transforms";
import type { LoadPortfolioOptions } from "./types";
import type { HoldingsState } from "./useHoldingsState";

interface UsePortfolioLoaderOptions {
  address: string;
  chainReloadKey: string;
  showLowValueTokens: boolean;
  state: HoldingsState;
  onRpcIssuesChange?: (chainIds: number[]) => void;
  onSnapshotsChanged?: () => void;
}

export function usePortfolioLoader({
  address,
  chainReloadKey,
  showLowValueTokens,
  state,
  onRpcIssuesChange,
  onSnapshotsChanged,
}: UsePortfolioLoaderOptions) {
  const {
    tokens,
    lastFetched,
    loadVersionRef,
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

      const loadVersion = loadVersionRef.current + 1;
      loadVersionRef.current = loadVersion;
      const isCurrentLoad = () => loadVersionRef.current === loadVersion;
      const hasExistingData = tokens.length > 0 || options.suppressSkeleton;
      if (!hasExistingData) setLoading(true);
      setError(null);

      try {
        const catalog = await loadPortfolioTokenCatalog(address, {
          enrich: false,
        });
        if (!isCurrentLoad()) return;

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

        // Paint catalog rows immediately; detached RPC work must never hold the
        // first useful render behind a skeleton.
        const initialDisplayTokens = applyVerifiedBalances(
          mergedTokens.filter(hasRenderablePortfolioToken),
        );
        const defiPositions = catalog.defiPositions || [];
        const initialTotal =
          getWalletTokenTotal(initialDisplayTokens) +
          getDefiTotal(defiPositions);
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
        ) => {
          try {
            const enrichedCatalog = await loadPortfolioTokenCatalog(address, {
              includeErc20PriceFallback: false,
              enrichTokenKeys: getVisibleTokenKeySet(
                baseTokens,
                showLowValueTokens,
              ),
            });
            if (!isCurrentLoad()) return;
            const enrichedTokens = applyVerifiedBalances(
              mergeTokenEnrichment(baseTokens, enrichedCatalog.tokens),
            );
            const enrichedDefiPositions = enrichedCatalog.defiPositions || [];
            const enrichedTotal =
              getWalletTokenTotal(enrichedTokens) +
              getDefiTotal(enrichedDefiPositions);
            const enrichedAt = Date.now();

            setTokens(enrichedTokens);
            setDefiPositions(enrichedDefiPositions);
            setTotalValueUsd(enrichedTotal);
            setCustomTokenKeys(enrichedCatalog.customTokenKeys);
            setAllTokenKeys(enrichedCatalog.allTokenKeys);
            setHiddenTokenKeys(enrichedCatalog.hiddenTokenKeys);
            setApiUnavailable(enrichedCatalog.apiUnavailable);
            setLastFetched(enrichedAt);
            writeHoldingsSnapshot(cacheKey, {
              tokens: enrichedTokens,
              defiPositions: enrichedDefiPositions,
              totalValueUsd: enrichedTotal,
              customTokenKeys: enrichedCatalog.customTokenKeys,
              allTokenKeys: enrichedCatalog.allTokenKeys,
              hiddenTokenKeys: enrichedCatalog.hiddenTokenKeys,
              onchainFetchedTokenKeys: fetchedTokenKeys,
              rpcIssueChainIds,
              apiUnavailable: enrichedCatalog.apiUnavailable,
              timestamp: enrichedAt,
            });
          } catch {
            // Metadata/price enrichment is best-effort; keep the fast catalog.
          }
        };

        const recordLoadedSnapshot = (total: number) => {
          schedulePortfolioBackgroundTask(async () => {
            try {
              await recordSnapshot(address, total, {
                force: options.forceSnapshot,
              });
              onSnapshotsChanged?.();
            } catch {
              // Snapshot failures should not block holdings rendering.
            }
          });
        };

        const tokensToRefresh = mergedTokens.filter(
          (token) =>
            forcedRefreshTokenKeys.has(
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ) || shouldFetchOnInitialPortfolioLoad(token, showLowValueTokens),
        );
        if (tokensToRefresh.length === 0) {
          setLoading(false);
          setPortfolioBalanceRefreshing(false);
          const verifiedKeys = new Set(verifiedBalanceKeysRef.current);
          writeHoldingsSnapshot(cacheKey, {
            tokens: initialDisplayTokens,
            defiPositions,
            totalValueUsd: initialTotal,
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
            applyEnrichedCatalog(initialDisplayTokens, verifiedKeys, []),
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
            onRpcIssuesChange?.(onchain.rpcIssueChainIds);
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
              getWalletTokenTotal(displayTokens) + getDefiTotal(defiPositions);
            setTotalValueUsd(total);
            writeHoldingsSnapshot(cacheKey, {
              tokens: displayTokens,
              defiPositions,
              totalValueUsd: total,
              customTokenKeys: catalog.customTokenKeys,
              allTokenKeys: catalog.allTokenKeys,
              hiddenTokenKeys: catalog.hiddenTokenKeys,
              onchainFetchedTokenKeys: verifiedKeys,
              rpcIssueChainIds: onchain.rpcIssueChainIds,
              apiUnavailable: catalog.apiUnavailable,
              timestamp: fetchedAt,
            });
            recordLoadedSnapshot(total);
            void applyEnrichedCatalog(
              displayTokens,
              verifiedKeys,
              onchain.rpcIssueChainIds,
            );
          } catch {
            if (!isCurrentLoad()) return;
            onRpcIssuesChange?.([]);
            setLoading(false);
            const verifiedKeys = new Set(verifiedBalanceKeysRef.current);
            setOnchainFetchedTokenKeys(verifiedKeys);
            writeHoldingsSnapshot(cacheKey, {
              tokens: initialDisplayTokens,
              defiPositions,
              totalValueUsd: initialTotal,
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
              applyEnrichedCatalog(initialDisplayTokens, verifiedKeys, []),
            );
          } finally {
            if (isCurrentLoad()) setPortfolioBalanceRefreshing(false);
          }
        });
      } catch (error) {
        if (!isCurrentLoad()) return;
        setError(
          error instanceof Error ? error.message : "Failed to load portfolio",
        );
        onRpcIssuesChange?.([]);
        setPortfolioBalanceRefreshing(false);
        setLoading(false);
      }
    },
    [
      address,
      chainReloadKey,
      lastFetched,
      loadVersionRef,
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
      setPortfolioBalanceRefreshing,
      setTokens,
      setTotalValueUsd,
      showLowValueTokens,
      tokens.length,
      verifiedBalanceKeysRef,
      verifiedBalanceTokensRef,
    ],
  );
}
