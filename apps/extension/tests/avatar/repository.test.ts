import assert from "node:assert/strict";
import test from "node:test";

import {
  AVATAR_CACHE_MAX_ENTRIES,
  AVATAR_CACHE_MAX_TOTAL_BYTES,
  AVATAR_CACHE_STORAGE_KEY,
} from "../../src/chrome/avatar/constants";
import {
  commitAvatarDataUrl,
  isAvatarCacheEntryValid,
  pruneAvatarCache,
  readCachedAvatarDataUrl,
} from "../../src/chrome/avatar/repository";
import type { AvatarCache } from "../../src/chrome/avatar/types";
import { createMockStorageRuntime, withGlobalReplacements } from "./runtime";

const dataUrl = "data:image/webp;base64,AQ==";

function entry(lastAccessedAt: number, value = dataUrl) {
  return {
    dataUrl: value,
    sizeBytes: value.length,
    cachedAt: Date.now(),
    lastAccessedAt,
  };
}

test("avatar repository validates the exact persisted schema", () => {
  assert.equal(isAvatarCacheEntryValid(entry(1)), true);
  assert.equal(isAvatarCacheEntryValid({ ...entry(1), sizeBytes: 1 }), false);
  assert.equal(isAvatarCacheEntryValid({ ...entry(1), cachedAt: Number.NaN }), false);
  assert.equal(isAvatarCacheEntryValid({ ...entry(1), dataUrl: "data:image/svg+xml,<svg/>" }), false);
});

test("avatar repository drops expired/corrupt entries and enforces 200-entry LRU", () => {
  const cache = Object.fromEntries(
    Array.from({ length: AVATAR_CACHE_MAX_ENTRIES + 1 }, (_, index) => [
      `https://images.example/${index}.png`,
      entry(index),
    ]),
  ) as AvatarCache;
  cache["https://images.example/corrupt.png"] = {
    ...entry(999),
    dataUrl: "https://tracker.example/a.png",
  };
  pruneAvatarCache(cache);
  assert.equal(Object.keys(cache).length, AVATAR_CACHE_MAX_ENTRIES);
  assert.equal(cache["https://images.example/0.png"], undefined);
  assert.equal(cache["https://images.example/corrupt.png"], undefined);
});

test("avatar repository enforces the 5 MiB aggregate LRU ceiling", () => {
  const largeDataUrl = `data:image/webp;base64,${"A".repeat(600_000)}`;
  const cache = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [
      `https://images.example/large-${index}.png`,
      entry(index, largeDataUrl),
    ]),
  ) as AvatarCache;
  pruneAvatarCache(cache);
  const total = Object.values(cache).reduce((sum, value) => sum + value.sizeBytes, 0);
  assert.ok(total <= AVATAR_CACHE_MAX_TOTAL_BYTES);
  assert.equal(Object.keys(cache).length, 8);
  assert.equal(cache["https://images.example/large-0.png"], undefined);
});

test("avatar repository serializes whole-record commits without lost updates", async () => {
  const runtime = createMockStorageRuntime();
  await withGlobalReplacements({ chrome: runtime.chrome }, async () => {
    assert.deepEqual(
      await Promise.all([
        commitAvatarDataUrl("https://images.example/a.png", dataUrl, () => true),
        commitAvatarDataUrl("https://images.example/b.png", dataUrl, () => true),
      ]),
      [true, true],
    );
    const cache = runtime.values[AVATAR_CACHE_STORAGE_KEY] as AvatarCache;
    assert.deepEqual(Object.keys(cache).sort(), [
      "https://images.example/a.png",
      "https://images.example/b.png",
    ]);
    assert.equal(await readCachedAvatarDataUrl("https://images.example/a.png"), dataUrl);
  });
});

test("avatar repository is best-effort when cache storage is unavailable", async () => {
  const chrome = {
    storage: {
      local: {
        async get() { throw new Error("storage unavailable"); },
        async set() { throw new Error("storage unavailable"); },
        async remove() { throw new Error("storage unavailable"); },
      },
    },
  };
  await withGlobalReplacements({ chrome }, async () => {
    assert.equal(await readCachedAvatarDataUrl("https://images.example/a.png"), null);
    assert.equal(
      await commitAvatarDataUrl("https://images.example/a.png", dataUrl, () => true),
      true,
    );
  });
});
