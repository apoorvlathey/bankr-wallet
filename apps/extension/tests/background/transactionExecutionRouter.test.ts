import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_TRANSACTION_EXECUTION_MESSAGE_TYPES,
  createBackgroundTransactionExecutionMessageRouter,
  type BackgroundTransactionExecutionDependencies,
} from "../../src/chrome/background/transactionExecutionRouter";

function dependencies(
  overrides: Partial<BackgroundTransactionExecutionDependencies> = {},
): BackgroundTransactionExecutionDependencies {
  return {
    getPendingTxRequestById: async () => ({ id: "tx-1" }),
    getTransactionNonce: async () => ({ success: true, nonce: 7 }),
    prepareTransactionReplacement: async () => ({ success: true }),
    handleConfirmTransaction: async () => ({ success: true }),
    handleConfirmTransactionAsync: async () => ({ success: true }),
    handleConfirmTransactionAsyncPK: async () => ({ success: true }),
    handleConfirmTransactionAsyncLedger: async () => ({ success: true }),
    handleConfirmImpersonatedTransaction: async () => ({ success: true }),
    handleInitiateTransfer: async () => ({ success: true, txId: "tx-new" }),
    runPendingRequestResolution: async (options: any) => options.resolve(),
    pendingResolutionConflict: (action: string) => ({
      success: false,
      error: action,
    }),
    writeResultToStorage: async () => {},
    readLocalStorage: async () => ({}),
    getFeePaymentOptions: async () => ({ success: true, options: [] }),
    getBatchFeePaymentOptions: async () => ({ success: true, options: [] }),
    getCrossDappBatchFeePaymentOptions: async () => ({
      success: true,
      options: [],
    }),
    getSafeExecutionFeePaymentOptions: async () => ({ success: true, options: [] }),
    prepareFeePaymentQuote: async () => ({ success: true, quoteId: "quote" }),
    ...overrides,
  };
}

test("Safe fee discovery and quotes are pinned to the selected executor", async () => {
  const calls: unknown[][] = [];
  const deps = dependencies({
    getSafeExecutionFeePaymentOptions: async (...args) => {
      calls.push(["options", ...args]);
      return { success: true, options: [] };
    },
    prepareFeePaymentQuote: async (...args) => {
      calls.push(["quote", ...args]);
      return { success: true, quoteId: "safe-quote" };
    },
  });
  await dispatch(deps, {
    type: "getFeePaymentOptions",
    requestKind: "safe",
    txId: "safe-proposal",
    accountId: "executor-1",
  });
  await dispatch(deps, {
    type: "prepareFeePaymentQuote",
    requestKind: "safe",
    requestId: "safe-proposal",
    accountId: "executor-1",
    feePaymentToken: `0x${"1".repeat(40)}`,
  });
  assert.deepEqual(calls, [
    ["options", "safe-proposal", "executor-1"],
    ["quote", "safeExecution", "safe-proposal", `0x${"1".repeat(40)}`, "executor-1"],
  ]);
});

test("cross-dapp fee discovery and quotes use the assembled batch family", async () => {
  const calls: unknown[][] = [];
  const deps = dependencies({
    getCrossDappBatchFeePaymentOptions: async (...args) => {
      calls.push(["options", ...args]);
      return { success: true, options: [] };
    },
    prepareFeePaymentQuote: async (...args) => {
      calls.push(["quote", ...args]);
      return { success: true, quoteId: "cross-dapp-quote" };
    },
  });
  await dispatch(deps, {
    type: "getFeePaymentOptions",
    requestKind: "crossDapp",
    txId: "cross-dapp-batch-123",
  });
  await dispatch(deps, {
    type: "prepareFeePaymentQuote",
    requestKind: "crossDapp",
    requestId: "cross-dapp-batch-123",
    feePaymentToken: `0x${"2".repeat(40)}`,
  });
  assert.deepEqual(calls, [
    ["options", "cross-dapp-batch-123"],
    [
      "quote",
      "crossDappBatch",
      "cross-dapp-batch-123",
      `0x${"2".repeat(40)}`,
      undefined,
    ],
  ]);
});

