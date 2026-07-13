// Background watch-asset transport contract.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_WATCH_ASSET_MESSAGE_TYPES,
  createBackgroundWatchAssetMessageRouter,
} from "../../src/chrome/background/watchAssetRouter";

function responseCapture() {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { response, sendResponse: resolve };
}

function dependencies(overrides: Record<string, unknown> = {}): any {
  return {
    authorizeConnectedDappRequest: async () => ({
      authorized: true,
      origin: "https://app.example",
      tabId: 5,
    }),
    enforceMetadataPromptAuthorizationAtConfirmation: async () => ({
      authorized: true,
    }),
    runPendingRequestResolution: async (options: any) => options.resolve(),
    pendingResolutionConflict: () => ({ success: false, error: "conflict" }),
    getPendingWatchAssetRequests: async () => [],
    savePendingWatchAssetRequest: async () => {},
    removePendingWatchAssetRequest: async () => {},
    fetchTokenInfo: async () => null,
    addCustomToken: async () => {},
    unhidePortfolioToken: async () => {},
    writeResultToStorage: async () => {},
    openExtensionPopup: async () => {},
    sendRuntimeMessage: async () => {},
    now: () => 1234,
    ...overrides,
  };
}

test("watch-asset transport stays focused and declares every route", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/watchAssetRouter.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.split(/\r?\n/).length <= 400);
  const switchTypes = [...source.matchAll(/^ {6}case ["']([^"']+)["']/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...new Set(switchTypes)].sort(),
    [...BACKGROUND_WATCH_ASSET_MESSAGE_TYPES].sort(),
  );
});

