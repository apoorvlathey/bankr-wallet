import assert from "node:assert/strict";
import test from "node:test";

import { estimateFees, estimateFeeTiers } from "../../src/chrome/feeEstimation";
import { bumpGasForEip7702Auth } from "../../src/chrome/gasEstimation";

test("EIP-7702 intrinsic gas bump preserves standard and non-standard floors", () => {
  assert.equal(bumpGasForEip7702Auth(1, 21_000n, 0), 21_000n);
  assert.equal(bumpGasForEip7702Auth(1, 21_000n, 1), 80_000n);
  assert.equal(bumpGasForEip7702Auth(1, 100_000n, 2), 200_000n);
  assert.equal(bumpGasForEip7702Auth(4326, 21_000n, 1), 300_000n);
  assert.equal(bumpGasForEip7702Auth(4326, 400_000n, 2), 700_000n);
});

test("fee history tiers preserve percentiles, spacing, and next-base prediction", async () => {
  const baseFee = 100_000_000_000n;
  const client = {
    async getBlock() {
      return { baseFeePerGas: baseFee, gasUsed: 750n, gasLimit: 1_000n };
    },
    async request(request: { method: string }) {
      assert.equal(request.method, "eth_feeHistory");
      return {
        reward: [
          ["0x1e8480"],
          ["0x2dc6c0"],
          ["0x3d0900"],
          ["0x4c4b40"],
        ],
      };
    },
  } as any;
  const result = await estimateFeeTiers(client, 8453);
  assert.ok(result);
  assert.equal(result.baseFee, baseFee);
  assert.equal(result.predictedNextBaseFee, 106_250_000_000n);
  assert.equal(result.tiers.slow.maxPriorityFeePerGas, 3_000_000n);
  assert.equal(result.tiers.standard.maxPriorityFeePerGas, 4_000_000n);
  assert.equal(result.tiers.fast.maxPriorityFeePerGas, 5_000_000n);
  const single = await estimateFees(client, 8453);
  assert.deepEqual(single?.tiers, result.tiers);
  assert.equal(single?.maxFeePerGas, result.tiers.standard.maxFeePerGas);
});

test("chains without baseFee retain the legacy gas-price ladder and floor", async () => {
  const client = {
    async getBlock() {
      return { baseFeePerGas: null, gasUsed: 0n, gasLimit: 1n };
    },
    async request(request: { method: string }) {
      assert.equal(request.method, "eth_gasPrice");
      return "0x0";
    },
  } as any;
  const result = await estimateFeeTiers(client, 1);
  assert.ok(result);
  assert.equal(result.baseFee, 0n);
  assert.equal(result.tiers.slow.maxFeePerGas, 50_000_000n);
  assert.equal(result.tiers.standard.maxFeePerGas, 55_000_000n);
  assert.equal(result.tiers.fast.maxFeePerGas, 62_500_000n);
});
