import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_ERC7715_PERMISSION_MESSAGE_TYPES,
  createBackgroundErc7715PermissionMessageRouter,
  type BackgroundErc7715PermissionDependencies,
} from "../../src/chrome/background/erc7715PermissionRouter";

const sender = {
  tab: { id: 7, windowId: 9 },
  frameId: 3,
} as chrome.runtime.MessageSender;

function createDependencies(
  overrides: Partial<BackgroundErc7715PermissionDependencies> = {},
): BackgroundErc7715PermissionDependencies {
  return {
    getPendingRequests: async () => [],
    getActiveGrantsWithOnchainSync: async () => [],
    initiateRevoke: async () => ({ success: true }),
    authorizeConnectedDappRequest: async () => ({
      authorized: true,
      origin: "https://dapp.example",
      tabId: 7,
    }),
    isPermissionMethod: () => true,
    getTabAccount: async () => ({ id: "account-7", type: "seedPhrase" }),
    handlePermissionMethod: async () => ({ approved: true }),
    ...overrides,
  };
}

function dispatch(
  dependencies: BackgroundErc7715PermissionDependencies,
  message: Record<string, unknown>,
): Promise<{ response: any; route: any }> {
  return new Promise((resolve) => {
    const router = createBackgroundErc7715PermissionMessageRouter(dependencies);
    let route: any;
    route = router(message, sender, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("ERC-7715 transport declares one unique route set", () => {
  assert.equal(
    new Set(BACKGROUND_ERC7715_PERMISSION_MESSAGE_TYPES).size,
    BACKGROUND_ERC7715_PERMISSION_MESSAGE_TYPES.length,
  );
});

test("grant reads validate the account and keep newest grants first", async () => {
  const invalid = await dispatch(createDependencies(), {
    type: "getErc7715PermissionGrantsForAccount",
  });
  assert.deepEqual(invalid.response, {
    success: false,
    error: "Account id is required",
  });

  const input = [
    { id: "old", createdAt: 1 },
    { id: "new", createdAt: 2 },
  ];
  const result = await dispatch(
    createDependencies({
      getActiveGrantsWithOnchainSync: async ({ accountId }) => {
        assert.equal(accountId, "account-1");
        return input;
      },
    }),
    {
      type: "getErc7715PermissionGrantsForAccount",
      accountId: "account-1",
    },
  );
  assert.deepEqual(result.response, {
    success: true,
    grants: [
      { id: "new", createdAt: 2 },
      { id: "old", createdAt: 1 },
    ],
  });
  assert.deepEqual(result.route, { handled: true, keepChannelOpen: true });
});

test("revoke transport preserves the account/grant tuple", async () => {
  let input: unknown;
  const result = await dispatch(
    createDependencies({
      initiateRevoke: async (value) => {
        input = value;
        return { success: true, requestId: "revoke-1" };
      },
    }),
    {
      type: "initiateErc7715PermissionRevoke",
      accountId: "account-1",
      grantId: "grant-1",
    },
  );
  assert.deepEqual(input, { accountId: "account-1", grantId: "grant-1" });
  assert.deepEqual(result.response, { success: true, requestId: "revoke-1" });
});

test("provider permission transport preserves authorization and sender scope", async () => {
  let handlerInput: any;
  const result = await dispatch(
    createDependencies({
      handlePermissionMethod: async (input) => {
        handlerInput = input;
        return { permission: "ok" };
      },
    }),
    {
      type: "walletExecutionPermissions",
      method: "wallet_requestExecutionPermissions",
      params: [{ permission: "native-token-stream" }],
      chainId: 8453,
      favicon: "https://dapp.example/icon.png",
      requestId: "request-1",
    },
  );

  assert.deepEqual(handlerInput, {
    method: "wallet_requestExecutionPermissions",
    params: [{ permission: "native-token-stream" }],
    origin: "https://dapp.example",
    chainId: 8453,
    favicon: "https://dapp.example/icon.png",
    senderWindowId: 9,
    senderOrigin: "https://dapp.example",
    tabId: 7,
    frameId: 3,
    account: { id: "account-7", type: "seedPhrase" },
    requestId: "request-1",
    waitForResult: false,
  });
  assert.deepEqual(result.response, {
    success: true,
    result: { permission: "ok" },
  });
});

test("unauthorized permission requests stop before account or method effects", async () => {
  let touched = false;
  const result = await dispatch(
    createDependencies({
      authorizeConnectedDappRequest: async () => ({
        authorized: false,
        error: "Unauthorized origin",
        code: 4100,
      }),
      getTabAccount: async () => {
        touched = true;
        return undefined;
      },
      handlePermissionMethod: async () => {
        touched = true;
        return undefined;
      },
    }),
    { type: "walletExecutionPermissions", method: "wallet_getPermissions" },
  );
  assert.equal(touched, false);
  assert.deepEqual(result.response, {
    success: false,
    error: "Unauthorized origin",
    code: 4100,
  });
});

test("background delegates ERC-7715 routes before unknown handling", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/messagePipeline.ts", import.meta.url),
    "utf8",
  );
  const routeIndex = source.indexOf(
    "routes.routeBackgroundErc7715PermissionMessage(",
  );
  const unknownHandlingIndex = source.indexOf("Unknown message type");
  assert.ok(routeIndex > 0 && routeIndex < unknownHandlingIndex);
  for (const messageType of BACKGROUND_ERC7715_PERMISSION_MESSAGE_TYPES) {
    assert.doesNotMatch(source, new RegExp(`case ["']${messageType}["']`));
  }
});
