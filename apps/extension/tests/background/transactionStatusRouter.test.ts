import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_TRANSACTION_STATUS_MESSAGE_TYPES,
  createBackgroundTransactionStatusMessageRouter,
} from "../../src/chrome/background/transactionStatusRouter";

function responseCapture() {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { response, sendResponse: resolve };
}

function dependencies(overrides: Record<string, unknown> = {}): any {
  return {
    handleCancelProcessingTx: async () => ({ success: true }),
    failedTxResults: new Map(),
    removeLocalStorage: () => {},
    getTxHistory: async () => [],
    queueAssetChangesBackfill: async () => ({ success: true }),
    getProcessingTxs: async () => [],
    clearTxHistory: async () => {},
    clearTxHistoryForAddresses: async () => {},
    clearAllNonces: () => {},
    checkPendingTxReceipt: async () => "pending",
    ...overrides,
  };
}

test("transaction status transport stays focused and declares every route", async () => {
  const source = await readFile(
    new URL(
      "../../src/chrome/background/transactionStatusRouter.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.split(/\r?\n/).length <= 400);
  const switchTypes = [...source.matchAll(/^ {6}case ["']([^"']+)["']/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...new Set(switchTypes)].sort(),
    [...BACKGROUND_TRANSACTION_STATUS_MESSAGE_TYPES].sort(),
  );
});

test("failed notification results remain destructive one-time reads", () => {
  const removed: string[] = [];
  const result = { txId: "tx-1", error: "failed" };
  const failedTxResults = new Map([["notice-1", result]]);
  const route = createBackgroundTransactionStatusMessageRouter(
    dependencies({
      failedTxResults,
      removeLocalStorage: (key: string) => removed.push(key),
    }),
  );
  const responses: unknown[] = [];

  assert.deepEqual(
    route(
      { type: "getFailedTxResult", notificationId: "notice-1" },
      (value) => responses.push(value),
    ),
    { handled: true, keepChannelOpen: false },
  );
  assert.deepEqual(responses, [result]);
  assert.equal(failedTxResults.has("notice-1"), false);
  assert.deepEqual(removed, ["notification-notice-1"]);
});

test("history clearing forwards only string addresses", async () => {
  let received: unknown;
  const capture = responseCapture();
  const route = createBackgroundTransactionStatusMessageRouter(
    dependencies({
      clearTxHistoryForAddresses: async (addresses: string[]) => {
        received = addresses;
      },
    }),
  );

  assert.deepEqual(
    route(
      {
        type: "clearTxHistoryForAddresses",
        addresses: ["0xone", null, 123, "0xtwo"],
      },
      capture.sendResponse,
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, { success: true });
  assert.deepEqual(received, ["0xone", "0xtwo"]);
});

test("receipt checks preserve identifiers and wrap the status response", async () => {
  const calls: unknown[][] = [];
  const capture = responseCapture();
  const route = createBackgroundTransactionStatusMessageRouter(
    dependencies({
      checkPendingTxReceipt: async (...args: unknown[]) => {
        calls.push(args);
        return "confirmed";
      },
    }),
  );

  assert.deepEqual(
    route(
      {
        type: "checkPendingTxReceipt",
        txId: "tx-1",
        txHash: "0xhash",
        chainId: 8453,
      },
      capture.sendResponse,
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, { status: "confirmed" });
  assert.deepEqual(calls, [["tx-1", "0xhash", 8453]]);
});
