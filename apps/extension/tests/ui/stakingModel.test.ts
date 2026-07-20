import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";
import { wchanVaultAbi } from "../../src/chrome/staking/abi";
import { normalizeWchanApy } from "../../src/components/Staking/model/stakingApy";
import {
  amountFromPercentage,
  buildStakingTransactions,
  displayAmountFromToken,
  parseStakingAmount,
  shouldBatchStakingTransactions,
  tokenAmountFromDisplay,
} from "../../src/components/Staking/model/stakingModel";

const owner = "0x1111111111111111111111111111111111111111";

test("stake planning adds approval only when allowance is insufficient", () => {
  const amount = parseStakingAmount("12.5")!;
  const approved = buildStakingTransactions({ action: "stake", amount, owner, allowance: amount });
  const needsApproval = buildStakingTransactions({ action: "stake", amount, owner, allowance: amount - 1n });

  assert.equal(approved.length, 1);
  assert.equal(needsApproval.length, 2);
  assert.equal(needsApproval[0].functionName, "approve");
  assert.equal(needsApproval[1].functionName, "deposit");
  assert.equal(decodeFunctionData({ abi: wchanVaultAbi, data: needsApproval[1].tx.data as `0x${string}` }).functionName, "deposit");
});

test("unstake and claim plans use the vault functions from the website flow", () => {
  const unstake = buildStakingTransactions({ action: "unstake", amount: 5n, owner, allowance: 0n });
  const claim = buildStakingTransactions({ action: "claim", amount: 0n, owner, allowance: 0n });

  assert.equal(unstake[0].functionName, "redeem");
  assert.equal(claim[0].functionName, "claimRewards");
});

test("batch capability stays explicit across every wallet type", () => {
  assert.equal(shouldBatchStakingTransactions({ accountType: "bankr", transactionCount: 2, hasDelegate: false }), true);
  assert.equal(shouldBatchStakingTransactions({ accountType: "privateKey", transactionCount: 2, hasDelegate: true }), true);
  assert.equal(shouldBatchStakingTransactions({ accountType: "privateKey", transactionCount: 2, hasDelegate: false }), false);
  assert.equal(shouldBatchStakingTransactions({ accountType: "seedPhrase", transactionCount: 2, hasDelegate: true }), true);
  assert.equal(shouldBatchStakingTransactions({ accountType: "ledger", transactionCount: 2, hasDelegate: false }), false);
  assert.equal(shouldBatchStakingTransactions({ accountType: "impersonator", transactionCount: 2, hasDelegate: true }), false);
  assert.equal(shouldBatchStakingTransactions({ accountType: "bankr", transactionCount: 1, hasDelegate: false }), false);
});

test("slider percentages preserve base-unit precision", () => {
  assert.equal(amountFromPercentage(1_000_000_000_000_000_001n, 25), "0.25");
});

test("staking amount display converts between WCHAN and USD", () => {
  assert.equal(displayAmountFromToken("100", true, 0.0025), "0.25");
  assert.equal(tokenAmountFromDisplay("0.25", true, 0.0025), "100");
  assert.equal(tokenAmountFromDisplay("100", false, 0.0025), "100");
});

test("zero is a resolved staking APY, not an unavailable value", () => {
  assert.deepEqual(normalizeWchanApy({ totalApy: 0, wchanApy: 0, wethApy: 0 }), {
    totalApy: 0,
    wchanApy: 0,
    wethApy: 0,
  });
});
