import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_CROSS_DAPP_BATCH_MESSAGE_TYPES,
  createBackgroundCrossDappBatchMessageRouter,
  type BackgroundCrossDappBatchDependencies,
} from "../../src/chrome/background/crossDappBatchRouter";

function createDependencies(
  overrides: Partial<BackgroundCrossDappBatchDependencies> = {},
): BackgroundCrossDappBatchDependencies {
  return {
    runPendingRequestResolution: async (options) => options.resolve(),
    runPendingRequestResolutions: async (options) => options.resolve(),
    pendingResolutionConflict: (action) => ({ error: String(action) }),
    handleAddToCrossDappBatch: async () => ({ success: true }),
    handleAddCallsToCrossDappBatch: async () => ({ success: true }),
    handleRemoveFromCrossDappBatch: async () => ({ success: true }),
    handleUpdateCallInCrossDappBatch: async () => ({ success: true }),
    handleRejectCrossDappBatch: async () => ({ success: false }),
    handleConfirmCrossDappBatch: async () => ({ success: true }),
    ...overrides,
  };
}

function dispatch(
  dependencies: BackgroundCrossDappBatchDependencies,
  message: Record<string, unknown>,
): Promise<any> {
  return new Promise((resolve) => {
    const route = createBackgroundCrossDappBatchMessageRouter(dependencies)(
      message,
      resolve,
    );
    assert.deepEqual(route, { handled: true, keepChannelOpen: true });
  });
}

test("cross-dapp transport declares one unique route set", () => {
  assert.equal(
    new Set(BACKGROUND_CROSS_DAPP_BATCH_MESSAGE_TYPES).size,
    BACKGROUND_CROSS_DAPP_BATCH_MESSAGE_TYPES.length,
  );
});

test("single and ERC-5792 sources acquire both source and active-batch claims", async () => {
  const claims: any[][] = [];
  const handlers: unknown[][] = [];
  const dependencies = createDependencies({
    runPendingRequestResolutions: async (options) => {
      claims.push(options.requests);
      assert.deepEqual(options.conflictResult("x", "y", "edit"), {
        error: "edit",
      });
      return options.resolve();
    },
    handleAddToCrossDappBatch: async (...args) => {
      handlers.push(["transaction", ...args]);
      return { success: true };
    },
    handleAddCallsToCrossDappBatch: async (...args) => {
      handlers.push(["batch", ...args]);
      return { success: true };
    },
  });

  await dispatch(dependencies, { type: "addToCrossDappBatch", txId: "tx-1" });
  await dispatch(dependencies, {
    type: "addCallsToCrossDappBatch",
    bundleId: "bundle-1",
  });
  assert.deepEqual(claims, [
    [
      { family: "transaction", requestId: "tx-1", action: "move" },
      { family: "crossDappBatch", requestId: "active", action: "move" },
    ],
    [
      {
        family: "batchTransaction",
        requestId: "bundle-1",
        action: "move",
      },
      { family: "crossDappBatch", requestId: "active", action: "move" },
    ],
  ]);
  assert.deepEqual(handlers, [
    ["transaction", "tx-1"],
    ["batch", "bundle-1"],
  ]);
});

test("active cross-dapp edits and decisions retain one claim and exact inputs", async () => {
  const claims: Array<[string, string, string]> = [];
  const handlers: unknown[][] = [];
  const dependencies = createDependencies({
    runPendingRequestResolution: async (options) => {
      claims.push([options.family, options.requestId, options.action]);
      return options.resolve();
    },
    handleRemoveFromCrossDappBatch: async (...args) => {
      handlers.push(["remove", ...args]);
      return { success: true };
    },
    handleUpdateCallInCrossDappBatch: async (...args) => {
      handlers.push(["update", ...args]);
      return { success: true };
    },
    handleRejectCrossDappBatch: async () => {
      handlers.push(["reject"]);
      return { success: false };
    },
    handleConfirmCrossDappBatch: async (...args) => {
      handlers.push(["confirm", ...args]);
      return { success: true };
    },
  });

  await dispatch(dependencies, {
    type: "removeFromCrossDappBatch",
    txId: "tx-1",
  });
  await dispatch(dependencies, {
    type: "updateCallInCrossDappBatch",
    txId: "tx-2",
    newData: "0xdata",
  });
  await dispatch(dependencies, { type: "rejectCrossDappBatch" });
  await dispatch(dependencies, {
    type: "confirmCrossDappBatch",
    password: "password",
    gasEstimates: [123],
  });
  assert.deepEqual(claims, [
    ["crossDappBatch", "active", "edit"],
    ["crossDappBatch", "active", "edit"],
    ["crossDappBatch", "active", "reject"],
    ["crossDappBatch", "active", "confirm"],
  ]);
  assert.deepEqual(handlers, [
    ["remove", "tx-1"],
    ["update", "tx-2", "0xdata"],
    ["reject"],
    ["confirm", "password", [123]],
  ]);
});
