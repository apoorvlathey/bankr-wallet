import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const originalDateNow = Date.now;

const values: Record<string, unknown> = {};
const operations: Array<{ type: "remove" | "set"; value: unknown }> = [];
let removeError: Error | undefined;

Object.defineProperty(Date, "now", {
  configurable: true,
  value: () => NOW,
});
Object.defineProperty(globalThis, "chrome", {
  configurable: true,
  value: {
    storage: {
      local: {
        async get(key: string | string[] | null) {
          if (key === null) return { ...values };
          const keys = Array.isArray(key) ? key : [key];
          return Object.fromEntries(keys.map((name) => [name, values[name]]));
        },
        async remove(keys: string | string[]) {
          operations.push({ type: "remove", value: keys });
          if (removeError) throw removeError;
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete values[key];
          }
        },
        async set(items: Record<string, unknown>) {
          operations.push({ type: "set", value: items });
          Object.assign(values, items);
        },
      },
    },
  },
});

const { CACHE_PRUNE_INTERVAL_MS, pruneNonCriticalStorageCaches } = await import(
  "../../src/chrome/storageCachePruner"
);

beforeEach(() => {
  for (const key of Object.keys(values)) delete values[key];
  operations.length = 0;
  removeError = undefined;
});

after(() => {
  Object.defineProperty(Date, "now", {
    configurable: true,
    value: originalDateNow,
  });
});

test("cache pruning preserves exact TTL, schema, and future-time policy", async () => {
  Object.assign(values, {
    "tokenInfo:fresh": { fetchedAt: NOW - 30 * DAY },
    "tokenLogo:expired": { fetchedAt: NOW - 30 * DAY - 1 },
    "ethShLabels:future": { fetchedAt: NOW + HOUR + 1 },
    "swapTokenList:malformed": { fetchedAt: "yesterday" },
    "cs:desc:old-schema": { schemaVersion: 2, updatedAt: NOW },
    "cs:desc:descriptor-expired": {
      schemaVersion: 3,
      descriptor: {},
      updatedAt: NOW - 7 * DAY - 1,
    },
    "cs:desc:failure-expired": {
      schemaVersion: 3,
      updatedAt: NOW - DAY - 1,
    },
    "cs:desc:fresh": {
      schemaVersion: 3,
      descriptor: {},
      updatedAt: NOW - 7 * DAY,
    },
    coingeckoMarketCache: {
      fresh: { fetchedAt: NOW - 5 * 60 * 1000 },
      stale: { fetchedAt: NOW - 5 * 60 * 1000 - 1 },
    },
    coingeckoSearchCache: "corrupt",
    ensAvatarImageCache: {
      fresh: {
        cachedAt: NOW - 14 * DAY,
        lastAccessedAt: NOW,
        sizeBytes: 10,
      },
      expired: {
        cachedAt: NOW - 14 * DAY - 1,
        lastAccessedAt: NOW,
        sizeBytes: 10,
      },
    },
  });

  assert.equal(CACHE_PRUNE_INTERVAL_MS, 6 * HOUR);
  assert.deepEqual(await pruneNonCriticalStorageCaches(), {
    removedKeys: 7,
    compactedKeys: 3,
  });
  assert.ok(values["tokenInfo:fresh"]);
  assert.ok(values["cs:desc:fresh"]);
  for (const key of [
    "tokenLogo:expired",
    "ethShLabels:future",
    "swapTokenList:malformed",
    "cs:desc:old-schema",
    "cs:desc:descriptor-expired",
    "cs:desc:failure-expired",
    "coingeckoSearchCache",
  ]) {
    assert.equal(values[key], undefined, key);
  }
  assert.deepEqual(values.coingeckoMarketCache, {
    fresh: { fetchedAt: NOW - 5 * 60 * 1000 },
  });
  assert.deepEqual(values.ensAvatarImageCache, {
    fresh: {
      cachedAt: NOW - 14 * DAY,
      lastAccessedAt: NOW,
      sizeBytes: 10,
    },
  });
  assert.deepEqual(
    operations.map((operation) => operation.type),
    ["remove", "set"],
  );
});

test("avatar cache keeps the 200 most recently accessed valid entries", async () => {
  values.ensAvatarImageCache = Object.fromEntries(
    Array.from({ length: 202 }, (_, index) => [
      `avatar-${index}`,
      {
        cachedAt: NOW,
        lastAccessedAt: NOW + index,
        sizeBytes: 1,
      },
    ]),
  );

  assert.deepEqual(await pruneNonCriticalStorageCaches(), {
    removedKeys: 0,
    compactedKeys: 1,
  });
  const avatars = values.ensAvatarImageCache as Record<string, unknown>;
  assert.equal(Object.keys(avatars).length, 200);
  assert.equal(avatars["avatar-0"], undefined);
  assert.equal(avatars["avatar-1"], undefined);
  assert.ok(avatars["avatar-201"]);
});

test("portfolio cache pruning stays delegated and reset-aware", async () => {
  const snapshot = (totalValueUsd: number, timestamp: number) => ({
    tokens: [],
    defiPositions: [],
    totalValueUsd,
    omittedTokenCount: 0,
    omittedTokenValueUsd: 0,
    omittedTokenValueUsdByChain: {},
    customTokenKeys: [],
    allTokenKeys: [],
    hiddenTokenKeys: [],
    onchainFetchedTokenKeys: [],
    rpcIssueChainIds: [],
    apiUnavailable: false,
    timestamp,
  });
  values.portfolioHoldingsCache = {
    version: 3,
    entries: {
      fresh: snapshot(1, NOW),
      stale: snapshot(2, NOW - DAY - 1),
    },
  };

  assert.deepEqual(await pruneNonCriticalStorageCaches(), {
    removedKeys: 0,
    compactedKeys: 1,
  });
  assert.deepEqual(
    Object.keys(
      (values.portfolioHoldingsCache as { entries: Record<string, unknown> })
        .entries,
    ),
    ["fresh"],
  );
});

test("cache storage failures propagate and remove remains ordered before set", async () => {
  values["tokenLogo:expired"] = { fetchedAt: NOW - 30 * DAY - 1 };
  values.coingeckoMarketCache = {
    fresh: { fetchedAt: NOW },
    stale: { fetchedAt: NOW - 5 * 60 * 1000 - 1 },
  };
  removeError = new Error("storage unavailable");

  await assert.rejects(pruneNonCriticalStorageCaches(), /storage unavailable/);
  assert.deepEqual(
    operations.map((operation) => operation.type),
    ["remove"],
  );
});

test("a clean storage snapshot performs no writes", async () => {
  assert.deepEqual(await pruneNonCriticalStorageCaches(), {
    removedKeys: 0,
    compactedKeys: 0,
  });
  assert.deepEqual(operations, []);
});
