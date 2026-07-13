import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_SIGNING_REQUEST_MESSAGE_TYPES,
  createBackgroundSigningRequestMessageRouter,
} from "../../src/chrome/background/signingRequestRouter";

function responseCapture() {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { response, sendResponse: resolve };
}

function dependencies(overrides: Record<string, unknown> = {}): any {
  return {
    connectedProviderOriginOrReject: async () => "https://app.example",
    handleTransactionRequest: () => {},
    enqueueAuthorizedSignatureRequest: () => {},
    getPendingSignatureRequests: async () => [],
    getPendingSignatureRequestById: async () => ({ id: "sig-1" }),
    removePendingSignatureRequest: async () => {},
    getPendingTxRequests: async () => [],
    getPendingTxRequestById: async () => ({ id: "tx-1" }),
    handleConfirmTransaction: async () => ({ success: true }),
    handleRejectTransaction: async () => ({ success: true }),
    handleCancelTransaction: async () => ({ success: true }),
    runPendingRequestResolution: async (options: any) => options.resolve(),
    pendingResolutionConflict: (action: string) => ({
      success: false,
      error: action,
    }),
    pendingRequestResolutionAction: () => null,
    canSignalPendingTransactionCancellation: () => true,
    writeResultToStorage: async () => {},
    readLocalStorage: async () => ({}),
    ...overrides,
  };
}

test("single-request transport stays focused and declares every route", async () => {
  const source = await readFile(
    new URL(
      "../../src/chrome/background/signingRequestRouter.ts",
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
    [...BACKGROUND_SIGNING_REQUEST_MESSAGE_TYPES].sort(),
  );
});

test("provider intake preserves the authorized origin and exact sender scope", async () => {
  const calls: unknown[][] = [];
  const sender = {
    tab: { id: 9, windowId: 4 },
    frameId: 2,
    origin: "https://app.example",
  } as any;
  const route = createBackgroundSigningRequestMessageRouter(
    dependencies({
      connectedProviderOriginOrReject: async (...args: unknown[]) => {
        calls.push(["authorize", ...args]);
        return "https://app.example";
      },
      handleTransactionRequest: (...args: unknown[]) => {
        calls.push(["transaction", ...args]);
      },
      enqueueAuthorizedSignatureRequest: (...args: unknown[]) => {
        calls.push(["signature", ...args]);
      },
    }),
  );

  const tx = { type: "sendTransaction", txId: "tx-1" };
  const signature = { type: "signatureRequest", sigId: "sig-1" };
  assert.deepEqual(route(tx, sender, assert.fail), {
    handled: true,
    keepChannelOpen: false,
  });
  assert.deepEqual(route(signature, sender, assert.fail), {
    handled: true,
    keepChannelOpen: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, [
    ["authorize", sender, "txResult", "tx-1"],
    ["authorize", sender, "sigResult", "sig-1"],
    ["transaction", tx, "tx-1", 4, "https://app.example", 9, 2],
    ["signature", signature, sender, "https://app.example"],
  ]);
});

test("signature rejection removes the prompt before publishing its result", async () => {
  const events: string[] = [];
  const capture = responseCapture();
  const route = createBackgroundSigningRequestMessageRouter(
    dependencies({
      removePendingSignatureRequest: async () => {
        events.push("remove");
      },
      writeResultToStorage: async (key: string, result: any) => {
        events.push(`write:${key}:${result.error}`);
      },
    }),
  );

  assert.deepEqual(
    route(
      { type: "rejectSignatureRequest", sigId: "sig-1" },
      {} as any,
      capture.sendResponse,
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, {
    success: false,
    error: "Signature request cancelled by user",
  });
  assert.deepEqual(events, [
    "remove",
    "write:sigResult:sig-1:Signature request cancelled by user",
  ]);
});

test("transaction confirmation preserves an existing durable terminal result", async () => {
  let reads = 0;
  const writes: unknown[][] = [];
  const capture = responseCapture();
  const route = createBackgroundSigningRequestMessageRouter(
    dependencies({
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
    }),
  );

  route(
    { type: "confirmTransaction", txId: "tx-1", password: "secret" },
    {} as any,
    capture.sendResponse,
  );
  assert.deepEqual(await capture.response, {
    success: true,
    txHash: "0xconfirmed",
  });
  assert.deepEqual(writes, []);
});

test("transaction cancellation cannot overtake the winning request action", () => {
  const responses: unknown[] = [];
  let cancelled = false;
  const route = createBackgroundSigningRequestMessageRouter(
    dependencies({
      canSignalPendingTransactionCancellation: () => false,
      pendingRequestResolutionAction: () => "confirm",
      handleCancelTransaction: async () => {
        cancelled = true;
      },
    }),
  );

  assert.deepEqual(
    route(
      { type: "cancelTransaction", txId: "tx-1" },
      {} as any,
      (value) => responses.push(value),
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(responses, [{ success: false, error: "confirm" }]);
  assert.equal(cancelled, false);
});
