// Background chain-prompt transport contract.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_CHAIN_PROMPT_MESSAGE_TYPES,
  createBackgroundChainPromptMessageRouter,
} from "../../src/chrome/background/chainPromptRouter";

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
      tabId: 6,
    }),
    enforceMetadataPromptAuthorizationAtConfirmation: async () => ({
      authorized: true,
    }),
    assertRpcEndpointAllowedForOrigin: () => {},
    runPendingRequestResolution: async (options: any) => options.resolve(),
    pendingResolutionConflict: () => ({ success: false, error: "conflict" }),
    getPendingAddChainRequests: async () => [],
    savePendingAddChainRequest: async () => {},
    removePendingAddChainRequest: async () => {},
    getActiveAccount: async () => null,
    approveDappNetworkRequest: async () => ({
      success: false,
      error: "not added",
    }),
    writeResultToStorage: async () => {},
    openExtensionPopup: async () => {},
    sendRuntimeMessage: async () => {},
    handleDappChainSwitchNotification: async () => ({ success: true }),
    now: () => 5678,
    ...overrides,
  };
}

test("chain-prompt transport stays focused and declares every route", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/chainPromptRouter.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.split(/\r?\n/).length <= 400);
  const switchTypes = [...source.matchAll(/^ {6}case ["']([^"']+)["']/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...new Set(switchTypes)].sort(),
    [...BACKGROUND_CHAIN_PROMPT_MESSAGE_TYPES].sort(),
  );
});

