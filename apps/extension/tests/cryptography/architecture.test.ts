import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import * as cryptoFacade from "../../src/chrome/crypto";
import * as utilsFacade from "../../src/chrome/cryptoUtils";
import * as base64 from "../../src/chrome/cryptography/base64";
import * as credentialStorage from "../../src/chrome/cryptography/credentialStorage";
import * as passwordCipher from "../../src/chrome/cryptography/passwordCipher";
import * as passwordKey from "../../src/chrome/cryptography/passwordKey";
import * as vaultKey from "../../src/chrome/cryptography/vaultKey";

test("cryptography facades preserve every implementation export identity", () => {
  assert.equal(cryptoFacade.encrypt, passwordCipher.encrypt);
  assert.equal(cryptoFacade.decrypt, passwordCipher.decrypt);
  assert.equal(cryptoFacade.generateVaultKey, vaultKey.generateVaultKey);
  assert.equal(cryptoFacade.encryptVaultKey, vaultKey.encryptVaultKey);
  assert.equal(cryptoFacade.tryDecryptVaultKey, vaultKey.tryDecryptVaultKey);
  assert.equal(cryptoFacade.importVaultKey, vaultKey.importVaultKey);
  assert.equal(cryptoFacade.encryptWithVaultKey, vaultKey.encryptWithVaultKey);
  assert.equal(cryptoFacade.decryptWithVaultKey, vaultKey.decryptWithVaultKey);
  assert.equal(
    cryptoFacade.loadDecryptedApiKey,
    credentialStorage.loadDecryptedApiKey,
  );
  assert.equal(
    cryptoFacade.hasEncryptedApiKey,
    credentialStorage.hasEncryptedApiKey,
  );
  assert.equal(
    cryptoFacade.hasVaultKeySystem,
    credentialStorage.hasVaultKeySystem,
  );
  assert.equal(
    cryptoFacade.isAgentPasswordEnabled,
    credentialStorage.isAgentPasswordEnabled,
  );

  for (const name of [
    "arrayBufferToBase64",
    "base64ToArrayBuffer",
    "base64ToUint8Array",
    "bytesToHex",
    "decodeBase64Bounded",
    "decodeBase64Exact",
  ] as const) {
    assert.equal(utilsFacade[name], base64[name], name);
  }
  assert.equal(utilsFacade.deriveKey, passwordKey.deriveKey);
  assert.equal(utilsFacade.PBKDF2_ITERATIONS, 600_000);
  assert.equal(utilsFacade.SALT_LENGTH, 16);
  assert.equal(utilsFacade.IV_LENGTH, 12);
});

test("root cryptography paths are policy-free compatibility facades", async () => {
  for (const file of ["crypto.ts", "cryptoUtils.ts"]) {
    const source = await readFile(
      new URL(`../../src/chrome/${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /crypto\.subtle|chrome\.storage|PBKDF2\s*\(/);
    assert.match(source, /cryptography\//);
    assert.ok(source.split("\n").length <= 30);
  }
});

test("cryptography implementations are audit-sized with one-way ownership", async () => {
  const directory = new URL("../../src/chrome/cryptography/", import.meta.url);
  const entries = await readdir(directory, { withFileTypes: true });
  const implementationFiles = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".ts"),
  );
  for (const entry of implementationFiles) {
    const source = await readFile(new URL(entry.name, directory), "utf8");
    assert.ok(
      source.split("\n").length <= 180,
      `${entry.name} exceeds the cryptography audit ceiling`,
    );
    assert.doesNotMatch(
      source,
      /from ["']\.\.\/(auth|passkey|mnemonic|vault|transactions)\//,
      `${entry.name} reaches outward into a policy domain`,
    );
  }

  const base64Source = await readFile(new URL("base64.ts", directory), "utf8");
  const typesSource = await readFile(new URL("types.ts", directory), "utf8");
  assert.doesNotMatch(base64Source, /^import /m);
  assert.doesNotMatch(typesSource, /^import /m);
});

test("bounded codecs reject malformed and oversized persisted fields", () => {
  const exact = new Uint8Array([1, 2, 3]);
  const encoded = base64.arrayBufferToBase64(exact.buffer);
  assert.deepEqual(base64.decodeBase64Exact(encoded, 3), exact);
  assert.equal(base64.decodeBase64Exact(encoded, 2), null);
  assert.equal(base64.decodeBase64Exact("not base64", 3), null);
  assert.equal(base64.decodeBase64Bounded("", 1, 8), null);
  assert.equal(base64.decodeBase64Bounded(encoded, 4, 8), null);
  assert.equal(base64.decodeBase64Bounded(encoded.repeat(8), 1, 8), null);
});
