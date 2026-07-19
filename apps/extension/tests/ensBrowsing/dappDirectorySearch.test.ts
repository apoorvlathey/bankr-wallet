import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDappDirectoryQuery,
  normalizeDappDirectoryResponse,
  searchDappDirectory,
} from "../../src/chrome/ensBrowsing/dappDirectorySearch";

test("directory response exposes only bounded safe HTTPS suggestions", () => {
  const hits = [
    {
      name: " Uniswap ",
      logo: "https://icons.llamao.fi/uniswap.png",
      route: "https://app.uniswap.org/swap",
      secretLikeField: "drop me",
    },
    { name: "Duplicate", route: "https://app.uniswap.org/swap" },
    { name: "Unsafe scheme", route: "javascript:alert(1)" },
    { name: "Plain HTTP", route: "http://example.com" },
    { name: "Credentials", route: "https://user:pass@example.com" },
    { name: "Bad logo", logo: "data:image/svg+xml,svg", route: "https://safe.example" },
  ];
  const result = normalizeDappDirectoryResponse({ results: [{ hits }] });
  assert.deepEqual(result, [
    {
      name: "Uniswap",
      url: "https://app.uniswap.org/swap",
      hostname: "app.uniswap.org",
      logo: "https://icons.llamao.fi/uniswap.png",
    },
    {
      name: "Bad logo",
      url: "https://safe.example/",
      hostname: "safe.example",
    },
  ]);
});

test("URL inputs search the DefiLlama directory by their first domain label", () => {
  assert.equal(normalizeDappDirectoryQuery(" Uniswap swap "), "Uniswap swap");
  assert.equal(
    normalizeDappDirectoryQuery("https://www.uniswap.org/swap"),
    "uniswap",
  );
});

test("directory transport uses the released bounded request contract", async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    observedUrl = String(input);
    observedInit = init;
    return new Response(
      JSON.stringify({
        results: [
          {
            hits: [
              {
                name: "Uniswap",
                logo: "https://icons.llamao.fi/uniswap.png",
                route: "https://app.uniswap.org/",
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const results = await searchDappDirectory("uniswap", "public-test-key");
    assert.equal(observedUrl, "https://search-core.defillama.com/multi-search");
    assert.equal(observedInit?.method, "POST");
    assert.equal(observedInit?.credentials, "omit");
    assert.equal(observedInit?.redirect, "error");
    assert.deepEqual(observedInit?.headers, {
      "content-type": "application/json",
      authorization: "Bearer public-test-key",
    });
    const body = JSON.parse(String(observedInit?.body));
    assert.deepEqual(body.queries[0], {
      indexUid: "directory",
      q: "uniswap",
      limit: 8,
      attributesToRetrieve: ["name", "logo", "route"],
    });
    assert.equal(results[0]?.url, "https://app.uniswap.org/");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