test("watch-asset intake preserves sender binding, durable fields, and UI effects", async () => {
  const events: unknown[][] = [];
  const sender = {
    origin: "https://app.example",
    frameId: 0,
    tab: { id: 5, windowId: 9 },
  } as any;
  const route = createBackgroundWatchAssetMessageRouter(
    dependencies({
      authorizeConnectedDappRequest: async (value: unknown) => {
        events.push(["authorize", value]);
        return {
          authorized: true,
          origin: "https://app.example",
          tabId: 5,
        };
      },
      savePendingWatchAssetRequest: async (request: unknown) => {
        events.push(["save", request]);
      },
      sendRuntimeMessage: async (message: unknown) => {
        events.push(["broadcast", message]);
      },
      openExtensionPopup: async (windowId: number) => {
        events.push(["popup", windowId]);
      },
    }),
  );
  const message = {
    type: "watchAsset",
    watchAssetId: "asset-1",
    asset: {
      address: "0x1111111111111111111111111111111111111111",
      symbol: "ONE",
      decimals: 18,
    },
    chainId: 8453,
    favicon: "https://app.example/icon.png",
  };

  assert.deepEqual(
    route(message, sender, () => assert.fail("intake must not respond directly")),
    { handled: true, keepChannelOpen: false },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const request = {
    id: "asset-1",
    asset: message.asset,
    chainId: 8453,
    origin: "https://app.example",
    favicon: "https://app.example/icon.png",
    timestamp: 1234,
    tabId: 5,
    frameId: 0,
    senderOrigin: "https://app.example",
  };
  assert.deepEqual(events, [
    ["authorize", sender],
    ["save", request],
    ["broadcast", { type: "newPendingWatchAssetRequest", request }],
    ["popup", 9],
  ]);
});

test("unauthorized watch-asset intake writes the provider result only", async () => {
  const writes: unknown[][] = [];
  const route = createBackgroundWatchAssetMessageRouter(
    dependencies({
      authorizeConnectedDappRequest: async () => ({
        authorized: false,
        error: "Disconnected",
        code: 4100,
      }),
      writeResultToStorage: async (...args: unknown[]) => {
        writes.push(args);
      },
      savePendingWatchAssetRequest: async () => assert.fail("must not save"),
    }),
  );
  route(
    { type: "watchAsset", watchAssetId: "asset-2" },
    {} as any,
    () => {},
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(writes, [
    [
      "watchAssetResult:asset-2",
      { success: false, error: "Disconnected", code: 4100 },
    ],
  ]);
});

test("pending watch-asset reads keep the response channel open", async () => {
  const capture = responseCapture();
  const route = createBackgroundWatchAssetMessageRouter(
    dependencies({
      getPendingWatchAssetRequests: async () => [{ id: "pending-asset" }],
    }),
  );
  assert.deepEqual(
    route(
      { type: "getPendingWatchAssetRequests" },
      {} as any,
      capture.sendResponse,
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, [{ id: "pending-asset" }]);
});

test("watch-asset confirmation claims before metadata and storage effects", async () => {
  const events: unknown[][] = [];
  const pending = {
    id: "asset-3",
    asset: {
      address: "0x3333333333333333333333333333333333333333",
      symbol: "THREE",
      decimals: 6,
      image: "https://token.example/three.png",
    },
    chainId: 8453,
    origin: "https://app.example",
  };
  const conflict = () => ({ success: false, error: "conflict" });
  const route = createBackgroundWatchAssetMessageRouter(
    dependencies({
      pendingResolutionConflict: conflict,
      getPendingWatchAssetRequests: async () => [pending],
      runPendingRequestResolution: async (options: any) => {
        events.push(["claim", options.family, options.requestId, options.action, options.conflictResult]);
        return options.resolve();
      },
      fetchTokenInfo: async (...args: unknown[]) => {
        events.push(["metadata", ...args]);
        return { name: "Token Three" };
      },
      enforceMetadataPromptAuthorizationAtConfirmation: async (...args: unknown[]) => {
        events.push(["authorize", ...args]);
        return { authorized: true };
      },
      addCustomToken: async (token: unknown) => {
        events.push(["token", token]);
      },
      unhidePortfolioToken: async (...args: unknown[]) => {
        events.push(["unhide", ...args]);
      },
      removePendingWatchAssetRequest: async (id: string) => {
        events.push(["remove", id]);
      },
      writeResultToStorage: async (...args: unknown[]) => {
        events.push(["result", ...args]);
      },
    }),
  );
  const capture = responseCapture();

  route(
    { type: "confirmWatchAsset", watchAssetId: "asset-3" },
    {} as any,
    capture.sendResponse,
  );
  assert.deepEqual(await capture.response, { success: true });
  assert.deepEqual(events, [
    ["claim", "watchAsset", "asset-3", "confirm", conflict],
    ["metadata", pending.asset.address, 8453],
    ["authorize", "watchAsset", pending],
    [
      "token",
      {
        chainId: 8453,
        contractAddress: pending.asset.address,
        symbol: "THREE",
        name: "Token Three",
        decimals: 6,
        image: pending.asset.image,
      },
    ],
    ["unhide", 8453, pending.asset.address],
    ["remove", "asset-3"],
    ["result", "watchAssetResult:asset-3", { success: true }],
  ]);
});

test("watch-asset rejection writes the durable EIP-1193 rejection", async () => {
  const writes: unknown[][] = [];
  const pending = { id: "asset-4" };
  const route = createBackgroundWatchAssetMessageRouter(
    dependencies({
      getPendingWatchAssetRequests: async () => [pending],
      removePendingWatchAssetRequest: async () => {},
      writeResultToStorage: async (...args: unknown[]) => writes.push(args),
    }),
  );
  const capture = responseCapture();
  route(
    { type: "rejectWatchAsset", watchAssetId: "asset-4" },
    {} as any,
    capture.sendResponse,
  );
  assert.deepEqual(await capture.response, { success: true });
  assert.deepEqual(writes, [
    [
      "watchAssetResult:asset-4",
      {
        success: false,
        error: "User rejected token addition",
        code: 4001,
      },
    ],
  ]);
});
