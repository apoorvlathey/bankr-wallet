// Background dapp-permission transport contract.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_DAPP_PERMISSION_MESSAGE_TYPES,
  createBackgroundDappPermissionMessageRouter,
} from "../../src/chrome/background/dappPermissionRouter";

function responseCapture() {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { response, sendResponse: resolve };
}

function dependencies(overrides: Record<string, unknown> = {}): any {
  return {
    handleGetDappAccounts: async () => ({ success: true, accounts: [] }),
    handleRequestDappConnection: async () => {},
    getDappPermissions: async () => ({}),
    handleGetDappConnectionContext: async () => ({ success: true }),
    getPendingDappConnectionRequests: async () => [],
    handleConfirmDappConnection: async () => ({ success: true }),
    handleRejectDappConnection: async () => ({ success: true }),
    handleRevokeDappPermission: async () => ({ success: true }),
    expireDappConnectionRequest: async () => ({ success: true }),
    expireErc7715PermissionRequest: async () => ({ success: true }),
    expireBatchAcknowledgement: async () => ({ success: true }),
    expireMetadataPrompt: async () => ({ success: true }),
    expireInjectedProviderRequest: async () => ({ success: true }),
    runPendingRequestResolution: async (options: any) => options.resolve(),
    pendingResolutionConflict: () => ({ success: false }),
    writeResultToStorage: async () => {},
    ...overrides,
  };
}

test("dapp permission transport stays focused and declares every route", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/dappPermissionRouter.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.split(/\r?\n/).length <= 400);
  const switchTypes = [...source.matchAll(/^ {6}case ["']([^"']+)["']/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...new Set(switchTypes)].sort(),
    [...BACKGROUND_DAPP_PERMISSION_MESSAGE_TYPES].sort(),
  );
});

test("provider account reads preserve the exact sender binding", async () => {
  const sender = { origin: "https://app.example", tab: { id: 8 } } as any;
  let receivedSender: unknown;
  const capture = responseCapture();
  const route = createBackgroundDappPermissionMessageRouter(
    dependencies({
      handleGetDappAccounts: async (value: unknown) => {
        receivedSender = value;
        return { success: true, accounts: ["0xabc"] };
      },
    }),
  );

  assert.deepEqual(
    route({ type: "getDappAccounts" }, sender, capture.sendResponse),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, {
    success: true,
    accounts: ["0xabc"],
  });
  assert.equal(receivedSender, sender);
});

