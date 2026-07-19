import assert from "node:assert/strict";
import test from "node:test";

import { assertFeePaymentQuoteChainState } from "../../src/chrome/feePayment/quoteValidation";
import type { PreparedFeePaymentQuote } from "../../src/chrome/feePayment/quotes";
import { assertNoPendingEoaNonceRace } from "../../src/chrome/feePayment/chainState";

function quote(needsAuthorization: boolean): PreparedFeePaymentQuote {
  return {
    id: "quote",
    family: "transaction",
    requestId: "tx",
    accountId: "account",
    accountAddress: "0x1111111111111111111111111111111111111111",
    chainId: 8453,
    fingerprint: "[]",
    token: {
      kind: "erc20",
      id: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      stablecoin: true,
      maximumGasCost: 100_000_000n,
    },
    prepared: {
      userOperation: { nonce: "0x7" },
    } as PreparedFeePaymentQuote["prepared"],
    needsAuthorization,
    eoaNonce: needsAuthorization ? 3 : null,
    expiresAt: Date.now() + 1_000,
  };
}

test("accepts the exact EntryPoint and EOA nonce snapshot", () => {
  assert.doesNotThrow(() =>
    assertFeePaymentQuoteChainState(quote(true), {
      needsAuthorization: true,
      userOperationNonce: "0x7",
      eoaNonce: 3,
    }),
  );
});

test("rejects EntryPoint nonce, EOA nonce, and delegation races", () => {
  for (const state of [
    { needsAuthorization: true, userOperationNonce: "0x8" as const, eoaNonce: 3 },
    { needsAuthorization: true, userOperationNonce: "0x7" as const, eoaNonce: 4 },
    { needsAuthorization: false, userOperationNonce: "0x7" as const, eoaNonce: null },
  ]) {
    assert.throws(
      () => assertFeePaymentQuoteChainState(quote(true), state),
      /Account state changed/,
    );
  }
});

test("blocks first-use authorization while an EOA transaction is pending", () => {
  assert.doesNotThrow(() => assertNoPendingEoaNonceRace(3, 3));
  assert.throws(
    () => assertNoPendingEoaNonceRace(3, 4),
    /pending transaction/,
  );
});
