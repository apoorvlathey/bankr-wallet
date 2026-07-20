import { useEffect, useState } from "react";

import { SEPOLIA_SHIELD_DASHBOARD } from "../model/shieldDashboard";

/** Reads the existing public ETH/USD price route; no Shield data is sent. */
export function useShieldNativePrice(): number | null {
  const [priceUsd, setPriceUsd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    chrome.runtime.sendMessage({
      type: "fetchNativePrice",
      chainId: SEPOLIA_SHIELD_DASHBOARD.chainId,
    }).then((response) => {
      if (cancelled) return;
      const nextPrice = Number(response?.priceUsd ?? 0);
      if (response?.success && Number.isFinite(nextPrice) && nextPrice > 0) {
        setPriceUsd(nextPrice);
      }
    }).catch(() => {
      // The confirmed ETH balance remains authoritative if pricing is unavailable.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return priceUsd;
}
