import { useCallback, useEffect, useState } from "react";
import {
  UNIFY_PORTFOLIO_BALANCES_STORAGE_KEY,
  resolveUnifyPortfolioBalances,
} from "./portfolioPreferences";

export function useUnifyPortfolioBalances() {
  const [unifyBalances, setUnifyBalancesState] = useState(true);

  useEffect(() => {
    let active = true;
    chrome.storage.sync.get(
      UNIFY_PORTFOLIO_BALANCES_STORAGE_KEY,
      (result) => {
        if (!active) return;
        setUnifyBalancesState(
          resolveUnifyPortfolioBalances(
            result[UNIFY_PORTFOLIO_BALANCES_STORAGE_KEY],
          ),
        );
      },
    );

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "sync") return;
      const change = changes[UNIFY_PORTFOLIO_BALANCES_STORAGE_KEY];
      if (!change || !active) return;
      setUnifyBalancesState(resolveUnifyPortfolioBalances(change.newValue));
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const setUnifyBalances = useCallback((next: boolean) => {
    setUnifyBalancesState(next);
    chrome.storage.sync.set({
      [UNIFY_PORTFOLIO_BALANCES_STORAGE_KEY]: next,
    });
  }, []);

  return { unifyBalances, setUnifyBalances };
}
