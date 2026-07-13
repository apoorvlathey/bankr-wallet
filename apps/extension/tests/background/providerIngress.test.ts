import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_MESSAGES_BLOCKED_DURING_ERC7715,
  createBackgroundProviderIngressHelpers,
} from "../../src/chrome/background/providerIngress";

const sender = {
  tab: { id: 9 },
  origin: "https://app.example",
} as chrome.runtime.MessageSender;

test("connected-provider origin uses exact sender and durable rejection keys", async () => {
  const writes: unknown[][] = [];
  const authorized = createBackgroundProviderIngressHelpers({
    authorizeConnectedDappRequest: async (received) => {
      assert.equal(received, sender);
      return { authorized: true, origin: "https://canonical.example" };
    },
    writeResultToStorage: async (...args) => {
      writes.push(args);
    },
    isErc7715PermissionRequestLocked: () => false,
    erc7715PermissionRequestInProgressError: "busy",
  });
  assert.equal(
    await authorized.connectedProviderOriginOrReject(sender, "txResult", "tx-1"),
    "https://canonical.example",
  );

  const denied = createBackgroundProviderIngressHelpers({
    authorizeConnectedDappRequest: async () => ({
      authorized: false,
      error: "Not connected",
      code: 4100,
    }),
    writeResultToStorage: async (...args) => {
      writes.push(args);
    },
    isErc7715PermissionRequestLocked: () => false,
    erc7715PermissionRequestInProgressError: "busy",
  });
  assert.equal(
    await denied.connectedProviderOriginOrReject(sender, "sigResult", "sig-1"),
    null,
  );
  assert.deepEqual(writes, [
    [
      "sigResult:sig-1",
      { success: false, error: "Not connected", code: 4100 },
    ],
  ]);
  assert.equal(
    await denied.connectedProviderOriginOrReject(sender, "txResult", ""),
    null,
  );
  assert.equal(writes.length, 1, "invalid identifiers must not create result keys");
});

test("authorization exceptions fail closed on the existing durable result", async () => {
  const writes: unknown[][] = [];
  const helpers = createBackgroundProviderIngressHelpers({
    authorizeConnectedDappRequest: async () => {
      throw new Error("storage unavailable");
    },
    writeResultToStorage: async (...args) => {
      writes.push(args);
    },
    isErc7715PermissionRequestLocked: () => false,
    erc7715PermissionRequestInProgressError: "busy",
  });
  assert.equal(
    await helpers.connectedProviderOriginOrReject(sender, "txResult", "tx-2"),
    null,
  );
  assert.deepEqual(writes, [
    [
      "txResult:tx-2",
      {
        success: false,
        error: "Unable to verify this site's WalletChan connection",
        code: 4100,
      },
    ],
  ]);
});

test("ERC-7715 lock blocks only the released provider route set", async () => {
  assert.equal(PROVIDER_MESSAGES_BLOCKED_DURING_ERC7715.size, 12);
  const writes: unknown[][] = [];
  const helpers = createBackgroundProviderIngressHelpers({
    authorizeConnectedDappRequest: async () => ({ authorized: true }),
    writeResultToStorage: async (...args) => {
      writes.push(args);
    },
    isErc7715PermissionRequestLocked: () => true,
    erc7715PermissionRequestInProgressError: "Permission request in progress",
  });

  assert.equal(
    helpers.rejectExternalProviderRequestDuringErc7715Lock(
      { type: "sendTransaction", txId: "tx-3" },
      () => {},
    ),
    true,
  );
  await Promise.resolve();
  assert.deepEqual(writes, [
    [
      "txResult:tx-3",
      {
        success: false,
        error: "Permission request in progress",
        code: -32002,
      },
    ],
  ]);
  assert.equal(
    helpers.rejectExternalProviderRequestDuringErc7715Lock(
      { type: "getActiveAccount" },
      () => {},
    ),
    false,
  );
});
