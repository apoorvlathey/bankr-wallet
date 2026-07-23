import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import type { Account } from "../../src/chrome/types";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const PASSWORD = "privacy-recovery-password";
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PRF_MATERIAL = Buffer.alloc(32, 7).toString("base64url");

function account(type: Account["type"] = "privateKey"): Account {
  const base = {
    id: `${type}-account`,
    type,
    address: `0x${"31".repeat(20)}`,
    createdAt: 1,
  };
  return type === "seedPhrase"
    ? { ...base, type, seedGroupId: "seed", derivationIndex: 0 }
    : base as Account;
}

async function masterSession() {
  const cryptoModule = await import("../../src/chrome/crypto");
  const session = await import("../../src/chrome/sessionCache");
  session.clearInMemoryAuthCache();
  session.setCachedVaultKey(
    await cryptoModule.importVaultKey(cryptoModule.generateVaultKey()),
  );
  session.setCachedPasswordType("master");
  session.setCachedPasswordDirect(PASSWORD);
  return session;
}

test("dedicated recovery export reveals the phrase only after explicit master proof", async () => {
  const selected = account();
  const harness = createChromeStorageHarness({
    local: { accounts: [selected] },
    sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
  });
  const session = await masterSession();
  try {
    const identity = await import("../../src/chrome/privacy/identity");
    const recovery = await import("../../src/chrome/privacy/recovery/operations");
    const privacyCrypto = await import("../../src/chrome/privacy/crypto");
    assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, true);

    const revealed = await recovery.revealPrivacyRecovery(PASSWORD, {
      getActiveAccount: async () => selected,
      verifyMasterPassword: async (password) => password === PASSWORD,
    });
    assert.equal(privacyCrypto.isValidPrivacyRecoveryPhrase(revealed.phrase), true);
    assert.equal(revealed.hasMasterRecovery, true);
    assert.equal(
      (await recovery.readPrivacyRecoveryStatus()).success,
      true,
    );
    assert.equal(
      (await recovery.readPrivacyRecoveryStatus() as { backupVerified: boolean })
        .backupVerified,
      true,
    );
    assert.equal(harness.stores.local.privacyRecoveryBackup.version, 2);
    assert.equal(
      harness.stores.local.privacyRecoveryBackup.revision,
      harness.stores.local.privacyVault.revision,
    );
    assert.equal(JSON.stringify(harness.stores.local).includes(revealed.phrase), false);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});

