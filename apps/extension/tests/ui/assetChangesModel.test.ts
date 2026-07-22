import assert from "node:assert/strict";
import test from "node:test";
import type { AssetChange, SimulationResult } from "../../src/chrome/txSimulation";
import {
  buildSimulationMessage,
  groupAssetChanges,
  isMetadataIncomplete,
  makeBatchCallsKey,
  makeSimulationFailureResult,
  shouldRetryMetadata,
} from "../../src/components/AssetChanges/assetChangesModel";

function asset(
  symbol: string,
  direction: "in" | "out",
  overrides: Partial<AssetChange> = {},
): AssetChange {
  return {
    address: symbol === "ETH" ? "native" : `0x${symbol.padEnd(40, "0")}`,
    name: symbol,
    symbol,
    decimals: 18,
    rawDelta: "1",
    formattedAmount: "1",
    direction,
    valueUsd: 1,
    logoUrl: "https://example.com/token.png",
    ...overrides,
  };
}

function result(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    simulationFailed: false,
    metadataComplete: true,
    ...overrides,
  };
}

test("simulation messages preserve single, atomic-batch, and non-atomic paths", () => {
  const txRequest = {
    id: "request-1",
    tx: { from: "0xfrom", chainId: 8453, to: "0xto" },
  } as Parameters<typeof buildSimulationMessage>[0]["txRequest"];

  assert.deepEqual(buildSimulationMessage({ txRequest }), {
    type: "simulateAssetChanges",
    tx: txRequest.tx,
    accountAddress: "0xfrom",
  });

  const calls = [{ to: "0xcall", data: "0x1234", value: "0x0" }];
  assert.equal(
    buildSimulationMessage({ txRequest, batchCalls: calls }).type,
    "simulateBatchAssetChanges",
  );
  assert.equal(
    buildSimulationMessage({ txRequest, batchCalls: calls, isNonAtomic: true })
      .type,
    "simulateBatchAssetChangesNonAtomic",
  );

  assert.deepEqual(
    buildSimulationMessage({
      txRequest,
      batchCalls: calls,
      safeAddress: "0xfrom",
    }),
    {
      type: "simulateSafeAssetChanges",
      calls,
      safeAddress: "0xfrom",
      chainId: 8453,
    },
  );

  const safeExecutionRequest = {
    id: "safe-execution:1",
    tx: {
      from: "0xexecutor",
      to: "0xfrom",
      data: "0xexec",
      value: "0",
      chainId: 8453,
    },
  } as Parameters<typeof buildSimulationMessage>[0]["txRequest"];
  assert.deepEqual(
    buildSimulationMessage({
      txRequest,
      batchCalls: calls,
      safeAddress: "0xfrom",
      safeExecutionRequest,
    }),
    {
      type: "simulateSafeAssetChanges",
      calls,
      safeAddress: "0xfrom",
      executionTx: safeExecutionRequest.tx,
      chainId: 8453,
    },
  );
});

test("batch call keys preserve call order and optional field changes", () => {
  assert.equal(makeBatchCallsKey(undefined), null);
  assert.equal(
    makeBatchCallsKey([
      { to: "0xa", data: "0x01" },
      { to: "0xb", value: "0x2" },
    ]),
    "0xa|0x01|;0xb||0x2",
  );
});

test("failure and retry projections preserve released simulation semantics", () => {
  assert.deepEqual(makeSimulationFailureResult("offline"), {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    simulationFailed: true,
    simulationError: "offline",
    metadataComplete: true,
  });
  assert.equal(shouldRetryMetadata(result()), false);
  assert.equal(
    shouldRetryMetadata(
      result({
        metadataComplete: false,
        tokenChanges: [asset("TOK...", "in", { valueUsd: null })],
      }),
    ),
    true,
  );
  assert.equal(
    isMetadataIncomplete([asset("TOKEN", "in")], asset("ETH", "out")),
    false,
  );
  assert.equal(
    isMetadataIncomplete(
      [asset("TOKEN", "in", { valueUsd: null })],
      null,
    ),
    true,
  );
  assert.equal(
    isMetadataIncomplete(
      [asset("TOKEN", "in", { logoUrl: undefined })],
      null,
    ),
    true,
  );
});

test("asset grouping keeps native-first order and the four-item summary cap", () => {
  const native = asset("ETH", "out");
  const changes = [
    asset("USDC", "in"),
    asset("DAI", "out"),
    asset("WETH", "in"),
    asset("WCHAN", "in"),
  ];
  const grouped = groupAssetChanges(
    result({ nativeChange: native, tokenChanges: changes }),
  );

  assert.deepEqual(grouped.allChanges, [native, ...changes]);
  assert.deepEqual(grouped.outgoing, [native, changes[1]]);
  assert.deepEqual(grouped.incoming, [changes[0], changes[2], changes[3]]);
  assert.equal(grouped.summary, "-1 ETH, -1 DAI, +1 USDC, +1 WETH, +1 more");
});
