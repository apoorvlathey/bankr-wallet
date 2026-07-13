import assert from "node:assert/strict";
import test from "node:test";

import { resolveNftMetadata } from "../../src/chrome/nftMetadata";

async function withFetch(
  implementation: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: implementation,
  });
  try {
    await run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "fetch", descriptor);
    else Reflect.deleteProperty(globalThis, "fetch");
  }
}

test("NFT tokenURI rejects local/private fetch targets before network access", async () => {
  let calls = 0;
  await withFetch(
    (async () => {
      calls += 1;
      throw new Error("must not fetch");
    }) as typeof fetch,
    async () => {
      for (const uri of [
        "http://metadata.example/token/1",
        "https://localhost/token/1",
        "https://127.0.0.1/token/1",
        "https://169.254.169.254/latest/meta-data",
        "https://[::1]/token/1",
      ]) {
        assert.equal(await resolveNftMetadata(uri, 1n), null, uri);
      }
      assert.equal(calls, 0);
    },
  );
});

test("NFT metadata redirects are revalidated before private follow-up", async () => {
  const calls: string[] = [];
  await withFetch(
    (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/private.json" },
      });
    }) as typeof fetch,
    async () => {
      assert.equal(
        await resolveNftMetadata(
          "https://metadata.example/token/redirect-private",
          1n,
        ),
        null,
      );
      assert.deepEqual(calls, [
        "https://metadata.example/token/redirect-private",
      ]);
    },
  );
});

test("NFT metadata rejects SVG MIME, inline SVG, and SVG image fields", async () => {
  await withFetch(
    (async () =>
      new Response("<svg/>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      })) as typeof fetch,
    async () => {
      assert.equal(
        await resolveNftMetadata("https://metadata.example/token.svg", 1n),
        null,
      );
    },
  );

  assert.equal(
    await resolveNftMetadata(
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      1n,
    ),
    null,
  );
  assert.deepEqual(
    await resolveNftMetadata(
      `data:application/json,${encodeURIComponent(
        JSON.stringify({ name: "Unsafe", image: "<svg><script/></svg>" }),
      )}`,
      1n,
    ),
    { name: "Unsafe", description: undefined, image: undefined },
  );
});

test("NFT metadata body is bounded while streaming", async () => {
  await withFetch(
    (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(200_000));
            controller.enqueue(new Uint8Array(100_000));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as typeof fetch,
    async () => {
      assert.equal(
        await resolveNftMetadata(
          "https://metadata.example/token/oversized",
          1n,
        ),
        null,
      );
    },
  );
});

test("NFT tracking callbacks occur only in hardened background fetches", async () => {
  let options: RequestInit | undefined;
  await withFetch(
    (async (_input: string | URL | Request, init?: RequestInit) => {
      options = init;
      return new Response(
        JSON.stringify({
          name: "Tracked NFT",
          image: "https://tracker.example/pixel.png?token=1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch,
    async () => {
      assert.deepEqual(
        await resolveNftMetadata(
          "https://metadata.example/token/tracking",
          1n,
        ),
        {
          name: "Tracked NFT",
          description: undefined,
          image: "https://tracker.example/pixel.png?token=1",
        },
      );
      assert.equal(options?.credentials, "omit");
      assert.equal(options?.referrerPolicy, "no-referrer");
      assert.equal(options?.redirect, "manual");
    },
  );
});
