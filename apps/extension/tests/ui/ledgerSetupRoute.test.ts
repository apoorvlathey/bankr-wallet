import assert from "node:assert/strict";
import test from "node:test";

import {
  getLedgerSetupUrl,
  isLedgerSetupRoute,
  openLedgerSetupTabWith,
} from "../../src/app/ledgerSetupRoute";

test("recognizes only the dedicated Ledger setup route", () => {
  assert.equal(isLedgerSetupRoute("?route=add-ledger"), true);
  assert.equal(isLedgerSetupRoute("?route=add-account"), false);
  assert.equal(isLedgerSetupRoute(""), false);
});

test("builds a direct extension-tab URL without discarding its origin", () => {
  assert.equal(
    getLedgerSetupUrl((path) => `chrome-extension://walletchan/${path}`),
    "chrome-extension://walletchan/index.html?route=add-ledger",
  );
});

test("closes the originating side panel after opening Ledger setup", async () => {
  const calls: string[] = [];
  await openLedgerSetupTabWith({
    getRuntimeUrl: (path) => `chrome-extension://walletchan/${path}`,
    createTab: async ({ url }) => {
      calls.push(`open:${url}`);
      return { windowId: 42 };
    },
    getViewKind: () => "sidepanel",
    closeSidePanel: async (windowId) => {
      calls.push(`close:${windowId}`);
      return true;
    },
    closeWindow: () => calls.push("fallback-close"),
  });
  assert.deepEqual(calls, [
    "open:chrome-extension://walletchan/index.html?route=add-ledger",
    "close:42",
  ]);
});

test("leaves popup launchers alone and falls back when panel close is unavailable", async () => {
  let fallbackCloses = 0;
  const base = {
    getRuntimeUrl: (path: string) => `chrome-extension://walletchan/${path}`,
    createTab: async () => ({ windowId: 7 }),
    closeSidePanel: async () => false,
    closeWindow: () => { fallbackCloses += 1; },
  };
  await openLedgerSetupTabWith({ ...base, getViewKind: () => "action-popup" });
  assert.equal(fallbackCloses, 0);
  await openLedgerSetupTabWith({ ...base, getViewKind: () => "sidepanel" });
  assert.equal(fallbackCloses, 1);
});
