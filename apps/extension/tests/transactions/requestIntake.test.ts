import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

const clone = <T>(value: T): T => structuredClone(value);

function storageArea(storage: StorageRecord) {
  return {
    async get(keys?: string | string[] | StorageRecord | null) {
      if (keys == null) return clone(storage);
      if (typeof keys === "string") return { [keys]: clone(storage[keys]) };
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, clone(storage[key])]));
      }
      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [
          key,
          clone(storage[key] ?? fallback),
        ]),
      );
    },
    async set(values: StorageRecord) {
      Object.assign(storage, clone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
    async clear() {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for request intake");
}

test("request intake persists exact transaction and signature account context", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const address = "0x1111111111111111111111111111111111111111";
  const local: StorageRecord = {
    accounts: [
      {
        id: "pk-1",
        type: "privateKey",
        address,
        createdAt: 1,
      },
    ],
  };
  const sync: StorageRecord = { activeAccountId: "pk-1" };
  const session: StorageRecord = {};
  const runtimeMessages: unknown[] = [];
  const popupCreates: unknown[] = [];

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        getURL(path: string) {
          return `chrome-extension://walletchan/${path}`;
        },
        async sendMessage(message: unknown) {
          runtimeMessages.push(clone(message));
          return null;
        },
      },
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
        session: storageArea(session),
      },
      action: {
        async setBadgeText() {},
        async setBadgeBackgroundColor() {},
      },
      windows: {
        async getAll() {
          return [];
        },
        async getLastFocused() {
          return { id: 1, left: 0, top: 0, width: 1200, height: 800 };
        },
        async get() {
          return { id: 1, left: 0, top: 0, width: 1200, height: 800 };
        },
        async update() {},
        async create(options: unknown) {
          popupCreates.push(clone(options));
          return { id: popupCreates.length };
        },
      },
      tabs: {
        async query() {
          return [];
        },
      },
    },
  });

  try {
    const { handleSignatureRequest, handleTransactionRequest } = await import(
      "../../src/chrome/transactions/requestIntake"
    );

    handleTransactionRequest(
      {
        type: "transactionRequest",
        tx: {
          chainId: 4326,
          from: address,
          to: "0x2222222222222222222222222222222222222222",
          value: "0x00",
          gas: "0x5208",
        },
        origin: "https://example.test",
        favicon: "https://example.test/favicon.png",
      },
      "tx-1",
      1,
      "https://example.test",
      undefined,
      0,
    );

    await waitFor(
      () => Array.isArray(local.pendingTxRequests) &&
        local.pendingTxRequests.length === 1,
    );
    const pendingTx = (local.pendingTxRequests as Array<Record<string, unknown>>)[0];
    assert.equal(pendingTx.accountId, "pk-1");
    assert.equal(pendingTx.accountAddress, address);
    assert.equal(pendingTx.accountType, "privateKey");
    assert.equal(pendingTx.senderOrigin, "https://example.test");
    assert.equal(pendingTx.requestChainId, 4326);
    assert.equal((pendingTx.tx as Record<string, unknown>).value, "0x0");
    assert.equal((pendingTx.tx as Record<string, unknown>).gas, undefined);

    handleSignatureRequest(
      {
        type: "signatureRequest",
        signature: {
          method: "personal_sign",
          params: ["0x1234", address],
          chainId: 1,
        },
        origin: "https://example.test",
      },
      "sig-1",
      1,
      "https://example.test",
      undefined,
      0,
    );

    await waitFor(
      () => Array.isArray(local.pendingSignatureRequests) &&
        local.pendingSignatureRequests.length === 1,
    );
    const pendingSignature = (
      local.pendingSignatureRequests as Array<Record<string, unknown>>
    )[0];
    assert.equal(pendingSignature.accountId, "pk-1");
    assert.equal(pendingSignature.accountAddress, address);
    assert.equal(pendingSignature.accountType, "privateKey");
    assert.equal(pendingSignature.senderOrigin, "https://example.test");
    assert.equal(pendingSignature.requestChainId, 1);

    await waitFor(() =>
      runtimeMessages.some(
        (message) =>
          (message as { type?: string }).type === "newPendingTxRequest",
      ),
    );
    await waitFor(() =>
      runtimeMessages.some(
        (message) =>
          (message as { type?: string }).type ===
          "newPendingSignatureRequest",
      ),
    );
    await waitFor(() => popupCreates.length >= 2);
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      delete (globalThis as { chrome?: unknown }).chrome;
    }
  }
});
