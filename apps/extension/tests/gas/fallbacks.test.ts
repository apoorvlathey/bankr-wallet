import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { estimateIndividualWithFallback } from "../../src/chrome/gas/batchFallback";
import { buildBatchEstimates } from "../../src/chrome/gas/batchResult";

test("independent batch fallback retains 20% estimates and the 500k dependent-call limit", async () => {
  let calls = 0;
  const client = {
    async estimateGas() {
      calls++;
      if (calls === 1) return 100_000n;
      throw new Error("dependent state unavailable");
    },
  } as any;
  const result = await estimateIndividualWithFallback(
    [
      { to: "0x1", data: "0x", value: "0x0" },
      { to: "0x2", data: "0x1234", value: "0x1" },
    ],
    "0x0000000000000000000000000000000000000001",
    client,
  );
  assert.deepEqual(result, [
    { gasLimit: 120_000n, fallbackUsed: false },
    { gasLimit: 500_000n, fallbackUsed: true },
  ]);
});

test("batch result construction keeps per-call cost and balance warnings", () => {
  const estimates = buildBatchEstimates(
    [
      { gasLimit: 100n, fallbackUsed: false },
      { gasLimit: 300n, fallbackUsed: true },
    ],
    {
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      baseFee: 1n,
      balance: 250n,
      nativePriceUsd: 2_000,
      nativeCurrencySymbol: "ETH",
      tiers: undefined,
      predictedNextBaseFee: "1",
    },
  );
  assert.equal(estimates[0].estimatedCostWei, "200");
  assert.equal(estimates[0].insufficientBalance, false);
  assert.equal(estimates[1].estimatedCostWei, "600");
  assert.equal(estimates[1].insufficientBalance, true);
  assert.equal(estimates[1].fallbackUsed, true);
});

test("batch coordinator preserves simulation order and conservative buffers", async () => {
  const root = new URL("../../src/chrome/gas/", import.meta.url);
  const coordinator = await readFile(new URL("batchEstimator.ts", root), "utf8");
  const simulate = coordinator.indexOf("await tryEthSimulateV1(");
  const inject = coordinator.indexOf("await tryBatchGasInjection(");
  const fallback = coordinator.indexOf("await estimateIndividualWithFallback(");
  assert.ok(simulate > 0 && simulate < inject && inject < fallback);

  const v1 = await readFile(new URL("batchSimulation.ts", root), "utf8");
  assert.match(v1, /gasLimit: BigInt\(result\.gasUsed\) \* 2n/);
  assert.match(v1, /gasLimit: 200_000n, fallbackUsed: true/);
  const injection = await readFile(new URL("batchInjection.ts", root), "utf8");
  assert.match(injection, /gasLimit: gas \* 2n/);

  const single = await readFile(new URL("singleEstimator.ts", root), "utf8");
  assert.match(single, /estimationError: "No RPC URL configured for this chain"/);
  assert.match(single, /gasLimit = 200_000n/);
  assert.match(single, /stateOverride/);
});
