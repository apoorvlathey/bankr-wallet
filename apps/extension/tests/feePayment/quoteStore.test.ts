import assert from "node:assert/strict";
import test from "node:test";

import {
  FeePaymentQuoteStore,
  feePaymentSafeExecutionCalls,
  fingerprintFeePaymentCalls,
  type PreparedFeePaymentQuote,
} from "../../src/chrome/feePayment/quotes";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";
const calls = [{ to: TARGET, value: 1n, data: "0x1234" }] as const;

function quote(overrides: Partial<PreparedFeePaymentQuote> = {}) {
  return {
    id: "quote-1",
    family: "transaction",
    requestId: "tx-1",
    accountId: "account-1",
    accountAddress: ACCOUNT,
    chainId: 8453,
    fingerprint: fingerprintFeePaymentCalls(calls),
    token: {
      kind: "erc20",
      id: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      stablecoin: true,
      maximumGasCost: 100_000_000n,
    },
    prepared: {} as PreparedFeePaymentQuote["prepared"],
    needsAuthorization: false,
    eoaNonce: null,
    expiresAt: 2_000,
    ...overrides,
  } satisfies PreparedFeePaymentQuote;
}

function consume(store: FeePaymentQuoteStore, overrides: Record<string, unknown> = {}) {
  return store.consume({
    quoteId: "quote-1",
    family: "transaction",
    requestId: "tx-1",
    accountId: "account-1",
    accountAddress: ACCOUNT,
    calls: [...calls],
    ...overrides,
  } as Parameters<FeePaymentQuoteStore["consume"]>[0]);
}

test("a request-pinned quote is single use", () => {
  const store = new FeePaymentQuoteStore(30, () => 1_000);
  store.put(quote());
  assert.equal(consume(store).id, "quote-1");
  assert.throws(() => consume(store), /expired or no longer matches/);
});

test("an account, request, family, or call substitution consumes and rejects the quote", () => {
  for (const mismatch of [
    { accountId: "account-2" },
    { requestId: "tx-2" },
    { family: "batchTransaction" },
    { calls: [{ to: TARGET, value: 2n, data: "0x1234" }] },
  ]) {
    const store = new FeePaymentQuoteStore(30, () => 1_000);
    store.put(quote());
    assert.throws(() => consume(store, mismatch), /expired or no longer matches/);
    assert.throws(() => consume(store), /expired or no longer matches/);
  }
});

test("expired quotes fail closed", () => {
  const store = new FeePaymentQuoteStore(30, () => 2_000);
  store.put(quote());
  assert.throws(() => consume(store), /expired or no longer matches/);
});

test("Safe execution quotes remain pinned to their request family and executor", () => {
  const store = new FeePaymentQuoteStore(30, () => 1_000);
  store.put(quote({ family: "safeExecution", requestId: "safe-proposal" }));
  assert.equal(consume(store, {
    family: "safeExecution",
    requestId: "safe-proposal",
  }).family, "safeExecution");
});

test("Safe fee quotes fingerprint only the exact outer execTransaction call", () => {
  const safe = "0x3333333333333333333333333333333333333333";
  assert.deepEqual(feePaymentSafeExecutionCalls({
    safeAddress: safe,
    executionData: "0x6a761202",
  }), [{
    to: safe,
    value: 0n,
    data: "0x6a761202",
  }]);
  assert.throws(() => feePaymentSafeExecutionCalls({
    safeAddress: "0x1234",
    executionData: "0x6a761202",
  }), /Invalid Safe execution request/);
});
