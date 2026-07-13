import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_TOKEN_DATA_MESSAGE_TYPES,
  createBackgroundTokenDataMessageRouter,
} from "../../src/chrome/background/tokenDataRouter";

const trustedSender = { id: "extension-id" } as chrome.runtime.MessageSender;
const externalSender = { tab: { id: 5 } } as chrome.runtime.MessageSender;

function baseDependencies(overrides: Record<string, unknown> = {}): any {
  return {
    isTrustedWalletUiSender: () => true,
    fetchTokenInfo: async () => ({}),
    resolveTokenMetadata: async () => ({}),
    getCustomTokens: async () => [],
    addCustomToken: async () => {},
    updateCustomToken: async () => {},
    removeCustomToken: async () => {},
    fetchTokenPrice: async () => 1,
    fetchNativePrice: async () => 2,
    fetchAndCacheAvatarImage: async () => "data:image/png;base64,x",
    resolveCoinGeckoNativeAssetsBatch: async () => ({}),
    resolveCoinGeckoErc20PricesBatch: async () => ({}),
    resolveTokenLogoUrl: async () => null,
    checkTokenAllowance: async () => 0n,
    getTokenBalanceWei: async () => 0n,
    checkPermit2Allowance: async () => ({ amount: 0n, expiration: 0 }),
    ...overrides,
  };
}

