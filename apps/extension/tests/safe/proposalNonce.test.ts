import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  cancelSafeProposal,
  changeSafeProposalNonce,
  createReviewedSafeProposal,
} from "../../src/chrome/safe/proposalLifecycle";
import {
  createSafeProposal,
  getSafeProposal,
  getSafeProposals,
  claimSafeProposalEffect,
  releaseSafeProposalEffect,
  replaceUnsignedSafeProposal,
} from "../../src/chrome/safe/proposalRepository";
import {
  getNextAvailableSafeNonce,
  getSafeProposalNoncePosition,
} from "../../src/chrome/safe/proposalNonce";
import { reconcileSafeProposalNonceQueue } from "../../src/chrome/safe/proposalNonceReconciliation";
import { startSafeProposalRejection } from "../../src/chrome/safe/proposalRejection";
import { buildSafeTransaction } from "../../src/chrome/safe/transactionBuilder";
import type {
  SafeAccountRecord,
  SafeProposalRecord,
} from "../../src/chrome/safe/types";
import { installNativeSessionStorage } from "../session/testStorage";

const installed: Array<ReturnType<typeof installNativeSessionStorage>> = [];
afterEach(() => installed.pop()?.restore());

const safeAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const target = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

const safeRecord: SafeAccountRecord = {
  version: 1,
  accountId: "safe-account",
  address: safeAddress,
  importedBy: "manual",
  chains: {
    "8453": {
      chainId: 8453,
      verifiedAtBlock: "12",
      configEpoch: `0x${"12".repeat(32)}`,
      singleton: "0x3333333333333333333333333333333333333333",
      version: "1.4.1",
      owners: ["0x1111111111111111111111111111111111111111"],
      contractOwners: [],
      threshold: 1,
      nonce: "4",
      modules: [],
      guard: "0x0000000000000000000000000000000000000000",
      fallbackHandler: "0x4444444444444444444444444444444444444444",
      transactionService: "supported",
      capability: "approve",
    },
  },
};

function proposalAt(
  nonce: bigint,
  state: SafeProposalRecord["state"] = "draft",
  callTarget = target,
): SafeProposalRecord {
  const built = buildSafeTransaction({
    chainId: 8453,
    safeAddress,
    safeVersion: "1.4.1",
    nonce,
    calls: [{ to: callTarget, value: "0", data: "0x", operation: 0 }],
  });
  return {
    version: 1,
    id: `8453:${safeAddress}:${built.safeTxHash}`,
    chainId: 8453,
    safeAccountId: "safe-account",
    safeAddress,
    safeTxHash: built.safeTxHash,
    safeVersion: "1.4.1",
    safeConfigEpoch: `0x${"12".repeat(32)}`,
    verifiedAtBlock: "12",
    calls: built.calls,
    transaction: built.transaction,
    state,
    confirmations: [],
    route: { kind: "wallet" },
    createdAt: 1,
    updatedAt: 1,
    error: state === "blocked"
      ? `Future Safe nonce ${nonce}; executable nonce is 4`
      : undefined,
  };
}

test("automatic Safe requests reserve sequential nonces under one storage lock", async () => {
  installed.push(installNativeSessionStorage({
    local: { safeAccounts: { version: 1, records: [safeRecord] } },
  }));
  const calls = [{ to: target, value: "0", data: "0x" as const, operation: 0 as const }];
  const created = await Promise.all([
    createReviewedSafeProposal(
      { safeAccountId: "safe-account", chainId: 8453, calls },
      { verifySafeOnchainState: async () => safeRecord.chains["8453"] },
    ),
    createReviewedSafeProposal(
      { safeAccountId: "safe-account", chainId: 8453, calls },
      { verifySafeOnchainState: async () => safeRecord.chains["8453"] },
    ),
  ]);

  assert.deepEqual(created.map((item) => item.transaction.nonce).sort(), [4, 5]);
  assert.equal(created.find((item) => item.transaction.nonce === 4)?.state, "draft");
  assert.equal(created.find((item) => item.transaction.nonce === 5)?.state, "draft");
  assert.equal(created.find((item) => item.transaction.nonce === 5)?.error, undefined);
});

test("nonce allocation uses the lowest free pending nonce and ignores terminal records", () => {
  assert.equal(getNextAvailableSafeNonce({
    safeAccountId: "safe-account",
    chainId: 8453,
    onchainNonce: 4n,
    proposals: [
      proposalAt(4n),
      proposalAt(5n, "cancelled"),
      proposalAt(6n, "blocked"),
    ],
  }), 5n);
});

test("Safe approvals accept current and future nonces but reject stale nonces", () => {
  assert.equal(getSafeProposalNoncePosition(4, "4"), "current");
  assert.equal(getSafeProposalNoncePosition(5, "4"), "future");
  assert.equal(getSafeProposalNoncePosition(3, "4"), "stale");
});

