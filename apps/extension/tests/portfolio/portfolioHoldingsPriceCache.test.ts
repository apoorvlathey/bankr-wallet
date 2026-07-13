import assert from "node:assert/strict";
import test from "node:test";

import { getLatestPortfolioHoldingsSnapshotForAddress } from "../../src/chrome/portfolioHoldingsCache";

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
                version: 1,
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
