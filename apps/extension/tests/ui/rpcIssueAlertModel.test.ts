import assert from "node:assert/strict";
import test from "node:test";
import {
  getVisibleRpcIssueChainIds,
  INITIAL_RPC_ISSUE_ALERT_STATE,
  reduceRpcIssueAlertState,
} from "../../src/app/home/rpcIssueAlertModel";

test("an RPC issue stays hidden until its reveal timer completes", () => {
  const pending = reduceRpcIssueAlertState(INITIAL_RPC_ISSUE_ALERT_STATE, {
    type: "report",
    chainIds: [324, 8453, 324],
    now: 1_000,
  });

  assert.deepEqual(pending.reportedChainIds, [324, 8453]);
  assert.deepEqual(getVisibleRpcIssueChainIds(pending), []);
  assert.equal(pending.pendingSince, 1_000);

  const revealed = reduceRpcIssueAlertState(pending, {
    type: "reveal",
    expectedChainIds: [8453, 324],
  });
  assert.deepEqual(getVisibleRpcIssueChainIds(revealed), [324, 8453]);
});

test("a successful refresh clears a pending warning without a flash", () => {
  const pending = reduceRpcIssueAlertState(INITIAL_RPC_ISSUE_ALERT_STATE, {
    type: "report",
    chainIds: [8453],
    now: 1_000,
  });
  const cleared = reduceRpcIssueAlertState(pending, {
    type: "report",
    chainIds: [],
    now: 2_000,
  });
  const staleTimer = reduceRpcIssueAlertState(cleared, {
    type: "reveal",
    expectedChainIds: [8453],
  });

  assert.deepEqual(staleTimer, INITIAL_RPC_ISSUE_ALERT_STATE);
  assert.deepEqual(getVisibleRpcIssueChainIds(staleTimer), []);
});

test("identical reports do not reset the delay or a dismissal", () => {
  const pending = reduceRpcIssueAlertState(INITIAL_RPC_ISSUE_ALERT_STATE, {
    type: "report",
    chainIds: [8453],
    now: 1_000,
  });
  const repeatedPending = reduceRpcIssueAlertState(pending, {
    type: "report",
    chainIds: [8453],
    now: 2_500,
  });
  assert.strictEqual(repeatedPending, pending);

  const revealed = reduceRpcIssueAlertState(pending, {
    type: "reveal",
    expectedChainIds: [8453],
  });
  const dismissed = reduceRpcIssueAlertState(revealed, { type: "dismiss" });
  const repeatedDismissed = reduceRpcIssueAlertState(dismissed, {
    type: "report",
    chainIds: [8453],
    now: 10_000,
  });

  assert.strictEqual(repeatedDismissed, dismissed);
  assert.deepEqual(getVisibleRpcIssueChainIds(repeatedDismissed), []);
});

test("newly failing chains wait while an existing issue remains visible", () => {
  const pending = reduceRpcIssueAlertState(INITIAL_RPC_ISSUE_ALERT_STATE, {
    type: "report",
    chainIds: [8453],
    now: 1_000,
  });
  const revealed = reduceRpcIssueAlertState(pending, {
    type: "reveal",
    expectedChainIds: [8453],
  });
  const expanded = reduceRpcIssueAlertState(revealed, {
    type: "report",
    chainIds: [1, 8453],
    now: 5_000,
  });

  assert.deepEqual(getVisibleRpcIssueChainIds(expanded), [8453]);
  const fullyRevealed = reduceRpcIssueAlertState(expanded, {
    type: "reveal",
    expectedChainIds: [1, 8453],
  });
  assert.deepEqual(getVisibleRpcIssueChainIds(fullyRevealed), [1, 8453]);
});

test("saving one chain clears only that chain's warning", () => {
  const pending = reduceRpcIssueAlertState(INITIAL_RPC_ISSUE_ALERT_STATE, {
    type: "report",
    chainIds: [1, 8453],
    now: 1_000,
  });
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