function dispatch(
  deps: BackgroundTransactionExecutionDependencies,
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender = {},
): Promise<{ response: any; route: any }> {
  return new Promise((resolve) => {
    const router = createBackgroundTransactionExecutionMessageRouter(deps);
    let route: any;
    route = router(message, sender, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("transaction execution declares one unique confirmation route set", () => {
  assert.equal(
    new Set(BACKGROUND_TRANSACTION_EXECUTION_MESSAGE_TYPES).size,
    BACKGROUND_TRANSACTION_EXECUTION_MESSAGE_TYPES.length,
  );
});

test("all transaction execution paths share the exact transaction claim", async () => {
  const claims: Array<Record<string, unknown>> = [];
  const calls: unknown[][] = [];
  const deps = dependencies({
    runPendingRequestResolution: async (options: any) => {
      claims.push({
        family: options.family,
        requestId: options.requestId,
        action: options.action,
        conflictResult: options.conflictResult,
      });
      return options.resolve();
    },
    handleConfirmTransaction: async (...args) => {
      calls.push(["bankr-immediate", ...args]);
      return { success: true };
    },
    handleConfirmTransactionAsync: async (...args) => {
      calls.push(["bankr-background", ...args]);
      return { success: true };
    },
    handleConfirmTransactionAsyncPK: async (...args) => {
      calls.push(["local", ...args]);
      return { success: true };
    },
    handleConfirmTransactionAsyncLedger: async (...args) => {
      calls.push(["ledger", ...args]);
      return { success: true };
    },
    handleConfirmImpersonatedTransaction: async (...args) => {
      calls.push(["impersonated", ...args]);
      return { success: true };
    },
  });

  const immediate = await dispatch(deps, {
    type: "confirmTransaction",
    txId: "bankr-1",
    password: "master",
  });
  const background = await dispatch(deps, {
    type: "confirmTransactionAsync",
    txId: "bankr-2",
    password: "agent-or-master",
    functionName: "swap",
    forceInclusion: false,
    feePaymentToken: "token",
    feePaymentQuoteId: "bankr-quote",
  });
  const local = await dispatch(
    deps,
    {
      type: "confirmTransactionAsyncPK",
      txId: "local-1",
      password: "master",
      functionName: "transfer",
      gasOverrides: { gas: "0x5208" },
      forceInclusion: false,
      feePaymentToken: "token",
      feePaymentQuoteId: "local-quote",
      nonce: 12,
    },
    { tab: { id: 17 } } as chrome.runtime.MessageSender,
  );
  const ledger = await dispatch(
    deps,
    {
      type: "confirmTransactionAsyncLedger",
      txId: "ledger-1",
      password: "agent",
      functionName: "approve",
      gasOverrides: { gasLimit: "0x5208" },
      forceInclusion: false,
      nonce: 13,
    },
    { tab: { id: 18 } } as chrome.runtime.MessageSender,
  );
  const impersonated = await dispatch(deps, {
    type: "confirmImpersonatedTransaction",
    txId: "impersonated-1",
    functionName: "transfer",
    gasOverrides: { gasLimit: "0x5208" },
  });

  for (const result of [immediate, background, local, ledger, impersonated]) {
    assert.deepEqual(result.response, { success: true });
    assert.deepEqual(result.route, { handled: true, keepChannelOpen: true });
  }
  assert.deepEqual(
    claims.map(({ family, requestId, action }) => ({
      family,
      requestId,
      action,
    })),
    [
      { family: "transaction", requestId: "bankr-1", action: "confirm" },
      { family: "transaction", requestId: "bankr-2", action: "confirm" },
      { family: "transaction", requestId: "local-1", action: "confirm" },
      { family: "transaction", requestId: "ledger-1", action: "confirm" },
      { family: "transaction", requestId: "impersonated-1", action: "confirm" },
    ],
  );
  assert.ok(claims.every((claim) => claim.conflictResult === deps.pendingResolutionConflict));
  assert.deepEqual(calls, [
    ["bankr-immediate", "bankr-1", "master"],
    ["bankr-background", "bankr-2", "agent-or-master", "swap", false, "token", "bankr-quote"],
    [
      "local",
      "local-1",
      "master",
      17,
      "transfer",
      { gas: "0x5208" },
      false,
      "token",
      "local-quote",
      12,
    ],
    [
      "ledger",
      "ledger-1",
      "agent",
      18,
      "approve",
      { gasLimit: "0x5208" },
      false,
      13,
    ],
    [
      "impersonated",
      "impersonated-1",
      "transfer",
      { gasLimit: "0x5208" },
    ],
  ]);
});

test("private-key and seed-phrase confirmations both preserve token selection", async () => {
  const calls: unknown[][] = [];
  const deps = dependencies({
    handleConfirmTransactionAsyncPK: async (...args) => {
      calls.push(args);
      return { success: true };
    },
  });
  await dispatch(deps, {
    type: "confirmTransactionAsyncPK",
    txId: "private-key-request",
    feePaymentToken: "token",
    feePaymentQuoteId: "private-quote",
  });
  await dispatch(deps, {
    type: "confirmTransactionAsyncPK",
    txId: "seed-phrase-request",
    feePaymentToken: "token",
    feePaymentQuoteId: "seed-quote",
  });
  assert.deepEqual(calls.map((call) => call.slice(6, 8)), [
    ["token", "private-quote"],
    ["token", "seed-quote"],
  ]);
});

test("loads the nonce through a read-only transaction route", async () => {
  const result = await dispatch(dependencies(), {
    type: "getTransactionNonce",
    txId: "local-request",
  });
  assert.deepEqual(result.response, { success: true, nonce: 7 });
  assert.deepEqual(result.route, { handled: true, keepChannelOpen: true });
});

test("prepares a replacement without claiming the pending signing request", async () => {
  const calls: unknown[][] = [];
  let claimed = false;
  const result = await dispatch(dependencies({
    prepareTransactionReplacement: async (...args) => {
      calls.push(args);
      return { success: true, txRequest: { id: "replacement" } };
    },
    runPendingRequestResolution: async () => {
      claimed = true;
      return {};
    },
  }), {
    type: "prepareTransactionReplacement",
    txId: "pending-history-id",
    kind: "cancel",
  });
  assert.equal(claimed, false);
  assert.deepEqual(calls, [["pending-history-id", "cancel"]]);
  assert.deepEqual(result.response, {
    success: true,
    txRequest: { id: "replacement" },
  });
});

test("rejects an unknown gas-payment token before execution", async () => {
  const result = await dispatch(dependencies(), {
    type: "confirmTransactionAsync",
    txId: "bankr-request",
    feePaymentToken: "arbitrary-token",
  });
  assert.deepEqual(result.response, {
    success: false,
    error: "Invalid gas-payment token",
  });
});

test("rejects token payment when force inclusion is requested", async () => {
  const result = await dispatch(dependencies(), {
    type: "confirmTransactionAsyncPK",
    txId: "forced-request",
    forceInclusion: true,
    feePaymentToken: "token",
    feePaymentQuoteId: "quote",
  });
  assert.deepEqual(result.response, {
    success: false,
    error: "Force inclusion requires native gas payment",
  });
});

test("immediate confirmation never overwrites an existing durable terminal result", async () => {
  let reads = 0;
  const writes: unknown[][] = [];
  const deps = dependencies({
    getPendingTxRequestById: async () => {
      reads += 1;
      return reads === 1 ? { id: "tx-1" } : null;
    },
    handleConfirmTransaction: async () => ({
      success: true,
      txHash: "0xconfirmed",
    }),
    readLocalStorage: async () => ({
      "txResult:tx-1": { result: { success: false, error: "expired" } },
    }),
    writeResultToStorage: async (...args: unknown[]) => {
      writes.push(args);
    },
  });

  assert.deepEqual(
    (
      await dispatch(deps, {
        type: "confirmTransaction",
        txId: "tx-1",
        password: "secret",
      })
    ).response,
    { success: true, txHash: "0xconfirmed" },
  );
  assert.deepEqual(writes, []);
});

test("local confirmation preserves an explicit tab id over sender fallback", async () => {
  let tabId: unknown;
  const deps = dependencies({
    handleConfirmTransactionAsyncPK: async (_txId, _password, receivedTabId) => {
      tabId = receivedTabId;
      return { success: true };
    },
  });
  await dispatch(
    deps,
    { type: "confirmTransactionAsyncPK", txId: "local", tabId: 31 },
    { tab: { id: 17 } } as chrome.runtime.MessageSender,
  );
  assert.equal(tabId, 31);
});

test("internal transfer intake forwards the complete message without a signing claim", async () => {
  const message = {
    type: "initiateTransfer",
    tx: { from: "0x1", to: "0x2", chainId: 8453 },
    chainName: "Base",
    tokenName: "USDC",
  };
  let received: unknown;
  let claimed = false;
  const result = await dispatch(
    dependencies({
      runPendingRequestResolution: async () => {
        claimed = true;
        return {};
      },
      handleInitiateTransfer: async (input) => {
        received = input;
        return { success: true, txId: "created" };
      },
    }),
    message,
  );
  assert.equal(received, message);
  assert.equal(claimed, false);
  assert.deepEqual(result.response, { success: true, txId: "created" });
  assert.deepEqual(result.route, { handled: true, keepChannelOpen: true });
});
