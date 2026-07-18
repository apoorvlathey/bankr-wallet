import assert from "node:assert/strict";
import test from "node:test";

import { registerStorageAuthLockLifecycle } from "../../../src/chrome/background/lifecycle/storageAuthLock";
import {
  createSendAccountToTab,
  registerTabAccountLifecycle,
} from "../../../src/chrome/background/lifecycle/tabAccounts";
import { startMaintenanceLifecycle } from "../../../src/chrome/background/lifecycle/maintenance";
import { registerInstallUpdateLifecycle } from "../../../src/chrome/background/lifecycle/installUpdate";
import { startRecoveryLifecycle } from "../../../src/chrome/background/lifecycle/startupRecovery";
import { registerActionFallbackLifecycle } from "../../../src/chrome/background/lifecycle/actionFallback";
import { registerTrustedUiPortLifecycle } from "../../../src/chrome/background/lifecycle/trustedUiPorts";
import { registerNotificationClickLifecycle } from "../../../src/chrome/background/lifecycle/notificationClicks";

test("storage and tab lifecycle callbacks preserve exact filtering and arguments", async () => {
  let storageListener!: (changes: any, area: string) => Promise<void>;
  const calls: unknown[][] = [];
  registerStorageAuthLockLifecycle({
    storageOnChanged: { addListener: (listener) => (storageListener = listener) },
    autoLockStorageKey: "autoLockTimeout",
    refreshErc7715PermissionRequestLockFromStorage: async () => {
      calls.push(["permission"]);
    },
    handleAutoLockTimeoutStorageChange: async (...args) => {
      calls.push(["autoLock", ...args]);
    },
  });
  await storageListener({ pendingErc7715PermissionRequests: {} }, "local");
  await storageListener(
    { autoLockTimeout: { oldValue: 1, newValue: 2 } },
    "sync",
  );
  assert.deepEqual(calls, [["permission"], ["autoLock", 1, 2]]);

  const listeners: Record<string, any> = {};
  registerTabAccountLifecycle({
    activatedEvent: { addListener: (listener) => (listeners.active = listener) },
    updatedEvent: { addListener: (listener) => (listeners.updated = listener) },
    removedEvent: { addListener: (listener) => (listeners.removed = listener) },
    replacedEvent: { addListener: (listener) => (listeners.replaced = listener) },
    activateBrowserTabAccount: async (id) => calls.push(["active", id]),
    resolveBrowserTabAccount: async (id) => calls.push(["updated", id]),
    clearTabAccount: async (id) => calls.push(["removed", id]),
    replaceBrowserTabAccountScope: async (...args) =>
      calls.push(["replaced", ...args]),
  });
  listeners.active({ tabId: 3 });
  listeners.updated(4, { status: "loading" });
  listeners.updated(4, { status: "complete" });
  listeners.removed(5);
  listeners.replaced(7, 6);
  await Promise.resolve();
  assert.deepEqual(calls.slice(2), [
    ["active", 3],
    ["updated", 4],
    ["removed", 5],
    ["replaced", 7, 6],
  ]);

  const sent: unknown[][] = [];
  const sendAccount = createSendAccountToTab(async (...args) => {
    sent.push(args);
  });
  await sendAccount(8, {
    id: "account-1",
    address: "0xabc",
    displayName: "Primary",
    type: "privateKey",
  } as any);
  assert.deepEqual(sent, [
    [
      8,
      {
        type: "setAccount",
        msg: {
          address: "0xabc",
          displayAddress: "Primary",
          accountId: "account-1",
          accountType: "privateKey",
        },
      },
    ],
  ]);
});

