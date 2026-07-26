import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTransactionAction,
  getDecodedActionFallback,
  shouldShowTransactionEstimatedChanges,
} from "../../src/components/TransactionConfirmation/transactionPresentation";

test("formats decoded function names as concise action labels", () => {
  assert.equal(formatTransactionAction("withdraw"), "Withdraw");
  assert.equal(formatTransactionAction("exactInputSingle"), "Exact Input Single");
  assert.equal(formatTransactionAction("claim_rewards"), "Claim rewards");
  assert.equal(formatTransactionAction(""), "Contract interaction");
});

test("uses decoded actions only when clear signing and specialized summaries are absent", () => {
  assert.equal(
    getDecodedActionFallback({
      clearSigningStatus: "absent",
      decodedFunctionName: "swapExactAmountIn",
      hasSpecializedSummary: false,
    }),
    "Swap Exact Amount In",
  );
  assert.equal(
    getDecodedActionFallback({
      clearSigningStatus: "matched",
      decodedFunctionName: "swapExactAmountIn",
      hasSpecializedSummary: false,
    }),
    null,
  );
  assert.equal(
    getDecodedActionFallback({
      clearSigningStatus: "absent",
      decodedFunctionName: "approve",
      hasSpecializedSummary: true,
    }),
    null,
  );
  assert.equal(
    getDecodedActionFallback({
      clearSigningStatus: "absent",
      decodedFunctionName: undefined,
      hasSpecializedSummary: false,
    }),
    null,
  );
});

test("standalone parsed ERC-20 approvals own their review without duplicate estimated changes", () => {
  assert.equal(
    shouldShowTransactionEstimatedChanges(false, true),
    false,
  );
  assert.equal(
    shouldShowTransactionEstimatedChanges(false, false),
    true,
  );
  assert.equal(
    shouldShowTransactionEstimatedChanges(true, false),
    false,
  );
});
