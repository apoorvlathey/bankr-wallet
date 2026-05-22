import { useEffect, useRef, useState } from "react";
import {
  TERMINAL_STATUS_CODES,
  type BungeeStatusEntry,
  type BungeeStatusResponse,
} from "@walletchan/shared/bungee";

interface UseBridgeStatusParams {
  requestHash?: string;
  txHash?: string;
  /** Poll every N ms while pending. */
  intervalMs?: number;
  /** Stop polling after N ms regardless of status. Default 10 min. */
  hardTimeoutMs?: number;
}

export function useBridgeStatus({
  requestHash,
  txHash,
  intervalMs = 5_000,
  hardTimeoutMs = 10 * 60 * 1000,
}: UseBridgeStatusParams) {
  const [entry, setEntry] = useState<BungeeStatusEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!requestHash && !txHash) {
      setEntry(null);
      setError(null);
      setIsPolling(false);
      return;
    }

    startedAtRef.current = Date.now();
    setIsPolling(true);
    setError(null);

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const params = new URLSearchParams();
        if (requestHash) params.set("requestHash", requestHash);
        if (txHash) params.set("txHash", txHash);

        const response = await fetch(
          `/api/bridge/status?${params.toString()}`,
        );
        const data = (await response.json()) as BungeeStatusResponse;
        if (!response.ok) {
          throw new Error(
            (data as unknown as { error?: string }).error ||
              `Status error: ${response.status}`,
          );
        }

        const first = data.result?.[0] ?? null;
        if (!cancelled) setEntry(first);

        const code = first?.bungeeStatusCode;
        const isDone = code !== undefined && TERMINAL_STATUS_CODES.has(code);
        const elapsed = Date.now() - (startedAtRef.current ?? Date.now());

        if (isDone || elapsed > hardTimeoutMs) {
          if (!cancelled) setIsPolling(false);
          return;
        }

        if (!cancelled) {
          timerRef.current = setTimeout(poll, intervalMs);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Status fetch failed");
        // Keep polling on transient errors until timeout.
        const elapsed = Date.now() - (startedAtRef.current ?? Date.now());
        if (elapsed > hardTimeoutMs) {
          setIsPolling(false);
          return;
        }
        timerRef.current = setTimeout(poll, intervalMs);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [requestHash, txHash, intervalMs, hardTimeoutMs]);

  return { entry, error, isPolling };
}
