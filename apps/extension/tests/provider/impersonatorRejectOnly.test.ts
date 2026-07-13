import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return { ...storage };
  if (typeof keys === "string") return { [keys]: storage[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storage[key]]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      storage[key] ?? fallback,
    ]),
  );
}

test("impersonator transaction requests queue for rejection but cannot sign", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {
    accounts: [
      {
        id: "watch-only",
        type: "impersonator",
        address: "0x1111111111111111111111111111111111111111",
        createdAt: 1,
      },
    ],
  };
  const sync: StorageRecord = { activeAccountId: "watch-only" };
  const session: StorageRecord = {};

  const storageArea = (storage: StorageRecord) => ({
    async get(keys?: string | string[] | StorageRecord | null) {
      return selectStorageValues(storage, keys);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, values);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
    async clear() {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
        session: storageArea(session),
      },
      action: {
        async setBadgeText() {},
        async setBadgeBackgroundColor() {},
      },
      runtime: {
        lastError: undefined,
        onStartup: { addListener() {} },
      },
    },
  });

  try {
    const {
      isRequestSigningAccount,
      pinnedSignatureRequest,
      pinnedTxRequest,
    } = await import("../../src/chrome/requests/pinnedRequest");
    const {
      getPendingTxRequestById,
      removePendingTxRequest,
      savePendingTxRequest,
    } = await import("../../src/chrome/requests/pendingTxStorage");
    const {
      getPendingSignatureRequestById,
      removePendingSignatureRequest,
      savePendingSignatureRequest,
    } = await import("../../src/chrome/requests/pendingSignatureStorage");

    const account = (local.accounts as Array<{
      id: string;
      type: "impersonator";
      address: string;
      createdAt: number;
    }>)[0];
    const request = pinnedTxRequest(account, {
      id: "watch-only-request",
      tx: {
        from: account.address,
        to: "0x2222222222222222222222222222222222222222",
        data: "0x",
        value: "0x0",
        chainId: 8453,
      },
      origin: "https://example.test",
      favicon: null,
      chainName: "Base",
      timestamp: Date.now(),
    });

    assert.equal(request.accountType, "impersonator");
    await savePendingTxRequest(request);
    assert.equal(
      (await getPendingTxRequestById(request.id))?.accountType,
      "impersonator",
    );

    assert.equal(isRequestSigningAccount(account), false);
    assert.ok(await getPendingTxRequestById(request.id));

    const signatureRequest = pinnedSignatureRequest(account, {
      id: "watch-only-signature",
      signature: {
        method: "personal_sign",
        params: ["0x68656c6c6f", account.address],
        chainId: 8453,
      },
      origin: "https://example.test",
      favicon: null,
      chainName: "Base",
      timestamp: Date.now(),
    });
    await savePendingSignatureRequest(signatureRequest);
    assert.equal(
      (await getPendingSignatureRequestById(signatureRequest.id))?.accountType,
      "impersonator",
    );

    await removePendingTxRequest(request.id);
    await removePendingSignatureRequest(signatureRequest.id);
    assert.equal(await getPendingTxRequestById(request.id), null);
    assert.equal(
      await getPendingSignatureRequestById(signatureRequest.id),
      null,
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
