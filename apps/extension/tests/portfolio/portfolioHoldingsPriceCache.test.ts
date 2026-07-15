import assert from "node:assert/strict";
import test from "node:test";

import {
  getLatestPortfolioHoldingsSnapshotForAddress,
  prunePortfolioHoldingsCacheValue,
} from "../../src/chrome/portfolio/holdingsCache";

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

test("background consumers receive the latest reset-aware portfolio snapshot for an address", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const address = "0x00000000000000000000000000000000000000aa";
  const older = { tokens: [{ symbol: "OLD" }], defiPositions: [], totalValueUsd: 1, timestamp: Date.now() - 1000 };
  const latest = { tokens: [{ symbol: "BNKR", priceUsd: 0.000241 }], defiPositions: [], totalValueUsd: 8, timestamp: Date.now() };

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get() {
            return {
              portfolioHoldingsCache: {
                version: 2,
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

  const snapshot = await getLatestPortfolioHoldingsSnapshotForAddress(address);
  assert.equal(snapshot?.tokens[0]?.symbol, "BNKR");
});
