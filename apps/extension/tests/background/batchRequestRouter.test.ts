import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_BATCH_REQUEST_MESSAGE_TYPES,
  createBackgroundBatchRequestMessageRouter,
  type BackgroundBatchRequestDependencies,
} from "../../src/chrome/background/batchRequestRouter";

const sender = {
  tab: { id: 7, windowId: 9 },
  frameId: 3,
} as chrome.runtime.MessageSender;

function createDependencies(
  overrides: Partial<BackgroundBatchRequestDependencies> = {},
): BackgroundBatchRequestDependencies {
  return {
    authorizeConnectedDappRequest: async () => ({
      authorized: true,
      origin: "https://dapp.example",
      tabId: 7,
    }),
    getTabAccount: async () => ({ id: "account-1", type: "privateKey" }),
    handleWalletGetCapabilities: async () => ({ atomic: true }),
    handleWalletSendCalls: async () => undefined,
    handleWalletGetCallsStatus: async () => ({ status: "CONFIRMED" }),
    handleWalletShowCallsStatus: () => undefined,
    getPendingBatchTxRequests: async () => [],
    handleConfirmBatchTransaction: async () => ({ success: true }),
    handleConfirmBatchTransactionPK: async () => ({ success: true }),
    handleRejectBatchTransaction: async () => ({ success: false }),
    handleSplitBatchIntoIndividualTxs: async () => ({ success: true }),
    handleRemoveCallFromPendingBatch: async () => ({ success: true }),
    handleUpdateCallInPendingBatch: async () => ({ success: true }),
    handleAppendApprovalRevokeToPendingBatch: async () => ({ success: true }),
    handleAppendApprovalRevokesToPendingBatch: async () => ({ success: true }),
    updatePendingTxRequestData: async () => {},
    runPendingRequestResolution: async (options) => options.resolve(),
    pendingResolutionConflict: () => ({ success: false, error: "conflict" }),
    writeResultToStorage: async () => {},
    ...overrides,
  };
}

const flush = () => new Promise<void>((resolve) => globalThis.setImmediate(resolve));

