import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_PROVIDER_RPC_MESSAGE_TYPES,
  createBackgroundProviderRpcMessageRouter,
} from "../../src/chrome/background/providerRpcRouter";

const sender = {
  tab: { id: 42 },
  origin: "https://dapp.example",
} as chrome.runtime.MessageSender;

test("provider RPC transport declares one unique route", () => {
  assert.equal(
    new Set(BACKGROUND_PROVIDER_RPC_MESSAGE_TYPES).size,
    BACKGROUND_PROVIDER_RPC_MESSAGE_TYPES.length,
  );
});

test("unauthorized RPC requests publish the exact durable rejection", async () => {
  let forwarded = false;
  let finish!: (value: unknown) => void;
  const published = new Promise((resolve) => {
    finish = resolve;
  });
  const router = createBackgroundProviderRpcMessageRouter({
    authorizeConnectedDappRequest: async (received) => {
      assert.equal(received, sender);
      return { authorized: false, error: "Not connected", code: 4100 };
    },
    handleSafeRpcRequest: async () => {
      forwarded = true;
    },
    writeResultToStorage: async (key, result) => finish({ key, result }),
  });

  assert.deepEqual(router({ type: "rpcRequest", rpcId: "rpc-1" }, sender), {
    handled: true,
    keepChannelOpen: false,
  });
  assert.deepEqual(await published, {
    key: "rpcResult:rpc-1",
    result: { error: "Not connected", code: 4100 },
  });
  assert.equal(forwarded, false);
});

test("authorized RPC requests preserve origin, arguments, and durable success", async () => {
  let finish!: (value: unknown) => void;
  const published = new Promise((resolve) => {
    finish = resolve;
  });
  const calls: unknown[][] = [];
  const router = createBackgroundProviderRpcMessageRouter({
    authorizeConnectedDappRequest: async () => ({
      authorized: true,
      origin: "https://authorized.example",
    }),
    handleSafeRpcRequest: async (...args) => {
      calls.push(args);
      return "0xresult";
    },
    writeResultToStorage: async (key, result) => finish({ key, result }),
  });

  const route = router(
    {
      type: "rpcRequest",
      rpcId: "rpc-2",
      rpcUrl: "https://rpc.example",
      method: "eth_getBalance",
      params: ["0xabc", "latest"],
    },
    sender,
  );
  assert.deepEqual(route, { handled: true, keepChannelOpen: false });
  assert.deepEqual(await published, {
    key: "rpcResult:rpc-2",
    result: { result: "0xresult" },
  });
  assert.deepEqual(calls, [
    [
      "https://rpc.example",
      "eth_getBalance",
      ["0xabc", "latest"],
      "https://authorized.example",
    ],
  ]);
});

test("safe-RPC failures become durable errors without opening a response channel", async () => {
  let finish!: (value: unknown) => void;
  const published = new Promise((resolve) => {
    finish = resolve;
  });
  const router = createBackgroundProviderRpcMessageRouter({
    authorizeConnectedDappRequest: async () => ({
      authorized: true,
      origin: "https://authorized.example",
    }),
    handleSafeRpcRequest: async () => {
      throw new Error("RPC unavailable");
    },
    writeResultToStorage: async (key, result) => finish({ key, result }),
  });

  assert.equal(
    router({ type: "rpcRequest", rpcId: "rpc-3" }, sender).keepChannelOpen,
    false,
  );
  assert.deepEqual(await published, {
    key: "rpcResult:rpc-3",
    result: { error: "RPC unavailable" },
  });
  assert.deepEqual(router({ type: "other" }, sender), { handled: false });
});
