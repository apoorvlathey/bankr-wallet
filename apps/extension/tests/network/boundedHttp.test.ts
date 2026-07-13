import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchTextBounded,
  HttpRequestTimeoutError,
  HttpResponseTooLargeError,
} from "../../src/chrome/network/boundedHttp";

test("bounded HTTP applies redirect, credential, referrer, and cache defaults", async () => {
  const originalFetch = globalThis.fetch;
  let observed: RequestInit | undefined;
  globalThis.fetch = (async (_input, init) => {
    observed = init;
    return new Response("ok");
  }) as typeof fetch;
  try {
    const { text } = await fetchTextBounded(
      "https://api.example",
      { method: "GET", credentials: "include" },
      { timeoutMs: 1_000, maxBytes: 10 },
    );
    assert.equal(text, "ok");
    assert.equal(observed?.redirect, "error");
    assert.equal(observed?.credentials, "omit");
    assert.equal(observed?.referrerPolicy, "no-referrer");
    assert.equal(observed?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bounded HTTP distinguishes its deadline and rejects declared excess", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    await assert.rejects(
      fetchTextBounded(
        "https://api.example",
        {},
        { timeoutMs: 1, maxBytes: 10 },
      ),
      HttpRequestTimeoutError,
    );

    globalThis.fetch = (async () =>
      new Response("too large", {
        headers: { "content-length": "11" },
      })) as typeof fetch;
    await assert.rejects(
      fetchTextBounded(
        "https://api.example",
        {},
        { timeoutMs: 1_000, maxBytes: 10 },
      ),
      HttpResponseTooLargeError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
