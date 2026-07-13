import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("onboarding separates state recovery, lifecycle, and first credential commit", async () => {
  const [facade, state, lifecycle, credential] = await Promise.all([
    readChromeModule("onboardingInitialization.ts"),
    readChromeModule("onboardingInitializationState.ts"),
    readChromeModule("onboardingInitializationLifecycle.ts"),
    readChromeModule("onboardingCredentialInitialization.ts"),
  ]);

  assert.match(facade, /Stable facade/);
  assert.doesNotMatch(facade, /chrome\.|crypto\.|\b(?:async )?function\b/);
  assert.doesNotMatch(
    state,
    /from ["'].\/(?:onboardingInitializationLifecycle|onboardingCredentialInitialization)["']/,
  );
  assert.match(lifecycle, /from ["'].\/onboardingInitializationState["']/);
  assert.doesNotMatch(lifecycle, /encryptVaultKey|generateVaultKey|importVaultKey/);
  assert.match(credential, /from ["'].\/onboardingInitializationState["']/);
  assert.doesNotMatch(credential, /onboardingInitializationLifecycle/);
});

test("onboarding facade preserves exact implementation identities", async () => {
  const [facade, state, lifecycle, credential] = await Promise.all([
    import("../../src/chrome/onboardingInitialization"),
    import("../../src/chrome/onboardingInitializationState"),
    import("../../src/chrome/onboardingInitializationLifecycle"),
    import("../../src/chrome/onboardingCredentialInitialization"),
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
