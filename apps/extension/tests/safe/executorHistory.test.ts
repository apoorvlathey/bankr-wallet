import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSafeExecutorHistoryEntry,
  getSafeExecutorHistoryId,
} from "../../src/chrome/safe/executorHistory";
import { decodeSafeProposal } from "../../src/chrome/safe/proposalRepository";
import { buildSafeTransaction } from "../../src/chrome/safe/transactionBuilder";
import type {
  SafeExecutionExecutor,
  SafeProposalRecord,
} from "../../src/chrome/safe/types";

const SAFE = `0x${"1".repeat(40)}` as const;
const OWNER = `0x${"2".repeat(40)}` as const;
const TX_HASH = `0x${"3".repeat(64)}` as const;
const USER_OPERATION_HASH = `0x${"6".repeat(64)}` as const;
const FEE_TOKEN = `0x${"7".repeat(40)}` as const;

function proposal(
  accountType: SafeExecutionExecutor["accountType"],
): SafeProposalRecord {
  const built = buildSafeTransaction({
    chainId: 8453,
    safeAddress: SAFE,
    safeVersion: "1.3.0",
    nonce: 7n,
    calls: [{
      to: `0x${"4".repeat(40)}`,
      value: "0",
      data: "0x1234",
      operation: 0,
    }],
  });
  const id = `8453:${SAFE}:${built.safeTxHash}`;
  return {
    version: 1,
    id,
    chainId: 8453,
    safeAccountId: "safe-account",
    safeAddress: SAFE,
    safeTxHash: built.safeTxHash,
    safeVersion: "1.3.0",
    safeConfigEpoch: `0x${"5".repeat(64)}`,
    verifiedAtBlock: "1",
    calls: built.calls,
    transaction: built.transaction,
    state: "executing",
    confirmations: [],
    route: { kind: "injected", origin: "https://dapp.example" },
    createdAt: 1,
    updatedAt: 2,
    transactionHash: TX_HASH,
    executor: {
      accountId: `${accountType}-executor`,
      accountType,
      address: OWNER,
      preparedAt: 3,
      gasOverrides: {
        gasLimit: "210000",
        maxFeePerGas: "2000000000",
        maxPriorityFeePerGas: "1000000000",
      },
    },
  };
}

for (const accountType of ["privateKey", "seedPhrase", "ledger"] as const) {
  test(`Safe execution creates a normal ${accountType} transaction-history row`, () => {
    const safeProposal = proposal(accountType);
    const entry = buildSafeExecutorHistoryEntry(
      safeProposal,
      "Base",
      false,
    );
    assert.ok(entry);
    assert.equal(entry.id, getSafeExecutorHistoryId(safeProposal.id));
    assert.equal(entry.status, "pending");
    assert.equal(entry.txHash, TX_HASH);
    assert.equal(entry.tx.from, OWNER);
    assert.equal(entry.tx.to, SAFE);
    assert.equal(entry.tx.chainId, 8453);
    assert.match(entry.tx.data || "", /^0x6a761202/);
    assert.equal(entry.tx.value, "0");
    assert.equal(entry.tx.gas, "210000");
    assert.equal(entry.origin, "https://dapp.example");
    assert.equal(entry.chainName, "Base");
    assert.equal(entry.accountType, accountType);
    assert.equal(entry.accountId, `${accountType}-executor`);
    assert.equal(entry.functionName, "Execute Safe Tx #7");
    assert.deepEqual(entry.safeExecutionMeta, {
      safeAddress: SAFE,
      nonce: 7,
    });
    assert.equal(entry.broadcastUncertain, false);
  });
}

test("Safe executor history is absent until exact signed outer-tx evidence exists", () => {
  const missingHash = proposal("privateKey");
  missingHash.transactionHash = undefined;
  assert.equal(buildSafeExecutorHistoryEntry(missingHash, "Base"), null);

  const missingExecutor = proposal("seedPhrase");
  missingExecutor.executor = undefined;
  assert.equal(buildSafeExecutorHistoryEntry(missingExecutor, "Base"), null);
});

test("token-funded Safe execution records its pending UserOperation and fee token", () => {
  const safeProposal = proposal("privateKey");
  safeProposal.transactionHash = undefined;
  safeProposal.userOperationHash = USER_OPERATION_HASH;
  safeProposal.executor!.feePaymentTokenAddress = FEE_TOKEN;
  const entry = buildSafeExecutorHistoryEntry(safeProposal, "Base", false);
  assert.ok(entry);
  assert.equal(entry.txHash, undefined);
  assert.equal(entry.userOperationHash, USER_OPERATION_HASH);
  assert.equal(entry.feePaymentToken, undefined);
  assert.deepEqual(entry.erc20FeePayment, { token: FEE_TOKEN });
  const decoded = decodeSafeProposal(safeProposal);
  assert.equal(decoded.userOperationHash, USER_OPERATION_HASH);
  assert.equal(decoded.executor?.feePaymentTokenAddress, FEE_TOKEN);
});

test("Safe execution persistence rejects Bankr, impersonator, and Safe executors", () => {
  for (const accountType of ["bankr", "impersonator", "safe"]) {
    const invalid = proposal("privateKey") as any;
    invalid.executor = { ...invalid.executor, accountType };
    assert.throws(
      () => decodeSafeProposal(invalid),
      /Invalid Safe execution account type/,
    );
  }
});
