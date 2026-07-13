import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("onboarding separates state recovery, lifecycle, and first credential commit", async () => {
  const [facade, state, lifecycle, credential] = await Promise.all([
    readChromeModule("onboardingInitialization.ts"),
    readChromeModule("onboarding/state.ts"),
    readChromeModule("onboarding/lifecycle.ts"),
    readChromeModule("onboarding/credential.ts"),
  ]);

  assert.match(facade, /Stable facade/);
  assert.doesNotMatch(facade, /chrome\.|crypto\.|\b(?:async )?function\b/);
  assert.doesNotMatch(
    state,
    /from ["'].\/(?:lifecycle|credential)["']/,
  );
  assert.match(lifecycle, /from ["'].\/state["']/);
  assert.doesNotMatch(lifecycle, /encryptVaultKey|generateVaultKey|importVaultKey/);
  assert.match(credential, /from ["'].\/state["']/);
  assert.doesNotMatch(credential, /from ["'].\/lifecycle["']/);
});

test("onboarding facade preserves exact implementation identities", async () => {
  const [facade, state, lifecycle, credential] = await Promise.all([
    import("../../src/chrome/onboardingInitialization"),
    import("../../src/chrome/onboarding/state"),
    import("../../src/chrome/onboarding/lifecycle"),
    import("../../src/chrome/onboarding/credential"),
  ]);

  assert.equal(
    facade.ONBOARDING_INITIALIZATION_KEY,
    state.ONBOARDING_INITIALIZATION_KEY,
  );
  assert.equal(
    facade.isOnboardingInitializationOwner,
    state.isOnboardingInitializationOwner,
  );
  for (const name of [
    "beginOnboardingInitialization",
    "completeOnboardingInitialization",
    "getOnboardingInitializationStatus",
    "rollbackOnboardingInitialization",
  ] as const) {
    assert.equal(facade[name], lifecycle[name], name);
  }
  assert.equal(
    facade.initializeOnboardingCredential,
    credential.initializeOnboardingCredential,
  );
});

test("onboarding root clutter is limited to the stable facade", async () => {
  const entries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  const rootModules = entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith("onboarding"),
    )
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(rootModules, ["onboardingInitialization.ts"]);

  const auditMap = await readChromeModule("onboarding/README.md");
  assert.match(auditMap, /Dependency direction/);
  assert.match(auditMap, /storage key and marker shape remain exactly/);
});
