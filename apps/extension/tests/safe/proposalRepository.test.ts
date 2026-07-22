import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  buildSafeRejectionTransaction,
  buildSafeTransaction,
} from "../../src/chrome/safe/transactionBuilder";
import {
  claimSafeProposalEffect,
  createSafeProposal,
  decodeSafeProposalsEnvelope,
  getSafeProposal,
  hasUnresolvedSafeEffects,
  recoverInterruptedSafeProposalEffects,
  releaseSafeProposalEffect,
  updateSafeProposal,
} from "../../src/chrome/safe/proposalRepository";
import type { SafeProposalRecord } from "../../src/chrome/safe/types";
import { installNativeSessionStorage } from "../session/testStorage";
import {
  authorizeSafeProposalRoute,
  cancelSafeProposal,
  replayCancelledSafeProposalRoutes,
} from "../../src/chrome/safe/proposalLifecycle";

const installed: Array<ReturnType<typeof installNativeSessionStorage>> = [];
afterEach(() => installed.pop()?.restore());

function proposal(): SafeProposalRecord {
  const safeAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  const built = buildSafeTransaction({
    chainId: 8453,
    safeAddress,
    safeVersion: "1.4.1",
    nonce: 1n,
    calls: [{ to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", value: "2", data: "0x", operation: 0 }],
  });
  const now = Date.now();
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
    state: "draft",
    confirmations: [],
    route: { kind: "wallet" },
    createdAt: now,
    updatedAt: now,
  };
}

test("proposal creation is idempotent and effect claims are first-action-wins", async () => {
  installed.push(installNativeSessionStorage());
  const initial = { ...proposal(), state: "readyToExecute" as const };
  assert.equal((await createSafeProposal(initial)).id, initial.id);
  assert.equal((await createSafeProposal(initial)).id, initial.id);
  const claimed = await claimSafeProposalEffect(initial.id, { kind: "execute" });
  assert.equal(claimed.effectClaim?.kind, "execute");
  await assert.rejects(() => claimSafeProposalEffect(initial.id, { kind: "execute" }), /already in progress/);
  const released = await releaseSafeProposalEffect(initial.id, claimed.effectClaim!.claimId, { state: "executed", transactionHash: `0x${"34".repeat(32)}` });
  assert.equal(released.state, "executed");
  assert.equal((await getSafeProposal(initial.id))?.transactionHash, `0x${"34".repeat(32)}`);
});

test("stale display state cannot make a hashed Safe execution removable", async () => {
  installed.push(installNativeSessionStorage());
  const initial = proposal();
  await createSafeProposal({
    ...initial,
    state: "readyToExecute",
    transactionHash: `0x${"45".repeat(32)}`,
  });

  assert.equal(await hasUnresolvedSafeEffects(initial.safeAccountId), true);
});

test("proposal decoder rejects mutated transaction hashes and duplicates", () => {
  const initial = proposal();
  assert.throws(() => decodeSafeProposalsEnvelope({ version: 1, records: [{ ...initial, transaction: { ...initial.transaction, value: "3" } }] }), /hash mismatch/);
  assert.throws(() => decodeSafeProposalsEnvelope({ version: 1, records: [initial, initial] }), /duplicate/i);
});

test("proposal storage accepts only canonical transactions marked as Safe rejections", () => {
  const initial = proposal();
  assert.throws(
    () => decodeSafeProposalsEnvelope({
      version: 1,
      records: [{ ...initial, purpose: "rejection" }],
    }),
    /Invalid Safe rejection transaction/,
  );

  const built = buildSafeRejectionTransaction({
    chainId: initial.chainId,
    safeAddress: initial.safeAddress,
    safeVersion: initial.safeVersion,
    nonce: BigInt(initial.transaction.nonce),
  });
  const rejection: SafeProposalRecord = {
    ...initial,
    id: `${initial.chainId}:${initial.safeAddress}:${built.safeTxHash}`,
    safeTxHash: built.safeTxHash,
    calls: built.calls,
    transaction: built.transaction,
    purpose: "rejection",
  };
  assert.equal(
    decodeSafeProposalsEnvelope({ version: 1, records: [rejection] }).records[0]?.purpose,
    "rejection",
  );
});

test("ERC-5792 publishes its bundle id only after explicit Safe authorization", async () => {
  const storage = installNativeSessionStorage();
  installed.push(storage);
  const initial = {
    ...proposal(),
    confirmations: [{
      ownerAddress: "0x1111111111111111111111111111111111111111" as const,
      accountId: "owner",
      accountType: "privateKey" as const,
      signature: `0x${"11".repeat(65)}` as `0x${string}`,
      createdAt: Date.now(),
    }],
    route: { kind: "erc5792" as const, bundleId: "bundle-safe", origin: "https://app.example" },
  };
  assert.equal(storage.local["batchTxAck:bundle-safe"], undefined);
  await authorizeSafeProposalRoute(initial);
  assert.deepEqual((storage.local["batchTxAck:bundle-safe"] as any).result, {
    success: true,
    id: "bundle-safe",
  });
  assert.equal((storage.local.bundleStatuses as any[])[0].status, 100);
});

test("unsigned Safe requests cancel locally and reject their waiting provider route", async () => {
  const storage = installNativeSessionStorage();
  installed.push(storage);
  const initial = {
    ...proposal(),
    route: {
      kind: "injected" as const,
      requestId: "request-1",
      origin: "https://app.example",
    },
  };
  await createSafeProposal(initial);

  const cancelled = await cancelSafeProposal(initial.id);
  assert.equal(cancelled.state, "cancelled");
  assert.deepEqual((storage.local["txResult:request-1"] as any).result, {
    success: false,
    error: "Safe proposal request rejected",
    code: 4001,
  });
});

test("cancel revalidates the durable record against an in-flight approval", async () => {
  installed.push(installNativeSessionStorage());
  const initial = proposal();
  await createSafeProposal(initial);
  const claimed = await claimSafeProposalEffect(initial.id, {
    kind: "approve",
    ownerAddress: "0x1111111111111111111111111111111111111111",
  });

  await assert.rejects(
    () => cancelSafeProposal(initial.id),
    /already in progress/,
  );
  assert.equal((await getSafeProposal(initial.id))?.effectClaim?.claimId, claimed.effectClaim?.claimId);
});

test("worker restart recovery distinguishes retryable and ambiguous Safe effects", async () => {
  installed.push(installNativeSessionStorage());
  const approval = proposal();
  await createSafeProposal(approval);
  await claimSafeProposalEffect(approval.id, { kind: "approve" });
  const recoveredApproval = await recoverInterruptedSafeProposalEffects({ now: Date.now() + 1 });
  assert.equal(recoveredApproval[0]?.state, "draft");
  assert.equal(recoveredApproval[0]?.effectClaim, undefined);

  const publishBase = {
    ...proposal(),
    state: "approvedLocally" as const,
    confirmations: [{
      ownerAddress: "0x1111111111111111111111111111111111111111" as const,
      accountId: "owner",
      accountType: "privateKey" as const,
      signature: `0x${"11".repeat(65)}` as `0x${string}`,
      createdAt: Date.now(),
    }],
  };
  // Keep a distinct valid identity by changing the transaction, not its hash.
  const rejectionBuilt = buildSafeRejectionTransaction({
    chainId: publishBase.chainId,
    safeAddress: publishBase.safeAddress,
    safeVersion: publishBase.safeVersion,
    nonce: 2n,
  });
  const publishRecord = {
    ...publishBase,
    id: `${publishBase.chainId}:${publishBase.safeAddress}:${rejectionBuilt.safeTxHash}`,
    safeTxHash: rejectionBuilt.safeTxHash,
    calls: rejectionBuilt.calls,
    transaction: rejectionBuilt.transaction,
  };
  await createSafeProposal(publishRecord);
  await claimSafeProposalEffect(publishRecord.id, { kind: "publish" });
  const recoveredPublication = await recoverInterruptedSafeProposalEffects({ now: Date.now() + 2 });
  const publication = recoveredPublication.find((item) => item.id === publishRecord.id);
  assert.equal(publication?.state, "ambiguous");
  assert.equal(publication?.confirmations.length, 1);

  const executionBuilt = buildSafeRejectionTransaction({
    chainId: publishBase.chainId,
    safeAddress: publishBase.safeAddress,
    safeVersion: publishBase.safeVersion,
    nonce: 3n,
  });
  const execution = {
    ...publishBase,
    id: `${publishBase.chainId}:${publishBase.safeAddress}:${executionBuilt.safeTxHash}`,
    safeTxHash: executionBuilt.safeTxHash,
    calls: executionBuilt.calls,
    transaction: executionBuilt.transaction,
    state: "readyToExecute" as const,
  };
  await createSafeProposal(execution);
  const executionClaim = await claimSafeProposalEffect(execution.id, { kind: "execute" });
  await updateSafeProposal(execution.id, (record) => ({
    ...record,
    state: "ambiguous",
    transactionHash: `0x${"44".repeat(32)}`,
    serializedExecution: "0x1234",
    executionPreparedAt: Date.now(),
  }));
  const recoveredExecution = await recoverInterruptedSafeProposalEffects({ now: Date.now() + 3 });
  const prepared = recoveredExecution.find((item) => item.id === execution.id);
  assert.equal(prepared?.state, "ambiguous");
  assert.equal(prepared?.transactionHash, `0x${"44".repeat(32)}`);
  assert.equal(prepared?.serializedExecution, "0x1234");
  assert.notEqual(executionClaim.effectClaim, undefined);
});

test("cancelled Safe route results are replayed after a worker interruption", async () => {
  const storage = installNativeSessionStorage();
  installed.push(storage);
  const initial = {
    ...proposal(),
    route: { kind: "injected" as const, requestId: "replay-request" },
  };
  await createSafeProposal(initial);
  await cancelSafeProposal(initial.id);
  delete storage.local["txResult:replay-request"];

  await replayCancelledSafeProposalRoutes();

  assert.deepEqual((storage.local["txResult:replay-request"] as any).result, {
    success: false,
    error: "Safe proposal request rejected",
    code: 4001,
  });
});

test("a signed Safe proposal cannot be represented as locally cancelled", async () => {
  installed.push(installNativeSessionStorage());
  const initial = {
    ...proposal(),
    state: "approvedLocally" as const,
    confirmations: [{
      ownerAddress: "0x1111111111111111111111111111111111111111" as const,
      accountId: "owner",
      accountType: "privateKey" as const,
      signature: `0x${"11".repeat(65)}` as `0x${string}`,
      createdAt: Date.now(),
    }],
  };
  await createSafeProposal(initial);

  await assert.rejects(
    () => cancelSafeProposal(initial.id),
    /require an onchain rejection transaction/,
  );
  assert.equal((await getSafeProposal(initial.id))?.state, "approvedLocally");
});
