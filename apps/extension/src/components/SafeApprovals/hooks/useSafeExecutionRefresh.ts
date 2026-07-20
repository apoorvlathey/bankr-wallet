import { useEffect } from "react";

const VISIBLE_RECONCILIATION_INTERVAL_MS = 10_000;

function send(message: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

/** Keeps a visible Safe review fresh while the MV3 background owns settlement. */
export function useSafeExecutionRefresh({
  pending,
  proposalId,
  onReload,
}: {
  pending: boolean;
  proposalId: string;
  onReload: () => Promise<void>;
}): void {
  useEffect(() => {
    if (!pending) return;
    let active = true;
    let running = false;
    const reconcile = async () => {
      if (running) return;
      running = true;
      try {
        await send({
          type: "reconcileSafeExecution",
          proposalId,
        });
      } catch {
        // The background persists a retryable RPC warning when appropriate.
      } finally {
        if (active) await onReload().catch(() => undefined);
        running = false;
      }
    };
    void reconcile();
    const interval = window.setInterval(
      () => void reconcile(),
      VISIBLE_RECONCILIATION_INTERVAL_MS,
    );
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [onReload, pending, proposalId]);
}
