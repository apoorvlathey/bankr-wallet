import assert from "node:assert/strict";
import test from "node:test";
import type { AssetChangeRecord } from "../../src/chrome/txHistoryStorage";
import { getForceInclusionState } from "../../src/components/TransactionDetails/forceInclusionState";
import {
  formatSignedTokenAmount,
  formatTokenAmountWei,
  getErc20TransferGroups,
  pickAssetChangeAmount,
} from "../../src/components/TransactionDetails/formatting";

const record: AssetChangeRecord = {
  blockNumber: "1",
  nativeDelta: "2000000000000000000",
  erc20Transfers: [
    {
      token: "0x0000000000000000000000000000000000000001",
      direction: "out",
      counterparty: "0x0000000000000000000000000000000000000002",
      amountWei: "1250000",
      symbol: "USDC",
      decimals: 6,
    },
    {
      token: "0x0000000000000000000000000000000000000001",
      direction: "out",
      counterparty: "0x0000000000000000000000000000000000000003",
      amountWei: "750000",
      symbol: "USDC",
      decimals: 6,
    },
  ],
};

test("transaction detail token formatting preserves direction and display precision", () => {
  assert.equal(formatTokenAmountWei("123456789", 6), "123.456789");
  assert.equal(formatTokenAmountWei("1", 18), null);
  assert.equal(formatSignedTokenAmount("1250000", 6, true), "−1.25");
  assert.equal(formatSignedTokenAmount("1250000", 6, false), "+1.25");
});

test("duplicate token transfers group by token and direction while keeping rows", () => {
  const groups = getErc20TransferGroups(record, "out");
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.totalWei, "2000000");
  assert.equal(groups[0]?.totalFormatted, "−2");
  assert.equal(groups[0]?.transfers.length, 2);
});

test("asset summary prefers the symbol-matched ERC-20 group then native fallback", () => {
  assert.deepEqual(pickAssetChangeAmount(record, "out", "USDC", false, 18), {
    amountLabel: "2",
    amountWei: "2000000",
    decimals: 6,
    source: "0x0000000000000000000000000000000000000001",
  });
  assert.deepEqual(pickAssetChangeAmount(record, "in", "ETH", true, 18), {
    amountLabel: "2",
    amountWei: "2000000000000000000",
    decimals: 18,
    source: "native",
  });
});

test("force-inclusion stages distinguish L1 rejection from L2 rejection", () => {
  const meta = {
    l1TxHash: "0xl1",
    l1ChainId: 1,
    l2ChainId: 8453,
  };

  assert.deepEqual(getForceInclusionState(meta, "failed", "0xl1"), {
    hasDistinctL2Hash: false,
    l1Confirmed: false,
    l1Reverted: true,
    l2Confirmed: false,
    l2Reverted: false,
  });
  assert.deepEqual(getForceInclusionState(meta, "failed", "0xl2"), {
    hasDistinctL2Hash: true,
    l1Confirmed: true,
    l1Reverted: false,
    l2Confirmed: false,
    l2Reverted: true,
  });
});
