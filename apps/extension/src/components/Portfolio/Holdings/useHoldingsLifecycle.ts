import { useEffect } from "react";
import { getPortfolioHoldingsSnapshot } from "@/chrome/portfolio/holdingsCache";
import { getReceiptTokenRefresh } from "@/components/tokenHoldingsUtils";
import {
  fromStoredHoldingsSnapshot,
  hasHoldingsSnapshotContent,
  holdingsCacheKey,
  readCachedHoldingsSnapshot,
  rememberHoldingsSnapshot,
} from "./cache";
import type { LoadPortfolioOptions } from "./types";
import type { HoldingsState } from "./useHoldingsState";

export type PortfolioLoader = (
  force?: boolean,
  options?: LoadPortfolioOptions,
) => Promise<void>;

interface UseHoldingsLifecycleOptions {
  address: string;
  chainReloadKey: string;
  loadPortfolio: PortfolioLoader;
  state: HoldingsState;
}

export function useHoldingsLifecycle({
  address,
  chainReloadKey,
  loadPortfolio,
  state,
}: UseHoldingsLifecycleOptions): void {
  const {
    applyHoldingsSnapshot,
    verifiedBalanceKeysRef,
    verifiedBalanceTokensRef,
    setApiUnavailable,
    setAllTokenKeys,
    setCustomTokenKeys,
    setDefiPositions,
    setHiddenTokenKeys,
    setLastFetched,
    setLoading,
    setLowValueLoading,
    setOnchainFetchedTokenKeys,
    setOmittedTokenCount,
    setOmittedTokenValueUsd,
    setOmittedTokenValueUsdByChain,
    setPortfolioBalanceRefreshing,
    setTokens,
    setTotalValueUsd,
  } = state;

  // Preserve the original address/network-only reload trigger. The loader
  // closure changes as data paints and must not restart hydration.
  useEffect(() => {
    let cancelled = false;
    verifiedBalanceTokensRef.current.clear();
    verifiedBalanceKeysRef.current.clear();
    const cacheKey = holdingsCacheKey(address, chainReloadKey);
    const cached = readCachedHoldingsSnapshot(cacheKey);
    if (cached) {
      applyHoldingsSnapshot(cached);
      void loadPortfolio(true, { suppressSkeleton: true });
      return () => {
        cancelled = true;
      };
    }

    setTokens([]);
    setDefiPositions([]);
    setTotalValueUsd(0);
    setOmittedTokenCount(0);
    setOmittedTokenValueUsd(0);
    setOmittedTokenValueUsdByChain({});
    setCustomTokenKeys(new Set());
    setAllTokenKeys(new Set());
    setHiddenTokenKeys(new Set());
    setOnchainFetchedTokenKeys(new Set());
    setApiUnavailable(false);
    setLastFetched(0);
    setLoading(true);
    setPortfolioBalanceRefreshing(false);
    setLowValueLoading(false);

    void (async () => {
      let hydrated = false;
      try {
        const storedSnapshot = await getPortfolioHoldingsSnapshot(cacheKey);
        if (cancelled || !storedSnapshot) return;
        const snapshot = fromStoredHoldingsSnapshot(storedSnapshot);
        if (!hasHoldingsSnapshotContent(snapshot)) return;
        rememberHoldingsSnapshot(cacheKey, snapshot);
        applyHoldingsSnapshot(snapshot);
        hydrated = true;
      } catch {
        // Persistent holdings cache is optional; fall through to live loading.
      } finally {
        if (!cancelled) {
          void loadPortfolio(true, { suppressSkeleton: hydrated });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, chainReloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!address) return;
    const listener = (message: any) => {
      if (message?.type !== "txHistoryUpdated") return;
      if (!message.changedKeys?.some((key: string) =>
        key === "assetChanges" || key === "destAssetChanges")) return;
      if (message.ownerAddress && message.ownerAddress !== address.toLowerCase()) return;
      if (!message.txId) return;
      chrome.runtime.sendMessage(
        { type: "getTxHistoryItem", txId: message.txId },
        (updated) => {
          if (!updated) return;
          const receiptRefresh = getReceiptTokenRefresh(updated);
          void loadPortfolio(true, {
            forceRefreshTokenKeys: receiptRefresh.tokenKeys,
            forceRefreshTokens: receiptRefresh.tokenStubs,
          });
        },
      );
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [address, loadPortfolio]);
}
