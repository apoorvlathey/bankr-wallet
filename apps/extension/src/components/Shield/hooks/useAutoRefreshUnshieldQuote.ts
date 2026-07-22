import { useEffect, useRef } from "react";

import type { UnshieldOperation } from "../model/unshield";

/** Schedules exactly one renderer refresh for each selected relay quote. */
export function useAutoRefreshUnshieldQuote({
  enabled,
  operation,
  refreshQuote,
}: {
  enabled: boolean;
  operation: UnshieldOperation | null;
  refreshQuote: () => Promise<void>;
}) {
  const refreshedQuoteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !operation) return;

    const quoteKey = `${operation.id}:${operation.expiresAt}`;
    const refreshExpiredQuote = () => {
      if (refreshedQuoteKeyRef.current === quoteKey) return;
      refreshedQuoteKeyRef.current = quoteKey;
      void refreshQuote();
    };
    const millisecondsUntilExpiry = operation.expiresAt - Date.now();

    if (millisecondsUntilExpiry <= 0) {
      refreshExpiredQuote();
      return;
    }

    const timer = window.setTimeout(refreshExpiredQuote, millisecondsUntilExpiry);
    return () => window.clearTimeout(timer);
  }, [enabled, operation, refreshQuote]);
}