test("connection intake remains fire-and-forget and persists queue failures", async () => {
  const sender = { origin: "https://app.example", tab: { id: 8 } } as any;
  const writes: unknown[][] = [];
  const route = createBackgroundDappPermissionMessageRouter(
    dependencies({
      handleRequestDappConnection: async () => {
        throw new Error("queue unavailable");
      },
      writeResultToStorage: async (...args: unknown[]) => {
        writes.push(args);
      },
    }),
  );

  assert.deepEqual(
    route(
      { type: "requestDappConnection", requestId: "connect-1" },
      sender,
      () => assert.fail("provider intake must not respond directly"),
    ),
    { handled: true, keepChannelOpen: false },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(writes, [
    [
      "dappConnectionResult:connect-1",
      { success: false, error: "queue unavailable" },
    ],
  ]);
});

test("provider expiry preserves family routing and exact sender binding", async () => {
  const sender = { origin: "https://app.example", tab: { id: 8 } } as any;
  const calls: unknown[][] = [];
  const route = createBackgroundDappPermissionMessageRouter(
    dependencies({
      expireDappConnectionRequest: async (...args: unknown[]) => {
        calls.push(["dapp", ...args]);
        return { success: true, family: "dapp" };
      },
      expireErc7715PermissionRequest: async (...args: unknown[]) => {
        calls.push(["permission", ...args]);
        return { success: true, family: "permission" };
      },
      expireBatchAcknowledgement: async (...args: unknown[]) => {
        calls.push(["batch", ...args]);
        return { success: true, family: "batch" };
      },
      expireMetadataPrompt: async (...args: unknown[]) => {
        calls.push(["metadata", ...args]);
        return { success: true, family: "metadata" };
      },
      expireInjectedProviderRequest: async (...args: unknown[]) => {
        calls.push(["injected", ...args]);
        return { success: true, family: "injected" };
      },
    }),
  );
  const kinds = [
    "dappConnection",
    "erc7715Permission",
    "batchTransaction",
    "addChain",
    "watchAsset",
    "transaction",
    "signature",
  ];

  for (const kind of kinds) {
    const capture = responseCapture();
    assert.deepEqual(
      route(
        { type: "expireProviderRequest", requestKind: kind, requestId: kind },
        sender,
        capture.sendResponse,
      ),
      { handled: true, keepChannelOpen: true },
    );
    assert.equal((await capture.response as any).success, true);
  }
  assert.deepEqual(calls, [
    ["dapp", "dappConnection", sender],
    ["permission", "erc7715Permission", sender],
    ["batch", "batchTransaction", sender],
    ["metadata", "addChain", "addChain", sender],
    ["metadata", "watchAsset", "watchAsset", sender],
    ["injected", "transaction", "transaction", sender],
    ["injected", "signature", "signature", sender],
  ]);
});

test("malformed provider expiry fails synchronously without domain effects", () => {
  const responses: unknown[] = [];
  const route = createBackgroundDappPermissionMessageRouter(dependencies());
  assert.deepEqual(
    route(
      { type: "expireProviderRequest", requestKind: "unknown", requestId: "x" },
      {} as any,
      (value) => responses.push(value),
    ),
    { handled: true, keepChannelOpen: false },
  );
  assert.deepEqual(responses, [
    { success: false, error: "Invalid provider request" },
  ]);
});

test("trusted permission reads and revocation preserve response shapes", async () => {
  const route = createBackgroundDappPermissionMessageRouter(
    dependencies({
      getDappPermissions: async () => ({
        first: { origin: "https://one.example" },
        second: { origin: "https://two.example" },
      }),
      handleGetDappConnectionContext: async (tabId: number) => ({ tabId }),
      getPendingDappConnectionRequests: async () => [{ id: "pending" }],
      handleRevokeDappPermission: async (origin: string) => ({
        success: true,
        origin,
      }),
    }),
  );
  const permissions = responseCapture();
  const context = responseCapture();
  const pending = responseCapture();
  const revoked = responseCapture();

  route({ type: "getDappPermissions" }, {} as any, permissions.sendResponse);
  route(
    { type: "getDappConnectionContext", tabId: "12" },
    {} as any,
    context.sendResponse,
  );
  route(
    { type: "getPendingDappConnectionRequests" },
    {} as any,
    pending.sendResponse,
  );
  route(
    { type: "revokeDappPermission", origin: "https://one.example" },
    {} as any,
    revoked.sendResponse,
  );
  assert.deepEqual(await permissions.response, {
    success: true,
    permissions: [
      { origin: "https://one.example" },
      { origin: "https://two.example" },
    ],
  });
  assert.deepEqual(await context.response, { tabId: 12 });
  assert.deepEqual(await pending.response, [{ id: "pending" }]);
  assert.deepEqual(await revoked.response, {
    success: true,
    origin: "https://one.example",
  });
});

test("connection decisions retain the all-queue serialization boundary", async () => {
  const options: any[] = [];
  const conflictResult = () => ({ success: false, error: "conflict" });
  const route = createBackgroundDappPermissionMessageRouter(
    dependencies({
      pendingResolutionConflict: conflictResult,
      handleConfirmDappConnection: async (id: string) => ({ confirmed: id }),
      handleRejectDappConnection: async (id: string) => ({ rejected: id }),
      runPendingRequestResolution: async (value: any) => {
        options.push(value);
        return value.resolve();
      },
    }),
  );
  const confirmed = responseCapture();
  const rejected = responseCapture();

  route(
    { type: "confirmDappConnection", requestId: "confirm-1" },
    {} as any,
    confirmed.sendResponse,
  );
  route(
    { type: "rejectDappConnection", requestId: "reject-1" },
    {} as any,
    rejected.sendResponse,
  );
  assert.deepEqual(await confirmed.response, { confirmed: "confirm-1" });
  assert.deepEqual(await rejected.response, { rejected: "reject-1" });
  assert.deepEqual(
    options.map(({ family, requestId, action, conflictResult: conflict }) => ({
      family,
      requestId,
      action,
      conflict,
    })),
    [
      {
        family: "dappConnection",
        requestId: "all",
        action: "confirm",
        conflict: conflictResult,
      },
      {
        family: "dappConnection",
        requestId: "all",
        action: "reject",
        conflict: conflictResult,
      },
    ],
  );
});
