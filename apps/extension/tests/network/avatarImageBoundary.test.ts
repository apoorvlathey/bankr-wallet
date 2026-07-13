import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedRasterImageContentType,
  isAllowedRemoteImageUrl,
  sanitizeUntrustedImageUrl,
  sanitizeTrustedRendererImageSrc,
} from "../../src/lib/remoteImagePolicy";
import {
  fetchAndCacheAvatarImage,
  getCachedAvatarImage,
  invalidateAvatarImageCacheForWalletReset,
  readAvatarBlobBounded,
} from "../../src/chrome/avatarImageCache";

test("avatar fetch boundary allows public HTTPS resources", () => {
  for (const url of [
    "https://avatars.example.org/user.png",
    "https://ipfs.io/ipfs/bafybeigdyrzt/avatar.webp",
    "https://cdn.example.org:443/a.png?size=128",
    "https://8.8.8.8/avatar.png",
    "https://[2606:4700:4700::1111]/avatar.png",
  ]) {
    assert.equal(isAllowedRemoteImageUrl(url), true, url);
  }
});

test("avatar fetch boundary rejects credentials, local networks, and unsafe schemes", () => {
  for (const url of [
    "http://images.example.org/a.png",
    "data:image/svg+xml,<svg/>",
    "file:///etc/passwd",
    "https://user:password@example.org/a.png",
    "https://example.org:8443/a.png",
    "https://localhost/a.png",
    "https://service.local/a.png",
    "https://service.internal/a.png",
    "https://127.0.0.1/a.png",
    "https://127.1/a.png",
    "https://0.0.0.0/a.png",
    "https://10.0.0.1/a.png",
    "https://169.254.169.254/latest/meta-data",
    "https://172.16.0.1/a.png",
    "https://192.168.0.1/a.png",
    "https://224.0.0.1/a.png",
    "https://[::1]/a.png",
    "https://[::ffff:127.0.0.1]/a.png",
    "https://[::ffff:7f00:1]/a.png",
    "https://[::ffff:a9fe:a9fe]/latest/meta-data",
    "https://[fc00::1]/a.png",
    "https://[fe80::1]/a.png",
    "https://[fec0::1]/a.png",
    "https://[ff02::1]/a.png",
    `https://example.org/${"x".repeat(2_100)}`,
  ]) {
    assert.equal(isAllowedRemoteImageUrl(url), false, url);
  }
});

test("untrusted page icons allow only public HTTPS or bounded raster data", () => {
  assert.equal(
    sanitizeUntrustedImageUrl("https://cdn.example.org/icon.png"),
    "https://cdn.example.org/icon.png",
  );
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(sanitizeUntrustedImageUrl(png), png);
  assert.equal(
    sanitizeUntrustedImageUrl("data:image/svg+xml,<svg onload=alert(1)/>"),
    null,
  );
  assert.equal(sanitizeUntrustedImageUrl("https://127.0.0.1/icon.png"), null);
});

test("trusted renderers never receive raw remote URLs or SVG/data markup", () => {
  assert.equal(
    sanitizeTrustedRendererImageSrc("/walletchan-icon.png"),
    "/walletchan-icon.png",
  );
  assert.equal(
    sanitizeTrustedRendererImageSrc("walletchan-icon.png"),
    "walletchan-icon.png",
  );
  assert.equal(
    sanitizeTrustedRendererImageSrc("data:image/png;base64,iVBORw0KGgo="),
    "data:image/png;base64,iVBORw0KGgo=",
  );

  for (const source of [
    "https://tracker.example/seen.png?request=secret",
    "https://127.0.0.1/admin.png",
    "http://169.254.169.254/latest/meta-data",
    "data:image/svg+xml,<svg onload=alert(1)/>",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "javascript:alert(1)",
    "//tracker.example/seen.png",
  ]) {
    assert.equal(sanitizeTrustedRendererImageSrc(source), null, source);
  }

  const oversized = `data:image/webp;base64,${"A".repeat(700_001)}`;
  assert.equal(sanitizeTrustedRendererImageSrc(oversized), null);
});

