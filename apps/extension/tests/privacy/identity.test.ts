import assert from "node:assert/strict";
import test from "node:test";

import type { Account } from "../../src/chrome/types";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const MASTER_PASSWORD = "privacy-master-password";

function account(type: Account["type"]): Account {
  const base = {
    id: `${type}-account`,
    type,
    address: `0x${"11".repeat(20)}`,
    createdAt: 1,
  };
  return type === "seedPhrase"
    ? { ...base, type, seedGroupId: "seed-group", derivationIndex: 0 }
    : type === "ledger"
      ? {
          ...base,
          type,
          deviceId: base.address.toLowerCase(),
          hdPath: "m/44'/60'/0'/0/0",
          hdIndex: 0,
        }
    : base as Account;
}

async function establishSession(passwordType: "master" | "agent") {
  const cryptoModule = await import("../../src/chrome/crypto");
  const session = await import("../../src/chrome/sessionCache");
  session.clearInMemoryAuthCache();
  session.setCachedVaultKey(
    await cryptoModule.importVaultKey(cryptoModule.generateVaultKey()),
  );
  session.setCachedPasswordType(passwordType);
  session.setCachedPasswordDirect(MASTER_PASSWORD);
  return session;
}

test("first Private-mode initialization creates one encrypted identity for every custody wallet type", async () => {
  const identity = await import("../../src/chrome/privacy/identity");
  const privacyCrypto = await import("../../src/chrome/privacy/crypto");
  const privacyVault = await import("../../src/chrome/privacy/vault");

  for (const type of ["bankr", "privateKey", "seedPhrase", "ledger"] as const) {
    const selected = account(type);
    const harness = createChromeStorageHarness({
      local: { accounts: [selected] },
      sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
    });
    const session = await establishSession("master");
    try {
      const first = await identity.ensurePrivacyIdentityInitialized();
      assert.deepEqual(first, { success: true, status: "ready" });
      const firstRecord = structuredClone(harness.stores.local.privacyVault);
      assert.ok(firstRecord);
      assert.equal(JSON.stringify(firstRecord).includes(MASTER_PASSWORD), false);
      assert.equal("phrase" in (firstRecord as Record<string, unknown>), false);

      const unlocked = await privacyVault.unlockPrivacyVaultWithPassword(
        MASTER_PASSWORD,
      );
      assert.ok(unlocked);
      const storedRecord = harness.stores.local.privacyVault as {
        keyId: string;
        recovery: Parameters<typeof privacyCrypto.decryptPrivacyRecovery>[2];
      };
      const phrase = await privacyCrypto.decryptPrivacyRecovery(
        unlocked.key,
        storedRecord.keyId,
        storedRecord.recovery,
      );
      assert.ok(phrase);
      assert.equal(privacyCrypto.isValidPrivacyRecoveryPhrase(phrase), true);
      unlocked.keyBytes.fill(0);

      const writesBeforeRepeat = harness.writes.length;
      const second = await identity.ensurePrivacyIdentityInitialized();
      assert.deepEqual(second, { success: true, status: "ready" });
      assert.deepEqual(harness.stores.local.privacyVault, firstRecord);
      assert.equal(harness.writes.length, writesBeforeRepeat);
    } finally {
      session.clearInMemoryAuthCache();
      harness.restore();
    }
  }
});

test("agent and impersonator sessions cannot create privacy recovery", async () => {
  const identity = await import("../../src/chrome/privacy/identity");

  for (const scenario of [
    { accountType: "bankr" as const, passwordType: "agent" as const },
    { accountType: "impersonator" as const, passwordType: "master" as const },
  ]) {
    const selected = account(scenario.accountType);
    const harness = createChromeStorageHarness({
      local: { accounts: [selected] },
      sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
    });
    const session = await establishSession(scenario.passwordType);
    try {
      const result = await identity.ensurePrivacyIdentityInitialized();
      assert.equal(result.success, false);
      assert.equal(harness.stores.local.privacyVault, undefined);
    } finally {
      session.clearInMemoryAuthCache();
      harness.restore();
    }
  }
});

test("an existing private identity still requires a live master session", async () => {
  const identity = await import("../../src/chrome/privacy/identity");
  const selected = account("bankr");
  const harness = createChromeStorageHarness({
    local: { accounts: [selected] },
    sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
  });
  const session = await establishSession("master");
  try {
    assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, true);
    const before = structuredClone(harness.stores.local.privacyVault);
    session.setCachedPasswordType("agent");
    session.setCachedPasswordDirect("agent-password");
    assert.deepEqual(await identity.ensurePrivacyIdentityInitialized(), {
      success: false,
      status: "action-required",
      code: "auth-required",
      error: "Use your main password to finish Shield setup.",
    });
    assert.deepEqual(harness.stores.local.privacyVault, before);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});

test("malformed privacy storage fails closed without replacement", async () => {
  const malformed = { version: 1, recovery: "plaintext should survive audit" };
  const selected = account("privateKey");
  const harness = createChromeStorageHarness({
    local: { accounts: [selected], privacyVault: malformed },
    sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
  });
  const session = await establishSession("master");
  try {
    const identity = await import("../../src/chrome/privacy/identity");
    const result = await identity.ensurePrivacyIdentityInitialized();
    assert.equal(result.success, false);
    assert.deepEqual(harness.stores.local.privacyVault, malformed);
    assert.equal(harness.writes.length, 0);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});