function dispatch(
  dependencies: any,
  message: Record<string, unknown>,
  sender = trustedSender,
): Promise<{ response: any; route: any }> {
  return new Promise((resolve) => {
    const router = createBackgroundTokenDataMessageRouter(dependencies);
    let route: any;
    route = router(message, sender, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("token data transport declares one unique route set", () => {
  assert.equal(
    new Set(BACKGROUND_TOKEN_DATA_MESSAGE_TYPES).size,
    BACKGROUND_TOKEN_DATA_MESSAGE_TYPES.length,
  );
});

test("metadata and custom-token routes preserve coercion and optional fields", async () => {
  const calls: unknown[][] = [];
  const dependencies = baseDependencies({
    fetchTokenInfo: async (...args: unknown[]) => {
      calls.push(["info", ...args]);
      return "info";
    },
    resolveTokenMetadata: async (...args: unknown[]) => {
      calls.push(["metadata", ...args]);
      return "metadata";
    },
    getCustomTokens: async () => [
      { chainId: 8453, contractAddress: "0xabc", symbol: "ABC" },
    ],
    addCustomToken: async (token: unknown) => calls.push(["add", token]),
    updateCustomToken: async (...args: unknown[]) =>
      calls.push(["update", ...args]),
    removeCustomToken: async (...args: unknown[]) =>
      calls.push(["remove", ...args]),
  });

  assert.deepEqual(
    (
      await dispatch(dependencies, {
        type: "fetchTokenInfo",
        tokenAddress: "0xtoken",
        chainId: 8453,
      })
    ).response,
    { success: true, data: "info" },
  );
  await dispatch(dependencies, {
    type: "resolveTokenMetadata",
    chainId: 1,
    tokenAddress: null,
    includeBungeeTokens: false,
  });
  assert.deepEqual(
    (
      await dispatch(dependencies, {
        type: "lookupCustomToken",
        chainId: "8453",
        tokenAddress: "0xABC",
      })
    ).response,
    {
      success: true,
      data: { chainId: 8453, contractAddress: "0xabc", symbol: "ABC" },
    },
  );
  await dispatch(dependencies, {
    type: "addCustomToken",
    chainId: "137",
    contractAddress: 123,
    symbol: "TKN",
    name: "Token",
    decimals: "18",
    image: "https://image.example/token.png",
  });
  await dispatch(dependencies, {
    type: "updateCustomToken",
    chainId: "137",
    contractAddress: "0xdef",
    name: null,
    decimals: "6",
    image: 42,
  });
  await dispatch(dependencies, {
    type: "removeCustomToken",
    chainId: "137",
    contractAddress: "0xdef",
  });

  assert.deepEqual(calls, [
    ["info", "0xtoken", 8453],
    ["metadata", 1, "", { includeBungeeTokens: false }],
    [
      "add",
      {
        chainId: 137,
        contractAddress: "123",
        symbol: "TKN",
        name: "Token",
        decimals: 18,
        image: "https://image.example/token.png",
      },
    ],
    ["update", 137, "0xdef", { name: "", decimals: 6 }],
    ["remove", 137, "0xdef"],
  ]);
});

test("price, image, CoinGecko, and logo helpers retain exact response contracts", async () => {
  const calls: unknown[][] = [];
  const dependencies = baseDependencies({
    fetchTokenPrice: async (...args: unknown[]) => {
      calls.push(["price", ...args]);
      return 1.25;
    },
    fetchNativePrice: async (...args: unknown[]) => {
      calls.push(["native", ...args]);
      return null;
    },
    fetchAndCacheAvatarImage: async (...args: unknown[]) => {
      calls.push(["avatar", ...args]);
      return "data:image/png;base64,avatar";
    },
    resolveCoinGeckoNativeAssetsBatch: async (...args: unknown[]) => {
      calls.push(["nativeBatch", ...args]);
      return { native: true };
    },
    resolveCoinGeckoErc20PricesBatch: async (...args: unknown[]) => {
      calls.push(["erc20Batch", ...args]);
      return { erc20: true };
    },
    resolveTokenLogoUrl: async (...args: unknown[]) => {
      calls.push(["logo", ...args]);
      return "https://image.example/logo.png";
    },
  });

  assert.deepEqual(
    (await dispatch(dependencies, { type: "fetchTokenPrice", chainId: 1, address: "0x1" })).response,
    { success: true, priceUsd: 1.25 },
  );
  assert.deepEqual(
    (await dispatch(dependencies, { type: "fetchNativePrice", chainId: 8453 })).response,
    { success: true, priceUsd: 0 },
  );
  assert.deepEqual(
    (
      await dispatch(dependencies, {
        type: "cacheAvatarImage",
        url: "https://image.example/avatar.png",
      })
    ).response,
    { dataUrl: "data:image/png;base64,avatar" },
  );
  await dispatch(dependencies, {
    type: "resolveCoinGeckoNativeAssets",
    requests: [{ chainId: 1 }],
  });
  await dispatch(dependencies, {
    type: "resolveCoinGeckoErc20Prices",
    requests: [{ chainId: 8453, address: "0x2" }],
  });
  await dispatch(dependencies, {
    type: "fetchTokenLogo",
    chainId: 137,
    tokenAddress: null,
  });

  assert.deepEqual(calls, [
    ["price", 1, "0x1"],
    ["native", 8453],
    ["avatar", "https://image.example/avatar.png"],
    ["nativeBatch", [{ chainId: 1 }]],
    ["erc20Batch", [{ chainId: 8453, address: "0x2" }]],
    ["logo", 137, ""],
  ]);

  let fetched = false;
  const denied = await dispatch(
    baseDependencies({
      isTrustedWalletUiSender: () => false,
      fetchAndCacheAvatarImage: async () => {
        fetched = true;
        return null;
      },
    }),
    { type: "cacheAvatarImage", url: "https://attacker.example" },
    externalSender,
  );
  assert.deepEqual(denied.response, { dataUrl: null });
  assert.deepEqual(denied.route, { handled: true, keepChannelOpen: false });
  assert.equal(fetched, false);
});

test("allowance and balance helpers preserve argument order and bigint strings", async () => {
  const calls: unknown[][] = [];
  const dependencies = baseDependencies({
    checkTokenAllowance: async (...args: unknown[]) => {
      calls.push(["allowance", ...args]);
      return 123n;
    },
    getTokenBalanceWei: async (...args: unknown[]) => {
      calls.push(["balance", ...args]);
      return 456n;
    },
    checkPermit2Allowance: async (...args: unknown[]) => {
      calls.push(["permit2", ...args]);
      return { amount: 789n, expiration: 123456 };
    },
  });

  const allowance = await dispatch(dependencies, {
    type: "checkTokenAllowance",
    tokenAddress: "0xtoken",
    owner: "0xowner",
    spender: "0xspender",
    chainId: 1,
  });
  const balance = await dispatch(dependencies, {
    type: "getTokenBalanceWei",
    tokenAddress: "0xtoken",
    owner: "0xowner",
    chainId: 8453,
  });
  const permit2 = await dispatch(dependencies, {
    type: "checkPermit2Allowance",
    token: "0xtoken",
    owner: "0xowner",
    spender: "0xspender",
    chainId: 137,
  });

  assert.deepEqual(allowance.response, { success: true, allowance: "123" });
  assert.deepEqual(balance.response, { success: true, balance: "456" });
  assert.deepEqual(permit2.response, {
    success: true,
    amount: "789",
    expiration: 123456,
  });
  assert.deepEqual(calls, [
    ["allowance", "0xtoken", "0xowner", "0xspender", 1],
    ["balance", "0xtoken", "0xowner", 8453],
    ["permit2", "0xtoken", "0xowner", "0xspender", 137],
  ]);
});
