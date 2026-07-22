import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const BACKGROUND = new URL("../../../src/chrome/background/", import.meta.url);

test("lifecycle audit domain has one focused module per registration concern", async () => {
  const entries = await readdir(new URL("lifecycle/", BACKGROUND), {
    withFileTypes: true,
  });
  assert.deepEqual(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => entry.name)
      .sort(),
    [
      "actionFallback.ts",
      "installUpdate.ts",
      "maintenance.ts",
      "notificationClicks.ts",
      "privacyAspRefresh.ts",
      "startupRecovery.ts",
      "storageAuthLock.ts",
      "tabAccounts.ts",
      "trustedUiPorts.ts",
    ],
  );
  for (const entry of entries.filter(
    (candidate) => candidate.isFile() && candidate.name.endsWith(".ts"),
  )) {
    const source = await readFile(new URL(`lifecycle/${entry.name}`, BACKGROUND), "utf8");
    assert.ok(source.split("\n").length <= 180, entry.name);
    assert.doesNotMatch(source, /from ["']\.\.\/\.\.\/background["']/);
  }
});

test("composition root preserves lifecycle registration and startup order", async () => {
  const source = await readFile(
    new URL("composition/lifecycle.ts", BACKGROUND),
    "utf8",
  );
  const ordered = [
    "registerStorageAuthLockLifecycle({",
    "registerPrivacyAspRefreshLifecycle({",
    "registerTabAccountLifecycle({",
    "startMaintenanceLifecycle({",
    "registerInstallUpdateLifecycle({",
    "startRecoveryLifecycle({",
    "registerActionFallbackLifecycle({",
    "registerTrustedUiPortLifecycle({",
    "chrome.runtime.onMessage.addListener",
    "registerNotificationClickLifecycle({",
  ].map((needle) => source.indexOf(needle));
  assert.ok(ordered.every((index) => index >= 0));
  assert.deepEqual(ordered, [...ordered].sort((a, b) => a - b));

  assert.equal(
    [...source.matchAll(/\.addListener\(/g)].length,
    1,
    "lifecycle composition registers the ordered onMessage pipeline once",
  );
  assert.doesNotMatch(source, /case ["']resetExtension["']/);
  assert.doesNotMatch(source, /function (?:migrateCustomOptimismChain|enqueueAuthorizedSignatureRequest|handleDappChainSwitchNotification)/);
});

test("reset and provider helper modules remain independently auditable", async () => {
  for (const [path, maximum] of [
    ["resetRouter.ts", 150],
    ["providerIngress.ts", 140],
    ["signatureValidation.ts", 120],
    ["chainSwitchNotification.ts", 130],
  ] as const) {
    const source = await readFile(new URL(path, BACKGROUND), "utf8");
    assert.ok(source.split("\n").length <= maximum, path);
  }
});
