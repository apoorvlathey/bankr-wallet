import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readComponent = (path: string) =>
  readFile(new URL(`../../src/components/${path}`, import.meta.url), "utf8");

test("portfolio chart hover state stays isolated from holdings and activity", async () => {
  const [tabs, balanceChart] = await Promise.all([
    readComponent("PortfolioTabs.tsx"),
    readComponent("Portfolio/PortfolioBalanceChart.tsx"),
  ]);

  assert.match(tabs, /<PortfolioBalanceChart/);
  assert.doesNotMatch(tabs, /setHoveredChartValue|balanceMotionDirection/);
  assert.match(balanceChart, /setHoveredChartValue/);
  assert.match(balanceChart, /export default memo\(PortfolioBalanceChart\)/);
});

test("hidden holdings keep their last view and stable callbacks", async () => {
  const tabs = await readComponent("PortfolioTabs.tsx");

  assert.match(
    tabs,
    /if \(nextIndex < 2\) \{[\s\S]*?setHoldingsView\(/,
  );
  assert.match(tabs, /view=\{holdingsView\}/);
  assert.match(tabs, /onShowAllNetworks=\{showAllNetworks\}/);
  assert.doesNotMatch(tabs, /onShowAllNetworks=\{\(\) =>/);
});

test("same-address chart refreshes stay warm and skipped writes do not reload", async () => {
  const [snapshotHook, loader, progressiveRefresh] = await Promise.all([
    readComponent("Portfolio/usePortfolioChartSnapshots.ts"),
    readComponent("Portfolio/Holdings/usePortfolioLoader.ts"),
    readComponent("Portfolio/Holdings/useProgressiveBalanceRefresh.ts"),
  ]);

  assert.match(
    snapshotHook,
    /const showedSkeleton = resolvedAddressRef\.current !== address/,
  );
  assert.match(snapshotHook, /if \(showedSkeleton\) setLoading\(true\)/);
  assert.match(
    loader,
    /const snapshotChanged = await recordSnapshot[\s\S]*?if \(snapshotChanged\) onSnapshotsChanged/,
  );
  assert.match(
    progressiveRefresh,
    /\.then\(\(snapshotChanged\) => \{[\s\S]*?if \(snapshotChanged\) onSnapshotsChanged/,
  );
});

test("failed progressive balance reads do not immediately retry forever", async () => {
  const refresh = await readComponent(
    "Portfolio/Holdings/useProgressiveBalanceRefresh.ts",
  );

  assert.match(
    refresh,
    /attemptedLoadVersionRef\.current !== state\.loadVersionRef\.current[\s\S]*?attemptedTokenKeysRef\.current\.clear\(\)/,
  );
  assert.match(
    refresh,
    /attemptedTokenKeys: attemptedTokenKeysRef\.current/,
  );
  assert.match(
    refresh,
    /attemptedTokenKeysRef\.current\.add\([\s\S]*?fetchOnchainBalances/,
  );
});