test("maintenance preserves registration, immediate startup, expiry, and stale-result order", async () => {
  const events: string[] = [];
  let suspend!: () => void;
  const intervals: Array<{ callback: () => void; milliseconds: number }> = [];
  const expired = (name: string) => () => events.push(`expire:${name}`);
  startMaintenanceLifecycle({
    suspendTarget: {
      addEventListener: (_type, listener) => {
        events.push("register:suspend");
        suspend = listener;
      },
    },
    setInterval: (callback, milliseconds) => {
      events.push(`interval:${milliseconds}`);
      intervals.push({ callback, milliseconds });
    },
    invalidateAuthCeremonies: () => events.push("auth:invalidate"),
    clearInMemoryAuthCache: () => events.push("auth:clear"),
    clearExpiredWalletConnectPendingRequests: expired("wc"),
    getAllLocalStorage: async () => {
      events.push("stale:get");
      return { "txResult:old": { timestamp: 1 } };
    },
    getStorageKeysWithPrefixes: () => {
      events.push("stale:filter");
      return ["txResult:old"];
    },
    walletResultStoragePrefixes: ["txResult:"],
    removeLocalStorage: (keys) => events.push(`stale:remove:${keys.join()}`),
    pruneNonCriticalStorageCaches: async () => {
      events.push("cache:prune");
    },
    cachePruneIntervalMs: 300_000,
    cleanupOldBundleStatuses: () => events.push("bundle:cleanup"),
    updateBadge: () => events.push("badge:init"),
    getAutoLockTimeout: () => events.push("autolock:init"),
    now: () => 2_000_000,
    warn: () => {},
  });
  assert.deepEqual(events.slice(0, 8), [
    "register:suspend",
    "interval:60000",
    "stale:get",
    "cache:prune",
    "interval:300000",
    "bundle:cleanup",
    "badge:init",
    "autolock:init",
  ]);
  await Promise.resolve();
  assert.deepEqual(events.slice(8), ["stale:filter", "stale:remove:txResult:old"]);
  suspend();
  intervals.find(({ milliseconds }) => milliseconds === 60_000)!.callback();
  assert.deepEqual(events.slice(-3), [
    "auth:invalidate",
    "auth:clear",
    "expire:wc",
  ]);
});

test("install and update lifecycle preserve defaults, migrations, and writes", async () => {
  let listener!: (details: any) => Promise<void>;
  const events: string[] = [];
  const syncWrites: unknown[] = [];
  registerInstallUpdateLifecycle({
    installedEvent: { addListener: (received) => (listener = received) },
    initializeAutoLockTimeoutDefault: async () => events.push("autolock"),
    getLocalStorage: async () => {
      events.push("theme:get");
      return {};
    },
    setLocalStorage: async (values) => events.push(`theme:set:${JSON.stringify(values)}`),
    selectedThemeStorageKey: "theme",
    freshInstallThemeId: "warm-midnight",
    isThemeId: () => false,
    migrateFromLegacyStorage: async () => events.push("legacy"),
    getSyncStorage: async () => ({
      networksInfo: { "OP Mainnet": { chainId: 10, rpcUrl: "https://rpc", hidden: true } },
      chainName: "OP Mainnet",
    }),
    setSyncStorage: async (values) => {
      events.push("optimism:set");
      syncWrites.push(values);
    },
    getRuntimeUrl: (path) => `chrome-extension://wallet/${path}`,
    createTab: async ({ url }) => events.push(`tab:${url}`),
    log: () => events.push("optimism:log"),
    error: () => {},
  });
  await listener({ reason: "install" });
  assert.deepEqual(events, [
    "autolock",
    "theme:get",
    'theme:set:{"theme":"warm-midnight"}',
    "tab:chrome-extension://wallet/onboarding.html",
  ]);
  events.length = 0;
  await listener({ reason: "update" });
  assert.deepEqual(events, ["autolock", "legacy", "optimism:set", "optimism:log"]);
  assert.deepEqual(syncWrites, [
    {
      networksInfo: {
        Optimism: { chainId: 10, rpcUrl: "https://rpc", hidden: true },
      },
      chainName: "Optimism",
    },
  ]);
});

