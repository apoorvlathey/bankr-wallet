import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregatePrivacyCommitmentPortfolio,
  type PrivacyPortfolioCommitmentInput,
  type PrivacyPortfolioOperationInput,
} from "../../src/chrome/privacy/commitments/portfolio";

function operation(
  state: PrivacyPortfolioOperationInput["state"],
  id = "shield-1",
): PrivacyPortfolioOperationInput {
  return {
    id,
    state,
    shieldedAmountWei: "4950",
    poolValueWei: state === "awaiting_asp" ? "4950" : null,
    updatedAt: 20,
  };
}

function commitment(
  status: PrivacyPortfolioCommitmentInput["status"],
  sourceOperationId: string | null = "shield-1",
  depositor = "0x1111111111111111111111111111111111111111",
): PrivacyPortfolioCommitmentInput {
  return {
    sourceOperationId,
    depositor,
    status,
    balanceWei: status === "spent" || status === "ragequit_recovered" ? "0" : "4950",
    updatedAt: 30,
  };
}

test("confirmed onchain Shield operations count before ASP indexing", () => {
  const confirming = aggregatePrivacyCommitmentPortfolio(
    [],
    [operation("awaiting_event")],
  );
  assert.equal(confirming.confirmedBalanceWei, "4950");
  assert.equal(confirming.pendingBalanceWei, "0");

  const awaitingAsp = aggregatePrivacyCommitmentPortfolio(
    [],
    [operation("awaiting_asp")],
  );
  assert.equal(awaitingAsp.confirmedBalanceWei, "4950");
  assert.equal(awaitingAsp.pendingBalanceWei, "4950");
  assert.equal(awaitingAsp.recoverableBalanceWei, "0");
});

test("commitment lineage supersedes its source operation without double counting", () => {
  const portfolio = aggregatePrivacyCommitmentPortfolio(
    [commitment("awaiting_asp")],
    [operation("awaiting_asp")],
  );
  assert.equal(portfolio.confirmedBalanceWei, "4950");
  assert.equal(portfolio.pendingBalanceWei, "4950");
  assert.equal(portfolio.readyBalanceWei, "0");
  assert.equal(portfolio.recoverableBalanceWei, "4950");
});

test("total confirmed balance remains separate from withdrawal and recovery availability", () => {
  const portfolio = aggregatePrivacyCommitmentPortfolio(
    [
      commitment("private_ready", "shield-ready"),
      commitment("withdrawal_pending", "shield-withdrawing"),
      commitment("asp_declined", "shield-recoverable"),
    ],
    [operation("awaiting_event", "shield-indexing")],
  );
  assert.equal(portfolio.confirmedBalanceWei, "19800");
  assert.equal(portfolio.readyBalanceWei, "4950");
  assert.equal(portfolio.pendingBalanceWei, "0");
  assert.equal(portfolio.recoverableBalanceWei, "4950");
  assert.equal(portfolio.attentionCount, 1);
});

test("an indexed ASP-pending commitment is publicly withdrawable without becoming attention", () => {
  const portfolio = aggregatePrivacyCommitmentPortfolio(
    [commitment("awaiting_asp")],
    [operation("awaiting_asp")],
  );
  assert.equal(portfolio.confirmedBalanceWei, "4950");
  assert.equal(portfolio.pendingBalanceWei, "4950");
  assert.equal(portfolio.recoverableBalanceWei, "4950");
  assert.equal(portfolio.attentionCount, 0);
});

test("public recovery balance is global to the privacy identity", () => {
  const portfolio = aggregatePrivacyCommitmentPortfolio([
    commitment("awaiting_asp", "shield-active"),
    commitment(
      "asp_declined",
      "shield-other",
      "0x2222222222222222222222222222222222222222",
    ),
  ], [], "0x1111111111111111111111111111111111111111");

  assert.equal(portfolio.confirmedBalanceWei, "9900");
  assert.equal(portfolio.recoverableBalanceWei, "9900");
  assert.equal(portfolio.attentionCount, 1);
});
