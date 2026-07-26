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
    handleAddApprovalRevokeToTransactionBatch: async () => ({ success: true }),
    handleAddApprovalRevokesToTransactionBatch: async () => ({ success: true }),
    handleAddCallsToCrossDappBatch: async () => ({ success: true }),
    handleAppendApprovalRevokeToCrossDappBatch: async () => ({ success: true }),
    handleAppendApprovalRevokesToCrossDappBatch: async () => ({ success: true }),
    resolveApprovalCleanupEvidence: async ({ evidenceIds }) =>
      (evidenceIds as string[]).map((evidenceId, index) => ({
        tokenAddress: `token:${evidenceId}`,
        spender: `spender:${evidenceId}`,
        sourceCallIndex: index,
      })),
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
    handleAddApprovalRevokeToTransactionBatch: async (...args) => {
      handlers.push(["transaction-cleanup", ...args]);
      return { success: true };
    },
    handleAddApprovalRevokesToTransactionBatch: async (...args) => {
      handlers.push(["transaction-cleanup-all", ...args]);
      return { success: true };
    },
    handleAddCallsToCrossDappBatch: async (...args) => {
      handlers.push(["batch", ...args]);
      return { success: true };
    },
  });

  await dispatch(dependencies, { type: "addToCrossDappBatch", txId: "tx-1" });
  await dispatch(dependencies, {
    type: "addApprovalRevokeToTransactionBatch",
    txId: "tx-2",
    detectionId: "detection-1",
    evidenceIds: ["evidence-1"],
  });
  await dispatch(dependencies, {
    type: "addApprovalRevokeToTransactionBatch",
    txId: "tx-3",
    detectionId: "detection-2",
    evidenceIds: ["evidence-a", "evidence-b"],
  });
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
      { family: "transaction", requestId: "tx-2", action: "move" },
      { family: "crossDappBatch", requestId: "active", action: "move" },
    ],
    [
      { family: "transaction", requestId: "tx-3", action: "move" },
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
    [
      "transaction-cleanup-all",
      "tx-2",
      [{
        tokenAddress: "token:evidence-1",
        spender: "spender:evidence-1",
        sourceCallIndex: 0,
      }],
    ],
    [
      "transaction-cleanup-all",
      "tx-3",
      [
        {
          tokenAddress: "token:evidence-a",
          spender: "spender:evidence-a",
          sourceCallIndex: 0,
        },
        {
          tokenAddress: "token:evidence-b",
          spender: "spender:evidence-b",
          sourceCallIndex: 1,
        },
      ],
    ],
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
    handleAppendApprovalRevokeToCrossDappBatch: async (...args) => {
      handlers.push(["cleanup", ...args]);
      return { success: true };
    },
    handleAppendApprovalRevokesToCrossDappBatch: async (...args) => {
      handlers.push(["cleanup-all", ...args]);
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
  await dispatch(dependencies, {
    type: "appendApprovalRevokeToCrossDappBatch",
    detectionId: "detection-3",
    evidenceIds: ["evidence-3"],
  });
  await dispatch(dependencies, {
    type: "appendApprovalRevokeToCrossDappBatch",
    detectionId: "detection-4",
    evidenceIds: ["evidence-a", "evidence-b"],
  });
  await dispatch(dependencies, { type: "rejectCrossDappBatch" });
  await dispatch(dependencies, {
    type: "confirmCrossDappBatch",
    password: "password",
    gasEstimates: [123],
    feePaymentToken: "token",
    feePaymentQuoteId: "quote-1",
  });
  assert.deepEqual(claims, [
    ["crossDappBatch", "active", "edit"],
    ["crossDappBatch", "active", "edit"],
    ["crossDappBatch", "active", "edit"],
    ["crossDappBatch", "active", "edit"],
    ["crossDappBatch", "active", "reject"],
    ["crossDappBatch", "active", "confirm"],
  ]);
  assert.deepEqual(handlers, [
    ["remove", "tx-1"],
    ["update", "tx-2", "0xdata"],
    [
      "cleanup-all",
      [{
        tokenAddress: "token:evidence-3",
        spender: "spender:evidence-3",
        sourceCallIndex: 0,
      }],
    ],
    [
      "cleanup-all",
      [
        {
          tokenAddress: "token:evidence-a",
          spender: "spender:evidence-a",
          sourceCallIndex: 0,
        },
        {
          tokenAddress: "token:evidence-b",
          spender: "spender:evidence-b",
          sourceCallIndex: 1,
        },
      ],
    ],
    ["reject"],
    ["confirm", "password", [123], "token", "quote-1"],
  ]);
});

test("cross-dapp confirmation rejects an unknown gas-payment mode", async () => {
  const result = await dispatch(createDependencies(), {
    type: "confirmCrossDappBatch",
    feePaymentToken: "arbitrary-token",
  });
  assert.deepEqual(result, {
    success: false,
    error: "Invalid gas-payment token",
  });
});