test("startup recovery preserves immediate effect and startup-listener order", async () => {
  const events: string[] = [];
  let startup!: () => void;
  startRecoveryLifecycle({
    initSidePanel: () => events.push("sidepanel"),
    cleanupStaleProcessingTxs: () => events.push("processing"),
    resumePendingPollers: () => events.push("receipts"),
    prunePendingBridges: async () => {
      events.push("bridge:prune");
    },
    resumePendingBridgePollers: () => events.push("bridge:resume"),
    recoverStuckForceInclusionTxs: () => events.push("force:recover"),
    initEnsBrowsing: async () => {
      events.push("ens");
    },
    initWalletConnect: async () => {
      events.push("wc");
    },
    startupEvent: {
      addListener: (listener) => {
        events.push("startup:register");
        startup = listener;
      },
    },
    warn: () => {},
  });
  assert.deepEqual(events, [
    "sidepanel",
    "processing",
    "receipts",
    "bridge:prune",
    "force:recover",
    "ens",
    "wc",
    "startup:register",
  ]);
  await Promise.resolve();
  assert.equal(events.at(-1), "bridge:resume");
  startup();
  assert.equal(events.at(-1), "wc");
});

test("action fallback, trusted ports, and notification clicks retain behavior", async () => {
  let action!: (tab: any) => Promise<void>;
  const events: string[] = [];
  registerActionFallbackLifecycle({
    actionClickedEvent: { addListener: (listener) => (action = listener) },
    openSidePanel: async ({ windowId }) => events.push(`sidepanel:${windowId}`),
    getContexts: async () => [],
    sendRuntimeMessage: async () => undefined,
    openPopupWindow: async () => events.push("popup"),
    delay: async (milliseconds) => events.push(`delay:${milliseconds}`),
  });
  await action({ windowId: 5 });
  assert.deepEqual(events, ["sidepanel:5", "delay:600", "popup"]);

  let connect!: (port: any) => void;
  let disconnectListener!: () => void;
  let portMessageListener!: (message: unknown) => void;
  registerTrustedUiPortLifecycle({
    connectEvent: { addListener: (listener) => (connect = listener) },
    isTrustedWalletUiSender: (sender) => sender.id === "trusted",
    incrementUIConnections: () => events.push("ui:+"),
    decrementUIConnections: () => events.push("ui:-"),
    log: () => {},
  });
  connect({ sender: {}, disconnect: () => events.push("port:disconnect") });
  connect({
    name: "ui-keepalive",
    sender: { id: "trusted" },
    disconnect: () => events.push("trusted-port:disconnect"),
    onMessage: {
      addListener: (listener: (message: unknown) => void) =>
        (portMessageListener = listener),
    },
    onDisconnect: { addListener: (listener: () => void) => (disconnectListener = listener) },
  });
  portMessageListener({ type: "wallet-ui-keepalive" });
  portMessageListener({ type: "unexpected" });
  disconnectListener();
  assert.deepEqual(events.slice(-4), [
    "port:disconnect",
    "ui:+",
    "trusted-port:disconnect",
    "ui:-",
  ]);

  let notification!: (id: string) => Promise<void>;
  registerNotificationClickLifecycle({
    notificationClickedEvent: { addListener: (listener) => (notification = listener) },
    getLocalStorage: async ([key]) => ({ [key]: "https://safe.example/tx" }),
    removeLocalStorage: (key) => events.push(`storage:remove:${key}`),
    sanitizeCustomExplorerUrl: (url) => url,
    createTab: ({ url }) => events.push(`tab:${url}`),
    getSidePanelMode: async () => false,
    isSidePanelSupported: () => false,
    getRuntimeUrl: (path) => path,
    createWindow: async () => {},
    clearNotification: (id) => events.push(`notification:clear:${id}`),
    fullscreenRequestWindowId: (id) =>
      id === "walletchan-fullscreen-request-5" ? 5 : null,
    openSidePanel: async ({ windowId }) =>
      events.push(`notification:sidepanel:${windowId}`),
  });
  await notification("tx-1");
  assert.deepEqual(events.slice(-3), [
    "tab:https://safe.example/tx",
    "storage:remove:notification-tx-1",
    "notification:clear:tx-1",
  ]);

  await notification("walletchan-fullscreen-request-5");
  assert.deepEqual(events.slice(-2), [
    "notification:sidepanel:5",
    "notification:clear:walletchan-fullscreen-request-5",
  ]);
});
