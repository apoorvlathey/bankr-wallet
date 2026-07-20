import { useEffect, useState } from "react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";

export type SplitPriorTxState =
  | { ready: true; justResolvedAt?: number }
  | { ready: false; label: string };

/**
 * Gates later slices of a split wallet_sendCalls bundle until the preceding
 * transaction has landed, then signals the gas estimator to refresh.
 */
export function useSplitPriorTxState(
  txRequest: PendingTxRequest,
): SplitPriorTxState {
  const parentBundleId = txRequest.parentBundleId;
  const bundleIndex = txRequest.bundleIndex;
  const noPrior =
    !parentBundleId || bundleIndex === undefined || bundleIndex === 0;
  const [state, setState] = useState<SplitPriorTxState>(
    noPrior
      ? { ready: true }
      : {
          ready: false,
          label: "Waiting for previous transaction to confirm…",
        },
  );

  useEffect(() => {
    if (noPrior) {
      setState({ ready: true });
      return;
    }

    const priorTxId = `${parentBundleId}:split:${(bundleIndex as number) - 1}`;
    let cancelled = false;

    const apply = (tx: { status: string; error?: string }) => {
      if (cancelled) return;
      if (tx.status === "success") {
        setState((previous) =>
          previous.ready
            ? previous
            : { ready: true, justResolvedAt: Date.now() },
        );
      } else if (tx.status === "failed") {
        setState({
          ready: false,
          label: `Previous transaction ${
            tx.error?.includes("dropped") ? "was dropped" : "failed"
          } — bundle cancelled`,
        });
      }
    };

    chrome.runtime.sendMessage({ type: "getTxHistory" }, (history) => {
      if (cancelled || !Array.isArray(history)) return;
      const prior = history.find((tx: { id?: string }) => tx.id === priorTxId);
      if (prior) apply(prior);
    });

    const onMessage = (message: {
      type: string;
      txId?: string;
    }) => {
      if (
        message.type !== "txHistoryUpdated" ||
        message.txId !== priorTxId
      ) {
        return;
      }
      chrome.runtime.sendMessage(
        { type: "getTxHistoryItem", txId: priorTxId },
        (updated) => {
          if (!cancelled && updated) apply(updated);
        },
      );
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [bundleIndex, noPrior, parentBundleId]);

  return state;
}
