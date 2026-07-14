import { useEffect, useRef, useState } from "react";
import { getNetworkRpcEndpoints } from "@/chrome/network/rpcHistoryRepository";
import {
  normalizeSavedRpcEndpoints,
  type SavedRpcEndpoint,
} from "@/lib/chains";

export function useNetworkRpcEndpoints(
  chainId: number | undefined,
  activeRpcUrl: string | undefined,
) {
  const [rpcEndpoints, setRpcEndpoints] = useState<SavedRpcEndpoint[]>(() =>
    normalizeSavedRpcEndpoints(activeRpcUrl, undefined),
  );
  const [isLoading, setIsLoading] = useState(Boolean(chainId && activeRpcUrl));
  const previousChainId = useRef(chainId);

  useEffect(() => {
    let cancelled = false;
    const fallback = normalizeSavedRpcEndpoints(activeRpcUrl, undefined);
    const isSameChain = previousChainId.current === chainId;
    previousChainId.current = chainId;
    setRpcEndpoints((current) =>
      isSameChain
        ? normalizeSavedRpcEndpoints(activeRpcUrl, current)
        : fallback,
    );
    if (!chainId || !activeRpcUrl) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    void getNetworkRpcEndpoints(chainId, activeRpcUrl)
      .then((saved) => {
        if (!cancelled) setRpcEndpoints(saved);
      })
      .catch(() => {
        if (!cancelled) setRpcEndpoints(fallback);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeRpcUrl, chainId]);

  return { rpcEndpoints, setRpcEndpoints, isLoading };
}