test("confirmed records advance a stale cached nonce floor", () => {
  assert.equal(getNextAvailableSafeNonce({
    safeAccountId: "safe-account",
    chainId: 8453,
    onchainNonce: 4n,
    proposals: [proposalAt(4n, "executed")],
  }), 5n);
});

test("an unsigned request can explicitly move to a custom nonce and later unblock", async () => {
  installed.push(installNativeSessionStorage());
  const initial = proposalAt(4n);
  const custom = proposalAt(7n, "blocked");
  await createSafeProposal(initial);

  const updated = await replaceUnsignedSafeProposal(initial.id, custom);
  assert.equal(updated.transaction.nonce, 7);
  assert.equal(await getSafeProposal(initial.id), null);

  await reconcileSafeProposalNonceQueue({
    safeAccountId: "safe-account",
    chainId: 8453,
    liveNonce: "7",
    threshold: 1,
  });
  assert.equal((await getSafeProposal(custom.id))?.state, "draft");
});

test("a queued approvable request is replaced only if the live nonce passes it", async () => {
  installed.push(installNativeSessionStorage());
  const queued = proposalAt(5n);
  await createSafeProposal(queued);

  await reconcileSafeProposalNonceQueue({
    safeAccountId: "safe-account",
    chainId: 8453,
    liveNonce: "4",
    threshold: 1,
  });
  assert.equal((await getSafeProposal(queued.id))?.state, "draft");

  await reconcileSafeProposalNonceQueue({
    safeAccountId: "safe-account",
    chainId: 8453,
    liveNonce: "6",
    threshold: 1,
  });
  assert.equal((await getSafeProposal(queued.id))?.state, "replaced");
});

test("a fully signed queued request becomes executable when its nonce is current", async () => {
  installed.push(installNativeSessionStorage());
  const queued = {
    ...proposalAt(5n),
    state: "awaitingApprovals" as const,
    confirmations: [
      {
        ownerAddress: "0x1111111111111111111111111111111111111111" as const,
        accountId: "owner-1",
        accountType: "privateKey" as const,
        signature: `0x${"11".repeat(65)}` as `0x${string}`,
        createdAt: 1,
        publishedAt: 2,
      },
      {
        ownerAddress: "0x2222222222222222222222222222222222222222" as const,
        accountId: "owner-2",
        accountType: "ledger" as const,
        signature: `0x${"22".repeat(65)}` as `0x${string}`,
        createdAt: 3,
        publishedAt: 4,
      },
    ],
  };
  await createSafeProposal(queued);

  await reconcileSafeProposalNonceQueue({
    safeAccountId: "safe-account",
    chainId: 8453,
    liveNonce: "4",
    threshold: 2,
  });
  assert.equal((await getSafeProposal(queued.id))?.state, "awaitingApprovals");

  await reconcileSafeProposalNonceQueue({
    safeAccountId: "safe-account",
    chainId: 8453,
    liveNonce: "5",
    threshold: 2,
  });
  assert.equal((await getSafeProposal(queued.id))?.state, "readyToExecute");
});

test("nonce reconciliation cannot replace an approval claim in progress", async () => {
  installed.push(installNativeSessionStorage());
  const queued = proposalAt(5n);
  await createSafeProposal(queued);
  const claimed = await claimSafeProposalEffect(queued.id, {
    kind: "approve",
    ownerAddress: "0x1111111111111111111111111111111111111111",
  });

  await reconcileSafeProposalNonceQueue({
    safeAccountId: "safe-account",
    chainId: 8453,
    liveNonce: "6",
    threshold: 1,
  });
  assert.equal((await getSafeProposal(queued.id))?.state, "draft");
  assert.equal(
    (await getSafeProposal(queued.id))?.effectClaim?.claimId,
    claimed.effectClaim?.claimId,
  );
  await releaseSafeProposalEffect(queued.id, claimed.effectClaim!.claimId);
});

test("an unsigned queued future-nonce request can be cancelled locally", async () => {
  const storage = installNativeSessionStorage();
  installed.push(storage);
  const queued = {
    ...proposalAt(5n, "blocked"),
    route: {
      kind: "injected" as const,
      requestId: "queued-request",
      origin: "https://app.example",
    },
  };
  await createSafeProposal(queued);

  const result = await startSafeProposalRejection(queued.id);

  assert.equal(result.kind, "cancelledLocally");
  assert.equal(result.proposal.state, "cancelled");
  assert.equal((await getSafeProposal(queued.id))?.state, "cancelled");
  assert.deepEqual((storage.local["txResult:queued-request"] as any).result, {
    success: false,
    error: "Safe proposal request rejected",
    code: 4001,
  });
});

