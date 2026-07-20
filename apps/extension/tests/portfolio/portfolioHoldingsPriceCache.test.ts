import assert from "node:assert/strict";
import test from "node:test";

import {
  getLatestPortfolioHoldingsSnapshotForAddress,
  prunePortfolioHoldingsCacheValue,
} from "../../src/chrome/portfolio/holdingsCache";
import {
  MAX_PORTFOLIO_HOLDINGS_CACHE_ENTRIES,
  PORTFOLIO_HOLDINGS_CACHE_VERSION,
} from "../../src/chrome/portfolio/holdingsCachePolicy";

function token(symbol: string, index = 1) {
  return {
    symbol,
    name: symbol,
    contractAddress: `0x${index.toString(16).padStart(40, "0")}`,
    chainId: 8453,
    decimals: 18,
    balance: "1",
    balanceFormatted: "1",
    priceUsd: 1,
    valueUsd: 1,
  };
}

function snapshot(tokens: ReturnType<typeof token>[], timestamp: number) {
  return {
    tokens,
    defiPositions: [],
    totalValueUsd: tokens.length,
    omittedTokenCount: 0,
    omittedTokenValueUsd: 0,
    omittedTokenValueUsdByChain: {},
    customTokenKeys: [],
    allTokenKeys: [],
    hiddenTokenKeys: [],
    onchainFetchedTokenKeys: [],
    rpcIssueChainIds: [],
    apiUnavailable: false,
    timestamp,
  };
}

test("sentinel-era V1 holdings caches are invalidated", () => {
  const result = prunePortfolioHoldingsCacheValue({
    version: 1,
    entries: {
      tempo: {
        tokens: [{ chainId: 4217, contractAddress: "native" }],
        defiPositions: [],
        totalValueUsd: 4.24e69,
        timestamp: Date.now(),
      },
    },
  });

  assert.equal(result.changed, true);
  assert.equal(result.next, undefined);
});

test("V2 holdings caches are invalidated so oversized snapshots cannot rehydrate", () => {
  const result = prunePortfolioHoldingsCacheValue({
    version: 2,
    entries: { legacy: snapshot([token("OLD")], Date.now()) },
  });

  assert.equal(result.changed, true);
  assert.equal(result.next, undefined);
});

test("holdings cache enforces token and entry ceilings", () => {
  const now = Date.now();
  const oversized = Array.from({ length: 1_250 }, (_, index) =>
    token(`T${index}`, index + 1),
  );
  const entries = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [
      `account-${index}`,
      snapshot(oversized, now - index),
    ]),
  );

  const result = prunePortfolioHoldingsCacheValue({
    version: PORTFOLIO_HOLDINGS_CACHE_VERSION,
    entries,
  });

  assert.equal(
    Object.keys(result.next?.entries ?? {}).length,
    MAX_PORTFOLIO_HOLDINGS_CACHE_ENTRIES,
  );
  for (const cached of Object.values(result.next?.entries ?? {})) {
    assert.equal(cached.tokens.length, 1_000);
    assert.equal(cached.omittedTokenCount, 250);
  }
});

test("background consumers receive the latest reset-aware portfolio snapshot for an address", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const address = "0x00000000000000000000000000000000000000aa";
  const older = snapshot([token("OLD")], Date.now() - 1000);
  const latest = snapshot([token("BNKR")], Date.now());
  latest.tokens[0].priceUsd = 0.000241;

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get() {
            return {
              portfolioHoldingsCache: {
                version: PORTFOLIO_HOLDINGS_CACHE_VERSION,
                entries: {
                  [`${address}|older-chains`]: older,
                  [`${address}|latest-chains`]: latest,
                  "0x00000000000000000000000000000000000000bb|chains": {
                    ...latest,
                    timestamp: Date.now() + 1,
                  },
                },
              },
            };
          },
          async set() {},
          async remove() {},
        },
      },
    },
  });
  t.after(() => {
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else Reflect.deleteProperty(globalThis, "chrome");
  });

  const cachedSnapshot = await getLatestPortfolioHoldingsSnapshotForAddress(address);
  assert.equal(cachedSnapshot?.tokens[0]?.symbol, "BNKR");
});
