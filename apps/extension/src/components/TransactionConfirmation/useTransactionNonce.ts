import { useCallback, useEffect, useMemo, useState } from "react";
import { parseTransactionNonceInput } from "@/lib/transactionNonce";
import type { TransactionAccountType } from "./types";
import { supportsEditableTransactionNonce } from "./transactionNonceModel";

type NonceResponse =
  | { success: true; nonce: number }
  | { success: false; error?: string };

export function useTransactionNonce(
  txId: string,
  accountType: TransactionAccountType | undefined,
) {
  const supported = supportsEditableTransactionNonce(accountType);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(supported);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setValue("");
    setLoadError(null);
    setLoading(supported);
    if (!supported) return () => {
      cancelled = true;
    };

    chrome.runtime.sendMessage(
      { type: "getTransactionNonce", txId },
      (response: NonceResponse | undefined) => {
        if (cancelled) return;
        setLoading(false);
        if (chrome.runtime.lastError || !response?.success) {
          setLoadError(
            response?.success === false && response.error
              ? response.error
              : "Nonce unavailable — enter it manually or retry",
          );
          return;
        }
        setValue(String(response.nonce));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [accountType, refreshKey, supported, txId]);

  const parsed = useMemo(() => parseTransactionNonceInput(value), [value]);
  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);

  return {
    error: parsed.valid
      ? null
      : value.length > 0
        ? parsed.error
        : loadError ?? parsed.error,
    loading,
    nonce: parsed.valid ? parsed.nonce : null,
    retry,
    setValue,
    supported,
    valid: parsed.valid,
    value,
  };
}
