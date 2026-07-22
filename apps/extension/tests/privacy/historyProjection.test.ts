import assert from "node:assert/strict";
import test from "node:test";
import { toHex } from "viem";

import type { CompletedTransaction } from "../../src/chrome/txHistoryStorage";
import { buildPrivacyShieldHistoryProjection } from "../../src/chrome/privacy/operations/historyProjection";
import type { StoredPrivacyShieldOperationV1 } from "../../src/chrome/privacy/operations/types";

const operationId = "11111111-1111-4111-8111-111111111111";
const account = `0x${"22".repeat(20)}` as `0x${string}`;
const entrypoint = `0x${"33".repeat(20)}` as `0x${string}`;

const operation = {
  summary: {
    schema: "walletchan-privacy-shield-operation-v1",
    id: operationId,
    requestId: "22222222-2222-4222-8222-222222222222",
    revision: 0,
    state: "awaiting_wallet_confirmation",
    createdAt: 1,
    updatedAt: 1,
    chainId: 11_155_111,
    accountId: "account-1",
    accountAddress: account,
    accountType: "privateKey",
    amountWei: "3000000000000000",
    protocolFeeWei: "30000000000000",
    shieldedAmountWei: "2970000000000000",
    gasReserveWei: "100000000000000",
    totalRequiredWei: "3100000000000000",
    destinationAddress: entrypoint,
    poolAddress: `0x${"44".repeat(20)}`,
    dedupeKey: "dedupe",
  },
  keyId: "key",
  encryptedDetails: {
    version: 1,
    scheme: "privacy-operation-key",
    ciphertext: "ciphertext",
    iv: "iv",
  },
  tracking: {
    version: 1,
    revision: 4,
    state: "awaiting_asp",
    updatedAt: 20,
    txHash: null,
    blockNumber: "10",
    commitment: "secret-never-projected",
    label: "secret-never-projected",
    poolValueWei: "2970000000000000",
    errorCode: null,
  },
} satisfies StoredPrivacyShieldOperationV1;

const history: CompletedTransaction = {
  id: operationId,
  status: "success",
  tx: {
    from: account,
    to: entrypoint,
    value: toHex(3_000_000_000_000_000n),
    chainId: 11_155_111,
  },
  origin: "WalletChan Shield",
  favicon: null,
  chainName: "Sepolia",
  chainId: 11_155_111,
  createdAt: 1,
  accountId: "account-1",
  accountType: "privateKey",
};

test("Shield history projection exposes only bounded public lifecycle fields", () => {
  const projection = buildPrivacyShieldHistoryProjection(history, operation);
  assert.deepEqual(projection, {
    version: 1,
    operationId,
    state: "awaiting_asp",
    updatedAt: 20,
    amountWei: "3000000000000000",
    shieldedAmountWei: "2970000000000000",
  });
  assert.deepEqual(Object.keys(projection!).sort(), [
    "amountWei",
    "operationId",
    "shieldedAmountWei",
    "state",
    "updatedAt",
    "version",
  ]);
});

test("Shield history projection rejects any transaction binding mismatch", () => {
  assert.equal(
    buildPrivacyShieldHistoryProjection(
      { ...history, origin: "https://example.com" },
      operation,
    ),
    null,
  );
  assert.equal(
    buildPrivacyShieldHistoryProjection(
      { ...history, tx: { ...history.tx, value: "0x1" } },
      operation,
    ),
    null,
  );
  assert.equal(
    buildPrivacyShieldHistoryProjection(
      { ...history, accountId: "other-account" },
      operation,
    ),
    null,
  );
});
