import assert from "node:assert/strict";
import test from "node:test";

import type { ERC5792Call } from "../../src/chrome/erc5792Types";
import {
  compactBatchActionName,
  getBatchActionSummary,
} from "../../src/components/BatchConfirmation/batchActionSummary";
import { encodeApproveCalldata } from "../../src/lib/erc20Approve";

const token = "0x1111111111111111111111111111111111111111" as const;
const spender = "0x2222222222222222222222222222222222222222" as const;

test("batch action summary prioritizes specialized and clear-signing intents", () => {
  const calls: ERC5792Call[] = [
    {
      to: token,
      data: encodeApproveCalldata(spender, 3n) as `0x${string}`,
    },
    {
      to: spender,
      data: "0x12345678",
    },
  ];

  assert.equal(
    getBatchActionSummary({
      calls,
      clearSigningActionNames: { 1: "Swap" },
      decodedFunctionNames: { 1: "swapExactAmountIn" },
    }),
    "Approve + Swap",
  );
});

test("batch action summary waits for every call to have a meaningful label", () => {
  assert.equal(
    getBatchActionSummary({
      calls: [{ to: spender, data: "0x12345678" }],
      clearSigningActionNames: {},
      decodedFunctionNames: {},
    }),
    null,
  );
});

test("decoded names collapse to concise action verbs", () => {
  assert.equal(compactBatchActionName("exactInputSingle"), "Swap");
  assert.equal(compactBatchActionName("withdraw_assets"), "Withdraw");
});
