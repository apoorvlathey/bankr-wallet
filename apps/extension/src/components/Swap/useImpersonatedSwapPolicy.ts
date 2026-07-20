import { useEffect, useState } from "react";
import { allowsImpersonatedTransactions } from "@/chrome/network/impersonatedRpcPolicy";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import type { SwapAccountType } from "./swapViewTypes";

/** Mirrors the exact selected-endpoint policy; the background rechecks it. */
export function useImpersonatedSwapPolicy(
  accountType: SwapAccountType,
  chainId: number,
): boolean {
  const { networksInfo } = useNetworks();
  const rpcUrl = getResolvedChainById(chainId, networksInfo)?.rpcUrl;
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAllowed(false);
    if (accountType !== "impersonator" || !rpcUrl) {
      return () => {
        cancelled = true;
      };
    }

    void allowsImpersonatedTransactions(chainId, rpcUrl)
      .then((nextAllowed) => {
        if (!cancelled) setAllowed(nextAllowed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accountType, chainId, rpcUrl]);

  return allowed;
}
