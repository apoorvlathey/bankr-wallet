import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getShieldActivityCopy,
  SEPOLIA_SHIELD_DASHBOARD,
} from "../../src/components/Shield/model/shieldDashboard";

test("Shield dashboard is pinned to a Sepolia ETH preview", () => {
  assert.equal(SEPOLIA_SHIELD_DASHBOARD.chainId, 11_155_111);
  assert.equal(SEPOLIA_SHIELD_DASHBOARD.networkName, "Sepolia");
  assert.equal(SEPOLIA_SHIELD_DASHBOARD.assetSymbol, "ETH");
  assert.equal(SEPOLIA_SHIELD_DASHBOARD.modeLabel, "Preview");
});

test("Shield and Unshield are the only top-level balance actions", () => {
  assert.deepEqual(SEPOLIA_SHIELD_DASHBOARD.actions, [
    { id: "shield", label: "Shield" },
    { id: "unshield", label: "Unshield" },
  ]);
});

test("empty activity copy stays short and action-oriented", () => {
  assert.deepEqual(getShieldActivityCopy(0), {
    title: "No activity yet",
    description: "Your Shield and Unshield activity will appear here.",
  });
  assert.deepEqual(getShieldActivityCopy(1), {
    title: "1 activity",
    description: "Your latest private-balance activity.",
  });
});

test("Shield opens amount entry without a blocking proof-readiness check", async () => {
  const source = await readFile(
    new URL("../../src/components/Shield/ShieldScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /privacyRunShieldReadinessCheck/);
  assert.doesNotMatch(source, /useShieldReadinessCheck/);
  assert.match(source, /enabled:\s*shieldPanelOpen/);
  assert.match(source, /useShieldNativePrice/);
});

test("Shield USD pricing uses the pinned Sepolia native-price route", async () => {
  const source = await readFile(
    new URL("../../src/components/Shield/hooks/useShieldNativePrice.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /type: "fetchNativePrice"/);
  assert.match(source, /SEPOLIA_SHIELD_DASHBOARD\.chainId/);
});

test("Shield activity refreshes after transaction updates without reopening the screen", async () => {
  const source = await readFile(
    new URL("../../src/components/Shield/hooks/useShieldOperations.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /message\.type !== "txHistoryUpdated"/);
  assert.match(source, /CONFIRMATION_REFRESH_DELAY_MS = 350/);
  assert.match(source, /ACTIVE_SYNC_INTERVAL_MS = 10_000/);
  assert.match(source, /ASP_SYNC_INTERVAL_MS = 120_000/);
  assert.match(source, /await chrome\.runtime\.sendMessage\(\{ type: "privacySyncShield" \}\)/);
});
