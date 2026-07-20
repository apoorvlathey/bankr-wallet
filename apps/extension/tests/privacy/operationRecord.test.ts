import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { generateVaultKey, importVaultKey } from "../../src/chrome/crypto";
import type { PendingTxRequest } from "../../src/chrome/requests/pendingTxStorage";
import {
  decryptPrivacyShieldOperationDetails,
  encryptPrivacyShieldOperationDetails,
} from "../../src/chrome/privacy/operations/crypto";
import {
  createPrivacyShieldOperationIntent,
  decodePrivacyShieldOperationIntent,
} from "../../src/chrome/privacy/operations/intent";
import {
  newestActivePrivacyShieldOperation,
} from "../../src/chrome/privacy/operations/repository";
import { isRejectedPrivacyShieldOperation } from "../../src/chrome/privacy/operations/rejectionRepository";
import { cleanupRejectedPrivacyShieldOperations } from "../../src/chrome/privacy/operations/rejectionLifecycle";
import {
  defaultPrivacyShieldOperationTracking,
  isValidStoredPrivacyShieldOperation,
  privacyShieldOperationDedupeKey,
  type PrivacyShieldOperationDetailsV1,
  type PrivacyShieldOperationSummaryV1,
  type StoredPrivacyShieldOperationV1,
} from "../../src/chrome/privacy/operations/types";

const OPERATION_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "00000000-0000-4000-8000-000000000002";
const ADDRESS = "0x1111111111111111111111111111111111111111" as const;

function summary(): PrivacyShieldOperationSummaryV1 {
  return {
    schema: "walletchan-privacy-shield-operation-v1",
    id: OPERATION_ID,
    requestId: REQUEST_ID,
    revision: 0,
    state: "awaiting_wallet_confirmation",
    createdAt: 1,
    updatedAt: 1,
    chainId: 11_155_111,
    accountId: "pk-1",
    accountAddress: ADDRESS,
    accountType: "privateKey",
    amountWei: "100000000000000000",
    protocolFeeWei: "1000000000000000",
    shieldedAmountWei: "99000000000000000",
    gasReserveWei: "200000000000000",
    totalRequiredWei: "100200000000000000",
    destinationAddress: "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
    poolAddress: "0x644d5A2554d36e27509254F32ccfeBe8cd58861f",
    dedupeKey: privacyShieldOperationDedupeKey({
      chainId: 11_155_111,
      accountId: "pk-1",
      amountWei: "100000000000000000",
    }),
  };
}

test("durable operation intent remains non-submittable and independently decoded", () => {
  const intent = createPrivacyShieldOperationIntent({
    operationId: OPERATION_ID,
    depositIndex: 7,
    sourceAddress: ADDRESS,
    valueWei: 100_000_000_000_000_000n,
    precommitment: 123_456_789n,
  });
  const decoded = decodePrivacyShieldOperationIntent(intent);
  assert.equal(intent.kind, "privacy-shield-operation-intent");
  assert.equal(intent.submittable, false);
  assert.equal(decoded.operationId, OPERATION_ID);
  assert.equal(decoded.depositIndex, 7);
  assert.equal(decoded.precommitment, 123_456_789n);
  assert.throws(() =>
    createPrivacyShieldOperationIntent({
      operationId: OPERATION_ID,
      depositIndex: 0xffff_ffff,
      sourceAddress: ADDRESS,
      valueWei: 100_000_000_000_000_000n,
      precommitment: 123_456_789n,
    }),
  );
});

test("operation details encrypt with summary-bound AAD", async () => {
  const key = await importVaultKey(generateVaultKey());
  const operationSummary = summary();
  const details: PrivacyShieldOperationDetailsV1 = {
    version: 1,
    operationId: OPERATION_ID,
    depositIndex: "7",
    precommitment: "123456789",
    callData: `0xb6b55f25${123_456_789n.toString(16).padStart(64, "0")}`,
  };
  const encryptedDetails = await encryptPrivacyShieldOperationDetails(
    key,
    "privacy-key-1",
    operationSummary,
    details,
  );
  const stored = {
    summary: operationSummary,
    keyId: "privacy-key-1",
    encryptedDetails,
  };
  assert.equal(isValidStoredPrivacyShieldOperation(stored), true);
  assert.deepEqual(
    await decryptPrivacyShieldOperationDetails(
      key,
      stored.keyId,
      stored.summary,
      stored.encryptedDetails,
    ),
    details,
  );

  const changed = { ...operationSummary, amountWei: "200000000000000000" };
  assert.equal(
    await decryptPrivacyShieldOperationDetails(
      key,
      stored.keyId,
      changed as PrivacyShieldOperationSummaryV1,
      stored.encryptedDetails,
    ),
    null,
  );
});

