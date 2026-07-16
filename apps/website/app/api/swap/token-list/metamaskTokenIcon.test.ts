import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  getMetaMaskTokenIconUrl,
  resolveMetaMaskTokenIcon,
} from "./metamaskTokenIcon";
import { GET } from "./route";

const TOKEN = "0x4E65fE4DbA92790696D040Ac24AA414708F5c0Ab";
const EXPECTED =
  "https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/8453/erc20/0x4e65fe4dba92790696d040ac24aa414708f5c0ab.png";

test("MetaMask token icon URLs are chain-bound and address-normalized", () => {
  assert.equal(getMetaMaskTokenIconUrl(8453, TOKEN), EXPECTED);
  assert.equal(getMetaMaskTokenIconUrl(0, TOKEN), null);
  assert.equal(getMetaMaskTokenIconUrl(8453, "not-an-address"), null);
});

test("MetaMask token icon resolution accepts only an existing PNG", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(null, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  }) as typeof fetch;

  try {
    assert.equal(await resolveMetaMaskTokenIcon(8453, TOKEN), EXPECTED);
    assert.equal(requests[0]?.url, EXPECTED);
    assert.equal(requests[0]?.init?.method, "HEAD");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MetaMask token icon resolution rejects missing assets", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(null, {
      status: 404,
      headers: { "content-type": "application/octet-stream" },
    })) as typeof fetch;

  try {
    assert.equal(await resolveMetaMaskTokenIcon(8453, TOKEN), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the address-aware token-list route returns the verified fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(null, {
      status: 200,
      headers: { "content-type": "image/png" },
    })) as typeof fetch;

  try {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/swap/token-list?chainId=8453&address=${TOKEN}`,
      ),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { logoUrl: EXPECTED });

    const invalid = await GET(
      new NextRequest(
        "http://localhost/api/swap/token-list?chainId=8453&address=invalid",
      ),
    );
    assert.equal(invalid.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
