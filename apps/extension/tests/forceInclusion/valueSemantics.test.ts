import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeFunctionData } from "viem";

import { FORCE_INCLUSION_CHAINS } from "../../src/constants/chainRegistry";
import {
  buildL1DepositTxParams,
  evaluateForceInclusionBalances,
  FORCE_INCLUSION_L1_CALL_VALUE,
} from "../../src/chrome/forceInclusion/deposit";

const PORTAL_DEPOSIT_ABI = [
  {
    type: "function",
    name: "depositTransaction",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
      { name: "_gasLimit", type: "uint64" },
      { name: "_isCreation", type: "bool" },
      { name: "_data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

test("force inclusion spends nonzero transaction value from L2 without minting L1 ETH", async () => {
  const info = FORCE_INCLUSION_CHAINS.get(8453);
  assert.ok(info, "Base must expose an Optimism Portal");

  const recipient = "0x0000000000000000000000000000000000000002";
  const transactionValue = 100_000_000_000_000_000n;
  const l1Tx = await buildL1DepositTxParams(
    {
      from: "0x0000000000000000000000000000000000000001",
      to: recipient,
      data: "0x1234",
      value: `0x${transactionValue.toString(16)}`,
      chainId: 8453,
    },
    info,
    250_000n,
  );

  assert.equal(FORCE_INCLUSION_L1_CALL_VALUE, 0n);
  assert.equal(l1Tx.value, "0x0", "outer L1 msg.value must not mint L2 ETH");

  const decoded = decodeFunctionData({
    abi: PORTAL_DEPOSIT_ABI,
    data: l1Tx.data as `0x${string}`,
  });
  assert.equal(decoded.functionName, "depositTransaction");
  assert.equal(decoded.args[0].toLowerCase(), recipient);
  assert.equal(decoded.args[1], transactionValue, "portal _value remains the reviewed L2 value");
  assert.equal(decoded.args[2], 250_000n);
});

test("force-inclusion balances keep L1 gas and L2 transaction value independent", () => {
  assert.deepEqual(
    evaluateForceInclusionBalances({
      l1Balance: 40n,
      l1GasCost: 10n,
      l2Balance: 200n,
      l2TransactionValue: 100n,
    }),
    {
      insufficientGasBalance: false,
      insufficientTransactionValueBalance: false,
    },
  );
  assert.deepEqual(
    evaluateForceInclusionBalances({
      l1Balance: 5n,
      l1GasCost: 10n,
      l2Balance: 200n,
      l2TransactionValue: 100n,
    }),
    {
      insufficientGasBalance: true,
      insufficientTransactionValueBalance: false,
    },
  );
  assert.deepEqual(
    evaluateForceInclusionBalances({
      l1Balance: 40n,
      l1GasCost: 10n,
      l2Balance: 50n,
      l2TransactionValue: 100n,
    }),
    {
      insufficientGasBalance: false,
      insufficientTransactionValueBalance: true,
    },
  );
});

test("Bankr, private-key, and seed-phrase single and batch paths share the zero-mint builder", async () => {
  const root = new URL("../../src/chrome/forceInclusion/", import.meta.url);
  for (const path of [
    "singleBankr.ts",
    "singleLocal.ts",
    "batchBankr.ts",
    "batchLocalPreparation.ts",
  ]) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /buildL1DepositTxParams\(/, `${path} must use the shared builder`);
  }

  const localBroadcast = await readFile(
    new URL("batchLocalBroadcast.ts", root),
    "utf8",
  );
  assert.match(localBroadcast, /deposit\.l1TxParams\.value/);
});
