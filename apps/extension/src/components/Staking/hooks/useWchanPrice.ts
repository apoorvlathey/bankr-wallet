import { useEffect, useState } from "react";
import { useScreenEntered } from "@/components/ScreenTransition";
import { STAKING_ADDRESSES, STAKING_CHAIN_ID } from "../constants";

export function useWchanPrice(): number {
  const entered = useScreenEntered();
  const [priceUsd, setPriceUsd] = useState(0);

  useEffect(() => {
    if (!entered) return;
    let cancelled = false;
    chrome.runtime.sendMessage(
      {
        type: "fetchTokenPrice",
        chainId: STAKING_CHAIN_ID,
        address: STAKING_ADDRESSES.wchan,
      },
      (response) => {
        if (cancelled) return;
        const nextPrice = Number(response?.priceUsd ?? 0);
        if (response?.success && nextPrice > 0) setPriceUsd(nextPrice);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [entered]);

  return priceUsd;
}