function dispatch(
  dependencies: BackgroundBatchRequestDependencies,
  message: Record<string, unknown>,
): Promise<{ response: any; route: any }> {
  return new Promise((resolve) => {
    const router = createBackgroundBatchRequestMessageRouter(dependencies);
    let route: any;
    route = router(message, sender, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("batch transport declares one unique route set", () => {
  assert.equal(
    new Set(BACKGROUND_BATCH_REQUEST_MESSAGE_TYPES).size,
    BACKGROUND_BATCH_REQUEST_MESSAGE_TYPES.length,
  );
});

test("capabilities pin the exact sender tab account and durable result key", async () => {
  const calls: unknown[][] = [];
  const writes: unknown[][] = [];
  const account = { id: "account-7", type: "seedPhrase" };
  const dependencies = createDependencies({
    getTabAccount: async (tabId) => {
      calls.push(["account", tabId]);
      return account;
    },
    handleWalletGetCapabilities: async (...args) => {
      calls.push(["capabilities", ...args]);
      return { capability: true };
    },
    writeResultToStorage: async (...args) => {
      writes.push(args);
    },
  });
  const router = createBackgroundBatchRequestMessageRouter(dependencies);
  const route = router(
    {
      type: "walletGetCapabilities",
      requestId: "cap-1",
      address: "0xabc",
      chainIds: [1, 8453],
    },
    sender,
    () => assert.fail("provider route must not send a direct response"),
  );
  assert.deepEqual(route, { handled: true, keepChannelOpen: false });
  await flush();
  assert.deepEqual(calls, [
    ["account", 7],
    ["capabilities", "0xabc", [1, 8453], account],
  ]);
  assert.deepEqual(writes, [
    ["capabilitiesResult:cap-1", { capability: true }],
  ]);
});

test("unauthorized capabilities publish only the provider error", async () => {
  const writes: unknown[][] = [];
  let handled = false;
  const dependencies = createDependencies({
    authorizeConnectedDappRequest: async () => ({
      authorized: false,
      error: "Unauthorized origin",
      code: 4100,
    }),
    handleWalletGetCapabilities: async () => {
      handled = true;
      return {};
    },
    writeResultToStorage: async (...args) => {
      writes.push(args);
    },
  });
  createBackgroundBatchRequestMessageRouter(dependencies)(
    { type: "walletGetCapabilities", requestId: "cap-denied" },
    sender,
    () => {},
  );
  await flush();
  assert.equal(handled, false);
  assert.deepEqual(writes, [
    [
      "capabilitiesResult:cap-denied",
      { success: false, error: "Unauthorized origin", code: 4100 },
    ],
  ]);
});

test("wallet_sendCalls claims the bundle and preserves injected sender metadata", async () => {
  let claim: any;
  let handlerArgs: unknown[] = [];
  const dependencies = createDependencies({
    runPendingRequestResolution: async (options) => {
      claim = options;
      return options.resolve();
    },
    handleWalletSendCalls: async (...args) => {
      handlerArgs = args;
    },
  });
  const route = createBackgroundBatchRequestMessageRouter(dependencies)(
    {
      type: "walletSendCalls",
      bundleId: "bundle-1",
      params: [{ calls: [] }],
      favicon: "https://dapp.example/icon.png",
    },
    sender,
    () => assert.fail("provider route must not send a direct response"),
  );
  assert.equal(route.keepChannelOpen, false);
  await flush();
  assert.deepEqual(
    {
      family: claim.family,
      requestId: claim.requestId,
      action: claim.action,
      conflict: claim.conflictResult(),
    },
    {
      family: "batchTransaction",
      requestId: "bundle-1",
      action: "confirm",
      conflict: undefined,
    },
  );
  assert.deepEqual(handlerArgs, [
    [{ calls: [] }],
    "bundle-1",
    "https://dapp.example",
    "https://dapp.example/icon.png",
    9,
    "https://dapp.example",
    7,
    3,
  ]);
});

test("status and show routes remain origin-pinned storage/provider paths", async () => {
  const writes: unknown[][] = [];
  const shown: unknown[][] = [];
  const dependencies = createDependencies({
    writeResultToStorage: async (...args) => {
      writes.push(args);
    },
    handleWalletShowCallsStatus: (...args) => shown.push(args),
  });
  const router = createBackgroundBatchRequestMessageRouter(dependencies);
  router(
    {
      type: "walletGetCallsStatus",
      requestId: "status-1",
      bundleId: "bundle-1",
    },
    sender,
    () => {},
  );
  router(
    { type: "walletShowCallsStatus", bundleId: "bundle-1" },
    sender,
    () => {},
  );
  await flush();
  assert.deepEqual(writes, [
    ["callsStatusResult:status-1", { status: "CONFIRMED" }],
  ]);
  assert.deepEqual(shown, [["bundle-1", "https://dapp.example"]]);
});

test("trusted batch decisions preserve claim family, action, and handler arguments", async () => {
  const claims: Array<[string, string, string]> = [];
  const handlers: unknown[][] = [];
  const dependencies = createDependencies({
    runPendingRequestResolution: async (options) => {
      claims.push([options.family, options.requestId, options.action]);
      return options.resolve();
    },
    handleConfirmBatchTransaction: async (...args) => {
      handlers.push(["bankr", ...args]);
      return { success: true };
    },
    handleConfirmBatchTransactionPK: async (...args) => {
      handlers.push(["local", ...args]);
      return { success: true };
    },
    handleSplitBatchIntoIndividualTxs: async (...args) => {
      handlers.push(["split", ...args]);
      return { success: true };
    },
    handleUpdateCallInPendingBatch: async (...args) => {
      handlers.push(["edit", ...args]);
      return { success: true };
    },
    handleAppendApprovalRevokeToPendingBatch: async (...args) => {
      handlers.push(["approval-cleanup", ...args]);
      return { success: true };
    },
    handleAppendApprovalRevokesToPendingBatch: async (...args) => {
      handlers.push(["approval-cleanup-all", ...args]);
      return { success: true };
    },
    updatePendingTxRequestData: async (...args) => {
      handlers.push(["tx-edit", ...args]);
    },
  });

  await dispatch(dependencies, {
    type: "confirmBatchTransactionAsync",
    bundleId: "bankr-bundle",
    password: "password",
    functionNames: ["transfer"],
    forceInclusion: false,
    feePaymentToken: "token",
    feePaymentQuoteId: "bankr-quote",
  });
  await dispatch(dependencies, {
    type: "confirmBatchTransactionAsyncPK",
    bundleId: "local-bundle",
    password: "password",
    tabId: 12,
    functionNames: ["approve"],
    gasEstimates: [1],
    forceInclusion: false,
    feePaymentToken: "token",
    feePaymentQuoteId: "local-quote",
  });
  await dispatch(dependencies, {
    type: "splitBatchIntoIndividualTxs",
    bundleId: "split-bundle",
  });
  await dispatch(dependencies, {
    type: "updateCallInPendingBatch",
    bundleId: "edit-bundle",
    callIndex: 2,
    newData: "0xdata",
  });
  await dispatch(dependencies, {
    type: "appendApprovalRevokeToPendingBatch",
    bundleId: "cleanup-bundle",
    tokenAddress: "0xtoken",
    spender: "0xspender",
  });
  await dispatch(dependencies, {
    type: "appendApprovalRevokeToPendingBatch",
    bundleId: "cleanup-all-bundle",
    approvals: [
      { tokenAddress: "0xtoken-a", spender: "0xspender-a" },
      { tokenAddress: "0xtoken-b", spender: "0xspender-b" },
    ],
  });
  await dispatch(dependencies, {
    type: "updatePendingTxRequestData",
    txId: "tx-1",
    newData: "0xnew",
  });

  assert.deepEqual(claims, [
    ["batchTransaction", "bankr-bundle", "confirm"],
    ["batchTransaction", "local-bundle", "confirm"],
    ["batchTransaction", "split-bundle", "split"],
    ["batchTransaction", "edit-bundle", "edit"],
    ["batchTransaction", "cleanup-bundle", "edit"],
    ["batchTransaction", "cleanup-all-bundle", "edit"],
    ["transaction", "tx-1", "edit"],
  ]);
  assert.deepEqual(handlers, [
    ["bankr", "bankr-bundle", "password", ["transfer"], false, "token", "bankr-quote"],
    [
      "local",
      "local-bundle",
      "password",
      12,
      ["approve"],
      [1],
      false,
      "token",
      "local-quote",
    ],
    ["split", "split-bundle", 9],
    ["edit", "edit-bundle", 2, "0xdata"],
    ["approval-cleanup", "cleanup-bundle", "0xtoken", "0xspender"],
    [
      "approval-cleanup-all",
      "cleanup-all-bundle",
      [
        { tokenAddress: "0xtoken-a", spender: "0xspender-a" },
        { tokenAddress: "0xtoken-b", spender: "0xspender-b" },
      ],
    ],
    ["tx-edit", "tx-1", "0xnew"],
  ]);
});

test("rejects a forced batch that attempts token fee payment", async () => {
  const result = await dispatch(createDependencies(), {
    type: "confirmBatchTransactionAsyncPK",
    bundleId: "forced-bundle",
    forceInclusion: true,
    feePaymentToken: "token",
    feePaymentQuoteId: "quote",
  });
  assert.deepEqual(result.response, {
    success: false,
    error: "Force inclusion requires native gas payment",
  });
});
