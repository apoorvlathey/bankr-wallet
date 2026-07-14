import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

const values: Record<string, any> = {};
const listeners = new Set<ChangeListener>();

Object.defineProperty(globalThis, "chrome", {
  configurable: true,
  value: {
    storage: {
      local: {
        async get(key: string) {
          return { [key]: values[key] };
        },
        async set(items: Record<string, unknown>) {
          for (const [key, value] of Object.entries(items)) {
            const oldValue = values[key];
            values[key] = value;
            for (const listener of listeners) {
              listener({ [key]: { oldValue, newValue: value } }, "local");
            }
          }
        },
        async remove(key: string) {
          delete values[key];
        },
      },
      onChanged: {
        addListener(listener: ChangeListener) {
          listeners.add(listener);
        },
        removeListener(listener: ChangeListener) {
          listeners.delete(listener);
        },
      },
    },
  },
});

const { waitForStorageResult } = await import(
  "../../src/chrome/storageResultWaiter"
);

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  for (const key of Object.keys(values)) delete values[key];
  listeners.clear();
});

test("confirm owning the timeout claim never causes a local timeout rejection", async () => {
  const key = "txResult:confirm-wins";
  let expiryAttempts = 0;
  let settled = false;
  const result = waitForStorageResult<{
    success: boolean;
    txHash?: string;
  }>(
    key,
    5,
    async () => {
      expiryAttempts += 1;
      return {
        success: false,
        error: "Request is already being confirmed",
      };
    },
    5,
  );
  void result.finally(() => {
    settled = true;
  });

  await delay(25);
  assert.equal(settled, false);
  assert.ok(expiryAttempts >= 1);

  await chrome.storage.local.set({
    [key]: {
      result: { success: true, txHash: "0xconfirmed" },
      timestamp: Date.now(),
    },
  });
  assert.deepEqual(await result, {
    success: true,
    txHash: "0xconfirmed",
  });
  assert.equal(listeners.size, 0);
});

test("an expiry owner resolves from the durable background result", async () => {
  const key = "sigResult:expiry-wins";
  const result = waitForStorageResult<{ success: boolean; error?: string }>(
    key,
    5,
    async () => {
      await chrome.storage.local.set({
        [key]: {
          result: { success: false, error: "Wallet request timed out" },
          timestamp: Date.now(),
        },
      });
      return { success: true, expired: true };
    },
    5,
  );

  assert.deepEqual(await result, {
    success: false,
    error: "Wallet request timed out",
  });
  assert.equal(listeners.size, 0);
});

test("a transient worker error retries expiry instead of losing the listener", async () => {
  const key = "txResult:worker-restart";
  let attempts = 0;
  const result = waitForStorageResult<{ success: boolean; error?: string }>(
    key,
    5,
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("service worker restarted");
      await chrome.storage.local.set({
        [key]: {
          result: { success: false, error: "Wallet request timed out" },
          timestamp: Date.now(),
        },
      });
    },
    5,
  );

  assert.deepEqual(await result, {
    success: false,
    error: "Wallet request timed out",
  });
  assert.equal(attempts, 2);
});

test("bounded non-prompt storage waits retain their ordinary timeout", async () => {
  await assert.rejects(
    waitForStorageResult("dappConnectionResult:missing", 5),
    /timed out/i,
  );
  assert.equal(listeners.size, 0);
});

test("an unbounded user-review wait stays subscribed until a durable result arrives", async () => {
  const key = "txResult:no-expiry";
  let settled = false;
  const result = waitForStorageResult<{ success: boolean; txHash?: string }>(
    key,
    null,
  );
  void result.finally(() => {
    settled = true;
  });

  await delay(25);
  assert.equal(settled, false);
  assert.equal(listeners.size, 1);

  await chrome.storage.local.set({
    [key]: {
      result: { success: true, txHash: "0xconfirmed" },
      timestamp: Date.now(),
    },
  });
  assert.deepEqual(await result, { success: true, txHash: "0xconfirmed" });
  assert.equal(listeners.size, 0);
});
