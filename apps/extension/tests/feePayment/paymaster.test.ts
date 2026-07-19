import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, erc20Abi, maxUint256 } from "viem";

import {
  addBoundedUsdcApproval,
  createDummyUsdcApprovalCall,
  getMaxTokenCost,
  getUserOperationMaxGas,
} from "../../src/chrome/feePayment/paymaster";
import type {
  PackedUserOperationV07,
  PimlicoTokenQuote,
} from "../../src/chrome/feePayment/pimlicoTypes";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYMASTER = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";

const userOperation: PackedUserOperationV07 = {
  sender: "0x3333333333333333333333333333333333333333",
  nonce: "0x0",
  callData: "0x",
  callGasLimit: "0x186a0", // 100,000
  verificationGasLimit: "0xc350", // 50,000
  preVerificationGas: "0x5208", // 21,000
  maxFeePerGas: "0x3b9aca00", // 1 gwei
  maxPriorityFeePerGas: "0x1",
  paymasterVerificationGasLimit: "0x7530", // 30,000
  paymasterPostOpGasLimit: "0x9c40", // 40,000
  signature: "0x",
};

const quote: PimlicoTokenQuote = {
  paymaster: PAYMASTER,
  token: USDC,
  postOpGas: "0xc350", // 50,000
  exchangeRate: "0x0de0b6b3a7640000", // 1e18
  exchangeRateNativeToUsd: "0x1",
  balanceSlot: "0x1",
  allowanceSlot: "0x2",
};

test("calculates Pimlico v0.7 maximum gas and token cost", () => {
  assert.equal(getUserOperationMaxGas(userOperation), 241_000n);
  assert.equal(getMaxTokenCost(userOperation, quote), 291_000_000_000_000n);
});

test("prepends an exact approval only when allowance is insufficient", () => {
  const result = addBoundedUsdcApproval(
    [{ to: TARGET, value: 0n, data: "0x1234" }],
    {
      usdc: USDC,
      quote,
      estimatedUserOperation: userOperation,
      currentAllowance: 0n,
    },
  );
  assert.equal(result.approvalAdded, true);
  assert.equal(result.calls.length, 2);
  const decoded = decodeFunctionData({
    abi: erc20Abi,
    data: result.calls[0]!.data!,
  });
  assert.equal(decoded.functionName, "approve");
  assert.deepEqual(decoded.args, [PAYMASTER, result.maximumTokenCost]);

  const sufficient = addBoundedUsdcApproval(result.calls.slice(1), {
    usdc: USDC,
    quote,
    estimatedUserOperation: userOperation,
    currentAllowance: result.maximumTokenCost,
  });
  assert.equal(sufficient.approvalAdded, false);
  assert.equal(sufficient.calls.length, 1);
});

test("uses unlimited approval only in the replace-before-sign estimation call", () => {
  const dummy = createDummyUsdcApprovalCall(USDC, PAYMASTER);
  const decoded = decodeFunctionData({ abi: erc20Abi, data: dummy.data! });
  assert.deepEqual(decoded.args, [PAYMASTER, maxUint256]);
});

test("rejects a substituted quote token", () => {
  assert.throws(
    () =>
      addBoundedUsdcApproval([], {
        usdc: USDC,
        quote: {
          ...quote,
          token: "0x4444444444444444444444444444444444444444",
        },
        estimatedUserOperation: userOperation,
        currentAllowance: 0n,
      }),
    /does not match the selected fee token/,
  );
});
