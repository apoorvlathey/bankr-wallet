import assert from "node:assert/strict";
import test from "node:test";

import { discoverApprovalIntents } from "../../src/chrome/simulation/approvalIntents";
import { discoverApprovalIntentsFromLogs } from "../../src/chrome/simulation/approvalLogs";
import {
  buildFallbackApprovalChanges,
  projectApprovalChange,
} from "../../src/chrome/simulation/approvalProjection";

const VICTIM = "0x3e1b8f98ed69c6a97a8540e1d7aed33fdf4509aa";
const TOKEN = "0x0bf0164d17469241b6e086da4016dcc54feaa334";
const SPENDER = "0x0012b7c5d4310915bb2d58c0b14c72546d320c05";
const MAX_UINT256 = 2n ** 256n - 1n;

// Approval tx 0x5ee0b8d400d91f9a9ec8127cb3018a8d86019ade178f44e0d24f36723346e542.
// The victim called alphaUSDCDeltaV2.multicall(bytes[]) with a buried
// approve(spender, uint256.max). The linked 0x12fb... drain followed 36s later.
const APPROVAL_TX_DATA =
  "0xac9650d80000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000044095ea7b30000000000000000000000000012b7c5d4310915bb2d58c0b14c72546d320c05ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000";

const APPROVAL_LOG = {
  address: TOKEN,
  topics: [
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
    "0x0000000000000000000000003e1b8f98ed69c6a97a8540e1d7aed33fdf4509aa",
    "0x0000000000000000000000000012b7c5d4310915bb2d58c0b14c72546d320c05",
  ],
  data: `0x${"ff".repeat(32)}`,
};

test("real alphaUSDCDeltaV2 self-multicall surfaces its buried unlimited approval", () => {
  const staticDiscovery = discoverApprovalIntents(
    [{ to: TOKEN, data: APPROVAL_TX_DATA }],
    VICTIM,
  );
  assert.equal(staticDiscovery.incomplete, false);
  assert.equal(staticDiscovery.intents.length, 1);
  const rpcFallback = buildFallbackApprovalChanges(staticDiscovery.intents);
  assert.equal(rpcFallback[0]?.verification, "unverified");
  assert.equal(rpcFallback[0]?.isUnlimited, true);

  const eventDiscovery = discoverApprovalIntentsFromLogs(
    [{ status: "0x1", logs: [APPROVAL_LOG] }],
    VICTIM,
  );
  assert.equal(eventDiscovery.incomplete, false);
  assert.equal(eventDiscovery.intents.length, 1);

  for (const intent of [
    staticDiscovery.intents[0],
    eventDiscovery.intents[0],
  ]) {
    assert.equal(intent?.tokenAddress.toLowerCase(), TOKEN);
    assert.equal(intent?.owner.toLowerCase(), VICTIM);
    assert.equal(intent?.spender.toLowerCase(), SPENDER);
    assert.equal(intent?.requestedAmount, MAX_UINT256);
  }

  const projected = projectApprovalChange(
    eventDiscovery.intents[0]!,
    { amount: 0n, expiration: null },
    { amount: MAX_UINT256, expiration: null },
    1_784_875_907n,
  );
  assert.equal(projected.incomplete, false);
  assert.equal(projected.change?.verification, "verified");
  assert.equal(projected.change?.isUnlimited, true);
  assert.equal(projected.change?.remainingAmount, MAX_UINT256.toString());
});
