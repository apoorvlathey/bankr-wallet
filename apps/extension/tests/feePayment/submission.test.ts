import assert from "node:assert/strict";
import test from "node:test";

import {
  PimlicoClient,
  PimlicoRpcError,
} from "../../src/chrome/feePayment/pimlicoClient";
import type { PackedUserOperationV07 } from "../../src/chrome/feePayment/pimlicoTypes";
import {
  getPackedUserOperationHash,
  submitUserOperationRecoverably,
} from "../../src/chrome/feePayment/submission";

const operation: PackedUserOperationV07 = {
  sender: "0x1111111111111111111111111111111111111111",
  nonce: "0x7",
  callData: "0x1234",
  callGasLimit: "0x100",
  verificationGasLimit: "0x200",
  preVerificationGas: "0x300",
  maxFeePerGas: "0x400",
  maxPriorityFeePerGas: "0x500",
  paymaster: "0x4444444444444444444444444444444444444444",
  paymasterVerificationGasLimit: "0x600",
  paymasterPostOpGasLimit: "0x700",
  paymasterData: "0xabcd",
  signature: `0x${"11".repeat(65)}`,
};

function installChromeStorage() {
  const values: Record<string, unknown> = {};
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: values[key] }),
          set: async (next: Record<string, unknown>) => Object.assign(values, next),
        },
      },
    },
  });
  return values;
}

function record() {
  return {
    version: 1 as const,
    family: "transaction" as const,
    txId: "tx-1",
    sender: operation.sender,
    chainId: 8453,
  };
}

test("pins a deterministic v0.7 hash before Pimlico submission", async () => {
  const values = installChromeStorage();
  const expected = getPackedUserOperationHash(operation, 8453);
  let wasPersistedAtSend = false;
  const client = {
    sendUserOperation: async () => {
      wasPersistedAtSend = Array.isArray(values.pendingUserOperations);
      return expected;
    },
  } as PimlicoClient;

  const result = await submitUserOperationRecoverably({
    client,
    record: record(),
    userOperation: operation,
  });
  assert.equal(wasPersistedAtSend, true);
  assert.equal(result.userOperationHash, expected);
  assert.equal(result.outcomeUnknown, false);
});

test("retains the deterministic hash when the submit response is lost", async () => {
  const values = installChromeStorage();
  const client = {
    sendUserOperation: async () => {
      throw new Error("network disconnected");
    },
  } as PimlicoClient;

  const result = await submitUserOperationRecoverably({
    client,
    record: record(),
    userOperation: operation,
  });
  assert.equal(result.outcomeUnknown, true);
  assert.equal(
    (values.pendingUserOperations as Array<{ userOperationHash: string }>)[0]
      ?.userOperationHash,
    result.userOperationHash,
  );
});

test("removes recovery state after a definite JSON-RPC rejection", async () => {
  const values = installChromeStorage();
  const client = {
    sendUserOperation: async () => {
      throw new PimlicoRpcError("AA23 reverted", -32500, undefined, true);
    },
  } as PimlicoClient;

  await assert.rejects(
    submitUserOperationRecoverably({
      client,
      record: record(),
      userOperation: operation,
    }),
    /AA23 reverted/,
  );
  assert.deepEqual(values.pendingUserOperations, []);
});

test("removes recovery state when the durable pre-broadcast hook fails", async () => {
  const values = installChromeStorage();
  let sent = false;
  const client = {
    sendUserOperation: async () => {
      sent = true;
      return getPackedUserOperationHash(operation, 8453);
    },
  } as PimlicoClient;
  await assert.rejects(
    submitUserOperationRecoverably({
      client,
      record: record(),
      userOperation: operation,
      beforeBroadcast: async () => {
        throw new Error("durable preparation failed");
      },
    }),
    /durable preparation failed/,
  );
  assert.equal(sent, false);
  assert.deepEqual(values.pendingUserOperations, []);
});

test("treats a mismatched provider hash as outcome unknown", async () => {
  installChromeStorage();
  const client = {
    sendUserOperation: async () => `0x${"ff".repeat(32)}`,
  } as PimlicoClient;
  const result = await submitUserOperationRecoverably({
    client,
    record: record(),
    userOperation: operation,
  });
  assert.equal(result.outcomeUnknown, true);
  assert.match(result.warning ?? "", /different UserOperation hash/);
});
