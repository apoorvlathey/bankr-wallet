import assert from "node:assert/strict";
import test from "node:test";

import {
  feePaymentCrossDappCalls,
  getCrossDappFeePaymentRequestId,
} from "../../src/chrome/feePayment/crossDappRequest";
import {
  createCrossDappBatchResultRoute,
  parseCrossDappBatchResultRoute,
} from "../../src/chrome/crossDappBatch/resultRoute";

const WALLET = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";

function entry(
  txId: string,
  source?:
    | { kind: "eth_sendTransaction" }
    | { kind: "wallet_sendCalls"; bundleId: string; callIndex: number; totalCalls: number }
    | { kind: "walletGenerated"; parentTxId: string; reason: "approvalRevoke" },
) {
  return {
    txId,
    tx: {
      from: WALLET,
      to: TARGET,
      value: "0x2",
      data: "0x1234",
      chainId: 8453,
    },
    origin: "https://app.example",
    favicon: null,
    addedAt: 1,
    source,
  };
}

test("cross-dapp fee calls preserve the exact reviewed order and values", () => {
  const calls = feePaymentCrossDappCalls({
    entries: [
      entry("tx-1"),
      { ...entry("tx-2"), tx: { ...entry("tx-2").tx, value: "0x0", data: "0xabcd" } },
    ],
  });
  assert.deepEqual(calls, [
    { to: TARGET, value: 2n, data: "0x1234" },
    { to: TARGET, value: 0n, data: "0xabcd" },
  ]);
  assert.equal(
    getCrossDappFeePaymentRequestId({ createdAt: 123 }),
    "cross-dapp-batch-123",
  );
});

test("cross-dapp fee calls reject deployments and malformed calldata", () => {
  assert.throws(
    () => feePaymentCrossDappCalls({
      entries: [{ ...entry("tx-1"), tx: { ...entry("tx-1").tx, to: undefined } }],
    }),
    /contract deployment/,
  );
  assert.throws(
    () => feePaymentCrossDappCalls({
      entries: [{ ...entry("tx-1"), tx: { ...entry("tx-1").tx, data: "0x1" } }],
    }),
    /invalid calldata/,
  );
});

test("result routes deduplicate bundles and omit wallet-generated calls", () => {
  const route = createCrossDappBatchResultRoute({
    entries: [
      entry("tx-1", { kind: "eth_sendTransaction" }),
      entry("batch-call-1", {
        kind: "wallet_sendCalls",
        bundleId: "bundle-1",
        callIndex: 0,
        totalCalls: 2,
      }),
      entry("batch-call-2", {
        kind: "wallet_sendCalls",
        bundleId: "bundle-1",
        callIndex: 1,
        totalCalls: 2,
      }),
      entry("cleanup", {
        kind: "walletGenerated",
        parentTxId: "tx-1",
        reason: "approvalRevoke",
      }),
    ],
  });
  assert.deepEqual(route, {
    transactionIds: ["tx-1"],
    bundleIds: ["bundle-1"],
  });
  assert.equal(parseCrossDappBatchResultRoute({
    transactionIds: ["x".repeat(129)],
    bundleIds: [],
  }), null);
});
