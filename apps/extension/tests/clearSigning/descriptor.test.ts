import assert from "node:assert/strict";
import test from "node:test";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";
import type { DescriptorLookup } from "../../src/chrome/clearSigning/types";

const ADDRESS = `0x${"A".repeat(40)}`;
const LOWER_ADDRESS = ADDRESS.toLowerCase();
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const calldataLookup: DescriptorLookup = {
  chainId: 8453,
  address: ADDRESS,
  kind: "calldata",
  selector: "0xA9059CBB",
};

async function withFixedNow<T>(operation: () => Promise<T>): Promise<T> {
  const original = Date.now;
  Object.defineProperty(Date, "now", {
    configurable: true,
    value: () => NOW,
  });
  try {
    return await operation();
  } finally {
    Object.defineProperty(Date, "now", {
      configurable: true,
      value: original,
    });
  }
}

test("descriptor cache preserves exact key hints, v3 schema, and TTLs", async () => {
  const cache = await import("../../src/chrome/clearSigning/descriptorCache");
  assert.equal(
    cache.descriptorCacheKey(calldataLookup),
    `cs:desc:8453:${LOWER_ADDRESS}:calldata:0xa9059cbb`,
  );
  assert.equal(
    cache.descriptorCacheKey({
      chainId: 1,
      address: ADDRESS,
      kind: "eip712",
      formatKey: "Permit(address)",
    }),
    `cs:desc:1:${LOWER_ADDRESS}:eip712:fmt:15:f94553e1`,
  );
  assert.equal(
    cache.descriptorCacheKey({
      ...calldataLookup,
      selector: "0x123",
    }),
    `cs:desc:8453:${LOWER_ADDRESS}:calldata:any`,
  );

  const key = cache.descriptorCacheKey(calldataLookup);
  const descriptor = { metadata: { contractName: "Token" } };
  const harness = createChromeStorageHarness();
  try {
    await withFixedNow(async () => {
      await cache.writeDescriptorCache(calldataLookup, descriptor);
      assert.deepEqual(harness.stores.local[key], {
        schemaVersion: 3,
        updatedAt: NOW,
        descriptor,
      });
      assert.deepEqual(await cache.readDescriptorCache(calldataLookup), {
        schemaVersion: 3,
        updatedAt: NOW,
        descriptor,
      });

      harness.stores.local[key] = {
        schemaVersion: 2,
        updatedAt: NOW,
        descriptor,
      };
      assert.equal(await cache.readDescriptorCache(calldataLookup), null);

      harness.stores.local[key] = {
        schemaVersion: 3,
        updatedAt: NOW - 7 * DAY,
        descriptor,
      };
      assert.ok(await cache.readDescriptorCache(calldataLookup));
      (harness.stores.local[key] as any).updatedAt -= 1;
      assert.equal(await cache.readDescriptorCache(calldataLookup), null);

      harness.stores.local[key] = {
        schemaVersion: 3,
        updatedAt: NOW - DAY,
        descriptor: null,
      };
      assert.ok(await cache.readDescriptorCache(calldataLookup));
      (harness.stores.local[key] as any).updatedAt -= 1;
      assert.equal(await cache.readDescriptorCache(calldataLookup), null);
    });
  } finally {
    harness.restore();
  }
});

test("descriptor cache writes are best-effort and invalidation is prefix-only", async () => {
  const cache = await import("../../src/chrome/clearSigning/descriptorCache");
  const harness = createChromeStorageHarness({
    local: {
      "cs:desc:one": {},
      "cs:desc:two": {},
      "prefix-cs:desc:three": {},
      unrelated: {},
    },
  });
  try {
    harness.failNext({ area: "local", operation: "set" });
    await cache.writeDescriptorCache(calldataLookup, null);
    assert.deepEqual(await cache.handleInvalidateClearSigningCache(), {
      cleared: 2,
    });
    assert.equal(harness.stores.local["cs:desc:one"], undefined);
    assert.equal(harness.stores.local["cs:desc:two"], undefined);
    assert.ok(harness.stores.local["prefix-cs:desc:three"]);
    assert.ok(harness.stores.local.unrelated);
  } finally {
    harness.restore();
  }
});

test("clear-signing settings default on and opt-out stores before purging", async () => {
  const settings = await import("../../src/chrome/clearSigning/settings");
  const harness = createChromeStorageHarness({
    local: { "cs:desc:cached": {}, unrelated: true },
  });
  try {
    assert.equal(await settings.getClearSigningEnabled(), true);
    await settings.setClearSigningEnabled(false);
    assert.equal(harness.stores.local["cs:enabled"], false);
    assert.equal(harness.stores.local["cs:desc:cached"], undefined);
    assert.deepEqual(
      harness.writes.map((write) => write.operation),
      ["set", "remove"],
    );

    harness.stores.local["cs:desc:retained"] = {};
    harness.clearObservations();
    await settings.setClearSigningEnabled(true);
    assert.ok(harness.stores.local["cs:desc:retained"]);
    assert.deepEqual(
      harness.writes.map((write) => write.operation),
      ["set"],
    );
  } finally {
    harness.restore();
  }
});

