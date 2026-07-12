import assert from "node:assert/strict";
import test from "node:test";

type StorageState = Record<string, unknown>;

function createStorageArea(state: StorageState) {
  return {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (keys == null) return { ...state };
      const names =
        typeof keys === "string"
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys);
      return Object.fromEntries(
        names
          .filter((key) => key in state)
          .map((key) => [key, state[key]]),
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

test("per-tab account overrides exist only for connected or pending dapps", async () => {
  const accountA = {
    id: "account-a",
    type: "privateKey" as const,
    address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    displayName: "Account A",
    createdAt: 1,
  };
  const accountB = {
    id: "account-b",
    type: "seedPhrase" as const,
    address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    displayName: "Account B",
    seedGroupId: "seed-group",
    derivationIndex: 0,
    createdAt: 2,
  };
  const accountC = {
    id: "account-c",
    type: "bankr" as const,
    address: "0xcccccccccccccccccccccccccccccccccccccccc",
    displayName: "Account C",
    createdAt: 3,
  };
  const localState: StorageState = {
    accounts: [accountA, accountB, accountC],
    dappPermissions: {
      "https://connected.example": {
        origin: "https://connected.example",
        hostname: "connected.example",
        approvedAt: 1,
        lastConnectedAt: 1,
      },
    },
    pendingDappConnectionRequests: [],
  };
  const syncState: StorageState = {
    activeAccountId: accountA.id,
    address: accountA.address,
    displayAddress: accountA.displayName,
    tabAccounts: { 1: accountB.id },
  };
  const tabs = new Map<number, { id: number; url: string; active: boolean }>([
    [1, { id: 1, url: "https://ordinary.example", active: false }],
    [2, { id: 2, url: "https://connected.example/app", active: true }],
    [3, { id: 3, url: "https://pending.example", active: false }],
    [4, { id: 4, url: "https://connected.example/replaced", active: false }],
    [5, { id: 5, url: "https://connected.example/a", active: false }],
    [6, { id: 6, url: "https://connected.example/c", active: false }],
  ]);

  globalThis.chrome = {
    storage: {
      local: createStorageArea(localState),
      sync: createStorageArea(syncState),
    },
    tabs: {
      get: async (tabId: number) => tabs.get(tabId),
    },
  } as unknown as typeof chrome;

  const {
    activateBrowserTabAccount,
    replaceBrowserTabAccountScope,
    resolveBrowserTabAccount,
    selectBrowserTabAccount,
  } = await import("../src/chrome/tabAccountResolver");

  assert.equal((await resolveBrowserTabAccount(1))?.id, accountA.id);
  assert.deepEqual(syncState.tabAccounts, {});

  assert.equal((await resolveBrowserTabAccount(2))?.id, accountA.id);
  assert.deepEqual(syncState.tabAccounts, { 2: accountA.id });

  const connectedSelection = await selectBrowserTabAccount(2, accountB.id);
  assert.equal(connectedSelection.scope, "dapp-tab");
  assert.equal(syncState.activeAccountId, accountB.id);
  assert.deepEqual(syncState.tabAccounts, { 2: accountB.id });

  const globalSelection = await selectBrowserTabAccount(1, accountC.id);
  assert.equal(globalSelection.scope, "global");
  assert.equal(syncState.activeAccountId, accountC.id);
  assert.deepEqual(syncState.tabAccounts, { 2: accountB.id });

  localState.pendingDappConnectionRequests = [
    {
      id: "request-1",
      origin: "https://pending.example",
      hostname: "pending.example",
      tabId: 3,
      timestamp: Date.now(),
    },
  ];
  const pendingSelection = await selectBrowserTabAccount(3, accountA.id);
  assert.equal(pendingSelection.scope, "dapp-tab");
  assert.equal(syncState.activeAccountId, accountA.id);
  assert.deepEqual(syncState.tabAccounts, {
    2: accountB.id,
    3: accountA.id,
  });

  await replaceBrowserTabAccountScope(4, 3);
  assert.deepEqual(syncState.tabAccounts, {
    2: accountB.id,
    4: accountA.id,
  });

  tabs.set(2, {
    id: 2,
    url: "https://ordinary.example/after-navigation",
    active: true,
  });
  assert.equal((await resolveBrowserTabAccount(2))?.id, accountA.id);
  assert.deepEqual(syncState.tabAccounts, { 4: accountA.id });

  // Reproduce A (account A), B (ordinary), C (account B): ordinary B must
  // follow whichever connected tab was active most recently without storing
  // its own override.
  syncState.tabAccounts = { 5: accountA.id, 6: accountB.id };
  tabs.get(2)!.active = false;
  tabs.get(5)!.active = true;
  await activateBrowserTabAccount(5);
  assert.equal(syncState.activeAccountId, accountA.id);
  tabs.get(5)!.active = false;
  tabs.get(1)!.active = true;
  assert.equal((await activateBrowserTabAccount(1))?.id, accountA.id);
  assert.deepEqual(syncState.tabAccounts, { 5: accountA.id, 6: accountB.id });

  tabs.get(1)!.active = false;
  tabs.get(6)!.active = true;
  await activateBrowserTabAccount(6);
  assert.equal(syncState.activeAccountId, accountB.id);
  tabs.get(6)!.active = false;
  tabs.get(1)!.active = true;
  assert.equal((await activateBrowserTabAccount(1))?.id, accountB.id);
  assert.deepEqual(syncState.tabAccounts, { 5: accountA.id, 6: accountB.id });
});
