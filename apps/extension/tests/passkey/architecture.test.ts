import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FROZEN_PASSKEY_FIXTURE } from "../fixtures/passkeyUpgradeRecords";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("passkey status, setup, hydration, removal, and facade keep focused boundaries", async () => {
  const [status, setup, hydration, removal, facade] = await Promise.all([
    readChromeModule("passkey/status.ts"),
    readChromeModule("passkey/setup.ts"),
    readChromeModule("passkey/hydration.ts"),
    readChromeModule("passkey/removal.ts"),
    readChromeModule("passkeyUnlock.ts"),
  ]);

  assert.doesNotMatch(
    status,
    /from ["'].\/(?:setup|hydration|removal)["']/,
  );
  assert.match(setup, /WALLET_SECRET_OPERATION_LOCK_KEY/);
  assert.match(setup, /withMnemonicVaultLock/);
  assert.match(setup, /mnemonicVault: preparedMnemonicVault/);
  assert.match(setup, /\[PASSKEY_UNLOCK_STORAGE_KEY\]: built\.record/);
  assert.doesNotMatch(
    hydration,
    /from ["'].\/(?:setup|removal)["']|from ["']\.\.\/storageLock["']/,
  );
  assert.match(removal, /validateGeneralVaultMasterRecovery/);
  assert.match(removal, /validateV2MnemonicMasterRecovery/);
  assert.match(removal, /WALLET_SECRET_OPERATION_LOCK_KEY/);
  assert.match(removal, /withMnemonicVaultLock/);

  assert.match(facade, /Compatibility facade/);
  assert.doesNotMatch(facade, /\b(?:async )?function\b|chrome\.|crypto\.subtle/);
  for (const moduleName of [
    "passkeyUnlockCrypto",
    "passkey/status",
    "passkey/setup",
    "passkey/hydration",
    "passkey/removal",
  ]) {
    assert.match(facade, new RegExp(`from ["']\\./${moduleName}["']`));
  }
});

test("passkey compatibility facade preserves every direct handler and validator identity", async () => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 60_000 },
  });
  try {
    const [facade, codec, status, setup, hydration, removal] = await Promise.all([
      import("../../src/chrome/passkeyUnlock"),
      import("../../src/chrome/passkeyUnlockCrypto"),
      import("../../src/chrome/passkey/status"),
      import("../../src/chrome/passkey/setup"),
      import("../../src/chrome/passkey/hydration"),
      import("../../src/chrome/passkey/removal"),
    ]);
    assert.equal(
      facade.isValidPasskeyCredentialPayload,
      codec.isValidPasskeyCredentialPayload,
    );
    assert.equal(
      facade.isValidPasskeyUnlockRecord,
      codec.isValidPasskeyUnlockRecord,
    );
    assert.equal(
      facade.handleGetPasskeyUnlockStatus,
      status.handleGetPasskeyUnlockStatus,
    );
    assert.equal(
      facade.handleVerifyPasskeySetupPassword,
      status.handleVerifyPasskeySetupPassword,
    );
    assert.equal(
      facade.handleCanSetupPasskeyUnlock,
      status.handleCanSetupPasskeyUnlock,
    );
    assert.equal(facade.handleSetupPasskeyUnlock, setup.handleSetupPasskeyUnlock);
    assert.equal(
      facade.handleSetupPasskeyUnlockWithPassword,
      setup.handleSetupPasskeyUnlockWithPassword,
    );
    assert.equal(facade.handleUnlockWithPasskey, hydration.handleUnlockWithPasskey);
    assert.equal(
      facade.handleRemovePasskeyUnlock,
      removal.handleRemovePasskeyUnlock,
    );
  } finally {
    chromeHarness.restore();
  }
});

test("status reads frozen V1/V2 records without mutation and advertises mnemonic capability only when matched", async () => {
  const chromeHarness = createChromeStorageHarness({
    local: { passkeyUnlock: structuredClone(FROZEN_PASSKEY_FIXTURE.v1) },
    sync: { autoLockTimeout: 60_000 },
  });
  try {
    const { handleGetPasskeyUnlockStatus } = await import(
      "../../src/chrome/passkey/status"
    );
    let status = await handleGetPasskeyUnlockStatus();
    assert.equal(status.configured, true);
    assert.equal(status.credentialId, FROZEN_PASSKEY_FIXTURE.v1.credentialId);
    assert.equal(status.mnemonicCapable, false);
    assert.deepEqual(chromeHarness.writes, []);

    chromeHarness.stores.local.passkeyUnlock = structuredClone(
      FROZEN_PASSKEY_FIXTURE.v2,
    );
    chromeHarness.stores.local.mnemonicVault = {
      version: 2,
      keyId: FROZEN_PASSKEY_FIXTURE.v2.mnemonicKeyId,
      revision: 0,
      masterWrappedKey: { ciphertext: "x", iv: "x", salt: "x" },
      keyCheck: {
        version: 2,
        scheme: "mnemonic-key-check",
        ciphertext: "x",
        iv: "x",
      },
      entries: [],
    };
    status = await handleGetPasskeyUnlockStatus();
    assert.equal(status.configured, true);
    assert.equal(status.mnemonicCapable, true);
    assert.deepEqual(chromeHarness.writes, []);

    (chromeHarness.stores.local.mnemonicVault as { keyId: string }).keyId =
      "different-key";
    status = await handleGetPasskeyUnlockStatus();
    assert.equal(status.mnemonicCapable, false);
    assert.deepEqual(chromeHarness.writes, []);
  } finally {
    chromeHarness.restore();
  }
});
