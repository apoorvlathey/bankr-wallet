import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  getVisibleRpcIssueChainIds,
  INITIAL_RPC_ISSUE_ALERT_STATE,
  reduceRpcIssueAlertState,
  RPC_ISSUE_ALERT_REVEAL_DELAY_MS,
} from "./rpcIssueAlertModel";

export function useRpcIssueAlert() {
  const [state, dispatch] = useReducer(
    reduceRpcIssueAlertState,
    INITIAL_RPC_ISSUE_ALERT_STATE,
  );

  useEffect(() => {
    if (state.pendingSince === null) return;
    const expectedChainIds = state.reportedChainIds;
    const remainingDelay = Math.max(
      0,
      state.pendingSince + RPC_ISSUE_ALERT_REVEAL_DELAY_MS - Date.now(),
    );
    const timer = window.setTimeout(() => {
      dispatch({ type: "reveal", expectedChainIds });
    }, remainingDelay);
    return () => window.clearTimeout(timer);
  }, [state.pendingSince, state.reportedChainIds]);

  const reportRpcIssues = useCallback((chainIds: number[]) => {
    dispatch({ type: "report", chainIds, now: Date.now() });
  }, []);
  const dismissRpcIssues = useCallback(() => {
    dispatch({ type: "dismiss" });
  }, []);
  const clearRpcIssue = useCallback((chainId: number) => {
    dispatch({ type: "clear", chainId });
  }, []);
  const visibleChainIds = useMemo(
    () => getVisibleRpcIssueChainIds(state),
    [state],
  );

  return {
    visibleChainIds,
    reportRpcIssues,
    dismissRpcIssues,
    clearRpcIssue,
  };
}
