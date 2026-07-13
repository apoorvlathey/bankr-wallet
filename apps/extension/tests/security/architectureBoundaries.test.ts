import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("passkey codec, crypto, repository, and facade keep one-way dependencies", async () => {
  const [record, wrapping, repository, facade] = await Promise.all([
    readChromeModule("passkey/record.ts"),
    readChromeModule("passkey/keyWrapping.ts"),
    readChromeModule("passkey/repository.ts"),
    readChromeModule("passkeyUnlockCrypto.ts"),
  ]);

  for (const [name, source] of [
    ["record codec", record],
    ["key wrapping", wrapping],
  ] as const) {
    assert.doesNotMatch(
      source,
      /from ["']\.\.\/(?:sessionCache|authHandlers|storageLock)["']|from ["']\.\/repository["']/,
    );
    assert.doesNotMatch(source, /chrome\.storage|chrome\.runtime/, name);
  }

  assert.match(repository, /from ["'].\/record["']/);
  assert.doesNotMatch(
    repository,
    /from ["']\.\.\/(?:sessionCache|authHandlers)["']|from ["']\.\/keyWrapping["']/,
  );
  assert.doesNotMatch(repository, /crypto\.subtle|crypto\.getRandomValues/);

  assert.match(facade, /Compatibility facade/);
  assert.doesNotMatch(facade, /\b(?:async )?function\b|chrome\.|crypto\.subtle/);
  assert.match(facade, /from ["'].\/passkey\/record["']/);
  assert.match(facade, /from ["'].\/passkey\/keyWrapping["']/);
  assert.match(facade, /from ["'].\/passkey\/repository["']/);
});

test("private-key vault cryptography is storage- and session-independent", async () => {
  const [cryptoSource, facadeSource, cryptoModule, facade] = await Promise.all([
    readChromeModule("privateKeyVaultCrypto.ts"),
    readChromeModule("vaultCrypto.ts"),
    import("../../src/chrome/privateKeyVaultCrypto"),
    import("../../src/chrome/vaultCrypto"),
  ]);

  assert.doesNotMatch(
    cryptoSource,
    /chrome\.|from ["'].\/(?:sessionCache|accountStorage|storageLock|masterAuthorization)["']/,
  );
  assert.match(facadeSource, /from ["'].\/privateKeyVaultCrypto["']/);
  for (const name of [
    "encryptPrivateKey",
    "decryptPrivateKey",
    "isVaultKeyEncrypted",
    "encryptPrivateKeyWithVaultKey",
    "decryptPrivateKeyWithVaultKey",
  ] as const) {
    assert.equal(facade[name], cryptoModule[name], name);
  }
});

test("the background router delegates seed operations to focused handlers", async () => {
  const [background, handlers] = await Promise.all([
    readChromeModule("background.ts"),
    readChromeModule("mnemonic/accountHandlers.ts"),
  ]);
  assert.match(
    handlers,
    /import \{ resolveMasterMnemonicAccess \} from ["'].\/masterAccess["']/,
  );
  assert.match(
    background,
    /import \{ previewSeedAddresses \} from ["'].\/mnemonic\/addressPreview["']/,
  );
  assert.doesNotMatch(
    background,
    /async function resolveMasterMnemonicAccess\(/,
  );
  assert.match(
    background,
    /case "previewSeedAddresses": \{\s*void previewSeedAddresses\(message\)\.then\(sendResponse\);\s*return true;/,
  );
  assert.match(
    background,
    /case "addSeedPhraseGroup": \{\s*void addSeedPhraseGroup\(message\)\.then\(sendResponse\);\s*return true;/,
  );
  assert.match(
    background,
    /case "deriveSeedAccount": \{\s*void deriveSeedAccounts\(message\)\.then\(sendResponse\);\s*return true;/,
  );
  assert.doesNotMatch(background, /findImportableSeedCandidates|storeMnemonic\(/);
});

test("the root keeps only the stable mnemonic storage facade", async () => {
  const entries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  const mnemonicRootFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(?:mnemonic|seed|masterMnemonic)/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(mnemonicRootFiles, ["mnemonicStorage.ts"]);
});
