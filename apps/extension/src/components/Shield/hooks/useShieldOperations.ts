import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearRendererMemoryCache,
  readRendererMemoryCache,
  writeRendererMemoryCache,
} from "@/app/rendererMemoryCache";

import {
  parseShieldOperationListResponse,
  type ShieldPrivatePortfolio,
  type ShieldPortfolioSeries,
  type ShieldPendingOperation,
} from "../model/shieldOperation";
import type { UnshieldOperation } from "../model/unshield";
import type { PublicRecoveryOperation } from "../model/recovery";

const CONFIRMATION_REFRESH_DELAY_MS = 350;
const PARTIAL_EVENT_SYNC_INTERVAL_MS = 1_000;
const ACTIVE_SYNC_INTERVAL_MS = 10_000;
const ASP_SYNC_INTERVAL_MS = 120_000;

type ShieldOperationsSnapshot = NonNullable<
  ReturnType<typeof parseShieldOperationListResponse>
>;

const SHIELD_OPERATIONS_CACHE_KEY = "private-portfolio-snapshot";

const EMPTY_PORTFOLIO: ShieldPrivatePortfolio = {
  status: "locked",
  confirmedBalanceWei: 0n,
  readyBalanceWei: 0n,
  maxPrivateSendWei: 0n,
  pendingBalanceWei: 0n,
  recoverableBalanceWei: 0n,
  attentionCount: 0,
  lastUpdatedAt: null,
};

const EMPTY_SERIES: ShieldPortfolioSeries = {
  priceUsd: null,
  totalValueUsd: null,
  snapshots: [],
};

function isPartialPrivacyEventSync(response: unknown): boolean {
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  const result = response as { success?: unknown; sync?: unknown };
  if (result.success !== true || !result.sync || typeof result.sync !== "object") {
    return false;
  }
  return (result.sync as { status?: unknown }).status === "partial";
}

function nextSyncDelay(
  operations: readonly ShieldPendingOperation[],
  withdrawals: readonly UnshieldOperation[],
): number | null {
  if (withdrawals.some((operation) =>
    operation.state === "awaiting_wallet_confirmation" ||
    operation.state === "proof_preparing" ||
    operation.state === "proof_verified" ||
    operation.state === "submitting_to_relayer" ||
    operation.state === "submission_unknown" ||
    operation.state === "submitted" ||
    operation.state === "public_confirmed"
  )) return ACTIVE_SYNC_INTERVAL_MS;
  if (operations.some((operation) =>
    operation.state === "submission_unknown" ||
    operation.state === "submitted" ||
    operation.state === "public_confirmed" ||
    operation.state === "awaiting_event"
  )) return ACTIVE_SYNC_INTERVAL_MS;
  return operations.some((operation) =>
    operation.state === "awaiting_asp" ||
    operation.state === "asp_unavailable" ||
    operation.state === "asp_poi_required"
  )
    ? ASP_SYNC_INTERVAL_MS
    : null;
}

