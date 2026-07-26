import assert from "node:assert/strict";
import test from "node:test";

import { allowsBatchFeePaymentSelection } from "../../src/components/BatchConfirmation/feePaymentPolicy";

test("ordinary and cross-dapp batches share fee selection", () => {
  assert.equal(allowsBatchFeePaymentSelection({
    customConfirmation: false,
    requestKind: "batch",
    privacyRagequit: false,
  }), true);
  assert.equal(allowsBatchFeePaymentSelection({
    customConfirmation: true,
    requestKind: "crossDapp",
    privacyRagequit: false,
  }), true);
});

test("unknown custom transports and privacy ragequits stay native-only", () => {
  assert.equal(allowsBatchFeePaymentSelection({
    customConfirmation: true,
    requestKind: "batch",
    privacyRagequit: false,
  }), false);
  assert.equal(allowsBatchFeePaymentSelection({
    customConfirmation: true,
    requestKind: "crossDapp",
    privacyRagequit: true,
  }), false);
});