test("export upgrades a passkey-only compatibility identity with master recovery", async () => {
  const selected = account("seedPhrase");
  const harness = createChromeStorageHarness({
    local: { accounts: [selected] },
    sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
  });
  const session = await masterSession();
  try {
    const privacyCrypto = await import("../../src/chrome/privacy/crypto");
    const repository = await import("../../src/chrome/privacy/repository");
    const privacyVault = await import("../../src/chrome/privacy/vault");
    const recovery = await import("../../src/chrome/privacy/recovery/operations");
    const prepared = await privacyVault.preparePrivacyVaultForPasskeyUnlock(
      PRF_MATERIAL,
    );
    assert.ok(prepared?.recordToCommit);
    if (!prepared?.recordToCommit) return;
    const passkeyOnly = {
      ...prepared.recordToCommit,
      revision: 1,
      recovery: await privacyCrypto.encryptPrivacyRecovery(
        prepared.unlocked.key,
        prepared.recordToCommit.keyId,
        PHRASE,
      ),
    };
    await repository.savePrivacyVault(passkeyOnly);
    session.setCachedPrivacyKey(prepared.unlocked);

    assert.equal((await recovery.readPrivacyRecoveryStatus()).success, true);
    const revealed = await recovery.revealPrivacyRecovery(PASSWORD, {
      getActiveAccount: async () => selected,
      verifyMasterPassword: async () => true,
    });
    assert.equal(revealed.phrase, PHRASE);
    const upgraded = await repository.readPrivacyVault();
    assert.equal(upgraded.status, "valid");
    if (upgraded.status === "valid") assert.ok(upgraded.record.masterWrappedKey);
    const passwordUnlocked = await privacyVault.unlockPrivacyVaultWithPassword(
      PASSWORD,
    );
    assert.ok(passwordUnlocked);
    passwordUnlocked?.keyBytes.fill(0);
    prepared.unlocked.keyBytes.fill(0);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});

test("restore preserves the current phrase until replacement is fully confirmed", async () => {
  const selected = account("bankr");
  const harness = createChromeStorageHarness({
    local: { accounts: [selected] },
    sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
  });
  const session = await masterSession();
  try {
    const privacyCrypto = await import("../../src/chrome/privacy/crypto");
    const recovery = await import("../../src/chrome/privacy/recovery/operations");
    const dependencies = {
      getActiveAccount: async () => selected,
      verifyMasterPassword: async () => true,
    };
    const first = await recovery.restorePrivacyRecovery({
      requestId: "00000000-0000-4000-8000-000000000101",
      phrase: `  ${PHRASE.toUpperCase()}  `,
      password: PASSWORD,
      replaceExisting: false,
      backupConfirmed: false,
      lossConfirmed: false,
    }, dependencies);
    assert.deepEqual(first, { status: "restored" });
    const firstRecord = structuredClone(harness.stores.local.privacyVault);

    const repeated = await recovery.restorePrivacyRecovery({
      requestId: "00000000-0000-4000-8000-000000000102",
      phrase: PHRASE,
      password: PASSWORD,
      replaceExisting: false,
      backupConfirmed: false,
      lossConfirmed: false,
    }, dependencies);
    assert.deepEqual(repeated, { status: "already-current" });
    const secondRecord = structuredClone(harness.stores.local.privacyVault);
    assert.deepEqual(secondRecord, firstRecord);

    const different = privacyCrypto.generatePrivacyRecoveryPhrase();
    await assert.rejects(
      recovery.restorePrivacyRecovery({
        requestId: "00000000-0000-4000-8000-000000000103",
        phrase: different === PHRASE
          ? privacyCrypto.generatePrivacyRecoveryPhrase()
          : different,
        password: PASSWORD,
        replaceExisting: true,
        backupConfirmed: false,
        lossConfirmed: true,
      }, dependencies),
      (error: unknown) =>
        error instanceof recovery.PrivacyRecoveryError &&
        error.code === "replacement-confirmation-required",
    );
    assert.deepEqual(harness.stores.local.privacyVault, firstRecord);

    const replacementPhrase = different === PHRASE
      ? privacyCrypto.generatePrivacyRecoveryPhrase()
      : different;
    await assert.rejects(
      recovery.restorePrivacyRecovery({
        requestId: "00000000-0000-4000-8000-000000000106",
        phrase: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon",
        password: PASSWORD,
        replaceExisting: true,
        backupConfirmed: true,
        lossConfirmed: true,
      }, dependencies),
      (error: unknown) =>
        error instanceof recovery.PrivacyRecoveryError &&
        error.code === "invalid-request",
    );
    assert.deepEqual(harness.stores.local.privacyVault, firstRecord);

    await assert.rejects(
      recovery.restorePrivacyRecovery({
        requestId: "00000000-0000-4000-8000-000000000107",
        phrase: replacementPhrase,
        password: PASSWORD,
        replaceExisting: true,
        backupConfirmed: true,
        lossConfirmed: true,
      }, {
        ...dependencies,
        deletePrivacyOperationsDatabase: async () => undefined,
        deletePrivacyCommitmentsDatabase: async () => {
          throw new Error("blocked");
        },
      }),
      (error: unknown) =>
        error instanceof recovery.PrivacyRecoveryError &&
        error.code === "recovery-unavailable",
    );
    assert.deepEqual(harness.stores.local.privacyVault, firstRecord);

    const deleted: string[] = [];
    const replaced = await recovery.restorePrivacyRecovery({
      requestId: "00000000-0000-4000-8000-000000000105",
      phrase: replacementPhrase,
      password: PASSWORD,
      replaceExisting: true,
      backupConfirmed: true,
      lossConfirmed: true,
    }, {
      ...dependencies,
      deletePrivacyOperationsDatabase: async () => { deleted.push("operations"); },
      deletePrivacyCommitmentsDatabase: async () => { deleted.push("commitments"); },
      deletePrivacyWithdrawalsDatabase: async () => { deleted.push("withdrawals"); },
      deletePrivacyRagequitsDatabase: async () => { deleted.push("ragequits"); },
      deletePrivacyPortfolioDatabase: async () => { deleted.push("portfolio"); },
    });
    assert.deepEqual(replaced, { status: "restored" });
    assert.deepEqual(deleted, ["operations", "commitments", "withdrawals", "ragequits", "portfolio"]);
    const revealed = await recovery.revealPrivacyRecovery(PASSWORD, dependencies);
    assert.equal(revealed.phrase, replacementPhrase);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});

test("restore accepts every custody wallet type", async () => {
  for (const type of ["bankr", "privateKey", "seedPhrase", "ledger"] as const) {
    const selected = account(type);
    const harness = createChromeStorageHarness({
      local: { accounts: [selected] },
      sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
    });
    const session = await masterSession();
    try {
      const recovery = await import("../../src/chrome/privacy/recovery/operations");
      const dependencies = {
        getActiveAccount: async () => selected,
        verifyMasterPassword: async () => true,
      };
      assert.deepEqual(await recovery.restorePrivacyRecovery({
        requestId: `00000000-0000-4000-8000-00000000020${
          type === "bankr" ? 1 : type === "privateKey" ? 2 : type === "seedPhrase" ? 3 : 4
        }`,
        phrase: PHRASE,
        password: PASSWORD,
        replaceExisting: false,
        backupConfirmed: false,
        lossConfirmed: false,
      }, dependencies), { status: "restored" });
      assert.equal(
        (await recovery.revealPrivacyRecovery(PASSWORD, dependencies)).phrase,
        PHRASE,
      );
    } finally {
      session.clearInMemoryAuthCache();
      harness.restore();
    }
  }
});

test("agent and active impersonator sessions cannot export or restore Shield recovery", async () => {
  const selected = account("impersonator");
  const harness = createChromeStorageHarness({
    local: { accounts: [selected] },
    sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
  });
  const session = await masterSession();
  try {
    const recovery = await import("../../src/chrome/privacy/recovery/operations");
    const dependencies = {
      getActiveAccount: async () => selected,
      verifyMasterPassword: async () => true,
    };
    await assert.rejects(
      recovery.restorePrivacyRecovery({
        requestId: "00000000-0000-4000-8000-000000000104",
        phrase: PHRASE,
        password: PASSWORD,
        replaceExisting: false,
        backupConfirmed: false,
        lossConfirmed: false,
      }, dependencies),
      (error: unknown) =>
        error instanceof recovery.PrivacyRecoveryError &&
        error.code === "account-unavailable",
    );

    session.setCachedPasswordType("agent");
    await assert.rejects(
      recovery.revealPrivacyRecovery(PASSWORD, dependencies),
      (error: unknown) =>
        error instanceof recovery.PrivacyRecoveryError &&
        error.code === "auth-required",
    );
    assert.equal(harness.stores.local.privacyVault, undefined);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});
