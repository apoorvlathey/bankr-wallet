import { useCallback, useEffect, useRef, useState } from "react";
import type { DefiPosition, PortfolioToken } from "@/chrome/portfolio/api";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import {
  holdingsCacheKey,
  readCachedHoldingsSnapshot,
} from "./cache";
import type { HoldingsSnapshot } from "./types";

interface UseHoldingsStateOptions {
  address: string;
  chainReloadKey: string;
}

export function useHoldingsState({
  address,
  chainReloadKey,
}: UseHoldingsStateOptions) {
  // Synchronous hydration is deliberately renderer-local. The reset-aware
  // chrome.storage mirror is handled later by the lifecycle hook.
  const initialSnapshot = readCachedHoldingsSnapshot(
    holdingsCacheKey(address, chainReloadKey),
  );
  const [tokens, setTokens] = useState<PortfolioToken[]>(
    () => initialSnapshot?.tokens ?? [],
  );
  const [defiPositions, setDefiPositions] = useState<DefiPosition[]>(
    () => initialSnapshot?.defiPositions ?? [],
  );
  const [totalValueUsd, setTotalValueUsd] = useState(
    () => initialSnapshot?.totalValueUsd ?? 0,
  );
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [hideValue, setHideValue] = useState(false);
  const [lastFetched, setLastFetched] = useState(
    () => initialSnapshot?.timestamp ?? 0,
  );
  const [customTokenKeys, setCustomTokenKeys] = useState<Set<string>>(
    () => initialSnapshot?.customTokenKeys ?? new Set(),
  );
  const [allTokenKeys, setAllTokenKeys] = useState<Set<string>>(
    () => initialSnapshot?.allTokenKeys ?? new Set(),
  );
  const [hiddenTokenKeys, setHiddenTokenKeys] = useState<Set<string>>(
    () => initialSnapshot?.hiddenTokenKeys ?? new Set(),
  );
  const [onchainFetchedTokenKeys, setOnchainFetchedTokenKeys] = useState<
    Set<string>
  >(() => initialSnapshot?.onchainFetchedTokenKeys ?? new Set());
  const [apiUnavailable, setApiUnavailable] = useState(
    () => initialSnapshot?.apiUnavailable ?? false,
  );
  const [portfolioBalanceRefreshing, setPortfolioBalanceRefreshing] =
    useState(false);
  const [lowValueLoading, setLowValueLoading] = useState(false);
  const loadVersionRef = useRef(0);
  const verifiedBalanceTokensRef = useRef(new Map<string, PortfolioToken>());
  const verifiedBalanceKeysRef = useRef(new Set<string>());

  useEffect(() => {
    chrome.storage.sync.get("hidePortfolioValue", (result) => {
      if (result.hidePortfolioValue) setHideValue(true);
    });
  }, []);

  const toggleHideValue = useCallback(() => {
    const newValue = !hideValue;
    setHideValue(newValue);
    chrome.storage.sync.set({ hidePortfolioValue: newValue });
  }, [hideValue]);

  const applyHoldingsSnapshot = useCallback(
    (snapshot: HoldingsSnapshot) => {
      verifiedBalanceKeysRef.current = new Set(
        snapshot.onchainFetchedTokenKeys,
      );
      verifiedBalanceTokensRef.current = new Map(
        snapshot.tokens
          .filter((token) =>
            snapshot.onchainFetchedTokenKeys.has(
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ),
          )
          .map((token) => [
            getPortfolioTokenKey(token.chainId, token.contractAddress),
            token,
          ]),
      );
      setTokens(snapshot.tokens);
      setDefiPositions(snapshot.defiPositions);
      setTotalValueUsd(snapshot.totalValueUsd);
      setCustomTokenKeys(snapshot.customTokenKeys);
      setAllTokenKeys(snapshot.allTokenKeys);
      setHiddenTokenKeys(snapshot.hiddenTokenKeys);
      setOnchainFetchedTokenKeys(snapshot.onchainFetchedTokenKeys);
      setApiUnavailable(snapshot.apiUnavailable);
      setLastFetched(snapshot.timestamp);
      setLoading(false);
      setPortfolioBalanceRefreshing(false);
      setLowValueLoading(false);
      // RPC health is ephemeral. Cached issue IDs must not recreate a warning
      // before the detached live balance refresh has checked the endpoints.
    },
    [],
  );

  return {
    tokens,
    setTokens,
    defiPositions,
    setDefiPositions,
    totalValueUsd,
    setTotalValueUsd,
    loading,
    setLoading,
    error,
    setError,
    hideValue,
    lastFetched,
    setLastFetched,
    customTokenKeys,
    setCustomTokenKeys,
    allTokenKeys,
    setAllTokenKeys,
    hiddenTokenKeys,
    setHiddenTokenKeys,
    onchainFetchedTokenKeys,
    setOnchainFetchedTokenKeys,
    apiUnavailable,
    setApiUnavailable,
    portfolioBalanceRefreshing,
    setPortfolioBalanceRefreshing,
    lowValueLoading,
    setLowValueLoading,
    loadVersionRef,
    verifiedBalanceTokensRef,
    verifiedBalanceKeysRef,
    toggleHideValue,
    applyHoldingsSnapshot,
  };
}

export type HoldingsState = ReturnType<typeof useHoldingsState>;
