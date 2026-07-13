import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("account root clutter is limited to the stable facade", async () => {
  const entries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  assert.deepEqual(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          /^(?:account|bankrAccount|localAccount|seedAccount|seedGroup)/.test(
            entry.name,
          ) &&
          /Storage\.ts$/.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort(),
    ["accountStorage.ts"],
  );
  assert.match(await readChromeModule("accounts/README.md"), /Review in dependency order/);
});

test("account storage keeps a stable facade over one-way ownership layers", async () => {
  const [
    facadeSource,
    repositorySource,
    selectionSource,
    bankrSource,
    localSource,
    seedSource,
    groupsSource,
    authorizationSource,
  ] = await Promise.all([
    readChromeModule("accountStorage.ts"),
    readChromeModule("accounts/repository.ts"),
    readChromeModule("accounts/selectionStorage.ts"),
    readChromeModule("accounts/bankrStorage.ts"),
    readChromeModule("accounts/localStorage.ts"),
    readChromeModule("accounts/seedStorage.ts"),
    readChromeModule("accounts/seedGroupStorage.ts"),
    readChromeModule("accounts/authorization.ts"),
  ]);

  assert.match(facadeSource, /Stable account-storage facade/);
  assert.doesNotMatch(facadeSource, /chrome\.|\b(?:async )?function\b/);

  assert.doesNotMatch(
    repositorySource,
    /from ["'].\/(?:selectionStorage|bankrStorage|localStorage|seedStorage|seedGroupStorage)["']/,
  );
  assert.doesNotMatch(repositorySource, /masterAuthorization/);
  for (const source of [selectionSource, bankrSource, localSource, seedSource]) {
    assert.match(source, /from ["'].\/repository["']/);
    assert.match(source, /from ["'].\/authorization["']/);
  }
  assert.doesNotMatch(
    selectionSource,
    /from ["'].\/(?:bankrStorage|localStorage|seedStorage|seedGroupStorage)["']/,
  );
  assert.doesNotMatch(
    groupsSource,
    /from ["'].\/(?:selectionStorage|bankrStorage|localStorage|seedStorage)["']/,
  );
  assert.match(authorizationSource, /from ["']\.\.\/masterAuthorization["']/);
  assert.doesNotMatch(authorizationSource, /chrome\.|storageLock/);
});

test("account storage facade preserves every implementation export identity", async () => {
  const [facade, repository, selection, bankr, local, seed, groups] =
    await Promise.all([
      import("../../src/chrome/accountStorage"),
      import("../../src/chrome/accounts/repository"),
      import("../../src/chrome/accounts/selectionStorage"),
      import("../../src/chrome/accounts/bankrStorage"),
      import("../../src/chrome/accounts/localStorage"),
      import("../../src/chrome/accounts/seedStorage"),
      import("../../src/chrome/accounts/seedGroupStorage"),
    ]);

  for (const implementation of [
    repository,
    selection,
    bankr,
    local,
    seed,
    groups,
  ]) {
    for (const [name, value] of Object.entries(implementation)) {
      if (
        name === "ACCOUNTS_LOCK_KEY" ||
        name === "ACCOUNTS_STORAGE_KEY" ||
        name === "saveAccounts" ||
        name === "clearAccountSelection" ||
        name === "repairSelectionAfterRemoval"
      ) {
        continue;
      }
      assert.equal(facade[name], value, name);
    }
  }
});
