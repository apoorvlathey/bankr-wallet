import assert from "node:assert/strict";
import test from "node:test";

import {
  clearReleasedPrivacyPortfolioView,
  parseReleasedPrivacyPortfolioView,
  readReleasedPrivacyPortfolioView,
  storeReleasedPrivacyPortfolio,
  storeReleasedPrivacyPortfolioSeries,
} from "../../src/chrome/privacy/portfolioViewCache";
import { PRIVACY_POOLS_DEPLOYMENT } from "../../src/chrome/privacy/deployment/manifest";

const valid = {
  version: 1,
  profile: PRIVACY_POOLS_DEPLOYMENT.profile,
  portfolio: {
    confirmedBalanceWei: "100",
    readyBalanceWei: "90",
    maxPrivateSendWei: "90",
    pendingBalanceWei: "10",
    recoverableBalanceWei: "0",
    attentionCount: 0,
    lastUpdatedAt: 123,
  },
  series: {
    priceUsd: 3_000,
    totalValueUsd: 0.00027,
    snapshots: [{ timestamp: 123, totalValueUsd: 0.00027 }],
  },
} as const;

test("released private portfolio view accepts bounded aggregate-only data", () => {
  assert.deepEqual(parseReleasedPrivacyPortfolioView(valid), valid);
});

test("released private portfolio view rejects another deployment profile", () => {
  assert.equal(parseReleasedPrivacyPortfolioView({ ...valid, profile: "other" }), null);
});

test("released private portfolio view rejects extra linkage data", () => {
  assert.equal(parseReleasedPrivacyPortfolioView({
    ...valid,
    portfolio: { ...valid.portfolio, commitmentId: "secret-link" },
  }), null);
});

test("released private portfolio view rejects impossible totals and unordered points", () => {
  assert.equal(parseReleasedPrivacyPortfolioView({
    ...valid,
    portfolio: { ...valid.portfolio, readyBalanceWei: "101" },
  }), null);
  assert.equal(parseReleasedPrivacyPortfolioView({
    ...valid,
    series: {
      ...valid.series,
      snapshots: [
        { timestamp: 124, totalValueUsd: 0.00027 },
        { timestamp: 123, totalValueUsd: 0.00026 },
      ],
    },
  }), null);
});

test("released aggregate and chart survive auth-only cache expiry until session teardown", async () => {
  const storage = new Map<string, unknown>();
  Object.assign(globalThis, {
    chrome: {
      runtime: { lastError: undefined },
      storage: {
        local: {
          async get(keys: string | string[] | null) {
            const selected = keys === null
              ? [...storage.keys()]
              : Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(selected
              .filter((key) => storage.has(key))
              .map((key) => [key, storage.get(key)]));
          },
          async set(items: Record<string, unknown>) {
            for (const [key, value] of Object.entries(items)) storage.set(key, value);
          },
          async remove(keys: string | string[]) {
            for (const key of Array.isArray(keys) ? keys : [keys]) storage.delete(key);
          },
        },
      },
    },
  });

  await storeReleasedPrivacyPortfolio(valid.portfolio);
  await storeReleasedPrivacyPortfolioSeries({
    priceUsd: valid.series.priceUsd,
    totalValueUsd: valid.series.totalValueUsd,
    snapshots: [...valid.series.snapshots],
  });
  assert.deepEqual(await readReleasedPrivacyPortfolioView(), valid);

  await clearReleasedPrivacyPortfolioView();
  assert.equal(await readReleasedPrivacyPortfolioView(), null);
});
