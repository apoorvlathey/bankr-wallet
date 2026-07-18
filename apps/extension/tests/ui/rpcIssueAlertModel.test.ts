import assert from "node:assert/strict";
import test from "node:test";
import {
  getVisibleRpcIssueChainIds,
  INITIAL_RPC_ISSUE_ALERT_STATE,
  reduceRpcIssueAlertState,
} from "../../src/app/home/rpcIssueAlertModel";

function report(
  state: typeof INITIAL_RPC_ISSUE_ALERT_STATE,
  checkedChainIds: number[],
  unhealthyChainIds: number[],
  now: number,
) {
  return reduceRpcIssueAlertState(state, {
    type: "report",
    checkedChainIds,
    unhealthyChainIds,
    now,
  });
}

test("an RPC issue stays hidden until its reveal timer completes", () => {
  const pending = report(
    INITIAL_RPC_ISSUE_ALERT_STATE,
    [324, 8453, 324],
    [324, 8453],
    1_000,
  );

  assert.deepEqual(pending.reportedChainIds, [324, 8453]);
  assert.deepEqual(getVisibleRpcIssueChainIds(pending), []);
  assert.equal(pending.pendingSince, 1_000);

  const revealed = reduceRpcIssueAlertState(pending, {
    type: "reveal",
    expectedChainIds: [8453, 324],
  });
  assert.deepEqual(getVisibleRpcIssueChainIds(revealed), [324, 8453]);
});

test("one healthy observation does not clear a warning", () => {
  const pending = report(
    INITIAL_RPC_ISSUE_ALERT_STATE,
    [8453],
    [8453],
    1_000,
  );
  const recovering = report(pending, [8453], [], 2_000);

  assert.deepEqual(recovering.reportedChainIds, [8453]);
  assert.equal(recovering.healthyObservationCounts[8453], 1);
  assert.equal(recovering.pendingSince, 1_000);
});

test("two healthy observations clear an issue without a stale timer flash", () => {
  const pending = report(
    INITIAL_RPC_ISSUE_ALERT_STATE,
    [8453],
    [8453],
    1_000,
  );
  const recovering = report(pending, [8453], [], 2_000);
  const cleared = report(recovering, [8453], [], 3_000);
  const staleTimer = reduceRpcIssueAlertState(cleared, {
    type: "reveal",
    expectedChainIds: [8453],
  });

  assert.deepEqual(staleTimer, INITIAL_RPC_ISSUE_ALERT_STATE);
  assert.deepEqual(getVisibleRpcIssueChainIds(staleTimer), []);
});

test("a partial refresh cannot clear a chain it did not check", () => {
  const pending = report(
    INITIAL_RPC_ISSUE_ALERT_STATE,
    [1, 8453],
    [1, 8453],
    1_000,
  );
  const partialSuccess = report(pending, [1], [], 2_000);

  assert.deepEqual(partialSuccess.reportedChainIds, [1, 8453]);
  assert.equal(partialSuccess.healthyObservationCounts[1], 1);
  assert.equal(partialSuccess.healthyObservationCounts[8453], undefined);
});

test("dismissal survives repeated unhealthy observations", () => {
  const pending = report(
    INITIAL_RPC_ISSUE_ALERT_STATE,
    [8453],
    [8453],
    1_000,
  );
  const revealed = reduceRpcIssueAlertState(pending, {
    type: "reveal",
    expectedChainIds: [8453],
  });
  const dismissed = reduceRpcIssueAlertState(revealed, { type: "dismiss" });
  const repeated = report(dismissed, [8453], [8453], 10_000);

  assert.deepEqual(getVisibleRpcIssueChainIds(repeated), []);
  assert.deepEqual(repeated.dismissedChainIds, [8453]);
});

test("newly failing chains wait while an existing issue remains visible", () => {
  const pending = report(
    INITIAL_RPC_ISSUE_ALERT_STATE,
    [8453],
    [8453],
    1_000,
  );
  const revealed = reduceRpcIssueAlertState(pending, {
    type: "reveal",
    expectedChainIds: [8453],
  });
  const expanded = report(revealed, [1, 8453], [1, 8453], 5_000);

  assert.deepEqual(getVisibleRpcIssueChainIds(expanded), [8453]);
  const fullyRevealed = reduceRpcIssueAlertState(expanded, {
    type: "reveal",
    expectedChainIds: [1, 8453],
  });
  assert.deepEqual(getVisibleRpcIssueChainIds(fullyRevealed), [1, 8453]);
});

test("saving one chain clears only that chain's warning", () => {
  const pending = report(
    INITIAL_RPC_ISSUE_ALERT_STATE,
    [1, 8453],
    [1, 8453],
    1_000,
  );
  const revealed = reduceRpcIssueAlertState(pending, {
    type: "reveal",
    expectedChainIds: [1, 8453],
  });
  const cleared = reduceRpcIssueAlertState(revealed, {
    type: "clear",
    chainId: 8453,
  });

  assert.deepEqual(cleared.reportedChainIds, [1]);
  assert.deepEqual(getVisibleRpcIssueChainIds(cleared), [1]);
});
