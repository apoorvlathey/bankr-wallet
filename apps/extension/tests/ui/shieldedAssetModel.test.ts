import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildShieldedEthToken,
  isShieldedEthToken,
  SHIELDED_ETH_ASSET_ID,
  SHIELDED_ETH_CHAIN_ID,
} from "../../src/components/Shield/model/shieldedAsset";

test("Shielded ETH identity is confined to the private portfolio", async () => {
  const token = buildShieldedEthToken({
    status: "ready",
    confirmedBalanceWei: 12_345_000_000_000_000n,
    readyBalanceWei: 10_000_000_000_000_000n,
    maxPrivateSendWei: 10_000_000_000_000_000n,
    pendingBalanceWei: 2_345_000_000_000_000n,
    recoverableBalanceWei: 0n,
    attentionCount: 0,
    lastUpdatedAt: 1,
  });

  assert.equal(token.name, "Shielded ETH");
  assert.equal(token.symbol, "ETH");
  assert.equal(token.chainId, SHIELDED_ETH_CHAIN_ID);
  assert.equal(token.contractAddress, SHIELDED_ETH_ASSET_ID);
  assert.equal(token.balance, "0.01");
  assert.equal(token.valueUsd, 0);
  assert.equal(isShieldedEthToken(token), true);
  assert.equal(
    isShieldedEthToken({ chainId: SHIELDED_ETH_CHAIN_ID, contractAddress: "native" }),
    false,
  );

  const [holdingsSource, transferSource, activitySource, privateHomeSource] = await Promise.all([
    readFile(new URL("../../src/components/Portfolio/Holdings/useHoldingsViewModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Transfer/TokenTransfer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Activity/ActivityList.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(holdingsSource, /shieldedEth/);
  assert.doesNotMatch(transferSource, /buildShieldedEthToken/);
  assert.match(privateHomeSource, /ShieldedEthRow/);
  assert.match(privateHomeSource, /scope="private"/);
  assert.match(activitySource, /privateSendOperations/);
  assert.match(activitySource, /scope === "private"/);
});
