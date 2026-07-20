import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_LEDGER_MESSAGE_TYPES,
  createBackgroundLedgerMessageRouter,
  type BackgroundLedgerDependencies,
} from "../../src/chrome/background/ledgerRouter";

function dependencies(
  overrides: Partial<BackgroundLedgerDependencies> = {},
): BackgroundLedgerDependencies {
  return {
    handleLedgerConnect: async () => ({ deviceId: "device-1" }),
    handleLedgerScan: async () => [{ address: "0x1" }],
    handleLedgerCancel: async () => ({ success: true }),
    handleAddLedgerAccounts: async () => [{ id: "ledger-1" }],
    handleGetLedgerDevices: async () => ({ "device-1": { label: "Ledger" } }),
    ...overrides,
  };
}

function dispatch(
  message: Record<string, unknown>,
  overrides: Partial<BackgroundLedgerDependencies> = {},
): Promise<{ response: unknown; keepChannelOpen: boolean }> {
  return new Promise((resolve) => {
    const route = createBackgroundLedgerMessageRouter(dependencies(overrides))(
      message,
      (response) => queueMicrotask(() => resolve({
        response,
        keepChannelOpen: route.keepChannelOpen,
      })),
    );
    assert.equal(route.handled, true);
  });
}

test("declares an exact unique Ledger account-management route set", () => {
  assert.deepEqual(BACKGROUND_LEDGER_MESSAGE_TYPES, [
    "ledgerConnect",
    "ledgerScan",
    "ledgerCancel",
    "addLedgerAccounts",
    "getLedgerDevices",
  ]);
  assert.equal(
    new Set(BACKGROUND_LEDGER_MESSAGE_TYPES).size,
    BACKGROUND_LEDGER_MESSAGE_TYPES.length,
  );
});

test("routes pairing, scanning, storage, reads, and cancellation", async () => {
  assert.deepEqual((await dispatch({ type: "ledgerConnect" })).response, {
    success: true,
    deviceId: "device-1",
  });
  assert.deepEqual((await dispatch({ type: "ledgerScan" })).response, {
    success: true,
    addresses: [{ address: "0x1" }],
  });
  assert.deepEqual((await dispatch({ type: "addLedgerAccounts" })).response, {
    success: true,
    accounts: [{ id: "ledger-1" }],
    account: { id: "ledger-1" },
  });
  assert.deepEqual((await dispatch({ type: "getLedgerDevices" })).response, {
    "device-1": { label: "Ledger" },
  });
  assert.deepEqual((await dispatch({ type: "ledgerCancel" })).response, {
    success: true,
  });
});

test("normalizes handler failures without leaking technical objects", async () => {
  const { response, keepChannelOpen } = await dispatch(
    { type: "ledgerConnect" },
    { handleLedgerConnect: async () => { throw new Error("device unavailable"); } },
  );
  assert.equal(keepChannelOpen, true);
  assert.deepEqual(response, { success: false, error: "device unavailable" });
});

test("does not claim unrelated messages", () => {
  const route = createBackgroundLedgerMessageRouter(dependencies())(
    { type: "unrelated" },
    () => assert.fail("unrelated messages must not respond"),
  );
  assert.deepEqual(route, { handled: false });
});
