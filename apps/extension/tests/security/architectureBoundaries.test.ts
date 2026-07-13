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
    readChromeModule("vault/entryCrypto.ts"),
    readChromeModule("vaultCrypto.ts"),
    import("../../src/chrome/vault/entryCrypto"),
    import("../../src/chrome/vaultCrypto"),
  ]);

  assert.doesNotMatch(
    cryptoSource,
    /chrome\.|from ["']\.\.\/(?:sessionCache|accountStorage|storageLock|masterAuthorization)["']/,
  );
  assert.match(facadeSource, /from ["'].\/vault\/entryCrypto["']/);
  assert.match(facadeSource, /from ["'].\/vault\/operations["']/);
  assert.match(facadeSource, /from ["'].\/vault\/repository["']/);
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
  const [background, accountRouter, handlers] = await Promise.all([
    readChromeModule("background/composition/accountRoutes.ts"),
    readChromeModule("background/accountManagementRouter.ts"),
    readChromeModule("mnemonic/accountHandlers.ts"),
  ]);
  assert.match(
    handlers,
    /import \{ resolveMasterMnemonicAccess \} from ["'].\/masterAccess["']/,
  );
  assert.match(
    background,
    /import \{ previewSeedAddresses \} from ["']\.\.\/\.\.\/mnemonic\/addressPreview["']/,
  );
  assert.doesNotMatch(
    background,
    /async function resolveMasterMnemonicAccess\(/,
  );
  assert.match(
    accountRouter,
    /case "previewSeedAddresses":\s*void dependencies\.previewSeedAddresses\(message\)\.then\(sendResponse\);\s*return HANDLED_ASYNC;/,
  );
  assert.match(
    accountRouter,
    /case "addSeedPhraseGroup":\s*void dependencies\.addSeedPhraseGroup\(message\)\.then\(sendResponse\);\s*return HANDLED_ASYNC;/,
  );
  assert.match(
    accountRouter,
    /case "deriveSeedAccount":\s*void dependencies\.deriveSeedAccounts\(message\)\.then\(sendResponse\);\s*return HANDLED_ASYNC;/,
  );
  assert.doesNotMatch(
    background,
    /case "(?:previewSeedAddresses|addSeedPhraseGroup|deriveSeedAccount)":/,
  );

  const compositionStart = background.indexOf(
    "createBackgroundAccountManagementMessageRouter({",
  );
  const compositionEnd = background.indexOf(
    "createBackgroundSecretManagementMessageRouter({",
    compositionStart,
  );
  assert.ok(compositionStart >= 0 && compositionEnd > compositionStart);
  const composition = background.slice(compositionStart, compositionEnd);
  assert.match(
    composition,
    /previewSeedAddresses,[\s\S]*addSeedPhraseGroup,[\s\S]*deriveSeedAccounts,/,
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
