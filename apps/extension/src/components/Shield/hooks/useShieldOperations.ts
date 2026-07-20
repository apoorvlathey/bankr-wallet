import { useCallback, useEffect, useState } from "react";

import {
  parseShieldOperationListResponse,
  type ShieldPrivatePortfolio,
  type ShieldPendingOperation,
} from "../model/shieldOperation";
import type { UnshieldOperation } from "../model/unshield";
import type { PublicRecoveryOperation } from "../model/recovery";

const CONFIRMATION_REFRESH_DELAY_MS = 350;
const ACTIVE_SYNC_INTERVAL_MS = 10_000;
const ASP_SYNC_INTERVAL_MS = 120_000;

function nextSyncDelay(operations: readonly ShieldPendingOperation[]): number | null {
  if (operations.some((operation) =>
    operation.state === "submission_unknown" ||
    operation.state === "submitted" ||
    operation.state === "public_confirmed" ||
    operation.state === "awaiting_event"
  )) return ACTIVE_SYNC_INTERVAL_MS;
  return operations.some((operation) => operation.state === "awaiting_asp")
    ? ASP_SYNC_INTERVAL_MS
    : null;
}

export function useShieldOperations(): {
  operations: ShieldPendingOperation[];
  withdrawals: UnshieldOperation[];
  recoveries: PublicRecoveryOperation[];
  portfolio: ShieldPrivatePortfolio;
  refresh: () => void;
} {
  const [operations, setOperations] = useState<ShieldPendingOperation[]>([]);
  const [withdrawals, setWithdrawals] = useState<UnshieldOperation[]>([]);
  const [recoveries, setRecoveries] = useState<PublicRecoveryOperation[]>([]);
  const [portfolio, setPortfolio] = useState<ShieldPrivatePortfolio>({
    status: "locked",
    confirmedBalanceWei: 0n,
    readyBalanceWei: 0n,
    pendingBalanceWei: 0n,
    recoverableBalanceWei: 0n,
    attentionCount: 0,
    lastUpdatedAt: null,
  });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => setRefreshNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let rerunRequested = false;
    let confirmationTimer: ReturnType<typeof setTimeout> | null = null;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const activityIds = new Set<string>();
    let nextDelay: number | null = null;

    const load = () =>
      chrome.runtime.sendMessage({ type: "privacyListShieldOperations" }).then((response) => {
        const parsed = parseShieldOperationListResponse(response);
        if (!cancelled && parsed) {
          activityIds.clear();
          for (const item of [
            ...parsed.operations,
            ...parsed.withdrawals,
            ...parsed.recoveries,
          ]) activityIds.add(item.id);
          nextDelay = nextSyncDelay(parsed.operations);
          setOperations(parsed.operations);
          setWithdrawals(parsed.withdrawals);
          setRecoveries(parsed.recoveries);
          setPortfolio(parsed.portfolio);
        }
      });

    const scheduleNextSync = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = nextDelay === null
        ? null
        : setTimeout(() => void syncAndLoad(), nextDelay);
    };

    const syncAndLoad = async () => {
      if (running) {
        rerunRequested = true;
        return;
      }
      running = true;
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = null;
      try {
        await load();
        await chrome.runtime.sendMessage({ type: "privacySyncShield" });
        await load();
      } catch {
        // Keep the last verified public snapshot and retry on the next signal.
      } finally {
        running = false;
        if (!cancelled) {
          if (rerunRequested) {
            rerunRequested = false;
            void syncAndLoad();
          } else {
            scheduleNextSync();
          }
        }
      }
    };

    const handleRuntimeMessage = (message: {
      type?: unknown;
      updatedTx?: { id?: unknown };
    }) => {
      if (message.type !== "txHistoryUpdated") return;
      const txId = message.updatedTx?.id;
      if (typeof txId === "string" && !activityIds.has(txId)) return;
      if (confirmationTimer) clearTimeout(confirmationTimer);
      confirmationTimer = setTimeout(
        () => void syncAndLoad(),
        CONFIRMATION_REFRESH_DELAY_MS,
      );
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    void syncAndLoad();
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      if (confirmationTimer) clearTimeout(confirmationTimer);
      if (syncTimer) clearTimeout(syncTimer);
    };
  }, [refreshNonce]);

  return { operations, withdrawals, recoveries, portfolio, refresh };
}
