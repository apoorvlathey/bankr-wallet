import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLatestNonce,
  parseReplacementSourceTransaction,
  recommendReplacementFees,
} from "../../src/chrome/transactions/replacementPolicy";
import {
  replacementFeeMinimums,
  replacementGasSelectionError,
} from "../../src/lib/transactionReplacement";

const from = "0x1111111111111111111111111111111111111111";
const to = "0x2222222222222222222222222222222222222222";
const hash = `0x${"ab".repeat(32)}`;
const raw = {
  hash,
  from,
  to,
  input: "0x1234",
  value: "0x2a",
  chainId: "0x2105",
  nonce: "0x7",
  gas: "0x5208",
  maxFeePerGas: "0x64",
  maxPriorityFeePerGas: "0xa",
  gasPrice: "0x50",
  type: "0x2",
  blockHash: null,
  blockNumber: null,
};

test("replacement fees clear a 10% txpool bump with conservative max-fee headroom", () => {
  assert.deepEqual(
    replacementFeeMinimums({ maxFeePerGas: 100n, maxPriorityFeePerGas: 10n }),
    { maxFeePerGas: 130n, maxPriorityFeePerGas: 12n },
  );
  const source = parseReplacementSourceTransaction(raw, {
    txHash: hash,
    from,
    chainId: 8453,
  });
  assert.deepEqual(recommendReplacementFees(source, {
    fastMaxFeePerGas: "150",
    fastMaxPriorityFeePerGas: "15",
    predictedNextBaseFee: "100",
  }), {
    minimumMaxFeePerGas: "130",
    minimumMaxPriorityFeePerGas: "12",
    maxFeePerGas: "215",
    maxPriorityFeePerGas: "15",
  });
});

test("pending RPC projection preserves exact intent and rejects mined or type-4 records", () => {
  assert.deepEqual(
    parseReplacementSourceTransaction(raw, { txHash: hash, from, chainId: 8453 }),
    {
      from,
      to,
      data: "0x1234",
      value: "0x2a",
      chainId: 8453,
      nonce: 7,
      gas: "0x5208",
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 10n,
      gasPrice: 80n,
    },
  );
  assert.throws(
    () => parseReplacementSourceTransaction(
      { ...raw, blockNumber: "0x1" },
      { txHash: hash, from, chainId: 8453 },
    ),
    /already included/i,
  );
  assert.throws(
    () => parseReplacementSourceTransaction(
      { ...raw, type: "0x4", authorizationList: [] },
      { txHash: hash, from, chainId: 8453 },
    ),
    /cannot be replaced safely/i,
  );
  assert.throws(
    () => parseReplacementSourceTransaction(
      { ...raw, type: "0x1", accessList: [] },
      { txHash: hash, from, chainId: 8453 },
    ),
    /cannot be replaced safely/i,
  );
  assert.throws(
    () => parseReplacementSourceTransaction(
      { ...raw, accessList: [{ address: from, storageKeys: [] }] },
      { txHash: hash, from, chainId: 8453 },
    ),
    /cannot be replaced safely/i,
  );
  assert.equal(parseLatestNonce("0x7"), 7);
});

test("reviewed replacement fees cannot be lowered below the replacement floor", () => {
  const minimums = {
    minimumMaxFeePerGas: "130",
    minimumMaxPriorityFeePerGas: "12",
  };
  assert.equal(replacementGasSelectionError(minimums, {
    gasLimit: "21000",
    maxFeePerGas: "130",
    maxPriorityFeePerGas: "12",
  }), null);
  assert.match(replacementGasSelectionError(minimums, {
    gasLimit: "21000",
    maxFeePerGas: "129",
    maxPriorityFeePerGas: "12",
  })!, /max fee/i);
  assert.match(replacementGasSelectionError(minimums, null)!, /required/i);
});