test("opt-out short-circuits cache and resolution; inputs retain exact bounds", async () => {
  const { handleGetClearSigningDescriptorWithDependencies } = await import(
    "../../src/chrome/clearSigning/handlers"
  );
  const afterEnabled: string[] = [];
  const disabled = await handleGetClearSigningDescriptorWithDependencies(
    {
      type: "GET_CLEAR_SIGNING_DESCRIPTOR",
      chainId: 8453,
      address: ADDRESS,
      kind: "calldata",
    },
    {
      getEnabled: async () => false,
      readCache: async () => {
        afterEnabled.push("cache");
        return null;
      },
      resolveDescriptor: async () => {
        afterEnabled.push("resolve");
        return null;
      },
      writeCache: async () => {
        afterEnabled.push("write");
      },
      now: () => NOW,
    },
  );
  assert.deepEqual(disabled, { descriptor: null, enabled: false });
  assert.deepEqual(afterEnabled, []);

  let normalized: DescriptorLookup | undefined;
  let bounded: DescriptorLookup | undefined;
  const originalLog = console.log;
  console.log = () => undefined;
  try {
    await handleGetClearSigningDescriptorWithDependencies(
      {
        type: "GET_CLEAR_SIGNING_DESCRIPTOR",
        chainId: 8453,
        address: ADDRESS,
        kind: "eip712",
        selector: "0xNOTVALID",
        formatKey: "x".repeat(8193),
      },
      {
        getEnabled: async () => true,
        readCache: async (lookup) => {
          normalized = lookup;
          return null;
        },
        resolveDescriptor: async () => null,
        writeCache: async () => undefined,
        now: () => NOW,
      },
    );
    await handleGetClearSigningDescriptorWithDependencies(
      {
        type: "GET_CLEAR_SIGNING_DESCRIPTOR",
        chainId: 1,
        address: ADDRESS,
        kind: "calldata",
        selector: "0xA9059CBB",
        formatKey: "x".repeat(8192),
      },
      {
        getEnabled: async () => true,
        readCache: async (lookup) => {
          bounded = lookup;
          return {
            schemaVersion: 3,
            updatedAt: NOW,
            descriptor: null,
          };
        },
        resolveDescriptor: async () => {
          throw new Error("cache should win");
        },
        writeCache: async () => undefined,
        now: () => NOW,
      },
    );
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(normalized, {
    chainId: 8453,
    address: LOWER_ADDRESS,
    kind: "eip712",
    selector: undefined,
    formatKey: undefined,
  });
  assert.equal(bounded?.selector, "0xa9059cbb");
  assert.equal(bounded?.formatKey?.length, 8192);
});

test("descriptor client preserves bounded query and null failure behavior", async () => {
  const client = await import("../../src/chrome/clearSigning/descriptorClient");
  assert.equal(client.CLEAR_SIGNING_REQUEST_TIMEOUT_MS, 10_000);
  assert.equal(client.CLEAR_SIGNING_RESPONSE_MAX_BYTES, 512 * 1024);

  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  console.warn = () => undefined;
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    return new Response(
      JSON.stringify({ descriptor: { metadata: { contractName: "Remote" } } }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    assert.deepEqual(
      await client.fetchClearSigningDescriptor({
        ...calldataLookup,
        formatKey: "Format Key",
      }),
      { metadata: { contractName: "Remote" } },
    );
    assert.equal(calls[0].url.searchParams.get("chainId"), "8453");
    assert.equal(calls[0].url.searchParams.get("address"), ADDRESS);
    assert.equal(calls[0].url.searchParams.get("kind"), "calldata");
    assert.equal(calls[0].url.searchParams.get("selector"), "0xa9059cbb");
    assert.equal(calls[0].url.searchParams.get("formatKey"), "Format Key");
    assert.equal(calls[0].init?.redirect, "error");
    assert.equal(calls[0].init?.credentials, "omit");
    assert.equal(calls[0].init?.referrerPolicy, "no-referrer");
    assert.equal(calls[0].init?.cache, "no-store");

    globalThis.fetch = (async () =>
      new Response("", { status: 404 })) as typeof fetch;
    assert.equal(
      await client.fetchClearSigningDescriptor(calldataLookup),
      null,
    );

    globalThis.fetch = (async () =>
      new Response("not-json", { status: 200 })) as typeof fetch;
    assert.equal(
      await client.fetchClearSigningDescriptor(calldataLookup),
      null,
    );

    globalThis.fetch = (async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-length": String(512 * 1024 + 1) },
      })) as typeof fetch;
    assert.equal(
      await client.fetchClearSigningDescriptor(calldataLookup),
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