export function useShieldOperations(): {
  operations: ShieldPendingOperation[];
  withdrawals: UnshieldOperation[];
  recoveries: PublicRecoveryOperation[];
  portfolio: ShieldPrivatePortfolio;
  series: ShieldPortfolioSeries;
  loading: boolean;
  refresh: () => void;
  recordWithdrawal: (operation: UnshieldOperation) => void;
} {
  const initialSnapshot = readRendererMemoryCache<ShieldOperationsSnapshot>(
    SHIELD_OPERATIONS_CACHE_KEY,
  );
  const [operations, setOperations] = useState<ShieldPendingOperation[]>(
    () => initialSnapshot?.operations ?? [],
  );
  const [withdrawals, setWithdrawals] = useState<UnshieldOperation[]>(
    () => initialSnapshot?.withdrawals ?? [],
  );
  const [recoveries, setRecoveries] = useState<PublicRecoveryOperation[]>(
    () => initialSnapshot?.recoveries ?? [],
  );
  const [portfolio, setPortfolio] = useState<ShieldPrivatePortfolio>(
    () => initialSnapshot?.portfolio ?? EMPTY_PORTFOLIO,
  );
  const [series, setSeries] = useState<ShieldPortfolioSeries>(
    () => initialSnapshot?.series ?? EMPTY_SERIES,
  );
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [loading, setLoading] = useState(initialSnapshot === null);
  const activityIdsRef = useRef(new Set<string>());
  const refresh = useCallback(() => setRefreshNonce((value) => value + 1), []);
  const recordWithdrawal = useCallback((operation: UnshieldOperation) => {
    activityIdsRef.current.add(operation.id);
    setWithdrawals((current) => {
      const next = [
        operation,
        ...current.filter((candidate) => candidate.id !== operation.id),
      ];
      const cached = readRendererMemoryCache<ShieldOperationsSnapshot>(
        SHIELD_OPERATIONS_CACHE_KEY,
      );
      if (cached) {
        writeRendererMemoryCache(SHIELD_OPERATIONS_CACHE_KEY, {
          ...cached,
          withdrawals: next,
        });
      }
      return next;
    });
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let rerunRequested = false;
    let confirmationTimer: ReturnType<typeof setTimeout> | null = null;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const activityIds = activityIdsRef.current;
    let nextDelay: number | null = null;

    const applySnapshot = (snapshot: ShieldOperationsSnapshot) => {
      activityIds.clear();
      for (const item of [
        ...snapshot.operations,
        ...snapshot.withdrawals,
        ...snapshot.recoveries,
      ]) activityIds.add(item.id);
      nextDelay = nextSyncDelay(snapshot.operations, snapshot.withdrawals);
      writeRendererMemoryCache(SHIELD_OPERATIONS_CACHE_KEY, snapshot);
      setOperations(snapshot.operations);
      setWithdrawals(snapshot.withdrawals);
      setRecoveries(snapshot.recoveries);
      setPortfolio(snapshot.portfolio);
      setSeries(snapshot.series);
      setLoading(false);
    };

    const load = () =>
      chrome.runtime.sendMessage({ type: "privacyListShieldOperations" }).then((response) => {
        const parsed = parseShieldOperationListResponse(response);
        if (!cancelled && parsed) {
          applySnapshot(parsed);
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
        const syncResponse = await chrome.runtime.sendMessage({ type: "privacySyncShield" });
        await load();
        if (isPartialPrivacyEventSync(syncResponse)) {
          nextDelay = nextDelay === null
            ? PARTIAL_EVENT_SYNC_INTERVAL_MS
            : Math.min(nextDelay, PARTIAL_EVENT_SYNC_INTERVAL_MS);
        }
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
      if (message.type === "walletLockedExternal") {
        clearRendererMemoryCache();
        return;
      }
      if (message.type !== "txHistoryUpdated") return;
      const txId = message.updatedTx?.id;
      if (typeof txId === "string" && !activityIds.has(txId)) return;
      if (confirmationTimer) clearTimeout(confirmationTimer);
      confirmationTimer = setTimeout(
        () => {
          // A lifecycle projection can advance while the background is still
          // paging through the mainnet event history. Read that durable update
          // immediately instead of waiting for the long-running sync response.
          void load().catch(() => {
            // Keep the last verified snapshot; the active sync will retry.
          });
          if (running) {
            rerunRequested = true;
          } else {
            void syncAndLoad();
          }
        },
        CONFIRMATION_REFRESH_DELAY_MS,
      );
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    const cachedSnapshot = readRendererMemoryCache<ShieldOperationsSnapshot>(
      SHIELD_OPERATIONS_CACHE_KEY,
    );
    if (cachedSnapshot && refreshNonce === 0) {
      // Navigating between Private screens must retain the last verified
      // aggregate and chart. Pending lifecycle work may continue on its normal
      // timer, while explicit refreshes and transaction broadcasts update it.
      applySnapshot(cachedSnapshot);
      scheduleNextSync();
    } else {
      void syncAndLoad();
    }
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      if (confirmationTimer) clearTimeout(confirmationTimer);
      if (syncTimer) clearTimeout(syncTimer);
    };
  }, [refreshNonce]);

  return {
    operations,
    withdrawals,
    recoveries,
    portfolio,
    series,
    loading,
    refresh,
    recordWithdrawal,
  };
}
