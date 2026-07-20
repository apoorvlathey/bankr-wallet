import assert from "node:assert/strict";
import test from "node:test";
import { mergeSafeServiceProposal } from "../../src/chrome/safe/serviceMerge";
import type { SafeProposalRecord } from "../../src/chrome/safe/types";

const SAFE = "0x1111111111111111111111111111111111111111" as const;
const OWNER = "0x2222222222222222222222222222222222222222" as const;
const SECOND_OWNER = "0x3333333333333333333333333333333333333333" as const;
const TX_HASH = `0x${"44".repeat(32)}` as const;
const REMOTE_TX_HASH = `0x${"55".repeat(32)}` as const;
const SERIALIZED = `0x${"66".repeat(64)}` as const;

function proposal(overrides: Partial<SafeProposalRecord> = {}): SafeProposalRecord {
  return {
    version: 1,
    id: `8453:${SAFE}:0x${"77".repeat(32)}`,
    chainId: 8453,
    safeAccountId: "safe-account",
    safeAddress: SAFE,
    safeTxHash: `0x${"77".repeat(32)}`,
    safeVersion: "1.4.1",
    safeConfigEpoch: `0x${"88".repeat(32)}`,
    verifiedAtBlock: "10",
    calls: [{ to: SAFE, value: "0", data: "0x", operation: 0 }],
    transaction: {
      to: SAFE,
      value: "0",
      data: "0x",
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce: 2,
    },
    state: "readyToExecute",
    confirmations: [],
    route: { kind: "wallet", origin: "WalletChan" },
    purpose: "rejection",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test("stale Safe service state cannot downgrade an in-flight local execution", () => {
  const current = proposal({
    state: "executing",
    transactionHash: TX_HASH,
    serializedExecution: SERIALIZED,
    executionPreparedAt: 100,
    route: { kind: "injected", requestId: "request-1" },
    confirmations: [{
      ownerAddress: OWNER,
      accountId: "bankr-owner",
      accountType: "bankr",
      signature: `0x${"11".repeat(65)}`,
      createdAt: 10,
    }],
  });
  const remote = proposal({
    state: "readyToExecute",
    confirmations: [{
      ownerAddress: OWNER,
      signature: `0x${"11".repeat(65)}`,
      createdAt: 11,
      publishedAt: 12,
    }, {
      ownerAddress: SECOND_OWNER,
      signature: `0x${"22".repeat(65)}`,
      createdAt: 13,
      publishedAt: 14,
    }],
  });

  const merged = mergeSafeServiceProposal(current, remote, 200);

  assert.equal(merged.state, "executing");
  assert.equal(merged.transactionHash, TX_HASH);
  assert.equal(merged.serializedExecution, SERIALIZED);
  assert.equal(merged.executionPreparedAt, 100);
  assert.deepEqual(merged.route, current.route);
  assert.equal(merged.confirmations.length, 2);
  assert.equal(merged.confirmations[0]?.accountId, "bankr-owner");
  assert.equal(merged.confirmations[0]?.publishedAt, 12);
});

test("a stale ready state carrying an execution hash is repaired to ambiguous", () => {
  const merged = mergeSafeServiceProposal(
    proposal({ state: "readyToExecute", transactionHash: TX_HASH }),
    proposal({ state: "readyToExecute" }),
    200,
  );

  assert.equal(merged.state, "ambiguous");
  assert.equal(merged.transactionHash, TX_HASH);
});

test("a service execution hash stays pending until receipt reconciliation applies terminal effects", () => {
  const merged = mergeSafeServiceProposal(
    proposal({
      state: "ambiguous",
      transactionHash: TX_HASH,
      serializedExecution: SERIALIZED,
      executionPreparedAt: 100,
      error: "Confirming broadcast",
    }),
    proposal({ state: "executed", transactionHash: REMOTE_TX_HASH }),
    200,
  );

  assert.equal(merged.state, "ambiguous");
  assert.equal(merged.transactionHash, REMOTE_TX_HASH);
  assert.equal(merged.serializedExecution, undefined);
  assert.equal(merged.executionPreparedAt, undefined);
  assert.equal(merged.error, undefined);
});

test("an active effect claim and unpublished local approval survive service lag", () => {
  const current = proposal({
    state: "publishing",
    effectClaim: {
      kind: "publish",
      claimId: "claim-1",
      claimedAt: 100,
    },
    confirmations: [{
      ownerAddress: OWNER,
      accountId: "seed-owner",
      accountType: "seedPhrase",
      signature: `0x${"11".repeat(65)}`,
      createdAt: 10,
    }],
  });

  const merged = mergeSafeServiceProposal(
    current,
    proposal({ state: "awaitingApprovals", confirmations: [] }),
    200,
  );

  assert.equal(merged.state, "publishing");
  assert.deepEqual(merged.effectClaim, current.effectClaim);
  assert.equal(merged.confirmations[0]?.accountId, "seed-owner");
});
