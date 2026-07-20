import assert from "node:assert/strict";
import test from "node:test";

import { PRIVACY_POOLS_RPC_BATCH_SIZE } from "../../src/chrome/privacy/rpcPolicy";

test("Privacy Pools RPC batches retain the reviewed free-tier ceiling", () => {
  assert.equal(PRIVACY_POOLS_RPC_BATCH_SIZE, 3);
});
