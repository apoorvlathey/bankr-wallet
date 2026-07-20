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

test("wallet mode control stays compact, tooltip-free, and balance-aligned", async () => {
  const [toggleSource, portfolioSource, privateHomeSource] = await Promise.all([
    readFile(new URL("../../src/components/WalletModeToggle.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/PortfolioTabs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(toggleSource, /Tooltip/);
  assert.match(toggleSource, /minH="28px"/);
  assert.match(portfolioSource, /modeToggle\?: ReactNode/);
  assert.match(portfolioSource, /Portfolio balance[\s\S]*?\{modeToggle\}/);
  assert.match(privateHomeSource, /Private balance[\s\S]*?\{modeToggle\}/);
});

test("entering Private mode starts idempotent privacy initialization", async () => {
  const modeHookSource = await readFile(
    new URL("../../src/app/home/useWalletHomeMode.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    modeHookSource,
    /next === "private"[\s\S]*?privacyEnsureInitialized/,
  );
});

test("confirmed Shield transactions return to Private Activity", async () => {
  const [appSource, privateHomeSource] = await Promise.all([
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /privacyRagequitMeta\) setPrivateHomeTab\("activity"\)/);
  assert.match(appSource, /activeTab=\{privateHomeTab\} onTabChange=\{setPrivateHomeTab\}/);
  assert.match(privateHomeSource, /activeTab: "assets" \| "activity"/);
  assert.match(privateHomeSource, /onClick=\{\(\) => onTabChange\(item\)\}/);
});
