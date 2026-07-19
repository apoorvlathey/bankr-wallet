import assert from "node:assert/strict";
import test from "node:test";
import { verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  encodeMetaMaskDeleGatorCalls,
  getMetaMaskUserOperationTypedData,
  METAMASK_EOA_STUB_SIGNATURE,
  signMetaMaskUserOperation,
} from "../../src/chrome/feePayment/userOperation";
import type { PackedUserOperationV07 } from "../../src/chrome/feePayment/pimlicoTypes";

const SENDER = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";
const SECOND_TARGET = "0x3333333333333333333333333333333333333333";

test("single-call encoding matches MetaMask Smart Accounts Kit 1.6.0", () => {
  assert.equal(
    encodeMetaMaskDeleGatorCalls(SENDER, [
      { to: TARGET, value: 3n, data: "0x1234" },
    ]),
    "0x5c1c6dcd000000000000000000000000000000000000000000000000000000000000002000000000000000000000000022222222222222222222222222222222222222220000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000021234000000000000000000000000000000000000000000000000000000000000",
  );
});

test("batch encoding matches MetaMask Smart Accounts Kit 1.6.0", () => {
  assert.equal(
    encodeMetaMaskDeleGatorCalls(SENDER, [
      { to: TARGET, value: 3n, data: "0x1234" },
      { to: SECOND_TARGET, data: "0xabcd" },
    ]),
    "0xe9ae5c530100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000212340000000000000000000000000000000000000000000000000000000000000000000000000000000000003333333333333333333333333333333333333333000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000002abcd000000000000000000000000000000000000000000000000000000000000",
  );
});

test("direct calls to the account preserve MetaMask passthrough behavior", () => {
  assert.equal(
    encodeMetaMaskDeleGatorCalls(SENDER, [
      { to: SENDER, value: 0n, data: "0x12345678" },
    ]),
    "0x12345678",
  );
  assert.throws(
    () =>
      encodeMetaMaskDeleGatorCalls(SENDER, [
        { to: SENDER, value: 1n, data: "0x" },
      ]),
    /cannot transfer value/,
  );
});

function createUserOperation(sender = SENDER): PackedUserOperationV07 {
  return {
    sender,
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
    signature: METAMASK_EOA_STUB_SIGNATURE,
  };
}

test("packs v0.7 typed data with MetaMask's Stateless DeleGator domain", () => {
  const typedData = getMetaMaskUserOperationTypedData(
    createUserOperation(),
    8453,
  );
  assert.deepEqual(typedData.domain, {
    chainId: 8453,
    name: "EIP7702StatelessDeleGator",
    version: "1",
    verifyingContract: SENDER,
  });
  assert.equal(
    typedData.message.accountGasLimits,
    "0x0000000000000000000000000000020000000000000000000000000000000100",
  );
  assert.equal(
    typedData.message.gasFees,
    "0x0000000000000000000000000000050000000000000000000000000000000400",
  );
  assert.equal(
    typedData.message.paymasterAndData,
    "0x44444444444444444444444444444444444444440000000000000000000000000000060000000000000000000000000000000700abcd",
  );
});

test("signs the exact MetaMask typed data and rejects a mismatched key", async () => {
  const privateKey =
    "0x0000000000000000000000000000000000000000000000000000000000000001";
  const account = privateKeyToAccount(privateKey);
  const userOperation = createUserOperation(account.address);
  const signature = await signMetaMaskUserOperation(
    privateKey,
    userOperation,
    8453,
  );
  assert.equal(
    await verifyTypedData({
      address: account.address,
      ...getMetaMaskUserOperationTypedData(userOperation, 8453),
      signature,
    }),
    true,
  );
  await assert.rejects(
    signMetaMaskUserOperation(privateKey, createUserOperation(), 8453),
    /signer does not match sender/,
  );
});

test("rejects malformed stateless and paymaster fields", () => {
  assert.throws(
    () =>
      getMetaMaskUserOperationTypedData(
        { ...createUserOperation(), factory: TARGET },
        8453,
      ),
    /cannot use factory data/,
  );
  assert.throws(
    () =>
      getMetaMaskUserOperationTypedData(
        {
          ...createUserOperation(),
          paymaster: undefined,
          paymasterData: "0x01",
        },
        8453,
      ),
    /require a paymaster address/,
  );
});
