import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, erc20Abi } from "viem";

import {
  buildApprovalTx,
  buildPermit2ApproveTx,
  fetchSwapPrice,
  fetchSwapQuote,
  getCachedTokenList,
  getCachedTokenLogo,
  NATIVE_TOKEN_ADDRESS,
} from "../../src/chrome/swapApi";
import { PERMIT2_ABI } from "../../src/chrome/swap/permit2";
import { mergePinnedTokens } from "../../src/chrome/swap/tokenListPolicy";
import {
  MAX_SWAP_TOKEN_LIST_ENTRIES,
  decodeSwapTokenList,
} from "../../src/chrome/swap/tokenListCodec";
import {
  tokenInfoCacheKey,
  fetchTokenInfo,
} from "../../src/chrome/swap/tokenInfo";
import { tokenLogoCacheKey } from "../../src/chrome/swap/tokenLogo";
import type { TokenListEntry } from "../../src/chrome/swap/types";

const TOKEN_A = "0x0000000000000000000000000000000000000001";
const TOKEN_B = "0x0000000000000000000000000000000000000002";
const OWNER = "0x0000000000000000000000000000000000000003";
const WCHAN = "0xBa5ED0000e1CA9136a695f0a848012A16008B032";

function installStorage(initial: Record<string, unknown> = {}) {
  const state = { ...initial };
  let getCalls = 0;
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key: string) => {
          getCalls += 1;
          return { [key]: state[key] };
        },
        set: async (values: Record<string, unknown>) => {
          Object.assign(state, values);
        },
      },
    },
  } as unknown as typeof chrome;
  return { state, getCalls: () => getCalls };
}

