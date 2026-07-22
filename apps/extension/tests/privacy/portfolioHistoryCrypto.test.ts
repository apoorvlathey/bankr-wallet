import assert from "node:assert/strict";
import test from "node:test";

import { generateVaultKey, importVaultKey } from "../../src/chrome/crypto";
import {
  decryptPrivacyPortfolioSnapshot,
  encryptPrivacyPortfolioSnapshot,
} from "../../src/chrome/privacy/portfolioHistory/crypto";
import { privacyPortfolioSnapshotIdsInWindow } from "../../src/chrome/privacy/portfolioHistory/repository";
import {
  isValidStoredPrivacyPortfolioSnapshot,
  type PrivacyPortfolioSnapshotDetailsV1,
} from "../../src/chrome/privacy/portfolioHistory/types";

const ID = "00000000-0000-4000-8000-000000000091";

test("private portfolio snapshots encrypt balances and bind their public header", async () => {
  const key = await importVaultKey(generateVaultKey());
  const header = {
    version: 1 as const,
    id: ID,
    keyId: "privacy-key-1",
    createdAt: 123,
  };
  const details: PrivacyPortfolioSnapshotDetailsV1 = {
    version: 1,
    id: ID,
    timestamp: 123,
    confirmedBalanceWei: "10000000000000000",
    priceUsd: 3_420,
    totalValueUsd: 34.2,
  };
  const record = {
    ...header,
    encryptedDetails: await encryptPrivacyPortfolioSnapshot(key, header, details),
  };

  assert.equal(isValidStoredPrivacyPortfolioSnapshot(record), true);
  assert.deepEqual(await decryptPrivacyPortfolioSnapshot(key, record), details);
  assert.equal(
    await decryptPrivacyPortfolioSnapshot(key, { ...record, createdAt: 124 }),
    null,
  );
  assert.equal(
    isValidStoredPrivacyPortfolioSnapshot({ ...record, confirmedBalanceWei: "leak" }),
    false,
  );
});

test("a non-submitted reservation removes only chart points from its lifetime", () => {
  const snapshots = [100, 200, 300].map((timestamp, index) => ({
    record: { id: `snapshot-${index}` },
    details: { timestamp },
  }));
  assert.deepEqual(
    privacyPortfolioSnapshotIdsInWindow(snapshots, 150, 250),
    ["snapshot-1"],
  );
  assert.deepEqual(privacyPortfolioSnapshotIdsInWindow(snapshots, 250, 150), []);
});
