import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareTokenUserOperation,
  prepareUsdcUserOperation,
} from "../../src/chrome/feePayment/prepareUserOperation";
import type { PimlicoTokenQuote } from "../../src/chrome/feePayment/pimlicoTypes";

const SENDER = "0x1111111111111111111111111111111111111111";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYMASTER = "0x2222222222222222222222222222222222222222";
const TARGET = "0x3333333333333333333333333333333333333333";

const quote: PimlicoTokenQuote = {
  paymaster: PAYMASTER,
  token: USDC,
  postOpGas: "0x64",
  exchangeRate: "0x0de0b6b3a7640000",
  exchangeRateNativeToUsd: "0x1",
  balanceSlot: "0x1",
  allowanceSlot: "0x2",
};

function createClient(tokenQuote = quote) {
  const events: string[] = [];
  return {
    events,
    getTokenQuotes: async () => {
      events.push("quote");
      return [tokenQuote];
    },
    getUserOperationGasPrice: async () => {
      events.push("gasPrice");
      return {
        slow: { maxFeePerGas: "0x1" as const, maxPriorityFeePerGas: "0x1" as const },
        standard: { maxFeePerGas: "0x2" as const, maxPriorityFeePerGas: "0x1" as const },
        fast: { maxFeePerGas: "0x3" as const, maxPriorityFeePerGas: "0x2" as const },
      };
    },
    getPaymasterStubData: async () => {
      events.push("stub");
      return {
        paymaster: PAYMASTER,
        paymasterData: "0xaa" as const,
        paymasterVerificationGasLimit: "0x20" as const,
        paymasterPostOpGasLimit: "0x30" as const,
      };
    },
    estimateUserOperationGas: async () => {
      events.push("estimate");
      return {
        callGasLimit: "0x100" as const,
        verificationGasLimit: "0x200" as const,
        preVerificationGas: "0x300" as const,
        paymasterVerificationGasLimit: "0x20" as const,
        paymasterPostOpGasLimit: "0x30" as const,
      };
    },
    getPaymasterData: async () => {
      events.push("paymaster");
      return {
        paymaster: PAYMASTER,
        paymasterData: "0xbb" as const,
        paymasterVerificationGasLimit: "0x20" as const,
        paymasterPostOpGasLimit: "0x30" as const,
      };
    },
  };
}

test("prepares a final bounded-approval envelope in provider order", async () => {
  const client = createClient();
  const result = await prepareUsdcUserOperation(client, {
    sender: SENDER,
    nonce: "0x7",
    calls: [{ to: TARGET, data: "0x1234" }],
    usdc: USDC,
    currentAllowance: 0n,
  });
  assert.equal(result.approvalAdded, true);
  assert.equal(result.calls.length, 2);
  assert.equal(result.userOperation.paymasterData, "0xbb");
  assert.equal(result.userOperation.signature.length, 132);
  assert.deepEqual(client.events, [
    "quote",
    "gasPrice",
    "stub",
    "estimate",
    "stub",
    "estimate",
    "paymaster",
  ]);
});

test("final paymaster data is requested after the last gas estimate", async () => {
  const client = createClient();
  await prepareUsdcUserOperation(client, {
    sender: SENDER,
    nonce: "0x7",
    calls: [{ to: TARGET, data: "0x1234" }],
    usdc: USDC,
    currentAllowance: 0n,
  });
  const finalPaymasterIndex = client.events.lastIndexOf("paymaster");
  assert.equal(finalPaymasterIndex, client.events.length - 1);
  assert.equal(
    client.events.slice(finalPaymasterIndex + 1).includes("estimate"),
    false,
  );
});

test("preserves estimated paymaster gas limits when final data omits them", async () => {
  const client = createClient();
  client.getPaymasterData = async () => {
    client.events.push("paymaster");
    return {
      paymaster: PAYMASTER,
      paymasterData: "0xbb" as const,
    };
  };

  const result = await prepareUsdcUserOperation(client, {
    sender: SENDER,
    nonce: "0x7",
    calls: [{ to: TARGET, data: "0x1234" }],
    usdc: USDC,
    currentAllowance: 0n,
  });

  assert.equal(result.userOperation.paymasterVerificationGasLimit, "0x20");
  assert.equal(result.userOperation.paymasterPostOpGasLimit, "0x30");
});

test("omits approval when existing allowance covers the maximum", async () => {
  const client = createClient();
  const result = await prepareUsdcUserOperation(client, {
    sender: SENDER,
    nonce: "0x0",
    calls: [{ to: TARGET, data: "0x" }],
    usdc: USDC,
    currentAllowance: 10n ** 30n,
  });
  assert.equal(result.approvalAdded, false);
  assert.equal(result.approvalAmount, null);
  assert.equal(result.calls.length, 1);
});

test("reads allowance only after the quote pins the paymaster", async () => {
  const client = createClient();
  let spender: string | undefined;
  await prepareUsdcUserOperation(client, {
    sender: SENDER,
    nonce: "0x0",
    calls: [{ to: TARGET, data: "0x" }],
    usdc: USDC,
    getCurrentAllowance: async (paymaster) => {
      spender = paymaster;
      return 10n ** 30n;
    },
  });
  assert.equal(spender, PAYMASTER);
});

test("rejects a provider quote above the v1 USDC safety limit", async () => {
  const client = createClient({
    ...quote,
    exchangeRate: "0x100000000000000000000000000000000",
  });
  await assert.rejects(
    prepareUsdcUserOperation(client, {
      sender: SENDER,
      nonce: "0x0",
      calls: [{ to: TARGET, data: "0x" }],
      usdc: USDC,
      currentAllowance: 10n ** 40n,
    }),
    /safety limit/,
  );
});

test("applies the selected catalog token's own absolute safety limit", async () => {
  const client = createClient();
  await assert.rejects(
    prepareTokenUserOperation(client, {
      sender: SENDER,
      nonce: "0x0",
      calls: [{ to: TARGET, data: "0x" }],
      token: USDC,
      maximumGasCost: 1n,
      currentAllowance: 10n ** 40n,
    }),
    /safety limit/,
  );
});
