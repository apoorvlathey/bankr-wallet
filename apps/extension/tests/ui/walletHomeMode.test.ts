import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveWalletHomeMode } from "../../src/app/home/walletHomeMode";

test("wallet home mode persists only the two released presentation states", () => {
  assert.equal(resolveWalletHomeMode("public"), "public");
  assert.equal(resolveWalletHomeMode("private"), "private");
  assert.equal(resolveWalletHomeMode("PRIVATE"), "public");
  assert.equal(resolveWalletHomeMode({ mode: "private" }), "public");
  assert.equal(resolveWalletHomeMode(undefined), "public");
});

test("Firefox's public-only home rejects persisted and requested Private mode", () => {
  assert.equal(resolveWalletHomeMode("public", false), "public");
  assert.equal(resolveWalletHomeMode("private", false), "public");
});

test("Firefox hides Private home entry points while Chrome keeps them", async () => {
  const [viteSource, appSource, modeHookSource] = await Promise.all([
    readFile(new URL("../../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../../src/app/home/useWalletHomeMode.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    viteSource,
    /__WALLETCHAN_FIREFOX_BUILD__[\s\S]*?process\.env\.BROWSER === "firefox"/,
  );
  assert.match(
    appSource,
    /walletModeToggle = privateHomeEnabled \? <WalletModeToggle/,
  );
  assert.match(
    appSource,
    /onShield=\{privateHomeEnabled && activeAccount/,
  );
  assert.match(
    modeHookSource,
    /!privateHomeEnabled && value !== "public"[\s\S]*?WALLET_HOME_MODE_STORAGE_KEY\]: "public"/,
  );
});

test("wallet mode control stays compact, tooltip-free, and balance-aligned", async () => {
  const [toggleSource, portfolioSource, balanceSource, privateHomeSource] = await Promise.all([
    readFile(new URL("../../src/components/WalletModeToggle.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/PortfolioTabs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Portfolio/PortfolioBalanceChart.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(toggleSource, /Tooltip/);
  assert.match(toggleSource, /minH="28px"/);
  assert.match(portfolioSource, /modeToggle\?: ReactNode/);
  assert.match(portfolioSource, /<PortfolioBalanceChart[\s\S]*?modeToggle=\{modeToggle\}/);
  assert.match(balanceSource, /Portfolio balance[\s\S]*?\{modeToggle\}/);
  assert.match(privateHomeSource, /Private Balance[\s\S]*?\{modeToggle\}/);
  assert.doesNotMatch(privateHomeSource, /Your Total/);
  assert.match(
    privateHomeSource,
    /Your total Privacy Pools balance\.\\nIt is not tied to any single account\./,
  );
  assert.match(privateHomeSource, /whiteSpace="pre-line"/);
  assert.doesNotMatch(privateHomeSource, /hasArrow/);
  assert.match(privateHomeSource, /aria-label="About global private balance"/);
});

test("entering Private mode starts idempotent privacy initialization", async () => {
  const modeHookSource = await readFile(
    new URL("../../src/app/home/useWalletHomeMode.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    modeHookSource,
    /resolvedMode === "private"[\s\S]*?privacyEnsureInitialized/,
  );
});

test("Private balance hides an empty processing row", async () => {
  const privateHomeSource = await readFile(
    new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    privateHomeSource,
    /pendingBalanceWei > 0n && \([\s\S]*?processing/,
  );
});

test("Private home retains its verified balance and chart while background refreshes run", async () => {
  const [privateHomeSource, operationsSource, chartSource, chartSnapshotsSource, lockSource] = await Promise.all([
    readFile(new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/hooks/useShieldOperations.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/PortfolioChart.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Portfolio/usePortfolioChartSnapshots.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/hooks/useManualWalletLock.ts", import.meta.url), "utf8"),
  ]);

  assert.match(privateHomeSource, /const isLoading = shield\.loading/);
  assert.doesNotMatch(
    privateHomeSource,
    /initialization\.status === "loading" \|\| shield\.loading/,
  );
  assert.match(operationsSource, /readRendererMemoryCache<ShieldOperationsSnapshot>/);
  assert.match(
    operationsSource,
    /if \(cachedSnapshot && refreshNonce === 0\)[\s\S]*?applySnapshot\(cachedSnapshot\);[\s\S]*?scheduleNextSync\(\)/,
  );
  assert.match(
    operationsSource,
    /message\.type === "walletLockedExternal"[\s\S]*?clearRendererMemoryCache\(\)/,
  );
  assert.match(
    lockSource,
    /const clearRendererAuthState = useCallback\(\(\) => \{[\s\S]*?clearRendererMemoryCache\(\)/,
  );
  assert.match(
    chartSnapshotsSource,
    /useState<[\s\S]*PortfolioChartSnapshot\[\][\s\S]*>\(\(\) => \(suppliedSnapshots \? \[\.\.\.suppliedSnapshots\] : \[\]\)\)/,
  );
  assert.match(
    chartSnapshotsSource,
    /useState\(suppliedSnapshots === undefined\)/,
  );
  assert.match(chartSource, /usePortfolioChartSnapshots/);
});

test("Private chart hover hides the current shielded amount without collapsing its row", async () => {
  const privateHomeSource = await readFile(
    new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    privateHomeSource,
    /visibility=\{hoveredValue === null \? "visible" : "hidden"\}/,
  );
  assert.match(privateHomeSource, /aria-hidden=\{hoveredValue !== null\}/);
  assert.doesNotMatch(
    privateHomeSource,
    /hoveredValue === null && \([\s\S]*?shielded/,
  );
});

test("Private assets stay wallet-wide and exclude selected-account native ETH", async () => {
  const [appSource, privateHomeSource] = await Promise.all([
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(privateHomeSource, /displayedValue = hoveredValue \?\? shield\.series\.totalValueUsd \?\? 0/);
  assert.match(privateHomeSource, /<ShieldedEthRow/);
  assert.doesNotMatch(privateHomeSource, /NativeEthRow|useNativeEthBalance|address: string/);
  assert.doesNotMatch(appSource, /<PrivatePortfolioHome\s+address=\{address\}/);
});

test("confirmed Shield transactions return to Private Activity", async () => {
  const [appSource, privateHomeSource] = await Promise.all([
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(
    appSource,
    /const openPrivateActivity[\s\S]*?setWalletHomeMode\("private"\);[\s\S]*?setPrivateHomeTab\("activity"\)/,
  );
  assert.match(
    appSource,
    /selectedTxRequest\?\.privacyShieldMeta[\s\S]*?openPrivateActivity\(\)/,
  );
  assert.match(
    appSource,
    /selectedBatchRequest\.privacyRagequitMeta[\s\S]*?openPrivateActivity\(\)/,
  );
  assert.match(
    appSource,
    /rejectingBatchIdsRef[\s\S]*?wasUserRejected[\s\S]*?openPrivateActivity\(\)/,
  );
  assert.match(appSource, /activeTab=\{privateHomeTab\} onTabChange=\{setPrivateHomeTab\}/);
  assert.match(privateHomeSource, /activeTab: "assets" \| "activity"/);
  assert.match(privateHomeSource, /onClick=\{\(\) => onTabChange\(item\)\}/);
  assert.match(
    appSource,
    /onUnshieldSubmitted=\{\(\) => \{[\s\S]*?openPrivateActivity\(\);[\s\S]*?setView\("main"\)/,
  );
  assert.match(
    privateHomeSource,
    /onUnshieldTransactionClick[\s\S]*?onSelectUnshield=\{onUnshieldTransactionClick\}/,
  );
});

test("Shield deposits are positive private-balance activity", async () => {
  const [modelSource, itemSource] = await Promise.all([
    readFile(new URL("../../src/components/Activity/activityModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Activity/ActivityItem.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(modelSource, /getPrivacyShieldValue[\s\S]*?"ETH",[\s\S]*?"\+"/);
  assert.match(itemSource, /isIncomingValue = presentation\.value\?\.startsWith\("\+"\)/);
  assert.match(itemSource, /isIncomingValue[\s\S]*?"chart\.positive"/);
});
