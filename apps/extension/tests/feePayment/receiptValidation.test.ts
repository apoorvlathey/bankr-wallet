import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics } from "viem";

import { ENTRY_POINT_V07 } from "../../src/chrome/feePayment/constants";
import {
  USER_OPERATION_EVENT_ABI,
  verifyUserOperationReceiptOnchain,
} from "../../src/chrome/feePayment/receiptValidation";
import type { UserOperationReceipt } from "../../src/chrome/feePayment/pimlicoTypes";
import {
  getUserOperationPaymasterFromReceipt,
  getUserOperationTokenFeeFromReceipt,
  USER_OPERATION_SPONSORED_EVENT_ABI,
} from "../../src/chrome/feePayment/userOperationEvent";

const HASH = `0x${"11".repeat(32)}` as const;
const TX_HASH = `0x${"22".repeat(32)}` as const;
const SENDER = "0x3333333333333333333333333333333333333333" as const;
const PAYMASTER = "0x4444444444444444444444444444444444444444" as const;
const TOKEN = "0x5555555555555555555555555555555555555555" as const;

function chainReceipt(success: boolean) {
  return {
    transactionHash: TX_HASH,
    status: success ? "0x1" : "0x0",
    logs: [{
      address: ENTRY_POINT_V07,
      topics: encodeEventTopics({
        abi: USER_OPERATION_EVENT_ABI,
        eventName: "UserOperationEvent",
        args: { userOpHash: HASH, sender: SENDER, paymaster: PAYMASTER },
      }),
      data: encodeAbiParameters(
        [
          { type: "uint256" },
          { type: "bool" },
          { type: "uint256" },
          { type: "uint256" },
        ],
        [7n, success, 100n, 90n],
      ),
    }],
  };
}

function bundlerReceipt(success: boolean): UserOperationReceipt {
  return {
    userOpHash: HASH,
    sender: SENDER,
    nonce: "0x7",
    success,
    actualGasCost: "0x64",
    actualGasUsed: "0x5a",
    receipt: { transactionHash: TX_HASH },
  };
}

test("accepts finality only from the matching onchain EntryPoint event", async () => {
  const receipt = chainReceipt(true);
  const verified = await verifyUserOperationReceiptOnchain({
    chainId: 8453,
    sender: SENDER,
    userOperationHash: HASH,
    bundlerReceipt: bundlerReceipt(true),
    fetchReceipt: async () => ({ receipt, rpcUrl: "https://rpc.example" }),
  });
  assert.equal(verified?.txHash, TX_HASH);
  assert.equal(verified?.receipt, receipt);
  assert.equal(verified?.success, true);
  assert.equal(verified?.paymaster, PAYMASTER);
  assert.equal(
    getUserOperationPaymasterFromReceipt(receipt, HASH, SENDER),
    PAYMASTER,
  );
});

test("reads the exact ERC-20 charge from the paymaster sponsorship event", () => {
  const receipt = chainReceipt(true);
  receipt.logs.push({
    address: PAYMASTER,
    topics: encodeEventTopics({
      abi: USER_OPERATION_SPONSORED_EVENT_ABI,
      eventName: "UserOperationSponsored",
      args: { userOpHash: HASH, user: SENDER },
    }),
    data: encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [1, TOKEN, 5797n, 1_000_000_000_000_000_000n],
    ),
  });
  assert.deepEqual(
    getUserOperationTokenFeeFromReceipt(receipt, HASH, SENDER, TOKEN),
    { paymaster: PAYMASTER, amountWei: "5797" },
  );
});

test("waits when the chain RPC has not observed the transaction", async () => {
  assert.equal(
    await verifyUserOperationReceiptOnchain({
      chainId: 8453,
      sender: SENDER,
      userOperationHash: HASH,
      bundlerReceipt: bundlerReceipt(true),
      fetchReceipt: async () => null,
    }),
    null,
  );
});

test("rejects substituted receipts and status disagreement", async () => {
  await assert.rejects(
    verifyUserOperationReceiptOnchain({
      chainId: 8453,
      sender: SENDER,
      userOperationHash: HASH,
      bundlerReceipt: bundlerReceipt(false),
      fetchReceipt: async () => ({
        receipt: chainReceipt(true),
        rpcUrl: "https://rpc.example",
      }),
    }),
    /disagrees with EntryPoint/,
  );
  await assert.rejects(
    verifyUserOperationReceiptOnchain({
      chainId: 8453,
      sender: SENDER,
      userOperationHash: `0x${"ff".repeat(32)}`,
      bundlerReceipt: bundlerReceipt(true),
      fetchReceipt: async () => ({
        receipt: chainReceipt(true),
        rpcUrl: "https://rpc.example",
      }),
    }),
    /different UserOperation/,
  );
});
