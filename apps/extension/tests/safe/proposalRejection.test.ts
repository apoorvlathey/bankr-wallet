import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  settleCompetingSafeProposals,
  terminalizeReplacedSafeRoute,
} from "../../src/chrome/safe/execution";
import { BUNDLE_STATUS } from "../../src/chrome/erc5792Types";
import {
  buildSafeRejectionTransaction,
  buildSafeTransaction,
} from "../../src/chrome/safe/transactionBuilder";
import {
  createSafeProposal,
  getSafeProposal,
} from "../../src/chrome/safe/proposalRepository";
import type { SafeProposalRecord } from "../../src/chrome/safe/types";
import { installNativeSessionStorage } from "../session/testStorage";

const installed: Array<ReturnType<typeof installNativeSessionStorage>> = [];
afterEach(() => installed.pop()?.restore());

function proposal(route: SafeProposalRecord["route"]): SafeProposalRecord {
  return {
    version: 1,
    id: `8453:0x1111111111111111111111111111111111111111:0x${"22".repeat(32)}`,
    chainId: 8453,
    safeAccountId: "safe-account",
    safeAddress: "0x1111111111111111111111111111111111111111",
    safeTxHash: `0x${"22".repeat(32)}`,
    safeVersion: "1.4.1",
    safeConfigEpoch: `0x${"33".repeat(32)}`,
    verifiedAtBlock: "1",
    calls: [{
      to: "0x4444444444444444444444444444444444444444",
      value: "0",
      data: "0x",
      operation: 0,
    }],
    transaction: {
      to: "0x4444444444444444444444444444444444444444",
      value: "0",
      data: "0x",
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce: 1,
    },
    state: "readyToExecute",
    confirmations: [],
    route,
    createdAt: 1,
    updatedAt: 1,
  };
}

test("onchain Safe rejection returns an error to a waiting transaction route", async () => {
  const storage = installNativeSessionStorage();
  installed.push(storage);

  await terminalizeReplacedSafeRoute(
    proposal({ kind: "walletConnect", requestId: "request-1", topic: "topic-1" }),
    "Safe transaction rejected onchain",
  );

  assert.deepEqual((storage.local["txResult:request-1"] as any).result, {
    success: false,
    error: "Safe transaction rejected onchain",
    code: 4001,
  });
});

test("onchain Safe rejection terminalizes an acknowledged ERC-5792 bundle", async () => {
  const storage = installNativeSessionStorage({
    local: {
      bundleStatuses: [{
        id: "bundle-1",
        chainId: 8453,
        status: BUNDLE_STATUS.PENDING,
        atomic: true,
        createdAt: 1,
      }],
    },
  });
  installed.push(storage);

  await terminalizeReplacedSafeRoute(
    proposal({ kind: "erc5792", bundleId: "bundle-1" }),
    "Safe transaction rejected onchain",
  );

  const [status] = storage.local.bundleStatuses as any[];
  assert.equal(status.status, BUNDLE_STATUS.OFFCHAIN_FAILURE);
  assert.equal(status.error, "Safe transaction rejected onchain");
  assert.ok(status.completedAt > 0);
});

test("the original becomes cancelled only when the rejection wins its Safe nonce", async () => {
  const storage = installNativeSessionStorage();
  installed.push(storage);
  const safeAddress = "0x1111111111111111111111111111111111111111" as const;
  const originalBuilt = buildSafeTransaction({
    chainId: 8453,
    safeAddress,
    safeVersion: "1.4.1",
    nonce: 1n,
    calls: [{
      to: "0x4444444444444444444444444444444444444444",
      value: "1",
      data: "0x",
      operation: 0,
    }],
  });
  const rejectionBuilt = buildSafeRejectionTransaction({
    chainId: 8453,
    safeAddress,
    safeVersion: "1.4.1",
    nonce: 1n,
  });
  const base = {
    version: 1 as const,
    chainId: 8453,
    safeAccountId: "safe-account",
    safeAddress,
    safeVersion: "1.4.1" as const,
    safeConfigEpoch: `0x${"33".repeat(32)}`,
    verifiedAtBlock: "1" as const,
    confirmations: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const original = await createSafeProposal({
    ...base,
    id: `8453:${safeAddress}:${originalBuilt.safeTxHash}`,
    safeTxHash: originalBuilt.safeTxHash,
    calls: originalBuilt.calls,
    transaction: originalBuilt.transaction,
    state: "readyToExecute",
    route: { kind: "injected", requestId: "request-2" },
  });
  const rejection = await createSafeProposal({
    ...base,
    id: `8453:${safeAddress}:${rejectionBuilt.safeTxHash}`,
    safeTxHash: rejectionBuilt.safeTxHash,
    calls: rejectionBuilt.calls,
    transaction: rejectionBuilt.transaction,
    state: "executed",
    route: { kind: "wallet", origin: "WalletChan" },
    purpose: "rejection",
  });

  assert.equal((await getSafeProposal(original.id))?.state, "readyToExecute");
  await settleCompetingSafeProposals(rejection);

  const cancelled = await getSafeProposal(original.id);
  assert.equal(cancelled?.state, "cancelled");
  assert.equal(cancelled?.rejectedBySafeTxHash, rejection.safeTxHash);
  assert.deepEqual((storage.local["txResult:request-2"] as any).result, {
    success: false,
    error: "Safe transaction rejected onchain",
    code: 4001,
  });
});
