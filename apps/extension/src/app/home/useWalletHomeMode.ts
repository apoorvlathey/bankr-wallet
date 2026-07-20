import { useCallback, useEffect, useState } from "react";

import {
  resolveWalletHomeMode,
  WALLET_HOME_MODE_STORAGE_KEY,
  type WalletHomeMode,
} from "./walletHomeMode";

export function useWalletHomeMode() {
  const [mode, setModeState] = useState<WalletHomeMode>("public");

  useEffect(() => {
    let active = true;
    chrome.storage.local.get(WALLET_HOME_MODE_STORAGE_KEY, (result) => {
      if (!active) return;
      setModeState(resolveWalletHomeMode(result[WALLET_HOME_MODE_STORAGE_KEY]));
    });

    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !active) return;
      const change = changes[WALLET_HOME_MODE_STORAGE_KEY];
      if (change) setModeState(resolveWalletHomeMode(change.newValue));
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  const setMode = useCallback((next: WalletHomeMode) => {
    setModeState(next);
    void chrome.storage.local.set({ [WALLET_HOME_MODE_STORAGE_KEY]: next });
    if (next === "private") {
      void chrome.runtime
        .sendMessage({ type: "privacyEnsureInitialized" })
        .catch(() => undefined);
    }
  }, []);

  return { mode, setMode };
}
