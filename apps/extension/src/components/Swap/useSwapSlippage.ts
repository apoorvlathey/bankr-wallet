import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SLIPPAGE_BPS } from "@/chrome/swapApi";

export function useSwapSlippage() {
  const [slippageBps, setSlippageBpsState] = useState(DEFAULT_SLIPPAGE_BPS);

  useEffect(() => {
    chrome.storage.sync.get("swapSlippageBps", (result) => {
      const stored = result.swapSlippageBps;
      if (typeof stored === "number" && stored > 0 && stored <= 10_000) {
        setSlippageBpsState(stored);
      }
    });
  }, []);

  const setSlippageBps = useCallback((value: number) => {
    setSlippageBpsState(value);
    chrome.storage.sync.set({ swapSlippageBps: value });
  }, []);

  return { slippageBps, setSlippageBps };
}