test("packaged URLs are restricted to this extension ID", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        getURL: (path: string) => `chrome-extension://walletchan-id${path}`,
      },
    },
  });
  try {
    assert.equal(
      sanitizeTrustedRendererImageSrc(
        "chrome-extension://walletchan-id/icons/icon128.png",
      ),
      "chrome-extension://walletchan-id/icons/icon128.png",
    );
    assert.equal(
      sanitizeTrustedRendererImageSrc(
        "chrome-extension://another-extension/icons/icon128.png",
      ),
      null,
    );
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "chrome", descriptor);
    else Reflect.deleteProperty(globalThis, "chrome");
  }
});

test("avatar decoder accepts explicit raster media types and rejects SVG", () => {
  for (const contentType of [
    "image/png",
    "image/jpeg; charset=binary",
    "IMAGE/WEBP",
    "image/gif",
    "image/avif",
    "image/x-icon",
  ]) {
    assert.equal(isAllowedRasterImageContentType(contentType), true, contentType);
  }

  for (const contentType of [
    "image/svg+xml",
    "image/svg+xml; charset=utf-8",
    "text/html",
    "application/octet-stream",
    "",
    null,
  ]) {
    assert.equal(isAllowedRasterImageContentType(contentType), false, String(contentType));
  }
});

test("avatar bodies are rejected while streaming before an unbounded allocation", async () => {
  const accepted = await readAvatarBlobBounded(
    new Response(new Uint8Array([1, 2, 3, 4])),
    4,
    "image/png",
  );
  assert.equal(accepted?.size, 4);
  assert.equal(accepted?.type, "image/png");

  const oversized = await readAvatarBlobBounded(
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
          controller.close();
        },
      }),
    ),
    5,
    "image/png",
  );
  assert.equal(oversized, null);

  const declaredOversized = await readAvatarBlobBounded(
    new Response(new Uint8Array([1]), {
      headers: { "content-length": "999" },
    }),
    5,
    "image/png",
  );
  assert.equal(declaredOversized, null);
});

async function withMockImageRuntime(
  fetchImpl: typeof fetch,
  run: (storage: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const descriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();
  const replace = (key: PropertyKey, value: unknown) => {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  };

  const storage: Record<string, unknown> = {};
  replace("fetch", fetchImpl);
  replace("chrome", {
    storage: {
      local: {
        async get(key: string) {
          return { [key]: storage[key] };
        },
        async set(value: Record<string, unknown>) {
          Object.assign(storage, value);
        },
      },
    },
  });

  try {
    await run(storage);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test("avatar redirects are revalidated before following private targets", async () => {
  const calls: string[] = [];
  await withMockImageRuntime(
    (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/private.png" },
      });
    }) as typeof fetch,
    async () => {
      const result = await fetchAndCacheAvatarImage(
        "https://redirect.example/avatar.png?private-target",
      );
      assert.equal(result, null);
      assert.deepEqual(calls, [
        "https://redirect.example/avatar.png?private-target",
      ]);
    },
  );
});

test("legacy or corrupted cache entries cannot bypass raster validation", async () => {
  const sourceUrl = "https://images.example/avatar.png?corrupt-cache";
  await withMockImageRuntime(
    (async () => {
      throw new Error("cache validation must finish before fetch");
    }) as typeof fetch,
    async (storage) => {
      const now = Date.now();
      storage.ensAvatarImageCache = {
        [sourceUrl]: {
          dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
          sizeBytes: 48,
          cachedAt: now,
          lastAccessedAt: now,
        },
      };
      assert.equal(await getCachedAvatarImage(sourceUrl), null);

      storage.ensAvatarImageCache = {
        [sourceUrl]: {
          dataUrl: "https://tracker.example/old-cache.png",
          sizeBytes: 37,
          cachedAt: now,
          lastAccessedAt: now,
        },
      };
      assert.equal(await getCachedAvatarImage(sourceUrl), null);
    },
  );
});

