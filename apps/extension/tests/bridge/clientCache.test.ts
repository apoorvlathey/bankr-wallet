import assert from "node:assert/strict";
import test from "node:test";
import { BASE_CHAIN_ID } from "@walletchan/shared/contracts";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const ADDRESS = `0x${"1".repeat(40)}`;
const TOKEN = `0x${"2".repeat(40)}`;

test("bridge client preserves query defaults and exact bounded error policy", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ success: true, result: {} }), {
      status: 200,
    });
  }) as typeof fetch;
  try {
    const { fetchBridgeQuote, fetchBridgeStatus } = await import(
      "../../src/chrome/bridge/client"
    );
    await fetchBridgeQuote({
      userAddress: ADDRESS,
      originChainId: 8453,
      destinationChainId: 1,
      inputToken: TOKEN,
      outputToken: ADDRESS,
      inputAmount: "123",
      slippage: 0,
    });
    await fetchBridgeStatus({ requestHash: "quote id", txHash: "0xhash" });

    const quote = new URL(urls[0]);
    assert.equal(quote.pathname.endsWith("/bridge/quote"), true);
    assert.equal(quote.searchParams.get("receiverAddress"), ADDRESS);
    assert.equal(quote.searchParams.get("inputAmount"), "123");
    assert.equal(quote.searchParams.get("slippage"), "0");
    const status = new URL(urls[1]);
    assert.equal(status.searchParams.get("requestHash"), "quote id");
    assert.equal(status.searchParams.get("txHash"), "0xhash");

    globalThis.fetch = (async () =>
      new Response("not json", { status: 200 })) as typeof fetch;
    await assert.rejects(
      fetchBridgeStatus({ txHash: "0xhash" }),
      new Error("Bridge API returned invalid JSON"),
    );

    globalThis.fetch = (async () =>
      new Response("[]", { status: 200 })) as typeof fetch;
    await assert.rejects(
      fetchBridgeStatus({ txHash: "0xhash" }),
      new Error("Bridge API returned an invalid response"),
    );

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "x".repeat(1_100) }), {
        status: 429,
      })) as typeof fetch;
    await assert.rejects(fetchBridgeStatus({ txHash: "0xhash" }), (error) => {
      assert.equal((error as Error).message, "x".repeat(1_000));
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bridge catalogs preserve TTL, stale fallback, keys, pinning, and single-flight", async () => {
  const now = Date.now();
  const cachedBaseToken = {
    address: TOKEN,
    symbol: "TEST",
    chainId: BASE_CHAIN_ID,
  };
  const staleToken = { address: ADDRESS, symbol: "STALE", chainId: 77_777 };
  const harness = createChromeStorageHarness({
    local: {
      bungeeChains: {
        chains: [{ chainId: 8453, name: "Cached Base" }],
        fetchedAt: now,
      },
      [`bungeeTokens:${BASE_CHAIN_ID}`]: {
        tokens: [cachedBaseToken],
        fetchedAt: now,
      },
      "bungeeTokens:77777": {
        tokens: [staleToken],
        fetchedAt: 0,
      },
    },
  });
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("chainId=77777")) {
      return new Response(JSON.stringify({ error: "unavailable" }), {
        status: 503,
      });
    }
    const chainId = new URL(url).searchParams.get("chainId");
    if (chainId) {
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            [chainId]: [{ address: TOKEN, symbol: "LIVE", chainId: Number(chainId) }],
          },
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        result: [{ chainId: 1, name: "Ethereum" }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const cache = await import("../../src/chrome/bridge/catalogCache");
    assert.deepEqual(await cache.getCachedBungeeChains(), [
      { chainId: 8453, name: "Cached Base" },
    ]);
    const baseTokens = await cache.getCachedBungeeTokens(BASE_CHAIN_ID);
    assert.equal(baseTokens[0].symbol, "WCHAN");
    assert.deepEqual(baseTokens.slice(1), [cachedBaseToken]);
    assert.deepEqual(
      (harness.stores.local[`bungeeTokens:${BASE_CHAIN_ID}`] as any).tokens,
      [cachedBaseToken],
      "pinned WCHAN must not be written into the released cache",
    );
    assert.equal(calls.length, 0);

    assert.deepEqual(await cache.getCachedBungeeTokens(77_777), [staleToken]);
    assert.equal(calls.length, 1);

    const [first, second] = await Promise.all([
      cache.getCachedBungeeTokens(88_888),
      cache.getCachedBungeeTokens(88_888),
    ]);
    assert.deepEqual(first, second);
    assert.equal(calls.filter((url) => url.includes("chainId=88888")).length, 1);
    const stored = harness.stores.local["bungeeTokens:88888"] as any;
    assert.equal(stored.tokens[0].symbol, "LIVE");
    assert.equal(typeof stored.fetchedAt, "number");
    assert.equal(cache.isNativeToken("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"), true);
  } finally {
    globalThis.fetch = originalFetch;
    harness.restore();
  }
});
