import { useCallback, useEffect, useRef, useState } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";

export function useResolvedCalldata(isOpen: boolean, tx: CompletedTransaction) {
  const [data, setData] = useState<string | undefined>(tx.tx.data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const resolve = useCallback(() => {
    if (!isOpen || tx.tx.data || (!tx.txHash && !tx.calldataSelector)) return;
    setLoading(true);
    setError(null);
    const requestGeneration = ++generation.current;
    chrome.runtime.sendMessage(
      { type: "getTransactionCalldata", txId: tx.id },
      (response: { success?: boolean; data?: string; error?: string } | undefined) => {
        if (requestGeneration !== generation.current) return;
        setLoading(false);
        if (response?.success && typeof response.data === "string") {
          setData(response.data);
        } else {
          setError(response?.error || "Calldata is currently unavailable");
        }
      },
    );
  }, [isOpen, tx.calldataSelector, tx.id, tx.tx.data, tx.txHash]);

  useEffect(() => {
    generation.current += 1;
    setData(tx.tx.data);
    setLoading(false);
    setError(null);
    resolve();
    return () => {
      generation.current += 1;
    };
  }, [resolve, tx.id, tx.tx.data]);

  return { data, loading, error, retry: resolve };
}
