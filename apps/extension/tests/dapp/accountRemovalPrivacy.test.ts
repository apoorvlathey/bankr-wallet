import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  disconnectDappsMappedToRemovedAccount,
  removeAccountWithDappPrivacyBoundary,
  withDappAccountBinding,
} from "../../src/chrome/dapp/accountRemovalPrivacy";

type StorageState = Record<string, unknown>;

function storageArea(state: StorageState) {
  return {
    async get(keys?: string | string[] | null) {
      if (keys == null) return { ...state };
      const names = typeof keys === "string" ? [keys] : keys;
      return Object.fromEntries(
        names.filter((key) => key in state).map((key) => [key, state[key]]),
      );
    },
    async set(values: Record<string, unknown>) {
      Object.assign(state, values);
    },
    async remove(keys: string | string[]) {
      for (const key of typeof keys === "string" ? [keys] : keys) {
        delete state[key];
      }
    },
  };
}

test("account removal disconnects only exact connected origins mapped to that account", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const removedAccountId = "account-to-remove";
  const local: StorageState = {
    dappPermissions: {
      "https://a.example": {
        origin: "https://a.example",
        hostname: "a.example",
        approvedAt: 1,
        lastConnectedAt: 1,
      },
      "https://b.example:8443": {
        origin: "https://b.example:8443",
        hostname: "b.example",
        approvedAt: 1,
        lastConnectedAt: 1,
      },
      "https://unrelated.example": {
        origin: "https://unrelated.example",
        hostname: "unrelated.example",
        approvedAt: 1,
        lastConnectedAt: 1,
      },
    },
  };
  const sync: StorageState = {
    tabAccounts: {
      1: removedAccountId,
      2: removedAccountId,
      3: removedAccountId,
      4: "other-account",
      5: removedAccountId,
      invalid: removedAccountId,
    },
  };
  const tabs = new Map<number, { id: number; url: string }>([
    [1, { id: 1, url: "https://A.example/app" }],
    // A second tab for the same origin must not cause a duplicate revoke.
    [2, { id: 2, url: "https://a.example/other" }],
    [3, { id: 3, url: "https://b.example:8443/path" }],
    [4, { id: 4, url: "https://unrelated.example/app" }],
    // This tab is mapped to the account but its origin is not connected.
    [5, { id: 5, url: "https://not-connected.example/app" }],
  ]);
  const revoked: string[] = [];

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
      },
      tabs: {
        async get(tabId: number) {
          const tab = tabs.get(tabId);
          if (!tab) throw new Error("tab not found");
          return tab;
        },
      },
    },
  });

  try {
    const origins = await disconnectDappsMappedToRemovedAccount(
      removedAccountId,
      async (origin) => {
        revoked.push(origin);
      },
    );

    assert.deepEqual(origins, [
      "https://a.example",
      "https://b.example:8443",
    ]);
    assert.deepEqual(revoked, origins);
    assert.ok(!revoked.includes("https://unrelated.example"));
    assert.ok(!revoked.includes("https://not-connected.example"));
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("the privacy boundary completes revocation before deletion and fails closed", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageState = {
    dappPermissions: {
      "https://connected.example": {
        origin: "https://connected.example",
        hostname: "connected.example",
        approvedAt: 1,
        lastConnectedAt: 1,
      },
    },
  };
  const sync: StorageState = {
    tabAccounts: { 7: "account-to-remove" },
  };
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
      },
      tabs: {
        async get() {
          return { id: 7, url: "https://connected.example/app" };
        },
      },
    },
  });

  try {
    const events: string[] = [];
    const result = await removeAccountWithDappPrivacyBoundary({
      accountId: "account-to-remove",
      revokeOrigin: async () => {
        events.push("revoke:start");
        await Promise.resolve();
        events.push("revoke:complete");
      },
      removeAccount: async () => {
        events.push("remove");
        return { success: true };
      },
    });
    assert.deepEqual(events, ["revoke:start", "revoke:complete", "remove"]);
    assert.deepEqual(result, { success: true });

    let removed = false;
    await assert.rejects(
      removeAccountWithDappPrivacyBoundary({
        accountId: "account-to-remove",
        revokeOrigin: async () => {
          throw new Error("revocation storage failed");
        },
        removeAccount: async () => {
          removed = true;
        },
      }),
      /revocation storage failed/,
    );
    assert.equal(
      removed,
      false,
      "account deletion must not proceed through a failed privacy revocation",
    );

    let revoked = false;
    await assert.rejects(
      removeAccountWithDappPrivacyBoundary({
        accountId: "account-to-remove",
        validateRemoval: async () => {
          throw new Error("Cannot remove the last account");
        },
        revokeOrigin: async () => {
          revoked = true;
        },
        removeAccount: async () => {
          removed = true;
        },
      }),
      /Cannot remove the last account/,
    );
    assert.equal(revoked, false, "an invalid removal must not revoke sites");
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("a queued connection confirmation cannot outlive removal of its selected account", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageState = {
    dappPermissions: {},
    pendingDappConnectionRequests: [
      {
        id: "connect-1",
        origin: "https://pending.example",
        hostname: "pending.example",
        tabId: 9,
        frameId: 0,
        timestamp: Date.now(),
      },
    ],
    pendingTxRequests: [],
    pendingSignatureRequests: [],
    pendingBatchTxRequests: [],
    pendingErc7715PermissionRequests: [],
    crossDappBatch: null,
  };
  const sync: StorageState = {
    tabAccounts: { 9: "account-to-remove" },
  };
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
      },
      tabs: {
        async get() {
          return { id: 9, url: "https://pending.example/connect" };
        },
      },
      action: {
        async setBadgeText() {},
        async setBadgeBackgroundColor() {},
      },
    },
  });

  try {
    let releaseRemoval!: () => void;
    const removalGate = new Promise<void>((resolve) => {
      releaseRemoval = resolve;
    });
    const events: string[] = [];
    const removal = removeAccountWithDappPrivacyBoundary({
      accountId: "account-to-remove",
      revokeOrigin: async () => {},
      removeAccount: async () => {
        events.push("removal:held");
        await removalGate;
        events.push("account:removed");
      },
    });

    // Let removal install the shared binding lock and cancel the durable
    // connection prompt before a competing confirmation tries to enter.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const confirmation = withDappAccountBinding(async () => {
      const pending = local.pendingDappConnectionRequests as unknown[];
      events.push(
        pending.length ? "confirmation:granted" : "confirmation:gone",
      );
      return pending.length;
    });
    await Promise.resolve();
    assert.ok(!events.some((event) => event.startsWith("confirmation:")));

    releaseRemoval();
    await removal;
    assert.equal(await confirmation, 0);
    assert.deepEqual(events, [
      "removal:held",
      "account:removed",
      "confirmation:gone",
    ]);
    assert.deepEqual(local.pendingDappConnectionRequests, []);
    const terminal = local["dappConnectionResult:connect-1"] as {
      result: { success: boolean; error: string; code: number };
      timestamp: number;
    };
    assert.deepEqual(terminal.result, {
      success: false,
      error: "Connection cancelled because the selected account is being removed",
      code: 4100,
    });
    assert.ok(Number.isFinite(terminal.timestamp));
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("production connection approval and account removal use the shared privacy boundary", async () => {
  const [connectionSource, accountRouterSource, backgroundSource] =
    await Promise.all([
      readFile(
        new URL("../../src/chrome/dapp/connectionHandlers.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../src/chrome/background/accountManagementRouter.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../src/chrome/background/composition/accountRoutes.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  const confirmStart = connectionSource.indexOf(
    "export async function handleConfirmDappConnection",
  );
  const rejectStart = connectionSource.indexOf(
    "export async function handleRejectDappConnection",
    confirmStart,
  );
  assert.ok(confirmStart >= 0 && rejectStart > confirmStart);
  assert.match(
    connectionSource.slice(confirmStart, rejectStart),
    /withDappAccountBinding/,
  );

  const removeStart = accountRouterSource.indexOf(
    "async function removeAccount(",
  );
  const routerStart = accountRouterSource.indexOf(
    "export function createBackgroundAccountManagementMessageRouter",
    removeStart,
  );
  assert.ok(removeStart >= 0 && routerStart > removeStart);
  const removeRoute = accountRouterSource.slice(removeStart, routerStart);
  assert.match(
    removeRoute,
    /dependencies\.withSponsoredTransferOperation\(\(\) =>\s*dependencies\.removeAccountWithDappPrivacyBoundary\(\{[\s\S]*validateRemoval:[\s\S]*revokeOrigin:[\s\S]*removeAccount: \(\) =>[\s\S]*dependencies\.handleRemoveAccount/,
  );
  assert.doesNotMatch(removeRoute, /sendAccountToTab/);

  const compositionStart = backgroundSource.indexOf(
    "createBackgroundAccountManagementMessageRouter({",
  );
  const compositionEnd = backgroundSource.indexOf(
    "createBackgroundSecretManagementMessageRouter({",
    compositionStart,
  );
  assert.ok(compositionStart >= 0 && compositionEnd > compositionStart);
  assert.match(
    backgroundSource.slice(compositionStart, compositionEnd),
    /removeAccountWithDappPrivacyBoundary,/,
  );
});
