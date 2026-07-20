import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFunctionData } from "viem";
import { decodeMultiSendTransactions, encodeMultiSendTransactions } from "../../src/chrome/safe/multiSend";
import { buildSafeTransaction } from "../../src/chrome/safe/transactionBuilder";
import { getCanonicalMultiSendAddress } from "../../src/chrome/safe/deploymentRegistry";

const calls = [
  { to: "0x1111111111111111111111111111111111111111", value: "1", data: "0x", operation: 0 },
  { to: "0x2222222222222222222222222222222222222222", value: "0", data: "0xabcdef", operation: 0 },
] as const;

test("MultiSend codec round-trips bounded call-only transactions", () => {
  const encoded = encodeMultiSendTransactions(calls);
  assert.deepEqual(decodeMultiSendTransactions(encoded), calls);
  assert.throws(() =>
    encodeMultiSendTransactions([{ ...calls[0], operation: 1 }]),
    /delegatecall/i,
  );
  assert.throws(() => decodeMultiSendTransactions(`${encoded}00`), /malformed/i);
});

test("batch builder targets canonical MultiSend with outer delegatecall", () => {
  const built = buildSafeTransaction({
    chainId: 8453,
    safeAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    safeVersion: "1.4.1",
    nonce: 14n,
    calls: [...calls],
  });
  assert.equal(built.transaction.to, getCanonicalMultiSendAddress(8453, "1.4.1"));
  assert.equal(built.transaction.operation, 1);
  assert.equal(built.transaction.nonce, 14);
  const decoded = decodeFunctionData({
    abi: [{ type: "function", name: "multiSend", stateMutability: "payable", inputs: [{ name: "transactions", type: "bytes" }], outputs: [] }] as const,
    data: built.transaction.data,
  });
  assert.deepEqual(decodeMultiSendTransactions(decoded.args[0]), calls);
});