test("swap price and quote preserve query and privileged-egress contracts", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: new URL(String(input)), init });
    return new Response(JSON.stringify({ marker: requests.length }), {
      status: 200,
    });
  }) as typeof fetch;

  try {
    const price = await fetchSwapPrice({
      chainId: 8453,
      sellToken: TOKEN_A,
      buyToken: TOKEN_B,
      sellAmount: "17",
    });
    const quote = await fetchSwapQuote({
      chainId: 1,
      sellToken: TOKEN_B,
      buyToken: TOKEN_A,
      sellAmount: "29",
      taker: OWNER,
      slippageBps: 0,
    });
    assert.equal((price as unknown as { marker: number }).marker, 1);
    assert.equal((quote as unknown as { marker: number }).marker, 2);

    assert.equal(requests[0].url.pathname.endsWith("/price"), true);
    assert.deepEqual(Object.fromEntries(requests[0].url.searchParams), {
      chainId: "8453",
      sellToken: TOKEN_A,
      buyToken: TOKEN_B,
      sellAmount: "17",
    });
    assert.equal(requests[1].url.pathname.endsWith("/quote"), true);
    assert.deepEqual(Object.fromEntries(requests[1].url.searchParams), {
      chainId: "1",
      sellToken: TOKEN_B,
      buyToken: TOKEN_A,
      sellAmount: "29",
      taker: OWNER,
      slippageBps: "0",
    });
    for (const request of requests) {
      assert.equal(request.init?.method, "GET");
      assert.equal(request.init?.redirect, "error");
      assert.equal(request.init?.credentials, "omit");
      assert.equal(request.init?.referrerPolicy, "no-referrer");
      assert.equal(request.init?.cache, "no-store");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("swap transport keeps released parse and remote error messages", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response("not-json", { status: 200 })) as typeof fetch;
    await assert.rejects(
      fetchSwapQuote({
        chainId: 1,
        sellToken: TOKEN_A,
        buyToken: TOKEN_B,
        sellAmount: "1",
        taker: OWNER,
      }),
      { message: "Swap API returned invalid JSON" },
    );

    globalThis.fetch = (async () =>
      new Response("[]", { status: 200 })) as typeof fetch;
    await assert.rejects(
      fetchSwapQuote({
        chainId: 1,
        sellToken: TOKEN_A,
        buyToken: TOKEN_B,
        sellAmount: "1",
        taker: OWNER,
      }),
      { message: "Swap API returned an invalid response" },
    );

    const remoteMessage = "x".repeat(1_200);
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: remoteMessage, reason: "ignored" }), {
        status: 429,
      })) as typeof fetch;
    await assert.rejects(
      fetchSwapQuote({
        chainId: 1,
        sellToken: TOKEN_A,
        buyToken: TOKEN_B,
        sellAmount: "1",
        taker: OWNER,
      }),
      (error: unknown) =>
        error instanceof Error && error.message === remoteMessage.slice(0, 1_000),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fresh token-list cache is read raw then merged with canonical pinned tokens", async () => {
  const apiTokens: TokenListEntry[] = [
    {
      address: WCHAN.toLowerCase(),
      name: "Stale WalletChan",
      symbol: "OLD",
      decimals: 6,
      logoURI: "https://stale.invalid/logo.png",
    },
    {
      address: TOKEN_A,
      name: "Token A",
      symbol: "A",
      decimals: 18,
      logoURI: "https://example.com/a.png",
    },
  ];
  installStorage({
    "swapTokenList:8453": { tokens: apiTokens, fetchedAt: Date.now() },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("fresh cache must not fetch");
  }) as typeof fetch;
  try {
    const tokens = await getCachedTokenList(8453);
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0].address, WCHAN);
    assert.equal(tokens[0].symbol, "WCHAN");
    assert.equal(tokens[1], apiTokens[1]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("token-list refresh caches the raw upstream list and stale failures fall back", async () => {
  const staleToken: TokenListEntry = {
    address: TOKEN_A,
    name: "Stale",
    symbol: "STALE",
    decimals: 18,
    logoURI: "",
  };
  const storage = installStorage({
    "swapTokenList:1": { tokens: [staleToken], fetchedAt: 0 },
  });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    assert.deepEqual(await getCachedTokenList(1), [staleToken]);

    const freshToken = { ...staleToken, name: "Fresh", symbol: "FRESH" };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ tokens: [freshToken] }), {
        status: 200,
      })) as typeof fetch;
    assert.deepEqual(await getCachedTokenList(1), [freshToken]);
    assert.deepEqual(
      (storage.state["swapTokenList:1"] as { tokens: TokenListEntry[] }).tokens,
      [freshToken],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("token metadata and logo cache keys stay chain-bound and normalized", async () => {
  assert.equal(tokenInfoCacheKey(8453, WCHAN), `tokenInfo:8453:${WCHAN.toLowerCase()}`);
  assert.equal(tokenLogoCacheKey(1, WCHAN), `tokenLogo:1:${WCHAN.toLowerCase()}`);

  const storage = installStorage({
    [tokenLogoCacheKey(8453, TOKEN_A)]: {
      logoUrl: "https://example.com/a.png",
      fetchedAt: Date.now(),
    },
  });
  assert.equal(
    await getCachedTokenLogo(8453, TOKEN_A),
    "https://example.com/a.png",
  );
  const callsBeforeInvalid = storage.getCalls();
  assert.equal(await getCachedTokenLogo(8453, "not-an-address"), null);
  assert.equal(storage.getCalls(), callsBeforeInvalid);

  const native = await fetchTokenInfo(NATIVE_TOKEN_ADDRESS, 8453);
  assert.equal(native?.decimals, 18);
});

test("token logos fall back through the address-aware WalletChan API", async () => {
  const storage = installStorage();
  const originalFetch = globalThis.fetch;
  const expected =
    "https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/8453/erc20/0x0000000000000000000000000000000000000002.png";
  const requests: URL[] = [];
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const data = url.searchParams.has("address")
      ? { logoUrl: expected }
      : { tokens: [] };
    return new Response(JSON.stringify(data), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(await getCachedTokenLogo(8453, TOKEN_B), expected);
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.searchParams.get("chainId"), "8453");
    assert.equal(
      requests[1]?.searchParams.get("address"),
      TOKEN_B.toLowerCase(),
    );
    const cached = storage.state[tokenLogoCacheKey(8453, TOKEN_B)] as {
      logoUrl: string;
      fetchedAt: number;
    };
    assert.equal(cached.logoUrl, expected);
    assert.equal(typeof cached.fetchedAt, "number");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolved token logos retain the 30-day cache window", async () => {
  const cachedLogo = "https://example.com/cached.png";
  installStorage({
    [tokenLogoCacheKey(8453, TOKEN_A)]: {
      logoUrl: cachedLogo,
      fetchedAt: Date.now() - 29 * 24 * 60 * 60 * 1000,
    },
  });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ logoUrl: null }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(await getCachedTokenLogo(8453, TOKEN_A), cachedLogo);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolved token logos refresh after 30 days", async () => {
  const refreshedLogo = "https://example.com/refreshed.png";
  installStorage({
    [tokenLogoCacheKey(8453, TOKEN_A)]: {
      logoUrl: "https://example.com/stale.png",
      fetchedAt: Date.now() - 30 * 24 * 60 * 60 * 1000 - 1,
    },
    "swapTokenList:8453": {
      tokens: [
        {
          address: TOKEN_A,
          name: "Token A",
          symbol: "A",
          decimals: 18,
          logoURI: refreshedLogo,
        },
      ],
      fetchedAt: Date.now(),
    },
  });

  assert.equal(await getCachedTokenLogo(8453, TOKEN_A), refreshedLogo);
});

