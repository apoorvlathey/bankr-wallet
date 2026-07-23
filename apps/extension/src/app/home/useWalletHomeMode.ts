import { useCallback, useEffect, useState } from "react";

import {
  PRIVATE_HOME_ENABLED,
  resolveWalletHomeMode,
  WALLET_HOME_MODE_STORAGE_KEY,
  type WalletHomeMode,
} from "./walletHomeMode";

export function useWalletHomeMode() {
  const privateHomeEnabled = PRIVATE_HOME_ENABLED;
  const [mode, setModeState] = useState<WalletHomeMode>("public");

  useEffect(() => {
    let active = true;
    const applyStoredMode = (value: unknown) => {
      if (!active) return;
      setModeState(resolveWalletHomeMode(value, privateHomeEnabled));
      if (!privateHomeEnabled && value !== "public") {
        void chrome.storage.local.set({
          [WALLET_HOME_MODE_STORAGE_KEY]: "public",
        });
      }
    };
    chrome.storage.local.get(WALLET_HOME_MODE_STORAGE_KEY, (result) => {
      applyStoredMode(result[WALLET_HOME_MODE_STORAGE_KEY]);
    });

    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !active) return;
      const change = changes[WALLET_HOME_MODE_STORAGE_KEY];
      if (change) applyStoredMode(change.newValue);
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [privateHomeEnabled]);

  const setMode = useCallback((next: WalletHomeMode) => {
    const resolvedMode = resolveWalletHomeMode(next, privateHomeEnabled);
    setModeState(resolvedMode);
    void chrome.storage.local.set({
      [WALLET_HOME_MODE_STORAGE_KEY]: resolvedMode,
    });
    if (resolvedMode === "private") {
      void chrome.runtime
        .sendMessage({ type: "privacyEnsureInitialized" })
        .catch(() => undefined);
    }
  }, [privateHomeEnabled]);

  return { mode, setMode, privateHomeEnabled };
}
