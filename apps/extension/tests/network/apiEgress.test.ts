import assert from "node:assert/strict";
import test from "node:test";

import { fetchBridgeQuote } from "../../src/chrome/bridgeApi";
import {
  fetchPortfolio,
  fetchPortfolioSummary,
} from "../../src/chrome/portfolio/api";
import { fetchSwapQuote } from "../../src/chrome/swapApi";

test("wallet API egress is bounded, redirect-safe, and strips unsafe navigation metadata", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("/portfolio")) {
      return new Response(
        JSON.stringify({
          tokens: [],
          totalValueUsd: 0,
          defiPositions: [
            { protocol: "Safe", chainId: 8453, type: "app", name: "Safe", valueUsd: 0, assets: [], rewardAssets: [], siteUrl: "https://safe.example/app" },
            { protocol: "Bad", chainId: 8453, type: "app", name: "Bad", valueUsd: 0, assets: [], rewardAssets: [], siteUrl: "javascript:alert(1)" },
            { protocol: "Private", chainId: 8453, type: "app", name: "Private", valueUsd: 0, assets: [], rewardAssets: [], siteUrl: "https://127.0.0.1/admin" },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    await fetchSwapQuote({
      chainId: 8453,
      sellToken: "0x0000000000000000000000000000000000000001",
      buyToken: "0x0000000000000000000000000000000000000002",
      sellAmount: "1",
      taker: "0x0000000000000000000000000000000000000003",
    });
    await fetchBridgeQuote({
      userAddress: "0x0000000000000000000000000000000000000003",
      originChainId: 8453,
      destinationChainId: 1,
      inputToken: "0x0000000000000000000000000000000000000001",
      outputToken: "0x0000000000000000000000000000000000000002",
      inputAmount: "1",
    });
    const portfolio = await fetchPortfolio(
      "0x0000000000000000000000000000000000000003",
    );
    const summary = await fetchPortfolioSummary(
      "0x0000000000000000000000000000000000000003",
    );

    for (const request of requests) {
      assert.equal(request.init?.redirect, "error", request.url);
      assert.equal(request.init?.credentials, "omit", request.url);
      assert.equal(request.init?.referrerPolicy, "no-referrer", request.url);
      assert.equal(request.init?.cache, "no-store", request.url);
    }
    assert.equal(portfolio.defiPositions[0].siteUrl, "https://safe.example/app");
    assert.equal(portfolio.defiPositions[1].siteUrl, undefined);
    assert.equal(portfolio.defiPositions[2].siteUrl, undefined);
    assert.equal(summary.totalValueUsd, 0);
    assert.ok(requests.some((request) => request.url.includes("summary=1")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("swap quote rejects declared oversized responses before parsing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-length": String(2 * 1024 * 1024 + 1) },
    })) as typeof fetch;

  try {
    await assert.rejects(
      fetchSwapQuote({
        chainId: 8453,
        sellToken: "0x0000000000000000000000000000000000000001",
        buyToken: "0x0000000000000000000000000000000000000002",
        sellAmount: "1",
        taker: "0x0000000000000000000000000000000000000003",
      }),
      /allowed size|oversized|exceeded/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