test("an identical request revives a locally cancelled unsigned Safe identity", async () => {
  const storage = installNativeSessionStorage({
    local: { safeAccounts: { version: 1, records: [safeRecord] } },
  });
  installed.push(storage);
  const verify = { verifySafeOnchainState: async () => safeRecord.chains["8453"] };
  const calls = [{ to: target, value: "0" as const, data: "0x" as const, operation: 0 as const }];
  const initial = await createReviewedSafeProposal({
    safeAccountId: "safe-account",
    chainId: 8453,
    calls,
    route: { kind: "injected", requestId: "old-request", origin: "https://app.example" },
  }, verify);
  await cancelSafeProposal(initial.id);

  const retried = await createReviewedSafeProposal({
    safeAccountId: "safe-account",
    chainId: 8453,
    calls,
    route: { kind: "injected", requestId: "new-request", origin: "https://app.example" },
  }, verify);

  assert.equal(retried.id, initial.id);
  assert.equal(retried.transaction.nonce, 4);
  assert.equal(retried.state, "draft");
  assert.equal(retried.route.requestId, "new-request");
  assert.equal((await getSafeProposals()).length, 1);
  assert.deepEqual((storage.local["txResult:old-request"] as any).result, {
    success: false,
    error: "Safe proposal request rejected",
    code: 4001,
  });
});

test("concurrent identical retries after local cancellation reserve unique nonces", async () => {
  installed.push(installNativeSessionStorage({
    local: { safeAccounts: { version: 1, records: [safeRecord] } },
  }));
  const verify = { verifySafeOnchainState: async () => safeRecord.chains["8453"] };
  const calls = [{ to: target, value: "0" as const, data: "0x" as const, operation: 0 as const }];
  const initial = await createReviewedSafeProposal({
    safeAccountId: "safe-account",
    chainId: 8453,
    calls,
  }, verify);
  await cancelSafeProposal(initial.id);

  const retried = await Promise.all([
    createReviewedSafeProposal({ safeAccountId: "safe-account", chainId: 8453, calls }, verify),
    createReviewedSafeProposal({ safeAccountId: "safe-account", chainId: 8453, calls }, verify),
  ]);

  assert.deepEqual(retried.map((item) => item.transaction.nonce).sort(), [4, 5]);
  assert.equal(new Set(retried.map((item) => item.id)).size, 2);
});

test("custom nonce replacement fails closed after any signature", async () => {
  installed.push(installNativeSessionStorage());
  const initial = proposalAt(4n);
  await createSafeProposal({
    ...initial,
    state: "awaitingApprovals",
    confirmations: [{
      ownerAddress: "0x1111111111111111111111111111111111111111",
      accountId: "owner",
      accountType: "privateKey",
      signature: `0x${"11".repeat(65)}`,
      createdAt: 1,
    }],
  });

  await assert.rejects(
    () => replaceUnsignedSafeProposal(initial.id, proposalAt(5n, "blocked")),
    /only be changed before signing/,
  );
  await assert.rejects(
    () => changeSafeProposalNonce({
      proposalId: initial.id,
      nonce: String(initial.transaction.nonce),
    }),
    /only be changed before signing/,
  );
});

test("explicit custom nonce selection may create a same-nonce competitor", async () => {
  installed.push(installNativeSessionStorage());
  const initial = proposalAt(4n);
  const occupied = proposalAt(
    5n,
    "blocked",
    "0xcccccccccccccccccccccccccccccccccccccccc",
  );
  await createSafeProposal(initial);
  await createSafeProposal(occupied);

  const replacement = await replaceUnsignedSafeProposal(
    initial.id,
    proposalAt(5n, "blocked"),
  );
  assert.equal(replacement.transaction.nonce, 5);
});

test("custom nonce route validates against freshly verified onchain state", async () => {
  installed.push(installNativeSessionStorage({
    local: { safeAccounts: { version: 1, records: [safeRecord] } },
  }));
  const verify = { verifySafeOnchainState: async () => safeRecord.chains["8453"] };
  const initial = await createReviewedSafeProposal({
    safeAccountId: "safe-account",
    chainId: 8453,
    calls: [{ to: target, value: "0", data: "0x", operation: 0 }],
  }, verify);
  await createSafeProposal(proposalAt(
    6n,
    "blocked",
    "0xcccccccccccccccccccccccccccccccccccccccc",
  ));

  await assert.rejects(
    () => changeSafeProposalNonce({ proposalId: initial.id, nonce: "3" }, verify),
    /must be 4 or higher/,
  );
  const changed = await changeSafeProposalNonce({
    proposalId: initial.id,
    nonce: "6",
  }, verify);
  assert.equal(changed.transaction.nonce, 6);
  assert.equal(changed.state, "draft");
  assert.equal(
    (await getSafeProposal(changed.id))?.transaction.nonce,
    6,
    "the trusted UI may deliberately create a competing same-nonce request",
  );
});
