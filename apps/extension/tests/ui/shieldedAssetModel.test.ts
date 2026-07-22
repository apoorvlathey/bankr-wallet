import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Shielded ETH identity is confined to the private portfolio", async () => {
  const [holdingsSource, transferSource, activitySource, privateHomeSource, assetSource] = await Promise.all([
    readFile(new URL("../../src/components/Portfolio/Holdings/useHoldingsViewModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Transfer/TokenTransfer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Activity/ActivityList.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/model/shieldedAsset.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(holdingsSource, /shieldedEth/);
  assert.doesNotMatch(transferSource, /ShieldedEth|shielded-eth/);
  assert.match(privateHomeSource, /ShieldedEthRow/);
  assert.match(privateHomeSource, /scope="private"/);
  assert.match(activitySource, /unshieldOperations/);
  assert.match(activitySource, /scope === "private"/);
  assert.match(assetSource, /"shield" \| "unshield" \| "activity"/);
  assert.doesNotMatch(assetSource, /walletchan:shielded-eth|"send"/);
});
