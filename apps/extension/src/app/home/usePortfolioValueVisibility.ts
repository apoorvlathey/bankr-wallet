import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "hidePortfolioValue";

export function usePortfolioValueVisibility(): {
  hideValue: boolean;
  toggleHideValue: () => void;
} {
  const [hideValue, setHideValue] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      setHideValue(result[STORAGE_KEY] === true);
    });
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === "sync" && changes[STORAGE_KEY]) {
        setHideValue(changes[STORAGE_KEY].newValue === true);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const toggleHideValue = useCallback(() => {
    setHideValue((current) => {
      const next = !current;
      chrome.storage.sync.set({ [STORAGE_KEY]: next });
      return next;
    });
  }, []);

  return { hideValue, toggleHideValue };
}
