import assert from "node:assert/strict";
import test from "node:test";

import {
  ENTRY_POINT_V07,
  WALLETCHAN_OFFICIAL_DELEGATE,
  WALLETCHAN_OFFICIAL_DELEGATION_CODE,
} from "../../src/chrome/feePayment/constants";
import {
  PimlicoClient,
  PimlicoRpcError,
} from "../../src/chrome/feePayment/pimlicoClient";
import { INSUFFICIENT_REMAINING_USDC_ERROR } from "../../src/chrome/feePayment/errors";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYMASTER = "0x1111111111111111111111111111111111111111";
const SENDER = "0x2222222222222222222222222222222222222222";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("requests a chain-pinned v0.7 token quote through the proxy", async (t) => {
  let requestBody: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        quotes: [{
          paymaster: PAYMASTER,
          token: USDC,
          postOpGas: "0x1",
          exchangeRate: "0x2",
          exchangeRateNativeToUsd: "0x3",
          balanceSlot: "0x4",
          allowanceSlot: "0x5",
        }],
      },
    });
  });

  const client = new PimlicoClient("http://localhost/pimlico", 8453);
  const quotes = await client.getTokenQuotes([USDC]);

  assert.equal(quotes[0]?.token, USDC);
  assert.deepEqual(requestBody, {
    jsonrpc: "2.0",
    id: 1,
    method: "pimlico_getTokenQuotes",
    params: [{ tokens: [USDC] }, ENTRY_POINT_V07, "0x2105"],
  });
});

test("rejects a quote for a token the extension did not request", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: [
        {
          paymaster: PAYMASTER,
          token: "0x2222222222222222222222222222222222222222",
          postOpGas: "0x1",
          exchangeRate: "0x2",
          exchangeRateNativeToUsd: "0x3",
          balanceSlot: "0x4",
          allowanceSlot: "0x5",
        },
      ],
    }),
  );
  const client = new PimlicoClient("http://localhost/pimlico", 8453);

  await assert.rejects(
    client.getTokenQuotes([USDC]),
    /unexpected token quote/,
  );
});

test("rejects a paymaster substitution after quote selection", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        paymaster: "0x2222222222222222222222222222222222222222",
        paymasterData: "0x01",
      },
    }),
  );
  const client = new PimlicoClient("http://localhost/pimlico", 8453);

  await assert.rejects(
    client.getPaymasterData({} as never, USDC, PAYMASTER),
    /changed the quoted paymaster/,
  );
});

test("accepts an empty paymaster data payload", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        paymaster: PAYMASTER,
        paymasterData: "0x",
        paymasterVerificationGasLimit: "0x1",
        paymasterPostOpGasLimit: "0x2",
      },
    }),
  );
  const result = await new PimlicoClient(
    "http://localhost/pimlico",
    8453,
  ).getPaymasterData({} as never, USDC, PAYMASTER);
  assert.equal(result.paymasterData, "0x");
});

test("rejects mismatched JSON-RPC envelopes", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ jsonrpc: "2.0", id: 99, result: "0x01" }),
  );
  const client = new PimlicoClient("http://localhost/pimlico", 8453);

  await assert.rejects(
    client.sendUserOperation({} as never),
    (error: unknown) =>
      error instanceof PimlicoRpcError && /Mismatched/.test(error.message),
  );
});

test("requires HTTPS except for local development", () => {
  assert.throws(
    () => new PimlicoClient("http://walletchan.example/pimlico", 8453),
    /must use HTTPS/,
  );
});

test("strictly parses Pimlico UserOperation gas price tiers", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        slow: { maxFeePerGas: "0x1", maxPriorityFeePerGas: "0x2" },
        standard: { maxFeePerGas: "0x3", maxPriorityFeePerGas: "0x4" },
        fast: { maxFeePerGas: "0x5", maxPriorityFeePerGas: "0x6" },
      },
    }),
  );
  const tiers = await new PimlicoClient(
    "http://localhost/pimlico",
    8453,
  ).getUserOperationGasPrice();
  assert.deepEqual(tiers.standard, {
    maxFeePerGas: "0x3",
    maxPriorityFeePerGas: "0x4",
  });
});

test("simulates a fresh 7702 sender with only the official delegation code", async (t) => {
  let requestBody: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        callGasLimit: "0x1",
        verificationGasLimit: "0x2",
        preVerificationGas: "0x3",
      },
    });
  });
  await new PimlicoClient("http://localhost/pimlico", 8453)
    .estimateUserOperationGas({
      sender: SENDER,
      eip7702Auth: { address: WALLETCHAN_OFFICIAL_DELEGATE },
    } as never);

  const params = requestBody?.params as unknown[];
  assert.deepEqual(params[2], {
    [SENDER]: { code: WALLETCHAN_OFFICIAL_DELEGATION_CODE },
  });
});

test("does not attach a state override for an already-delegated sender", async (t) => {
  let requestBody: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        callGasLimit: "0x1",
        verificationGasLimit: "0x2",
        preVerificationGas: "0x3",
      },
    });
  });
  await new PimlicoClient("http://localhost/pimlico", 8453)
    .estimateUserOperationGas({ sender: SENDER } as never);

  assert.equal((requestBody?.params as unknown[]).length, 2);
});

test("explains when the transaction leaves no USDC for the paymaster", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32500,
        message:
          "UserOperation reverted during simulation with reason: AA50 postOp reverted 0x7939f424",
      },
    }),
  );

  await assert.rejects(
    new PimlicoClient("http://localhost/pimlico", 8453)
      .estimateUserOperationGas({ sender: SENDER } as never),
    (error: unknown) =>
      error instanceof PimlicoRpcError &&
      error.message === INSUFFICIENT_REMAINING_USDC_ERROR &&
      error.code === -32500,
  );
});

test("preserves unrelated Pimlico simulation errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32500, message: "AA23 reverted" },
    }),
  );

  await assert.rejects(
    new PimlicoClient("http://localhost/pimlico", 8453)
      .estimateUserOperationGas({ sender: SENDER } as never),
    (error: unknown) =>
      error instanceof PimlicoRpcError && error.message === "AA23 reverted",
  );
});

test("rejects a receipt for a different UserOperation hash", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        userOpHash: `0x${"22".repeat(32)}`,
        sender: USDC,
        nonce: "0x0",
        success: true,
        actualGasCost: "0x1",
        actualGasUsed: "0x1",
        receipt: {},
      },
    }),
  );
  await assert.rejects(
    new PimlicoClient("http://localhost/pimlico", 8453)
      .getUserOperationReceipt(`0x${"11".repeat(32)}`),
    /different UserOperation/,
  );
});
