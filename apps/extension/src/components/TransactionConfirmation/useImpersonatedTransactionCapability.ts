import { useEffect, useState } from "react";
import { allowsImpersonatedTransactions } from "@/chrome/network/impersonatedRpcPolicy";

export function useImpersonatedTransactionCapability(input: {
  accountType?: string;
  chainId: number;
  rpcUrl?: string;
  requestId: string;
}): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAllowed(false);
    if (input.accountType !== "impersonator" || !input.rpcUrl) {
      return () => {
        cancelled = true;
      };
    }
    void allowsImpersonatedTransactions(input.chainId, input.rpcUrl)
      .then((result) => {
        if (!cancelled) setAllowed(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [input.accountType, input.chainId, input.requestId, input.rpcUrl]);

  return allowed;
}
