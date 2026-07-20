import { useCallback, useEffect, useState } from "react";
import {
  FOLLOW_DAPP_NETWORK_STORAGE_KEY,
  resolveFollowDappNetwork,
} from "./portfolioPreferences";

export function useFollowDappNetwork() {
  const [followDappNetwork, setFollowDappNetworkState] = useState(true);

  useEffect(() => {
    let active = true;
    chrome.storage.sync.get(FOLLOW_DAPP_NETWORK_STORAGE_KEY, (result) => {
      if (!active) return;
      setFollowDappNetworkState(
        resolveFollowDappNetwork(result[FOLLOW_DAPP_NETWORK_STORAGE_KEY]),
      );
    });

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "sync") return;
      const change = changes[FOLLOW_DAPP_NETWORK_STORAGE_KEY];
      if (!change || !active) return;
      setFollowDappNetworkState(resolveFollowDappNetwork(change.newValue));
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const setFollowDappNetwork = useCallback((next: boolean) => {
    setFollowDappNetworkState(next);
    chrome.storage.sync.set({
      [FOLLOW_DAPP_NETWORK_STORAGE_KEY]: next,
    });
  }, []);

  return { followDappNetwork, setFollowDappNetwork };
}
