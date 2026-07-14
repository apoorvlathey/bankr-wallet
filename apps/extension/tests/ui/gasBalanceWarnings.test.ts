import assert from "node:assert/strict";
import test from "node:test";

import type { GasEstimate } from "../../src/chrome/gasEstimation";
import {
  applyForceInclusionBalanceTotals,
  getBatchedNativeOutlayWei,
  getInsufficientBalanceMessage,
} from "../../src/components/GasEstimate/model/balanceWarnings";

function estimate(overrides: Partial<GasEstimate> = {}): GasEstimate {
  return {
    gasLimit: "1",
    maxFeePerGas: "1",
    maxPriorityFeePerGas: "1",
    baseFee: "1",
    estimatedCostWei: "30",
    nativePriceUsd: null,
    nativeCurrencySymbol: "ETH",
    accountBalance: "100",
    insufficientBalance: false,
    estimationFailed: false,
    dappProvidedGas: false,
    gasBalanceChainName: "Ethereum",
    transactionValueBalance: "100",
    transactionValueChainName: "Base",
    ...overrides,
  };
}

test("force-inclusion batches total L1 gas and L2 native outlay independently", () => {
  const enough = applyForceInclusionBalanceTotals(
    [estimate(), estimate()],
    90n,
  );
  assert.equal(enough[0]?.insufficientGasBalance, false);
  assert.equal(enough[0]?.insufficientTransactionValueBalance, false);

  const shortOnBoth = applyForceInclusionBalanceTotals(
    [estimate({ accountBalance: "50" }), estimate({ accountBalance: "50" })],
    110n,
  );
  assert.equal(shortOnBoth[0]?.insufficientGasBalance, true);
  assert.equal(shortOnBoth[0]?.insufficientTransactionValueBalance, true);
  assert.equal(shortOnBoth[0]?.insufficientBalance, true);
});

test("force-inclusion warning copy names the deficient chain and purpose", () => {
  assert.equal(
    getInsufficientBalanceMessage([
      estimate({
        insufficientBalance: true,
        insufficientTransactionValueBalance: true,
      }),
    ]),
    "Insufficient Base balance for transaction value",
  );
  assert.equal(
    getInsufficientBalanceMessage([
      estimate({
        insufficientBalance: true,
        insufficientGasBalance: true,
      }),
    ]),
    "Insufficient Ethereum balance for gas",
  );
  assert.equal(
    getInsufficientBalanceMessage([
      estimate({
        insufficientBalance: true,
        insufficientGasBalance: true,
        insufficientTransactionValueBalance: true,
      }),
    ]),
    "Insufficient Ethereum balance for gas and Base balance for transaction value",
  );
});

test("batched native outlay uses the larger encoded or inner-call requirement", () => {
  assert.equal(getBatchedNativeOutlayWei("0x5", ["0x3", "0x4"]), 7n);
  assert.equal(getBatchedNativeOutlayWei("0x9", ["0x3", "0x4"]), 9n);
});
