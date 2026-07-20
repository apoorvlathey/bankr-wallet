import assert from "node:assert/strict";
import test from "node:test";
import { validateTransactionNonceSelection } from "../../src/chrome/transactions/noncePolicy";

test("nonce selection accepts native local execution and rejects unsupported modes", () => {
  assert.deepEqual(validateTransactionNonceSelection(12, "native"), {
    ok: true,
    nonce: 12,
  });
  assert.deepEqual(validateTransactionNonceSelection(undefined, "feeToken"), {
    ok: true,
    nonce: undefined,
  });
  assert.deepEqual(validateTransactionNonceSelection(12, "feeToken"), {
    ok: false,
    error: "Custom nonce is unavailable when paying network fees with a token",
  });
  assert.deepEqual(validateTransactionNonceSelection(12, "forceInclusion"), {
    ok: false,
    error: "Custom nonce is unavailable for force inclusion",
  });
  assert.deepEqual(validateTransactionNonceSelection("12", "native"), {
    ok: false,
    error: "Transaction nonce must be a non-negative safe integer",
  });
  assert.deepEqual(validateTransactionNonceSelection(11, "native", 12), {
    ok: false,
    error: "Replacement transaction must use nonce 12",
  });
  assert.deepEqual(validateTransactionNonceSelection(12, "native", 12), {
    ok: true,
    nonce: 12,
  });
});
