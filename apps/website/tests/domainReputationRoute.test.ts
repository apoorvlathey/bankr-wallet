import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/domain-reputation/route";

function request(body: unknown) {
  return new NextRequest("https://walletchan.eth.sh/api/domain-reputation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `reputation-test-${Math.random()}`,
    },
    body: JSON.stringify(body),
  });
}

async function withEnvironment(
  work: () => Promise<void>,
  fetchImpl?: typeof fetch,
) {
  const priorUrl = process.env.DOMAIN_REPUTATION_SERVICE_URL;
  const priorToken = process.env.DOMAIN_REPUTATION_SERVICE_TOKEN;
  const priorFetch = globalThis.fetch;
  try {
    process.env.DOMAIN_REPUTATION_SERVICE_URL = "https://railway.example";
    process.env.DOMAIN_REPUTATION_SERVICE_TOKEN = "s".repeat(32);
    if (fetchImpl) globalThis.fetch = fetchImpl;
    await work();
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.DOMAIN_REPUTATION_SERVICE_URL;
    else process.env.DOMAIN_REPUTATION_SERVICE_URL = priorUrl;
    if (priorToken === undefined) delete process.env.DOMAIN_REPUTATION_SERVICE_TOKEN;
    else process.env.DOMAIN_REPUTATION_SERVICE_TOKEN = priorToken;
  }
}

test("rejects URL-shaped input before proxying", async () => {
  await withEnvironment(async () => {
    assert.equal(
      (await POST(request({ hostname: "https://bad.example" }))).status,
      400,
    );
  });
});

test("forwards only the normalized hostname with server authentication", async () => {
  await withEnvironment(async () => {
    let observedUrl = "";
    let observedAuthorization = "";
    let observedBody = "";
    const priorFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      observedUrl = String(input);
      observedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      observedBody = String(init?.body);
      return new Response(JSON.stringify({
        outcome: "no_match",
        matchType: "none",
        snapshot: {
          version: 2,
          fetchedAt: "2026-07-26T00:00:00.000Z",
          stale: false,
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const response = await POST(request({ hostname: "APP.Example.com." }));
      assert.equal(response.status, 200);
      assert.equal(observedUrl, "https://railway.example/v1/domain/check");
      assert.equal(observedAuthorization, `Bearer ${"s".repeat(32)}`);
      assert.deepEqual(JSON.parse(observedBody), { hostname: "app.example.com" });
      assert.equal(response.headers.get("cache-control"), "no-store");
    } finally {
      globalThis.fetch = priorFetch;
    }
  });
});

test("fails safely on malformed upstream data", async () => {
  await withEnvironment(async () => {
    const response = await POST(request({ hostname: "app.example.com" }));
    assert.equal(response.status, 502);
  }, async () => new Response('{"outcome":"unknown"}', { status: 200 }));
});

test("stops reading an oversized upstream stream at the byte ceiling", async () => {
  await withEnvironment(async () => {
    const response = await POST(request({ hostname: "app.example.com" }));
    assert.equal(response.status, 502);
  }, async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(17 * 1_024)));
      controller.close();
    },
  }), { status: 200 }));
});
