import assert from "node:assert/strict";
import test from "node:test";
import type { GasEstimate } from "../../src/chrome/gasEstimation";
import { calculateNativeMaxAmount } from "../../src/components/Transfer/model/nativeMaxAmount";

function estimate(overrides: Partial<GasEstimate> = {}): GasEstimate {
  return {
    gasLimit: "25200",
    maxFeePerGas: "20000000000",
    maxPriorityFeePerGas: "1000000000",
    baseFee: "10000000000",
    estimatedCostWei: "504000000000000",
    nativePriceUsd: 3000,
    nativeCurrencySymbol: "ETH",
    accountBalance: "1000000000000000000",
    insufficientBalance: false,
    estimationFailed: false,
    dappProvidedGas: false,
    tiers: {
      slow: { maxFeePerGas: "15000000000", maxPriorityFeePerGas: "1" },
      standard: { maxFeePerGas: "20000000000", maxPriorityFeePerGas: "2" },
      fast: { maxFeePerGas: "30000000000", maxPriorityFeePerGas: "3" },
    },
    ...overrides,
  };
}

test("native MAX reserves buffered gas at the highest fee tier plus headroom", () => {
  assert.equal(
    calculateNativeMaxAmount("1", 18, estimate()),
    "0.9991684",
  );
});

test("native MAX honors a larger estimator cost and never goes below zero", () => {
  assert.equal(
    calculateNativeMaxAmount(
      "1",
      18,
      estimate({ estimatedCostWei: "1000000000000000" }),
    ),
    "0.9989",
  );
  assert.equal(calculateNativeMaxAmount("0.0001", 18, estimate()), "0");
});

test("native MAX fails closed when balance or fee data cannot be priced", () => {
  assert.equal(calculateNativeMaxAmount("not-a-balance", 18, estimate()), null);
  assert.equal(
    calculateNativeMaxAmount(
      "1",
      18,
      estimate({ gasLimit: "0", estimatedCostWei: "0", tiers: undefined }),
    ),
    null,
  );
});
