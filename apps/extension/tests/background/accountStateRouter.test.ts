// Background account-state transport contract.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_ACCOUNT_STATE_MESSAGE_TYPES,
  createBackgroundAccountStateMessageRouter,
} from "../../src/chrome/background/accountStateRouter";

function responseCapture() {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { response, sendResponse: resolve };
}

test("account-state transport stays focused and declares every route", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/accountStateRouter.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.split(/\r?\n/).length <= 400);
  const switchTypes = [...source.matchAll(/^ {6}case ["']([^"']+)["']/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...new Set(switchTypes)].sort(),
    [...BACKGROUND_ACCOUNT_STATE_MESSAGE_TYPES].sort(),
  );
});

test("active-account reads preserve provider tab scoping", async () => {
  const calls: string[] = [];
  const route = createBackgroundAccountStateMessageRouter({
    isTrustedWalletUiSender: (sender) => sender.url === "trusted",
    getActiveAccount: async () => {
      calls.push("global");
      return { id: "global" } as any;
    },
    resolveBrowserTabAccount: async (tabId) => {
      calls.push(`tab:${tabId}`);
      return { id: `tab-${tabId}` } as any;
    },
  });
  const provider = responseCapture();
  const walletUi = responseCapture();

  route(
    { type: "getActiveAccount" },
    { url: "provider", tab: { id: 17 } } as any,
    provider.sendResponse,
  );
  route(
    { type: "getActiveAccount" },
    { url: "trusted", tab: { id: 17 } } as any,
    walletUi.sendResponse,
  );
  assert.deepEqual(await provider.response, { id: "tab-17" });
  assert.deepEqual(await walletUi.response, { id: "global" });
  assert.deepEqual(calls, ["tab:17", "global"]);
});

test("reordering and display-name changes retain broadcasts and response shapes", async () => {
  const broadcasts: unknown[] = [];
  const names: string[] = [];
  const route = createBackgroundAccountStateMessageRouter({
    reorderAccounts: async () => [{ id: "two" }, { id: "one" }] as any,
    updateAccountDisplayName: async (_id, name) => {
      names.push(name);
    },
    sendRuntimeMessage: async (message) => {
      broadcasts.push(message);
    },
  });
  const reordered = responseCapture();
  const renamed = responseCapture();

  route(
    { type: "reorderAccounts", accountIds: ["two", "one"] },
    {} as any,
    reordered.sendResponse,
  );
  route(
    {
      type: "updateAccountDisplayName",
      accountId: "one",
      displayName: "n".repeat(120),
    },
    {} as any,
    renamed.sendResponse,
  );
  assert.deepEqual(await reordered.response, {
    success: true,
    accounts: [{ id: "two" }, { id: "one" }],
  });
  assert.deepEqual(await renamed.response, { success: true });
  await Promise.resolve();
  assert.deepEqual(names, ["n".repeat(100)]);
  assert.deepEqual(broadcasts, [
    { type: "accountsUpdated" },
    { type: "accountsUpdated" },
  ]);
});

test("global selection writes compatibility identity before broadcasting", async () => {
  const events: string[] = [];
  const capture = responseCapture();
  const route = createBackgroundAccountStateMessageRouter({
    setActiveAccountId: async (id) => {
      events.push(`select:${id}`);
    },
    getAccountById: async () => ({
      id: "account-1",
      address: "0xabc",
      displayName: "Primary",
    }) as any,
    setSyncStorage: async (values) => {
      events.push(`sync:${JSON.stringify(values)}`);
    },
    sendRuntimeMessage: async (message) => {
      events.push(`broadcast:${String(message.type)}`);
    },
  });

  assert.deepEqual(
    route(
      { type: "setActiveAccount", accountId: "account-1" },
      {} as any,
      capture.sendResponse,
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, { success: true });
  await Promise.resolve();
  assert.deepEqual(events, [
    "select:account-1",
    'sync:{"address":"0xabc","displayAddress":"Primary"}',
    "broadcast:accountsUpdated",
  ]);
});

test("tab selection preserves activation, scope broadcasts, and missing-tab errors", async () => {
  const events: string[] = [];
  const route = createBackgroundAccountStateMessageRouter({
    activateBrowserTabAccount: async (tabId) => ({ id: `active-${tabId}` }) as any,
    selectBrowserTabAccount: async (tabId, accountId) => ({
      account: { id: accountId, tabId },
      scope: "global" as const,
    }),
    sendRuntimeMessage: async (message) => {
      events.push(String(message.type));
    },
  });
  const activated = responseCapture();
  const selected = responseCapture();
  const missing = responseCapture();

  route(
    { type: "getTabAccount", tabId: 4, activate: true },
    {} as any,
    activated.sendResponse,
  );
  route(
    { type: "setTabAccount", tabId: 4, accountId: "account-4" },
    {} as any,
    selected.sendResponse,
  );
  route(
    { type: "setTabAccount", accountId: "account-4" },
    {} as any,
    missing.sendResponse,
  );
  assert.deepEqual(await activated.response, { id: "active-4" });
  assert.deepEqual(await selected.response, {
    success: true,
    account: { id: "account-4", tabId: 4 },
    scope: "global",
  });
  assert.deepEqual(await missing.response, {
    success: false,
    error: "No tab ID",
  });
  await Promise.resolve();
  assert.deepEqual(events, ["accountsUpdated"]);
});
