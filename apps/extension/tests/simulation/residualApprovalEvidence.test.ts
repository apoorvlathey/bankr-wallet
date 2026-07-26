import assert from "node:assert/strict";
import test from "node:test";

import {
  registerResidualApprovalEvidence,
  resetApprovalCleanupEvidenceForTests,
  resolveApprovalCleanupEvidence,
} from "../../src/chrome/approvalCleanup/evidenceRegistry";
import { resolveResidualApprovalRequest } from "../../src/chrome/approvalCleanup/requestResolver";

const OWNER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";

function installPendingTransaction(data = "0x1234") {
  const values: Record<string, unknown> = {
    pendingTxRequests: [{
      id: "tx-1",
      tx: {
        from: OWNER,
        to: SPENDER,
        value: "0x0",
        data,
        chainId: 8453,
      },
      origin: "https://dapp.example",
      favicon: null,
      chainName: "Base",
      timestamp: 1,
      accountId: "account-1",
      accountAddress: OWNER,
      accountType: "privateKey",
    }],
  };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: values[key] }),
      },
    },
  } as unknown as typeof chrome;
  return values;
}

test("opaque cleanup evidence is bound to the exact pending request fingerprint", async () => {
  const values = installPendingTransaction();
  resetApprovalCleanupEvidenceForTests();
  const ref = { family: "transaction" as const, requestId: "tx-1" };
  const request = await resolveResidualApprovalRequest(ref);
  const detection = registerResidualApprovalEvidence({
    request,
    approvals: [{
      system: "erc20",
      tokenAddress: TOKEN,
      owner: OWNER,
      spender: SPENDER,
      previousAmount: "25",
      remainingAmount: "15",
      sourceCallIndex: 0,
      evidence: "transferFromTrace",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    }],
    approvalDetectionIncomplete: false,
    metadataComplete: true,
  });
  const approval = detection.residualApprovals[0];

  assert.deepEqual(
    await resolveApprovalCleanupEvidence({
      ref,
      detectionId: detection.detectionId,
      evidenceIds: [approval.evidenceId],
    }),
    [{
      tokenAddress: TOKEN,
      spender: SPENDER,
      sourceCallIndex: 0,
    }],
  );

  (values.pendingTxRequests as any[])[0].tx.data = "0x5678";
  await assert.rejects(
    resolveApprovalCleanupEvidence({
      ref,
      detectionId: detection.detectionId,
      evidenceIds: [approval.evidenceId],
    }),
    /stale/,
  );
});

test("unknown, duplicate, and cross-request evidence fails closed", async () => {
  installPendingTransaction();
  resetApprovalCleanupEvidenceForTests();
  await assert.rejects(
    resolveApprovalCleanupEvidence({
      ref: { family: "transaction", requestId: "tx-1" },
      detectionId: "missing",
      evidenceIds: ["missing"],
    }),
    /stale/,
  );
  await assert.rejects(
    resolveApprovalCleanupEvidence({
      ref: { family: "transaction", requestId: "tx-1" },
      detectionId: "missing",
      evidenceIds: ["same", "same"],
    }),
    /Invalid/,
  );
});

test("batch and cross-dapp request identities resolve their individual call targets", async () => {
  const values: Record<string, unknown> = {
    pendingBatchTxRequests: [{
      id: "bundle-1",
      params: {
        from: OWNER,
        calls: [
          { to: TOKEN, data: "0x01", value: "0x0" },
          { to: SPENDER, data: "0x02", value: "0x0" },
        ],
      },
      origin: "https://dapp.example",
      favicon: null,
      chainName: "Base",
      chainId: 8453,
      timestamp: 1,
      accountId: "account-1",
      accountAddress: OWNER,
      accountType: "privateKey",
    }],
    crossDappBatch: {
      fromAddress: OWNER,
      chainId: 8453,
      chainName: "Base",
      accountType: "privateKey",
      accountId: "account-1",
      createdAt: 1,
      entries: [
        {
          txId: "tx-a",
          tx: {
            from: OWNER,
            to: TOKEN,
            data: "0x03",
            value: "0x0",
            chainId: 8453,
          },
          origin: "https://a.example",
          favicon: null,
          addedAt: 1,
        },
        {
          txId: "tx-b",
          tx: {
            from: OWNER,
            to: SPENDER,
            data: "0x04",
            value: "0x0",
            chainId: 8453,
          },
          origin: "https://b.example",
          favicon: null,
          addedAt: 2,
        },
      ],
    },
  };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: values[key] }),
      },
    },
  } as unknown as typeof chrome;

  const batch = await resolveResidualApprovalRequest({
    family: "batchTransaction",
    requestId: "bundle-1",
  });
  const cross = await resolveResidualApprovalRequest({
    family: "crossDappBatch",
    requestId: "active",
  });
  assert.deepEqual(batch.calls.map((call) => call.to), [
    TOKEN,
    SPENDER,
  ]);
  assert.deepEqual(cross.calls.map((call) => call.to), [
    TOKEN,
    SPENDER,
  ]);
  assert.notEqual(batch.fingerprint, cross.fingerprint);
});
