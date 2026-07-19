import assert from "node:assert/strict";
import test from "node:test";

import {
  contenthashHistoryLabel,
  formatContenthashUpdatedAt,
} from "../../src/components/DappConnection/contenthashHistoryModel";

const NOW = Date.UTC(2026, 6, 19, 12);

test("formats ENS contenthash history as compact elapsed time", () => {
  assert.equal(formatContenthashUpdatedAt(NOW - 12_000, NOW), "just now");
  assert.equal(formatContenthashUpdatedAt(NOW - 7 * 86_400_000, NOW), "7 days ago");
  assert.equal(formatContenthashUpdatedAt(NOW - 45 * 86_400_000, NOW), "1 month ago");
});

test("keeps the ENS provenance pill visible across asynchronous states", () => {
  assert.equal(
    contenthashHistoryLabel({ status: "idle", updatedAt: null }, NOW),
    null,
  );
  assert.equal(
    contenthashHistoryLabel({ status: "loading", updatedAt: null }, NOW),
    "IPFS Hash last updated: Checking…",
  );
  assert.equal(
    contenthashHistoryLabel({ status: "unavailable", updatedAt: null }, NOW),
    "IPFS Hash last updated: Unavailable",
  );
  assert.equal(
    contenthashHistoryLabel(
      { status: "found", updatedAt: NOW - 7 * 86_400_000 },
      NOW,
    ),
    "IPFS Hash last updated: 7 days ago",
  );
});