test("add-chain intake preserves RPC origin checks and sender metadata", async () => {
  const events: unknown[][] = [];
  const sender = { frameId: 0, tab: { id: 6, windowId: 10 } } as any;
  const message = {
    type: "addEthereumChain",
    requestId: "chain-1",
    chainId: 999,
    chainName: "Test Chain",
    nativeCurrency: { name: "Test", symbol: "TST", decimals: 18 },
    rpcUrls: ["https://rpc-one.example", "https://rpc-two.example"],
    blockExplorerUrls: ["https://explorer.example"],
    favicon: "https://app.example/icon.png",
  };
  const route = createBackgroundChainPromptMessageRouter(
    dependencies({
      authorizeConnectedDappRequest: async (value: unknown) => {
        events.push(["authorize", value]);
        return {
          authorized: true,
          origin: "https://app.example",
          tabId: 6,
        };
      },
      assertRpcEndpointAllowedForOrigin: (...args: unknown[]) => {
        events.push(["rpc", ...args]);
      },
      savePendingAddChainRequest: async (request: unknown) => {
        events.push(["save", request]);
      },
      sendRuntimeMessage: async (value: unknown) => {
        events.push(["broadcast", value]);
      },
      openExtensionPopup: async (windowId: number) => {
        events.push(["popup", windowId]);
      },
    }),
  );

  assert.deepEqual(
    route(message, sender, () => assert.fail("intake must not respond directly")),
    { handled: true, keepChannelOpen: false },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const request = {
    id: "chain-1",
    chainId: 999,
    chainName: "Test Chain",
    nativeCurrency: message.nativeCurrency,
    rpcUrls: message.rpcUrls,
    blockExplorerUrls: message.blockExplorerUrls,
    origin: "https://app.example",
    favicon: message.favicon,
    timestamp: 5678,
    tabId: 6,
    frameId: 0,
    senderOrigin: "https://app.example",
  };
  assert.deepEqual(events, [
    ["authorize", sender],
    ["rpc", "https://rpc-one.example", "https://app.example"],
    ["rpc", "https://rpc-two.example", "https://app.example"],
    ["save", request],
    ["broadcast", { type: "newPendingAddChainRequest", request }],
    ["popup", 10],
  ]);
});

test("unauthorized add-chain intake writes only its durable provider result", async () => {
  const writes: unknown[][] = [];
  const route = createBackgroundChainPromptMessageRouter(
    dependencies({
      authorizeConnectedDappRequest: async () => ({
        authorized: false,
        error: "Disconnected",
        code: 4100,
      }),
      writeResultToStorage: async (...args: unknown[]) => writes.push(args),
      savePendingAddChainRequest: async () => assert.fail("must not save"),
    }),
  );
  route(
    { type: "addEthereumChain", requestId: "chain-denied" },
    {} as any,
    () => {},
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(writes, [
    [
      "addChainResult:chain-denied",
      { success: false, error: "Disconnected", code: 4100 },
    ],
  ]);
});

test("pending add-chain reads keep the response channel open", async () => {
  const capture = responseCapture();
  const route = createBackgroundChainPromptMessageRouter(
    dependencies({
      getPendingAddChainRequests: async () => [{ id: "pending-chain" }],
    }),
  );
  assert.deepEqual(
    route(
      { type: "getPendingAddChainRequests" },
      {} as any,
      capture.sendResponse,
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, [{ id: "pending-chain" }]);
});

test("add-chain confirmation preserves authorization and network write inputs", async () => {
  const events: unknown[][] = [];
  const pending = {
    id: "chain-2",
    chainId: 999,
    chainName: "Pending Name",
    rpcUrls: ["https://pending-rpc.example"],
    blockExplorerUrls: ["https://pending-explorer.example"],
    nativeCurrency: { name: "Pending", symbol: "PND", decimals: 18 },
    origin: "https://app.example",
  };
  const conflict = () => ({ success: false, error: "conflict" });
  const route = createBackgroundChainPromptMessageRouter(
    dependencies({
      pendingResolutionConflict: conflict,
      getPendingAddChainRequests: async () => [pending],
      getActiveAccount: async () => ({ type: "privateKey" }),
      runPendingRequestResolution: async (options: any) => {
        events.push(["claim", options.family, options.requestId, options.action, options.conflictResult]);
        return options.resolve();
      },
      enforceMetadataPromptAuthorizationAtConfirmation: async (...args: unknown[]) => {
        events.push(["authorize", ...args]);
        return { authorized: true };
      },
      approveDappNetworkRequest: async (input: unknown) => {
        events.push(["network", input]);
        return {
          success: true,
          networksInfo: {
            "Chosen Name": { chainId: 1000, rpcUrl: "https://stored-rpc.example" },
          },
          chainName: "Chosen Name",
          chainId: 1000,
          shouldSwitch: true,
        };
      },
      removePendingAddChainRequest: async (id: string) => {
        events.push(["remove", id]);
      },
      writeResultToStorage: async (...args: unknown[]) => {
        events.push(["result", ...args]);
      },
    }),
  );
  const capture = responseCapture();
  route(
    {
      type: "confirmAddChain",
      requestId: "chain-2",
      chainName: "Chosen Name",
      chainId: 1000,
      rpcUrl: "https://chosen-rpc.example",
      explorer: "https://chosen-explorer.example",
    },
    {} as any,
    capture.sendResponse,
  );
  const result = {
    success: true,
    rpcUrl: "https://stored-rpc.example",
    chainName: "Chosen Name",
    shouldSwitch: true,
  };
  assert.deepEqual(await capture.response, result);
  assert.deepEqual(events, [
    ["claim", "addChain", "chain-2", "confirm", conflict],
    ["authorize", "addChain", pending],
    [
      "network",
      {
        chainName: "Chosen Name",
        entry: {
          chainId: 1000,
          rpcUrl: "https://chosen-rpc.example",
          isCustom: true,
          explorer: "https://chosen-explorer.example",
          nativeCurrency: pending.nativeCurrency,
        },
        requestChainId: 999,
        switchIfSupportedForAccountType: "privateKey",
        requestOrigin: "https://app.example",
      },
    ],
    ["remove", "chain-2"],
    ["result", "addChainResult:chain-2", result],
  ]);
});

test("add-chain rejection writes the durable EIP-1193 rejection", async () => {
  const writes: unknown[][] = [];
  const route = createBackgroundChainPromptMessageRouter(
    dependencies({
      getPendingAddChainRequests: async () => [{ id: "chain-3" }],
      removePendingAddChainRequest: async () => {},
      writeResultToStorage: async (...args: unknown[]) => writes.push(args),
    }),
  );
  const capture = responseCapture();
  route(
    { type: "rejectAddChain", requestId: "chain-3" },
    {} as any,
    capture.sendResponse,
  );
  assert.deepEqual(await capture.response, { success: true });
  assert.deepEqual(writes, [
    [
      "addChainResult:chain-3",
      {
        success: false,
        error: "User rejected chain addition",
        code: 4001,
      },
    ],
  ]);
});

test("chain-switch notices preserve authorization and exact sender binding", async () => {
  const sender = { origin: "https://app.example", tab: { id: 6 } } as any;
  let received: unknown[] | undefined;
  const route = createBackgroundChainPromptMessageRouter(
    dependencies({
      handleDappChainSwitchNotification: async (...args: unknown[]) => {
        received = args;
        return { success: true, skipped: true };
      },
    }),
  );
  const message = { type: "dappChainSwitchNotification", chainId: 8453 };
  const capture = responseCapture();
  assert.deepEqual(route(message, sender, capture.sendResponse), {
    handled: true,
    keepChannelOpen: true,
  });
  assert.deepEqual(await capture.response, { success: true, skipped: true });
  assert.deepEqual(received, [message, sender]);
});

test("unauthorized chain-switch notices preserve the provider error", async () => {
  const capture = responseCapture();
  const route = createBackgroundChainPromptMessageRouter(
    dependencies({
      authorizeConnectedDappRequest: async () => ({
        authorized: false,
        error: "Disconnected",
        code: 4100,
      }),
      handleDappChainSwitchNotification: async () =>
        assert.fail("must not notify"),
    }),
  );
  route(
    { type: "dappChainSwitchNotification", chainId: 8453 },
    {} as any,
    capture.sendResponse,
  );
  assert.deepEqual(await capture.response, {
    success: false,
    error: "Disconnected",
    code: 4100,
  });
});
