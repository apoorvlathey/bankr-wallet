// Mnemonic vault folder/facade architecture.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FROZEN_LEGACY_SECRET_FIXTURE } from "../fixtures/legacySecretVaults";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("mnemonic record, crypto, repository, coordination, and facade keep one-way boundaries", async () => {
  const [record, crypto, repository, operations, recovery, facade] =
    await Promise.all([
      readChromeModule("mnemonic/record.ts"),
      readChromeModule("mnemonic/crypto.ts"),
      readChromeModule("mnemonic/repository.ts"),
      readChromeModule("mnemonic/operations.ts"),
      readChromeModule("mnemonic/recovery.ts"),
      readChromeModule("mnemonicStorage.ts"),
    ]);

  assert.doesNotMatch(record, /chrome\.|crypto\.subtle|storageLock/);
  assert.match(crypto, /from ["'].\/record["']/);
  assert.doesNotMatch(
    crypto,
    /chrome\.storage|masterAuthorization|\.\/repository/,
  );
  assert.match(repository, /from ["'].\/record["']/);
  assert.doesNotMatch(
    repository,
    /crypto\.subtle|masterAuthorization|\.\/crypto/,
  );
  for (const source of [operations, recovery]) {
    assert.match(source, /from ["'].\/repository["']/);
    assert.match(source, /from ["'].\/crypto["']/);
    assert.doesNotMatch(source, /chrome\.storage|crypto\.subtle/);
  }

  assert.match(facade, /Compatibility facade/);
  assert.doesNotMatch(facade, /\b(?:async )?function\b|chrome\.|crypto\.subtle/);
  for (const moduleName of [
    "mnemonic/record",
    "mnemonic/repository",
    "mnemonic/operations",
    "mnemonic/recovery",
  ]) {
    assert.match(facade, new RegExp(`from ["']\\./${moduleName}["']`));
  }
});

test("mnemonic derivation, access, integrity, preview, and account orchestration have explicit boundaries", async () => {
  const [
    derivation,
    access,
    integrity,
    preview,
    persistence,
    handlers,
  ] = await Promise.all([
    readChromeModule("mnemonic/derivation.ts"),
    readChromeModule("mnemonic/masterAccess.ts"),
    readChromeModule("mnemonic/integrity.ts"),
    readChromeModule("mnemonic/addressPreview.ts"),
    readChromeModule("mnemonic/accountPersistence.ts"),
    readChromeModule("mnemonic/accountHandlers.ts"),
  ]);

  assert.doesNotMatch(
    derivation,
    /chrome\.|accountStorage|sessionCache|storageLock|mnemonicStorage|vaultCrypto/,
  );
  assert.match(access, /from ["'].\/recovery["']/);
  assert.match(access, /from ["'].\/repository["']/);
  assert.match(integrity, /from ["'].\/derivation["']/);
  assert.match(integrity, /from ["'].\/recovery["']/);
  assert.match(preview, /from ["'].\/masterAccess["']/);
  assert.match(preview, /from ["'].\/operations["']/);
  assert.match(preview, /from ["'].\/derivation["']/);
  assert.doesNotMatch(preview, /storeMnemonic|removeMnemonic/);
  assert.match(persistence, /from ["'].\/masterAccess["']/);
  assert.match(persistence, /from ["'].\/derivation["']/);
  assert.match(handlers, /from ["'].\/accountPersistence["']/);
  assert.match(handlers, /from ["'].\/masterAccess["']/);
  assert.match(handlers, /from ["'].\/operations["']/);

  for (const source of [
    derivation,
    access,
    integrity,
    preview,
    persistence,
    handlers,
  ]) {
    assert.doesNotMatch(source, /from ["']\.\.\/mnemonicStorage["']/);
  }
});

test("mnemonic compatibility facade preserves direct export identity", async () => {
  const [facade, repository, operations, recovery] = await Promise.all([
    import("../../src/chrome/mnemonicStorage"),
    import("../../src/chrome/mnemonic/repository"),
    import("../../src/chrome/mnemonic/operations"),
    import("../../src/chrome/mnemonic/recovery"),
  ]);

  assert.equal(facade.loadMnemonicVault, repository.loadMnemonicVault);
  assert.equal(facade.withMnemonicVaultLock, repository.withMnemonicVaultLock);
  assert.equal(facade.storeMnemonic, operations.storeMnemonic);
  assert.equal(facade.getMnemonic, operations.getMnemonic);
  assert.equal(facade.removeMnemonic, operations.removeMnemonic);
  assert.equal(
    facade.unlockMnemonicKeyWithPassword,
    recovery.unlockMnemonicKeyWithPassword,
  );
  assert.equal(
    facade.prepareMnemonicKeyVault,
    recovery.prepareMnemonicKeyVault,
  );
  assert.equal(
    facade.computeReEncryptedMnemonicVault,
    recovery.computeReEncryptedMnemonicVault,
  );
});

test("mnemonic record codec accepts the frozen released V1 shape and rejects corruption", async () => {
  const { parseMnemonicVault } = await import(
    "../../src/chrome/mnemonic/record"
  );
  assert.deepEqual(
    parseMnemonicVault(
      structuredClone(FROZEN_LEGACY_SECRET_FIXTURE.mnemonicVault),
    ),
    FROZEN_LEGACY_SECRET_FIXTURE.mnemonicVault,
  );
  assert.equal(parseMnemonicVault(null), null);
  assert.throws(
    () => parseMnemonicVault({ version: 1 }),
    /Mnemonic vault is malformed/,
  );
  assert.throws(
    () =>
      parseMnemonicVault({
        version: 2,
        keyId: "",
        revision: 0,
        masterWrappedKey: {},
        entries: [],
      }),
    /unsupported or corrupt format/,
  );
});

test("V2 mnemonic ciphertext and key checks remain bound to their key and group AAD", async () => {
  const [generalCrypto, mnemonicCrypto] = await Promise.all([
    import("../../src/chrome/crypto"),
    import("../../src/chrome/mnemonic/crypto"),
  ]);
  const key = await generalCrypto.importVaultKey(
    generalCrypto.generateVaultKey(),
  );
  const otherKey = await generalCrypto.importVaultKey(
    generalCrypto.generateVaultKey(),
  );
  const mnemonic =
    "test test test test test test test test test test test junk";
  const encrypted = await mnemonicCrypto.encryptMnemonicWithKey(
    mnemonic,
    "seed-group-a",
    key,
    "mnemonic-key-a",
  );
  assert.equal(
    await mnemonicCrypto.decryptMnemonicWithKey(
      encrypted,
      "seed-group-a",
      key,
      "mnemonic-key-a",
    ),
    mnemonic,
  );
  await assert.rejects(
    mnemonicCrypto.decryptMnemonicWithKey(
      encrypted,
      "seed-group-b",
      key,
      "mnemonic-key-a",
    ),
  );
  await assert.rejects(
    mnemonicCrypto.decryptMnemonicWithKey(
      encrypted,
      "seed-group-a",
      key,
      "mnemonic-key-b",
    ),
  );

  const check = await mnemonicCrypto.createMnemonicKeyCheck(
    key,
    "mnemonic-key-a",
  );
  assert.equal(
    await mnemonicCrypto.verifyMnemonicKeyCheck(
      check,
      key,
      "mnemonic-key-a",
    ),
    true,
  );
  assert.equal(
    await mnemonicCrypto.verifyMnemonicKeyCheck(
      check,
      otherKey,
      "mnemonic-key-a",
    ),
    false,
  );
  assert.equal(
    await mnemonicCrypto.verifyMnemonicKeyCheck(
      check,
      key,
      "mnemonic-key-b",
    ),
    false,
  );
});
