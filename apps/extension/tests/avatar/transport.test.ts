import assert from "node:assert/strict";
import test from "node:test";

import {
  AVATAR_FETCH_TIMEOUT_MS,
  AVATAR_MAX_DOWNLOAD_BYTES,
  AVATAR_MAX_REDIRECTS,
} from "../../src/chrome/avatar/constants";
import { fetchAvatarRasterBlob } from "../../src/chrome/avatar/transport";
import { withGlobalReplacements } from "./runtime";

test("avatar transport manually revalidates redirect targets against SSRF", async () => {
  const calls: string[] = [];
  await withGlobalReplacements(
    {
      fetch: async (input: string | URL | Request) => {
        calls.push(String(input));
        return new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/private.png" },
        });
      },
    },
    async () => {
      assert.equal(
        await fetchAvatarRasterBlob("https://redirect.example/avatar.png"),
        null,
      );
      assert.deepEqual(calls, ["https://redirect.example/avatar.png"]);
    },
  );
});

test("avatar transport follows at most three manually validated redirects", async () => {
  const calls: string[] = [];
  await withGlobalReplacements(
    {
      fetch: async (input: string | URL | Request) => {
        const current = String(input);
        calls.push(current);
        return new Response(null, {
          status: 302,
          headers: { location: `${current}${calls.length}` },
        });
      },
    },
    async () => {
      assert.equal(
        await fetchAvatarRasterBlob("https://redirect.example/avatar"),
        null,
      );
      assert.equal(AVATAR_MAX_REDIRECTS, 3);
      assert.equal(calls.length, 4);
    },
  );
});

test("avatar transport omits ambient authority and accepts relative redirects", async () => {
  const options: RequestInit[] = [];
  const calls: string[] = [];
  await withGlobalReplacements(
    {
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        calls.push(String(input));
        options.push(init || {});
        if (calls.length === 1) {
          return new Response(null, {
            status: 301,
            headers: { location: "/final.png" },
          });
        }
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      },
    },
    async () => {
      const blob = await fetchAvatarRasterBlob("https://cdn.example.org/start");
      assert.equal(blob?.size, 3);
      assert.deepEqual(calls, [
        "https://cdn.example.org/start",
        "https://cdn.example.org/final.png",
      ]);
      for (const init of options) {
        assert.equal(init.credentials, "omit");
        assert.equal(init.referrerPolicy, "no-referrer");
        assert.equal(init.redirect, "manual");
      }
    },
  );
});

test("avatar transport rejects rich MIME and oversized declared bodies", async () => {
  for (const response of [
    new Response("<svg/>", {
      status: 200,
      headers: { "content-type": "image/svg+xml" },
    }),
    new Response(new Uint8Array([1]), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(AVATAR_MAX_DOWNLOAD_BYTES + 1),
      },
    }),
  ]) {
    await withGlobalReplacements(
      { fetch: async () => response },
      async () => {
        assert.equal(
          await fetchAvatarRasterBlob(`https://cdn.example.org/${Math.random()}`),
          null,
        );
      },
    );
  }
});

test("avatar transport recovers signature-identified rasters from generic binary CDNs", async () => {
  await withGlobalReplacements(
    {
      fetch: async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00]), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    },
    async () => {
      const blob = await fetchAvatarRasterBlob(
        "https://protocol-icons.example.org/aave-v2.jpg",
      );
      assert.equal(blob?.type, "image/jpeg");
      assert.equal(blob?.size, 5);
    },
  );
});

test("avatar transport rejects document bytes mislabeled as generic binary", async () => {
  await withGlobalReplacements(
    {
      fetch: async () =>
        new Response("<svg><script/></svg>", {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    },
    async () => {
      assert.equal(
        await fetchAvatarRasterBlob("https://cdn.example.org/logo.jpg"),
        null,
      );
    },
  );
});

test("avatar transport converts network failures to null under a 10s deadline", async () => {
  assert.equal(AVATAR_FETCH_TIMEOUT_MS, 10_000);
  await withGlobalReplacements(
    { fetch: async () => { throw new Error("offline"); } },
    async () => {
      assert.equal(
        await fetchAvatarRasterBlob("https://cdn.example.org/offline.png"),
        null,
      );
    },
  );
});
