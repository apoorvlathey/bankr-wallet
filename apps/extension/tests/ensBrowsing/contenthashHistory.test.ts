import assert from "node:assert/strict";
import test from "node:test";

import { getEnsContenthashLastUpdated } from "../../src/chrome/ensBrowsing/contenthashHistory";

test("contenthash history rejects non-ENS names before network access", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("unexpected fetch");
  };
  try {
    await assert.rejects(
      getEnsContenthashLastUpdated("ens.eth.attacker.example"),
      /Invalid ENS name/,
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("contenthash history resolves the latest subgraph block timestamp", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    requests.push({ url, init });
    const body = JSON.parse(String(init?.body)) as {
      method?: string;
      query?: string;
    };
    if (body.method === "eth_getBlockByNumber") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { timestamp: "0x64" } }),
        { status: 200 },
      );
    }
    if (body.query?.includes("GetDomainResolver")) {
      return new Response(
        JSON.stringify({ data: { domains: [{ resolver: { id: "resolver-1" } }] } }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({ data: { contenthashChangeds: [{ blockNumber: 123 }] } }),
      { status: 200 },
    );
  };

  try {
    assert.equal(await getEnsContenthashLastUpdated("history-test.eth"), 100_000);
    assert.equal(requests.length, 3);
    for (const request of requests.slice(0, 2)) {
      assert.equal(request.init?.credentials, "omit");
      assert.equal(request.init?.redirect, "error");
      assert.match(request.url, /thegraph\.com/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
