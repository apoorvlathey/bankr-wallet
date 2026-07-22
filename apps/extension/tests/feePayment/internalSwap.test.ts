import assert from "node:assert/strict";
import test from "node:test";
import { parseInternalSwapFeePaymentPayload } from "../../src/chrome/feePayment/internalSwap";

const ADDRESS = "0x1111111111111111111111111111111111111111";

test("internal swap fee-payment payload normalizes reviewed calls", () => {
  assert.deepEqual(
    parseInternalSwapFeePaymentPayload({
      chainId: 8453,
      calls: [{ to: ADDRESS, data: "0x1234", value: "0x2a" }],
    }),
    {
      chainId: 8453,
      calls: [{ to: ADDRESS, data: "0x1234", value: 42n }],
    },
  );
});

test("internal swap fee-payment payload fails closed on malformed calls", () => {
  assert.throws(
    () => parseInternalSwapFeePaymentPayload({ chainId: 8453, calls: [] }),
    /Invalid swap fee-payment calls/u,
  );
  assert.throws(
    () => parseInternalSwapFeePaymentPayload({
      chainId: 8453,
      calls: [{ to: ADDRESS, data: "0x1", value: "0x0" }],
    }),
    /Invalid swap call 1 data/u,
  );
  assert.throws(
    () => parseInternalSwapFeePaymentPayload({
      chainId: 8453,
      calls: [{ to: ADDRESS, data: "0x", value: "1" }],
    }),
    /Invalid swap call 1 value/u,
  );
});
