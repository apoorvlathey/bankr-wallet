import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("authentication modules retain stable exports with one-way dependencies", async () => {
  const [
    facade,
    unlock,
    hydration,
    migration,
    verification,
    agentFactors,
    bankrCredential,
    passwordRotation,
  ] =
    await Promise.all([
      readModule("authHandlers.ts"),
      readModule("auth/walletUnlock.ts"),
      readModule("auth/sessionHydration.ts"),
      readModule("auth/legacyVaultKeyMigration.ts"),
      readModule("auth/masterPasswordVerification.ts"),
      readModule("auth/agentFactorHandlers.ts"),
      readModule("auth/bankrCredentialUpdate.ts"),
      readModule("auth/masterPasswordRotation.ts"),
    ]);

  assert.match(facade, /from "\.\/auth\/walletUnlock"/);
  assert.match(facade, /from "\.\/auth\/sessionHydration"/);
  assert.match(facade, /from "\.\/auth\/masterPasswordVerification"/);
  assert.match(facade, /from "\.\/auth\/agentFactorHandlers"/);
  assert.match(facade, /from "\.\/auth\/bankrCredentialUpdate"/);
  assert.match(facade, /from "\.\/auth\/masterPasswordRotation"/);
  assert.doesNotMatch(facade, /function handleUnlockWallet\(/);
  assert.doesNotMatch(facade, /function hydrateAuthSessionFromVaultKeyBytes\(/);
  assert.doesNotMatch(facade, /function verifyMasterPassword\(/);
  assert.doesNotMatch(facade, /function handleSetAgentPassword\(/);
  assert.doesNotMatch(
    facade,
    /function prepareApiKeyUpdateWithCachedPassword\(/,
  );
  assert.doesNotMatch(facade, /function handleChangePassword\(/);

  assert.doesNotMatch(unlock, /from "\.\.\/authHandlers"/);
  assert.doesNotMatch(
    hydration,
    /from "(?:\.\.\/authHandlers|\.\/walletUnlock)"/,
  );
  assert.doesNotMatch(
    migration,
    /from "(?:\.\.\/authHandlers|\.\/walletUnlock|\.\/sessionHydration)"/,
  );
  assert.doesNotMatch(
    verification,
    /from "(?:\.\.\/authHandlers|\.\/walletUnlock|\.\/sessionHydration)"/,
  );
  for (const source of [agentFactors, bankrCredential, passwordRotation]) {
    assert.doesNotMatch(source, /from "\.\.\/authHandlers"/);
  }
});

test("authentication implementation modules stay within audit-sized budgets", async () => {
  const budgets: Record<string, number> = {
    "authHandlers.ts": 100,
    "auth/walletUnlock.ts": 220,
    "auth/sessionHydration.ts": 380,
    "auth/legacyVaultKeyMigration.ts": 200,
    "auth/masterPasswordVerification.ts": 120,
    "auth/agentFactorHandlers.ts": 240,
    "auth/bankrCredentialUpdate.ts": 200,
    "auth/masterPasswordRotation.ts": 360,
    "auth/sessionTermination.ts": 60,
  };

  for (const [name, maximumLines] of Object.entries(budgets)) {
    const source = await readModule(name);
    const lines = source.split("\n").length;
    assert.ok(
      lines <= maximumLines,
      `${name} has ${lines} lines; audit budget is ${maximumLines}`,
    );
  }
});

test("authHandlers compatibility exports are the focused implementations", async () => {
  const [
    facade,
    unlock,
    hydration,
    verification,
    agentFactors,
    bankrCredential,
    passwordRotation,
  ] = await Promise.all([
    import("../../src/chrome/authHandlers"),
    import("../../src/chrome/auth/walletUnlock"),
    import("../../src/chrome/auth/sessionHydration"),
    import("../../src/chrome/auth/masterPasswordVerification"),
    import("../../src/chrome/auth/agentFactorHandlers"),
    import("../../src/chrome/auth/bankrCredentialUpdate"),
    import("../../src/chrome/auth/masterPasswordRotation"),
  ]);

  assert.equal(facade.handleUnlockWallet, unlock.handleUnlockWallet);
  assert.equal(facade.checkHasVaultKeySystem, unlock.checkHasVaultKeySystem);
  assert.equal(
    facade.hydrateAuthSessionFromVaultKeyBytes,
    hydration.hydrateAuthSessionFromVaultKeyBytes,
  );
  assert.equal(
    facade.decryptAllKeysWithVaultKey,
    hydration.decryptAllKeysWithVaultKey,
  );
  assert.equal(facade.verifyMasterPassword, verification.verifyMasterPassword);
  assert.equal(
    facade.handleSetAgentPassword,
    agentFactors.handleSetAgentPassword,
  );
  assert.equal(
    facade.handleRemoveAgentPassword,
    agentFactors.handleRemoveAgentPassword,
  );
  assert.equal(
    facade.handleSaveApiKeyWithCachedPassword,
    bankrCredential.handleSaveApiKeyWithCachedPassword,
  );
  assert.equal(
    facade.prepareApiKeyUpdateWithCachedPassword,
    bankrCredential.prepareApiKeyUpdateWithCachedPassword,
  );
  assert.equal(
    facade.commitPreparedApiKeyUpdate,
    bankrCredential.commitPreparedApiKeyUpdate,
  );
  assert.equal(
    facade.handleChangePassword,
    passwordRotation.handleChangePassword,
  );
});
