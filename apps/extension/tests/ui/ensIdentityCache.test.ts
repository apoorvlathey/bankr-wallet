import assert from "node:assert/strict";
import test from "node:test";

import {
  cacheIdentityNameHint,
  isCacheValid,
  type EnsIdentityCache,
} from "../../src/lib/ensIdentityCache";

const ADDRESS = "0x1111111111111111111111111111111111111111";

function installStorage(initial: EnsIdentityCache = {}) {
  let cache = structuredClone(initial);
  const previous = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ ensIdentityCache: structuredClone(cache) }),
        set: async (record: { ensIdentityCache: EnsIdentityCache }) => {
          cache = structuredClone(record.ensIdentityCache);
        },
      },
    },
  } as typeof chrome;
  return { read: () => cache, restore: () => { globalThis.chrome = previous; } };
}

test("forward-resolved contact names seed a partial cache entry", async () => {
  const storage = installStorage();
  try {
    await cacheIdentityNameHint(ADDRESS, "john.eth");
    const entry = storage.read()[ADDRESS];
    assert.equal(entry.name, "john.eth");
    assert.equal(entry.avatar, null);
    assert.equal(entry.needsAvatar, true);
    assert.equal(isCacheValid(entry), false);
  } finally {
    storage.restore();
  }
});

test("a matching cached avatar survives a repeated name hint", async () => {
  const storage = installStorage({
    [ADDRESS]: {
      name: "john.eth",
      avatar: "https://example.com/john.png",
      resolvedAt: 1,
    },
  });
  try {
    await cacheIdentityNameHint(ADDRESS, "john.eth");
    const entry = storage.read()[ADDRESS];
    assert.equal(entry.avatar, "https://example.com/john.png");
    assert.equal(entry.needsAvatar, false);
    assert.equal(isCacheValid(entry), true);
  } finally {
    storage.restore();
  }
});
