import assert from "node:assert/strict";
import test from "node:test";
import { createPublicClient } from "viem";

import {
  assertRpcEndpointAllowedForOrigin,
  assertSecureRpcConfigurationUrl,
  fetchRpcResult,
  parseRpcEndpoint,
  probeRpcChainId,
  secureHttpTransport,
} from "../../src/chrome/rpcHttpClient";

function rpcResponse(result: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers,
  });
}

test("RPC endpoint policy rejects unsafe URL forms and cross-network pivots", () => {
  for (const url of [
    "file:///etc/passwd",
    "data:text/plain,hello",
    "https://user:secret@rpc.example",
    "https://rpc.example/" + "x".repeat(2_048),
  ]) {
    assert.throws(() => parseRpcEndpoint(url), /RPC URL/i, url);
  }

  assert.doesNotThrow(() =>
    assertRpcEndpointAllowedForOrigin(
      "https://rpc.example",
      "https://app.example",
    ),
  );
  assert.throws(
    () => assertSecureRpcConfigurationUrl("http://rpc.example"),
    /must use HTTPS/i,
  );
  assert.doesNotThrow(() =>
    assertSecureRpcConfigurationUrl("http://localhost:8545"),
  );
  assert.throws(
    () =>
      assertRpcEndpointAllowedForOrigin(
        "http://127.0.0.1:8545",
        "https://app.example",
      ),
    /Private-network RPC access/i,
  );
  assert.doesNotThrow(() =>
    assertRpcEndpointAllowedForOrigin(
      "http://127.0.0.1:8545",
      "http://localhost:3000",
    ),
  );
  assert.doesNotThrow(() =>
    assertRpcEndpointAllowedForOrigin(
      "http://192.168.1.40:8545",
      "http://192.168.1.40:3000",
    ),
  );
  assert.throws(
    () =>
      assertRpcEndpointAllowedForOrigin(
        "http://192.168.1.41:8545",
        "http://192.168.1.40:3000",
      ),
    /Private-network RPC access/i,
  );
  assert.doesNotThrow(() =>
    assertRpcEndpointAllowedForOrigin(
      "http://10.0.0.2:8545",
      undefined,
      { allowPrivateWithoutOrigin: true },
    ),
  );
});

test("bounded RPC fetches reject redirects and omit ambient browser state", async () => {
  const originalFetch = globalThis.fetch;
  let input: RequestInfo | URL | undefined;
  let init: RequestInit | undefined;
  globalThis.fetch = (async (nextInput, nextInit) => {
    input = nextInput;
    init = nextInit;
    return rpcResponse("0x1");
  }) as typeof fetch;

  try {
    assert.equal(
      await fetchRpcResult("https://rpc.example", "eth_chainId", []),
      "0x1",
    );
    assert.equal(String(input), "https://rpc.example/");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.referrerPolicy, "no-referrer");
    assert.equal(init?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RPC probes do not fetch blocked private targets and cap response bytes", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return rpcResponse("0x1", { "content-length": "64001" });
  }) as typeof fetch;

  try {
    assert.equal(
      await probeRpcChainId("http://127.0.0.1:8545", {
        requestOrigin: "https://app.example",
      }),
      null,
    );
    assert.equal(calls, 0);

    assert.equal(await probeRpcChainId("https://rpc.example"), null);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RPC error messages are bounded before reaching callers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "x".repeat(10_000) },
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    await assert.rejects(
      fetchRpcResult("https://rpc.example", "eth_blockNumber", []),
      (error: unknown) =>
        error instanceof Error &&
        error.name === "RpcResponseError" &&
        error.message.length === 1_000,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("viem RPC transport bounds streamed responses before viem parses them", async () => {
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  let observedInit: RequestInit | undefined;
  globalThis.fetch = (async (_input, init) => {
    observedInit = init;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4_500_000));
        controller.enqueue(new Uint8Array(4_500_000));
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const client = createPublicClient({
      transport: secureHttpTransport("https://rpc.example", {
        retryCount: 0,
        timeout: 5_000,
      }),
    });
    await assert.rejects(
      client.request({ method: "eth_chainId" }),
      (error: unknown) =>
        error instanceof Error &&
        /Response exceeded the allowed size/i.test(error.message),
    );
    assert.equal(cancelled, true);
    assert.equal(observedInit?.redirect, "error");
    assert.equal(observedInit?.credentials, "omit");
    assert.equal(observedInit?.referrerPolicy, "no-referrer");
    assert.equal(observedInit?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("viem RPC transport rejects oversized request bodies before network egress", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return rpcResponse("0x1");
  }) as typeof fetch;

  try {
    const client = createPublicClient({
      transport: secureHttpTransport("https://rpc.example", {
        retryCount: 0,
      }),
    });
    await assert.rejects(
      client.request({
        method: "eth_call",
        params: [{ data: `0x${"a".repeat(1_100_000)}` }, "latest"],
      } as never),
      (error: unknown) =>
        error instanceof Error && /RPC request is too large/i.test(error.message),
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
