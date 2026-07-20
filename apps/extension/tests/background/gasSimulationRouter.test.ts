import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_GAS_SIMULATION_MESSAGE_TYPES,
  createBackgroundGasSimulationMessageRouter,
  type BackgroundGasSimulationDependencies,
} from "../../src/chrome/background/gasSimulationRouter";

function createDependencies(
  calls: unknown[][],
): BackgroundGasSimulationDependencies {
  const handler = (name: string) => async (...args: unknown[]) => {
    calls.push([name, ...args]);
    return { name };
  };
  return {
    estimateGas: handler("estimateGas"),
    estimateForceInclusionGas: handler("estimateForceInclusionGas"),
    estimateBatchGasSequential: handler("estimateBatchGasSequential"),
    simulateAssetChanges: handler("simulateAssetChanges"),
    simulateBatchAssetChanges: handler("simulateBatchAssetChanges"),
    simulateBatchAssetChangesNonAtomic: handler(
      "simulateBatchAssetChangesNonAtomic",
    ),
    simulateSafeAssetChanges: handler("simulateSafeAssetChanges"),
    retryTokenMetadata: handler("retryTokenMetadata"),
  };
}

test("gas/simulation transport declares unique routes and exact arguments", async () => {
  assert.equal(
    new Set(BACKGROUND_GAS_SIMULATION_MESSAGE_TYPES).size,
    BACKGROUND_GAS_SIMULATION_MESSAGE_TYPES.length,
  );
  const calls: unknown[][] = [];
  const router = createBackgroundGasSimulationMessageRouter(
    createDependencies(calls),
  );
  const dispatch = (message: Record<string, unknown>) =>
    new Promise((resolve) => {
      const route = router(message, resolve);
      assert.deepEqual(route, { handled: true, keepChannelOpen: true });
    });

  await dispatch({
    type: "estimateGas",
    tx: { to: "0x1" },
    accountAddress: "0xaccount",
    eip7702Delegate: "0xdelegate",
    eip7702AuthCount: 2,
  });
  await dispatch({
    type: "estimateForceInclusionGas",
    tx: { to: "0x2" },
    accountAddress: "0xaccount",
  });
  await dispatch({
    type: "estimateBatchGasSequential",
    calls: [{ to: "0x3" }],
    fromAddress: "0xaccount",
    chainId: 8453,
  });
  await dispatch({
    type: "simulateAssetChanges",
    tx: { to: "0x4" },
    accountAddress: "0xaccount",
  });
  await dispatch({
    type: "simulateBatchAssetChanges",
    calls: [{ to: "0x5" }],
    fromAddress: "0xaccount",
    chainId: 1,
  });
  await dispatch({
    type: "simulateBatchAssetChangesNonAtomic",
    calls: [{ to: "0x6" }],
    fromAddress: "0xaccount",
    chainId: 137,
  });
  await dispatch({
    type: "simulateSafeAssetChanges",
    calls: [{ to: "0x7" }],
    safeAddress: "0xsafe",
    executionTx: { from: "0xexecutor", to: "0xsafe" },
    chainId: 8453,
  });
  await dispatch({
    type: "retryTokenMetadata",
    chainId: 130,
    tokenChanges: [{ address: "0xtoken" }],
    accountAddress: "0xaccount",
    nativeChange: { amount: "1" },
  });

  assert.deepEqual(calls, [
    [
      "estimateGas",
      { to: "0x1" },
      "0xaccount",
      { eip7702Delegate: "0xdelegate", eip7702AuthCount: 2 },
    ],
    ["estimateForceInclusionGas", { to: "0x2" }, "0xaccount"],
    [
      "estimateBatchGasSequential",
      [{ to: "0x3" }],
      "0xaccount",
      8453,
    ],
    ["simulateAssetChanges", { to: "0x4" }, "0xaccount"],
    ["simulateBatchAssetChanges", [{ to: "0x5" }], "0xaccount", 1],
    [
      "simulateBatchAssetChangesNonAtomic",
      [{ to: "0x6" }],
      "0xaccount",
      137,
    ],
    [
      "simulateSafeAssetChanges",
      [{ to: "0x7" }],
      "0xsafe",
      { from: "0xexecutor", to: "0xsafe" },
      8453,
    ],
    [
      "retryTokenMetadata",
      130,
      [{ address: "0xtoken" }],
      "0xaccount",
      { amount: "1" },
    ],
  ]);
});

test("background delegates gas/simulation routes before unknown handling", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/messagePipeline.ts", import.meta.url),
    "utf8",
  );
  const routeIndex = source.indexOf("routes.routeBackgroundGasSimulationMessage(");
  const unknownHandlingIndex = source.indexOf("Unknown message type");
  assert.ok(routeIndex > 0 && routeIndex < unknownHandlingIndex);
  for (const messageType of BACKGROUND_GAS_SIMULATION_MESSAGE_TYPES) {
    assert.doesNotMatch(source, new RegExp(`case ["']${messageType}["']`));
  }
});
