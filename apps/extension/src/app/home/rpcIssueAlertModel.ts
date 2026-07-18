import type { RpcHealthReport } from "@/types";

export const RPC_ISSUE_ALERT_REVEAL_DELAY_MS = 15_000;
const RPC_RECOVERY_OBSERVATIONS_REQUIRED = 2;

export interface RpcIssueAlertState {
  reportedChainIds: number[];
  revealedChainIds: number[];
  dismissedChainIds: number[];
  healthyObservationCounts: Record<number, number>;
  pendingSince: number | null;
}

export type RpcIssueAlertEvent =
  | ({ type: "report"; now: number } & RpcHealthReport)
  | { type: "reveal"; expectedChainIds: number[] }
  | { type: "clear"; chainId: number }
  | { type: "dismiss" };

export const INITIAL_RPC_ISSUE_ALERT_STATE: RpcIssueAlertState = {
  reportedChainIds: [],
  revealedChainIds: [],
  dismissedChainIds: [],
  healthyObservationCounts: {},
  pendingSince: null,
};

function normalizeChainIds(chainIds: number[]): number[] {
  return Array.from(
    new Set(
      chainIds.filter(
        (chainId) => Number.isSafeInteger(chainId) && chainId > 0,
      ),
    ),
  ).sort((a, b) => a - b);
}

function haveSameChainIds(left: number[], right: number[]): boolean {
  return (
    left.length === right.length &&
    left.every((chainId, index) => chainId === right[index])
  );
}

function keepReportedCounts(
  counts: Record<number, number>,
  reported: Set<number>,
): Record<number, number> {
  return Object.fromEntries(
    Object.entries(counts).filter(([chainId]) => reported.has(Number(chainId))),
  );
}

export function reduceRpcIssueAlertState(
  state: RpcIssueAlertState,
  event: RpcIssueAlertEvent,
): RpcIssueAlertState {
  if (event.type === "clear") {
    const reportedChainIds = state.reportedChainIds.filter(
      (chainId) => chainId !== event.chainId,
    );
    if (reportedChainIds.length === 0) return INITIAL_RPC_ISSUE_ALERT_STATE;
    const revealedChainIds = state.revealedChainIds.filter(
      (chainId) => chainId !== event.chainId,
    );
    const reported = new Set(reportedChainIds);
    return {
      ...state,
      reportedChainIds,
      revealedChainIds,
      dismissedChainIds: state.dismissedChainIds.filter(
        (chainId) => chainId !== event.chainId,
      ),
      healthyObservationCounts: keepReportedCounts(
        state.healthyObservationCounts,
        reported,
      ),
      pendingSince: haveSameChainIds(revealedChainIds, reportedChainIds)
        ? null
        : state.pendingSince,
    };
  }

  if (event.type === "dismiss") {
    return {
      ...state,
      dismissedChainIds: state.reportedChainIds,
    };
  }

  if (event.type === "reveal") {
    const expectedChainIds = normalizeChainIds(event.expectedChainIds);
    if (!haveSameChainIds(state.reportedChainIds, expectedChainIds)) {
      return state;
    }
    return {
      ...state,
      revealedChainIds: state.reportedChainIds,
      pendingSince: null,
    };
  }

  const checkedChainIds = normalizeChainIds(event.checkedChainIds);
  if (checkedChainIds.length === 0) return state;
  const checked = new Set(checkedChainIds);
  const unhealthy = new Set(
    normalizeChainIds(event.unhealthyChainIds).filter((chainId) =>
      checked.has(chainId),
    ),
  );
  const reported = new Set(state.reportedChainIds);
  const revealed = new Set(state.revealedChainIds);
  const dismissed = new Set(state.dismissedChainIds);
  const healthyObservationCounts = { ...state.healthyObservationCounts };

  for (const chainId of checked) {
    if (unhealthy.has(chainId)) {
      reported.add(chainId);
      delete healthyObservationCounts[chainId];
      continue;
    }
    if (!reported.has(chainId)) continue;

    const healthyCount = (healthyObservationCounts[chainId] ?? 0) + 1;
    if (healthyCount < RPC_RECOVERY_OBSERVATIONS_REQUIRED) {
      healthyObservationCounts[chainId] = healthyCount;
      continue;
    }
    reported.delete(chainId);
    revealed.delete(chainId);
    dismissed.delete(chainId);
    delete healthyObservationCounts[chainId];
  }

  if (reported.size === 0) return INITIAL_RPC_ISSUE_ALERT_STATE;

  const reportedChainIds = Array.from(reported).sort((a, b) => a - b);
  const revealedChainIds = Array.from(revealed)
    .filter((chainId) => reported.has(chainId))
    .sort((a, b) => a - b);
  const previousPendingChainIds = state.reportedChainIds.filter(
    (chainId) => !state.revealedChainIds.includes(chainId),
  );
  const pendingChainIds = reportedChainIds.filter(
    (chainId) => !revealed.has(chainId),
  );

  return {
    reportedChainIds,
    revealedChainIds,
    dismissedChainIds: Array.from(dismissed)
      .filter((chainId) => reported.has(chainId))
      .sort((a, b) => a - b),
    healthyObservationCounts: keepReportedCounts(
      healthyObservationCounts,
      reported,
    ),
    pendingSince:
      pendingChainIds.length === 0
        ? null
        : state.pendingSince !== null &&
            haveSameChainIds(previousPendingChainIds, pendingChainIds)
          ? state.pendingSince
          : event.now,
  };
}

export function getVisibleRpcIssueChainIds(
  state: RpcIssueAlertState,
): number[] {
  const dismissed = new Set(state.dismissedChainIds);
  return state.revealedChainIds.filter((chainId) => !dismissed.has(chainId));
}