test("legacy known-no-logo cache entries retry immediately", async () => {
  const now = Date.now();
  const storage = installStorage({
    [tokenLogoCacheKey(8453, TOKEN_A)]: {
      logoUrl: "",
      fetchedAt: now,
    },
    "swapTokenList:8453": { tokens: [], fetchedAt: now },
  });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ logoUrl: null }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(await getCachedTokenLogo(8453, TOKEN_A), null);
    assert.equal(calls, 1);
    assert.equal(
      (storage.state[tokenLogoCacheKey(8453, TOKEN_A)] as {
        fallbackVersion?: number;
      }).fallbackVersion,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("current known-no-logo cache entries retain a six-hour TTL", async () => {
  installStorage({
    [tokenLogoCacheKey(8453, TOKEN_A)]: {
      logoUrl: "",
      fetchedAt: Date.now(),
      fallbackVersion: 1,
    },
  });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ logoUrl: null }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(await getCachedTokenLogo(8453, TOKEN_A), null);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("current known-no-logo cache entries retry after six hours", async () => {
  installStorage({
    [tokenLogoCacheKey(8453, TOKEN_A)]: {
      logoUrl: "",
      fetchedAt: Date.now() - 6 * 60 * 60 * 1000 - 1,
      fallbackVersion: 1,
    },
    "swapTokenList:8453": { tokens: [], fetchedAt: Date.now() },
  });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ logoUrl: null }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(await getCachedTokenLogo(8453, TOKEN_A), null);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pinned-token merge is a no-op for unpinned chains", () => {
  const tokens: TokenListEntry[] = [];
  assert.equal(mergePinnedTokens(1, tokens), tokens);
});

test("swap token catalogs reject malformed rows and stop at the item ceiling", () => {
  const tokens = Array.from(
    { length: MAX_SWAP_TOKEN_LIST_ENTRIES + 50 },
    (_, index) => ({
      address: `0x${(index + 1).toString(16).padStart(40, "0")}`,
      name: `Token ${index}`,
      symbol: `T${index}`,
      decimals: 18,
      logoURI: "",
    }),
  );
  const decoded = decodeSwapTokenList([null, { address: "bad" }, ...tokens]);
  assert.equal(decoded.length, MAX_SWAP_TOKEN_LIST_ENTRIES);
  assert.equal(decoded[0].address, tokens[0].address);
});

test("approval builders preserve target, amount, uint160 clamp, and expiry", () => {
  const approval = buildApprovalTx(TOKEN_A, TOKEN_B, 123n);
  assert.equal(approval.to, TOKEN_A);
  assert.equal(approval.value, "0x0");
  const decodedApproval = decodeFunctionData({
    abi: erc20Abi,
    data: approval.data as `0x${string}`,
  });
  assert.equal(decodedApproval.functionName, "approve");
  assert.deepEqual(decodedApproval.args, [TOKEN_B, 123n]);

  const originalNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    const permit2Address = "0x0000000000000000000000000000000000000004";
    const maxUint160 = (1n << 160n) - 1n;
    const permit2Approval = buildPermit2ApproveTx(
      permit2Address,
      TOKEN_A,
      TOKEN_B,
      maxUint160 + 1n,
    );
    assert.equal(permit2Approval.to, permit2Address);
    assert.equal(permit2Approval.value, "0x0");
    const decodedPermit2 = decodeFunctionData({
      abi: PERMIT2_ABI,
      data: permit2Approval.data as `0x${string}`,
    });
    assert.equal(decodedPermit2.functionName, "approve");
    assert.deepEqual(decodedPermit2.args, [
      TOKEN_A,
      TOKEN_B,
      maxUint160,
      1_700_000_000 + 30 * 24 * 60 * 60,
    ]);
  } finally {
    Date.now = originalNow;
  }
});
