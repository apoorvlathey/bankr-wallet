import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApprovalChange,
  AssetChange,
  SimulationResult,
} from "../../src/chrome/txSimulation";
import {
  buildSimulationMessage,
  groupAssetChanges,
  isMetadataIncomplete,
  makeBatchCallsKey,
  makeSimulationFailureResult,
  shouldRetryMetadata,
  sortApprovalChanges,
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
    approvalChanges: [],
    approvalDetectionIncomplete: false,
    simulationFailed: false,
    metadataComplete: true,
    ...overrides,
  };
}

function approval(
  overrides: Partial<ApprovalChange> = {},
): ApprovalChange {
  return {
    system: "erc20",
    tokenAddress: "0x2222222222222222222222222222222222222222",
    owner: "0x1111111111111111111111111111111111111111",
    spender: "0x3333333333333333333333333333333333333333",
    requestedAmount: "100",
    previousAmount: "0",
    remainingAmount: "100",
    expiration: null,
    verification: "verified",
    changeType: "increase",
    isUnlimited: false,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoUrl: "https://example.com/usdc.png",
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
    approvalChanges: [],
    residualApprovals: [],
    approvalDetectionIncomplete: true,
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
  assert.equal(
    shouldRetryMetadata(
      result({
        simulationFailed: true,
        metadataComplete: false,
        approvalChanges: [approval({ logoUrl: undefined })],
      }),
    ),
    true,
  );
  assert.equal(
    isMetadataIncomplete([], null, [approval({ logoUrl: undefined })]),
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

test("approvals lead summaries and sort unlimited and unverified risk first", () => {
  const verified = approval({ spender: "0x0000000000000000000000000000000000000001" });
  const unverified = approval({
    spender: "0x0000000000000000000000000000000000000002",
    verification: "unverified",
    changeType: "unknown",
  });
  const unlimited = approval({
    spender: "0x0000000000000000000000000000000000000003",
    isUnlimited: true,
  });
  const sorted = sortApprovalChanges([verified, unverified, unlimited]);
  assert.deepEqual(
    sorted.map((entry) => entry.spender),
    [unlimited.spender, unverified.spender, verified.spender],
  );

  const grouped = groupAssetChanges(
    result({
      approvalChanges: [verified],
      tokenChanges: [
        asset("USDC", "in"),
        asset("DAI", "out"),
        asset("WETH", "in"),
        asset("WCHAN", "in"),
        asset("USDT", "in"),
      ],
    }),
  );
  assert.equal(
    grouped.summary,
    "1 approval, -1 DAI, +1 USDC, +1 WETH, +2 more",
  );
});
