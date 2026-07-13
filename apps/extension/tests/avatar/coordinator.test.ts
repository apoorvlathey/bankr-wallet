import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchAndCacheAvatarImage,
  getCachedAvatarImage,
} from "../../src/chrome/avatar/coordinator";
import { AVATAR_CACHE_STORAGE_KEY } from "../../src/chrome/avatar/constants";
import { invalidateAvatarImageCacheForWalletReset } from "../../src/chrome/avatar/scheduler";
import { createMockStorageRuntime, deferred, withGlobalReplacements } from "./runtime";

function rasterRuntime(storage = createMockStorageRuntime()) {
  let closeCalls = 0;
  return {
    storage,
    replacements: {
      chrome: storage.chrome,
      fetch: async () => new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
      createImageBitmap: async () => ({
        width: 1,
        height: 1,
        close() { closeCalls += 1; },
      }),
      OffscreenCanvas: class {
        getContext() { return { drawImage() {} }; }
        async convertToBlob() { return new Blob([new Uint8Array([1])], { type: "image/webp" }); }
      },
    },
    get closeCalls() { return closeCalls; },
  };
}

test("avatar coordinator stores and reuses the exact cache schema", async () => {
  const runtime = rasterRuntime();
  let fetchCalls = 0;
  runtime.replacements.fetch = async () => {
    fetchCalls += 1;
    return new Response(new Uint8Array([1]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  };
  await withGlobalReplacements(runtime.replacements, async () => {
    const url = "https://images.example/cached.png";
    const first = await fetchAndCacheAvatarImage(url);
    assert.match(first || "", /^data:image\/webp;base64,/);
    assert.equal(await fetchAndCacheAvatarImage(url), first);
    assert.equal(await getCachedAvatarImage(url), first);
    assert.equal(fetchCalls, 1);
    const cache = runtime.storage.values[AVATAR_CACHE_STORAGE_KEY] as Record<string, Record<string, unknown>>;
    assert.deepEqual(Object.keys(cache[url]!).sort(), [
      "cachedAt",
      "dataUrl",
      "lastAccessedAt",
      "sizeBytes",
    ]);
  });
  assert.equal(runtime.closeCalls, 1);
});

test("avatar coordinator rejects corrupt legacy cache and SVG before decoding", async () => {
  const url = "https://images.example/avatar.svg";
  const now = Date.now();
  const storage = createMockStorageRuntime({
    [AVATAR_CACHE_STORAGE_KEY]: {
      [url]: {
        dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        sizeBytes: 48,
        cachedAt: now,
        lastAccessedAt: now,
      },
    },
  });
  let bitmapCalls = 0;
  await withGlobalReplacements(
    {
      chrome: storage.chrome,
      fetch: async () => new Response("<svg/>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
      createImageBitmap: async () => { bitmapCalls += 1; throw new Error("unexpected"); },
    },
    async () => {
      assert.equal(await getCachedAvatarImage(url), null);
      assert.equal(await fetchAndCacheAvatarImage(url), null);
      assert.equal(bitmapCalls, 0);
    },
  );
});

test("wallet reset during decode prevents old-wallet cache repopulation", async () => {
  const runtime = rasterRuntime();
  const bitmapStarted = deferred();
  const releaseBitmap = deferred();
  runtime.replacements.createImageBitmap = async () => {
    bitmapStarted.resolve();
    await releaseBitmap.promise;
    return { width: 1, height: 1, close() {} };
  };
  await withGlobalReplacements(runtime.replacements, async () => {
    const pending = fetchAndCacheAvatarImage("https://images.example/old-wallet.png");
    await bitmapStarted.promise;
    invalidateAvatarImageCacheForWalletReset();
    releaseBitmap.resolve();
    assert.equal(await pending, null);
    assert.equal(runtime.storage.values[AVATAR_CACHE_STORAGE_KEY], undefined);
  });
});

test("wallet reset crossing storage.set removes the stale committed entry", async () => {
  const setStarted = deferred();
  const releaseSet = deferred();
  let setCalls = 0;
  const storage = createMockStorageRuntime({}, {
    beforeSet: async () => {
      setCalls += 1;
      if (setCalls === 1) {
        setStarted.resolve();
        await releaseSet.promise;
      }
    },
  });
  const runtime = rasterRuntime(storage);
  await withGlobalReplacements(runtime.replacements, async () => {
    const pending = fetchAndCacheAvatarImage("https://images.example/reset-set.png");
    await setStarted.promise;
    invalidateAvatarImageCacheForWalletReset();
    releaseSet.resolve();
    assert.equal(await pending, null);
    assert.equal(storage.values[AVATAR_CACHE_STORAGE_KEY], undefined);
  });
});

test("avatar coordinator resolves unexpected runtime failures to null", async () => {
  const storage = createMockStorageRuntime();
  await withGlobalReplacements(
    {
      chrome: storage.chrome,
      fetch: async () => { throw new Error("offline"); },
    },
    async () => {
      assert.equal(
        await fetchAndCacheAvatarImage("https://images.example/offline.png"),
        null,
      );
    },
  );
});