test("terminal Shield records do not dedupe a fresh intent for the same amount", async () => {
  const key = await importVaultKey(generateVaultKey());
  const operationSummary = summary();
  const details: PrivacyShieldOperationDetailsV1 = {
    version: 1,
    operationId: OPERATION_ID,
    depositIndex: "7",
    precommitment: "123456789",
    callData: `0xb6b55f25${123_456_789n.toString(16).padStart(64, "0")}`,
  };
  const encryptedDetails = await encryptPrivacyShieldOperationDetails(
    key,
    "privacy-key-1",
    operationSummary,
    details,
  );
  const base: StoredPrivacyShieldOperationV1 = {
    summary: operationSummary,
    keyId: "privacy-key-1",
    encryptedDetails,
    tracking: defaultPrivacyShieldOperationTracking(operationSummary),
  };
  const initialTracking = defaultPrivacyShieldOperationTracking(operationSummary);
  const rejected: StoredPrivacyShieldOperationV1 = {
    ...base,
    tracking: {
      ...initialTracking,
      revision: 1,
      state: "wallet_rejected",
      updatedAt: 2,
      errorCode: "wallet-rejected",
    },
  };

  assert.equal(newestActivePrivacyShieldOperation([rejected]), null);
  assert.equal(isRejectedPrivacyShieldOperation(rejected), true);
  assert.equal(isRejectedPrivacyShieldOperation(base), false);

  const activeSummary = {
    ...operationSummary,
    id: "00000000-0000-4000-8000-000000000003",
    requestId: "00000000-0000-4000-8000-000000000004",
    createdAt: 3,
    updatedAt: 3,
  };
  const active: StoredPrivacyShieldOperationV1 = {
    ...base,
    summary: activeSummary,
    tracking: defaultPrivacyShieldOperationTracking(activeSummary),
  };
  assert.equal(
    newestActivePrivacyShieldOperation([rejected, active])?.summary.id,
    active.summary.id,
  );
});

test("Shield rejection removes pending state before deleting encrypted operation data", async () => {
  const requestActions = await readFile(
    new URL("../../src/chrome/transactions/requestActions.ts", import.meta.url),
    "utf8",
  );
  const rejection = requestActions.indexOf(
    "await recordPrivacyShieldWalletRejected(pending)",
  );
  const pendingRemoval = requestActions.indexOf(
    "await removePendingTxRequest(txId)",
  );
  const operationDeletion = requestActions.indexOf(
    "await discardRejectedPrivacyShieldOperation(pending)",
  );
  assert.ok(rejection >= 0 && rejection < pendingRemoval);
  assert.ok(pendingRemoval < operationDeletion);

  const rejectionRepository = await readFile(
    new URL(
      "../../src/chrome/privacy/operations/rejectionRepository.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const deleteStart = rejectionRepository.indexOf(
    "export async function deleteRejectedPrivacyShieldOperation",
  );
  const deleteEnd = rejectionRepository.indexOf(
    "export async function deleteRejectedPrivacyShieldOperations",
  );
  const deleteSource = rejectionRepository.slice(deleteStart, deleteEnd);
  assert.match(deleteSource, /store\.delete\(operationId\)/);
  assert.doesNotMatch(deleteSource, /PRIVACY_OPERATIONS_METADATA_STORE/);
});

test("startup finishes an interrupted Shield rejection before pruning it", async () => {
  const operationSummary = summary();
  const tracking = defaultPrivacyShieldOperationTracking(operationSummary);
  const rejected = {
    summary: operationSummary,
    keyId: "privacy-key-1",
    encryptedDetails: {
      version: 1 as const,
      scheme: "privacy-operation-key" as const,
      ciphertext: "unused-by-cleanup",
      iv: "unused-by-cleanup",
    },
    tracking: {
      ...tracking,
      revision: 1,
      state: "wallet_rejected" as const,
      updatedAt: 2,
      errorCode: "wallet-rejected" as const,
    },
  } satisfies StoredPrivacyShieldOperationV1;
  const events: string[] = [];
  const remaining = await cleanupRejectedPrivacyShieldOperations([rejected], {
    getPending: async () => [{
      id: OPERATION_ID,
      privacyShieldMeta: { version: 1, operationId: OPERATION_ID },
    } as PendingTxRequest],
    removePending: async (id) => {
      events.push(`pending:${id}`);
    },
    deleteRejectedBatch: async (ids) => {
      events.push(`operations:${ids.join(",")}`);
      return ids.length;
    },
  });

  assert.deepEqual(events, [
    `pending:${OPERATION_ID}`,
    `operations:${OPERATION_ID}`,
  ]);
  assert.deepEqual(remaining, []);
});
