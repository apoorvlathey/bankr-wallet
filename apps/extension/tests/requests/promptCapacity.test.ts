import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return structuredClone(storage);
  const names =
    typeof keys === "string"
      ? [keys]
      : Array.isArray(keys)
        ? keys
        : Object.keys(keys);
  return Object.fromEntries(
    names.map((key) => [key, structuredClone(storage[key])]),
  );
}

test("one origin cannot monopolize metadata and connection prompt queues", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};

  const storageArea = (storage: StorageRecord) => ({
    get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      const values = selectStorageValues(storage, keys);
      if (callback) {
        callback(values);
        return;
      }
      return Promise.resolve(values);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, structuredClone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea({}),
        session: storageArea({}),
      },
      action: {
        async setBadgeText() {},
        async setBadgeBackgroundColor() {},
      },
      runtime: { lastError: undefined },
    },
  });

  try {
    const dapp = await import("../../src/chrome/dappPermissionStorage");
    const addChain = await import("../../src/chrome/pendingAddChainStorage");
    const watchAsset = await import("../../src/chrome/pendingWatchAssetStorage");
    const now = Date.now();

    await dapp.savePendingDappConnectionRequest({
      id: "connect-1",
      origin: "https://flood.example",
      hostname: "flood.example",
      timestamp: now,
    });
    await assert.rejects(
      dapp.savePendingDappConnectionRequest({
        id: "connect-2",
        origin: "https://flood.example",
        hostname: "flood.example",
        timestamp: now,
      }),
      /already has a pending connection request/i,
    );
    await dapp.savePendingDappConnectionRequest({
      id: "connect-other",
      origin: "https://other.example",
      hostname: "other.example",
      timestamp: now,
    });

    for (let index = 0; index < 5; index += 1) {
      await addChain.savePendingAddChainRequest({
        id: `chain-${index}`,
        chainId: 10_000 + index,
        origin: "https://flood.example",
        favicon: null,
        timestamp: now,
      });
    }
    await assert.rejects(
      addChain.savePendingAddChainRequest({
        id: "chain-overflow",
        chainId: 20_000,
        origin: "https://flood.example",
        favicon: null,
        timestamp: now,
      }),
      /this site has too many pending chain requests/i,
    );
    await addChain.savePendingAddChainRequest({
      id: "chain-other",
      chainId: 20_001,
      origin: "https://other.example",
      favicon: null,
      timestamp: now,
    });

    for (let index = 0; index < 5; index += 1) {
      await watchAsset.savePendingWatchAssetRequest({
        id: `asset-${index}`,
        asset: {
          address: `0x${index.toString(16).padStart(40, "0")}`,
          symbol: "TOK",
          decimals: 18,
        },
        chainId: 8453,
        origin: "https://flood.example",
        favicon: null,
        timestamp: now,
      });
    }
    await assert.rejects(
      watchAsset.savePendingWatchAssetRequest({
        id: "asset-overflow",
        asset: {
          address: `0x${"f".repeat(40)}`,
          symbol: "TOK",
          decimals: 18,
        },
        chainId: 8453,
        origin: "https://flood.example",
        favicon: null,
        timestamp: now,
      }),
      /this site has too many pending asset requests/i,
    );
    await watchAsset.savePendingWatchAssetRequest({
      id: "asset-other",
      asset: {
        address: `0x${"e".repeat(40)}`,
        symbol: "TOK",
        decimals: 18,
      },
      chainId: 8453,
      origin: "https://other.example",
      favicon: null,
      timestamp: now,
    });

    assert.equal((await dapp.getPendingDappConnectionRequests()).length, 2);
    assert.equal((await addChain.getPendingAddChainRequests()).length, 6);
    assert.equal((await watchAsset.getPendingWatchAssetRequests()).length, 6);
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
