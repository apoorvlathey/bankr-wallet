export const RPC_ISSUE_ALERT_REVEAL_DELAY_MS = 3_000;

export interface RpcIssueAlertState {
  reportedChainIds: number[];
  revealedChainIds: number[];
  dismissedChainIds: number[];
  pendingSince: number | null;
}

export type RpcIssueAlertEvent =
  | { type: "report"; chainIds: number[]; now: number }
  | { type: "reveal"; expectedChainIds: number[] }
  | { type: "clear"; chainId: number }
  | { type: "dismiss" };

export const INITIAL_RPC_ISSUE_ALERT_STATE: RpcIssueAlertState = {
  reportedChainIds: [],
  revealedChainIds: [],
  dismissedChainIds: [],
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
    return {
      ...state,
      reportedChainIds,
      revealedChainIds,
      dismissedChainIds: state.dismissedChainIds.filter(
        (chainId) => chainId !== event.chainId,
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

  const reportedChainIds = normalizeChainIds(event.chainIds);
  if (haveSameChainIds(state.reportedChainIds, reportedChainIds)) {
    return state;
  }
  if (reportedChainIds.length === 0) {
    return INITIAL_RPC_ISSUE_ALERT_STATE;
  }

  const stillReported = new Set(reportedChainIds);
  const revealedChainIds = state.revealedChainIds.filter((chainId) =>
    stillReported.has(chainId),
  );

  return {
    reportedChainIds,
    revealedChainIds,
    dismissedChainIds: state.dismissedChainIds.filter((chainId) =>
      stillReported.has(chainId),
    ),
    pendingSince: haveSameChainIds(revealedChainIds, reportedChainIds)
      ? null
      : event.now,
  };
}

export function getVisibleRpcIssueChainIds(
  state: RpcIssueAlertState,
): number[] {
  const dismissed = new Set(state.dismissedChainIds);
  return state.revealedChainIds.filter((chainId) => !dismissed.has(chainId));
}
