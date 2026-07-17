import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type {
  CompletedTransaction,
  GasData,
} from "../../src/chrome/txHistoryStorage";
import { selectHistoryGasData } from "../../src/chrome/history/gasDataPolicy";
import {
  buildForceInclusionL1GasData,
  isForceInclusionL1GasData,
} from "../../src/chrome/forceInclusion/l1GasData";

const L1_GAS: GasData = {
  gasUsed: "120000",
  gasLimit: "140000",
  effectiveGasPrice: "25000000000",
  feeSource: "forceInclusionL1",
};

function forceIncludedTx(
  accountType: "bankr" | "privateKey" | "seedPhrase",
): CompletedTransaction {
  return {
    id: `force-${accountType}`,
    status: "success",
    tx: { from: "0x1", chainId: 8453 },
    origin: "WalletChan",
    favicon: null,
    chainName: "Base",
    chainId: 8453,
    createdAt: 1,
    accountType,
    gasData: L1_GAS,
    forceInclusionMeta: {
      l1TxHash: "0xl1",
      l1ChainId: 1,
      l2ChainId: 8453,
    },
  };
}

test("force inclusion accounts gas from the fee-bearing L1 receipt", () => {
  const gasData = buildForceInclusionL1GasData(
    {
      gasUsed: "0x1d4c0",
      effectiveGasPrice: "0x5d21dba00",
    },
    1,
    "0x222e0",
  );
  assert.deepEqual(gasData, L1_GAS);
  assert.equal(isForceInclusionL1GasData(gasData), true);
  assert.equal(
    isForceInclusionL1GasData({
      gasUsed: gasData.gasUsed,
      gasLimit: gasData.gasLimit,
      effectiveGasPrice: gasData.effectiveGasPrice,
    }),
    false,
  );
});

test("derived zero-cost L2 receipts cannot replace L1 gas for any signing wallet", () => {
  const zeroL2Gas: GasData = {
    gasUsed: "100000",
    gasLimit: "100000",
    effectiveGasPrice: "0",
  };
  for (const accountType of [
    "bankr",
    "privateKey",
    "seedPhrase",
  ] as const) {
    assert.equal(
      selectHistoryGasData(forceIncludedTx(accountType), zeroL2Gas),
      L1_GAS,
    );
  }
  assert.equal(
    selectHistoryGasData(
      { ...forceIncludedTx("bankr"), forceInclusionMeta: undefined },
      zeroL2Gas,
    ),
    zeroL2Gas,
  );
});

test("all force-inclusion receipt paths persist or preserve L1 gas", async () => {
  const root = new URL("../../src/chrome/forceInclusion/", import.meta.url);
  for (const file of [
    "singleOutcome.ts",
    "batchBankr.ts",
    "batchLocalReceipts.ts",
    "recovery.ts",
  ]) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.match(source, /buildForceInclusionL1GasData/u, file);
  }
  const repository = await readFile(
    new URL("../../src/chrome/history/repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(repository, /selectHistoryGasData/u);
});
