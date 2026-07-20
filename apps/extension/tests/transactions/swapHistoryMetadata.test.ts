import assert from "node:assert/strict";
import test from "node:test";
import { selectSwapHistoryEntry } from "../../src/chrome/transactions/swaps/historyMetadata";
import type { SwapTxEntry } from "../../src/chrome/transactions/swaps/types";

const address = "0x1111111111111111111111111111111111111111";

function entry(origin: string): SwapTxEntry {
  return {
    origin,
    favicon: null,
    functionName: origin,
    tx: { from: address, to: address, data: "0x", value: "0x0", chainId: 8453 },
  };
}

test("approval batches use the final reviewed action as their history title", () => {
  const approval = entry("Approve WCHAN for staking");
  const stake = entry("Stake WCHAN");

  assert.equal(selectSwapHistoryEntry([approval, stake]), stake);
});

test("specialized swap and bridge metadata retain priority", () => {
  const approval = entry("Approve token");
  const swap = { ...entry("Swap token"), swapMeta: {} as SwapTxEntry["swapMeta"] };
  const bridge = { ...entry("Bridge token"), bridge: {} as SwapTxEntry["bridge"] };

  assert.equal(selectSwapHistoryEntry([approval, swap]), swap);
  assert.equal(selectSwapHistoryEntry([approval, swap, bridge]), bridge);
});