test("avatar fetch rejects SVG MIME before any renderer-visible decode", async () => {
  let bitmapCalls = 0;
  await withMockImageRuntime(
    (async () =>
      new Response("<svg/>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      })) as typeof fetch,
    async () => {
      const previous = Object.getOwnPropertyDescriptor(
        globalThis,
        "createImageBitmap",
      );
      Object.defineProperty(globalThis, "createImageBitmap", {
        configurable: true,
        value: async () => {
          bitmapCalls += 1;
          throw new Error("must not decode");
        },
      });
      try {
        assert.equal(
          await fetchAndCacheAvatarImage(
            "https://images.example/avatar.svg?mime-regression",
          ),
          null,
        );
        assert.equal(bitmapCalls, 0);
      } finally {
        if (previous) {
          Object.defineProperty(globalThis, "createImageBitmap", previous);
        } else {
          Reflect.deleteProperty(globalThis, "createImageBitmap");
        }
      }
    },
  );
});

test("avatar tracking requests omit credentials and referrers before rasterizing", async () => {
  let options: RequestInit | undefined;
  await withMockImageRuntime(
    (async (_input: string | URL | Request, init?: RequestInit) => {
      options = init;
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as typeof fetch,
    async () => {
      const bitmapDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        "createImageBitmap",
      );
      const canvasDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        "OffscreenCanvas",
      );
      Object.defineProperty(globalThis, "createImageBitmap", {
        configurable: true,
        value: async () => ({ width: 1, height: 1, close() {} }),
      });
      Object.defineProperty(globalThis, "OffscreenCanvas", {
        configurable: true,
        value: class {
          getContext() {
            return { drawImage() {} };
          }
          async convertToBlob() {
            return new Blob([new Uint8Array([1, 2])], { type: "image/webp" });
          }
        },
      });
      try {
        const result = await fetchAndCacheAvatarImage(
          "https://tracker.example/seen.png?background-only",
        );
        assert.match(result || "", /^data:image\/webp;base64,/);
        assert.equal(options?.credentials, "omit");
        assert.equal(options?.referrerPolicy, "no-referrer");
        assert.equal(options?.redirect, "manual");
      } finally {
        if (bitmapDescriptor) {
          Object.defineProperty(globalThis, "createImageBitmap", bitmapDescriptor);
        } else {
          Reflect.deleteProperty(globalThis, "createImageBitmap");
        }
        if (canvasDescriptor) {
          Object.defineProperty(globalThis, "OffscreenCanvas", canvasDescriptor);
        } else {
          Reflect.deleteProperty(globalThis, "OffscreenCanvas");
        }
      }
    },
  );
});

test("wallet reset invalidation prevents an old in-flight image from repopulating cache", async () => {
  await withMockImageRuntime(
    (async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })) as typeof fetch,
    async (storage) => {
      const bitmapDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        "createImageBitmap",
      );
      const canvasDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        "OffscreenCanvas",
      );
      let releaseBitmap!: () => void;
      let markBitmapStarted!: () => void;
      const bitmapStarted = new Promise<void>((resolve) => {
        markBitmapStarted = resolve;
      });
      const bitmapGate = new Promise<void>((resolve) => {
        releaseBitmap = resolve;
      });
      Object.defineProperty(globalThis, "createImageBitmap", {
        configurable: true,
        value: async () => {
          markBitmapStarted();
          await bitmapGate;
          return { width: 1, height: 1, close() {} };
        },
      });
      Object.defineProperty(globalThis, "OffscreenCanvas", {
        configurable: true,
        value: class {
          getContext() {
            return { drawImage() {} };
          }
          async convertToBlob() {
            return new Blob([new Uint8Array([1])], { type: "image/webp" });
          }
        },
      });

      try {
        const pending = fetchAndCacheAvatarImage(
          "https://images.example/old-wallet.png?reset-race",
        );
        await bitmapStarted;
        invalidateAvatarImageCacheForWalletReset();
        releaseBitmap();
        assert.equal(await pending, null);
        assert.equal(storage.ensAvatarImageCache, undefined);
      } finally {
        if (bitmapDescriptor) {
          Object.defineProperty(globalThis, "createImageBitmap", bitmapDescriptor);
        } else {
          Reflect.deleteProperty(globalThis, "createImageBitmap");
        }
        if (canvasDescriptor) {
          Object.defineProperty(globalThis, "OffscreenCanvas", canvasDescriptor);
        } else {
          Reflect.deleteProperty(globalThis, "OffscreenCanvas");
        }
      }
    },
  );
});
