import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import * as facade from "../../src/chrome/vaultCrypto";
import * as entryCrypto from "../../src/chrome/vault/entryCrypto";
import * as operations from "../../src/chrome/vault/operations";
import * as recordCodec from "../../src/chrome/vault/recordCodec";
import * as repository from "../../src/chrome/vault/repository";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("vaultCrypto preserves every stable runtime export identity", () => {
  for (const name of [
    "encryptPrivateKey",
    "decryptPrivateKey",
    "isVaultKeyEncrypted",
    "encryptPrivateKeyWithVaultKey",
    "decryptPrivateKeyWithVaultKey",
  ] as const) {
    assert.equal(facade[name], entryCrypto[name], name);
  }
  for (const name of [
    "addKeyToVault",
    "removeKeyFromVault",
    "decryptAllKeys",
    "reEncryptVault",
    "computeReEncryptedVault",
    "computeVaultKeyMigratedVault",
  ] as const) {
    assert.equal(facade[name], operations[name], name);
  }
  for (const name of [
    "loadVault",
    "saveVault",
    "clearVault",
    "hasVaultEntries",
    "VAULT_STORAGE_KEY",
  ] as const) {
    assert.equal(facade[name], repository[name], name);
  }
});

test("released storage key and AES-GCM parameter shape remain frozen", async () => {
  assert.equal(repository.VAULT_STORAGE_KEY, "pkVault");
  const repositorySource = await source("vault/repository.ts");
  assert.match(repositorySource, /VAULT_STORAGE_KEY = "pkVault"/);
  assert.doesNotMatch(repositorySource, /pkVaultV2|privateKeyVault/);

  const cryptoSource = await source("vault/entryCrypto.ts");
  assert.match(cryptoSource, /deriveKey\(password, salt\)/);
  assert.match(cryptoSource, /keystore\.salt === ""/);
  // Released private-key records predate AAD. Adding it would make every
  // existing password/vault-key ciphertext undecryptable after auto-update.
  assert.doesNotMatch(cryptoSource, /additionalData/);
});

test("vault dependencies are one-way and every implementation is audit-sized", async () => {
  const budgets: Record<string, number> = {
    "vault/entryCrypto.ts": 140,
    "vault/accountIntegrity.ts": 70,
    "vault/generalIntegrity.ts": 180,
    "vault/recordCodec.ts": 110,
    "vault/repository.ts": 50,
    "vault/operations.ts": 280,
  };
  for (const [path, maximum] of Object.entries(budgets)) {
    const moduleSource = await source(path);
    assert.ok(moduleSource.split("\n").length <= maximum, path);
    assert.doesNotMatch(moduleSource, /from ["']\.\.\/vaultCrypto["']/);
  }

  const cryptoSource = await source("vault/entryCrypto.ts");
  assert.doesNotMatch(cryptoSource, /chrome\.|sessionCache|storageLock/);
  const repositorySource = await source("vault/repository.ts");
  assert.match(repositorySource, /from ["']\.\/recordCodec["']/);
  assert.doesNotMatch(repositorySource, /entryCrypto|sessionCache|masterAuthorization/);
  assert.equal(recordCodec.RELEASED_VAULT_VERSION, 1);
  const operationsSource = await source("vault/operations.ts");
  assert.match(operationsSource, /from ["']\.\/entryCrypto["']/);
  assert.match(operationsSource, /from ["']\.\/repository["']/);
  assert.match(operationsSource, /WALLET_SECRET_STORAGE_LOCK_KEY/);
});

test("root vault implementation clutter is removed", async () => {
  const entries = await readdir(CHROME_ROOT, { withFileTypes: true });
  const roots = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(?:privateKeyVaultCrypto|privateKeyIntegrity|generalVaultIntegrity|vaultCrypto)\.ts$/.test(
          entry.name,
        ),
    )
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(roots, ["vaultCrypto.ts"]);
});
