import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as authorizationFacade from "../../src/chrome/masterAuthorization";
import * as authorization from "../../src/chrome/secrets/masterAuthorization";
import * as revealFacade from "../../src/chrome/secretRevealHandlers";
import * as revealHandlers from "../../src/chrome/secrets/revealHandlers";

test("secret facades preserve every implementation export identity", () => {
  assert.equal(
    authorizationFacade.assertCurrentMasterAuthorization,
    authorization.assertCurrentMasterAuthorization,
  );
  assert.equal(
    authorizationFacade.hasCurrentMasterAuthorization,
    authorization.hasCurrentMasterAuthorization,
  );
  assert.equal(
    authorizationFacade.STALE_MASTER_AUTHORIZATION_ERROR,
    authorization.STALE_MASTER_AUTHORIZATION_ERROR,
  );
  assert.equal(
    revealFacade.handleRevealPrivateKey,
    revealHandlers.handleRevealPrivateKey,
  );
  assert.equal(
    revealFacade.handleRevealSeedPhrase,
    revealHandlers.handleRevealSeedPhrase,
  );
});

test("secret release keeps authorization, lock, read, and recheck visible", async () => {
  const source = await readFile(
    new URL("../../src/chrome/secrets/revealHandlers.ts", import.meta.url),
    "utf8",
  );
  const authorization = source.indexOf(
    "resolveExplicitMasterRevealAuthorization(",
  );
  const lock = source.indexOf(
    "withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY",
    authorization,
  );
  const secretRead = source.indexOf("getMnemonic(seedGroupId", lock);
  const recheck = source.indexOf(
    "hasCurrentMasterAuthorization(expectedAuthEpoch)",
    secretRead,
  );
  const response = source.indexOf(
    "sendResponse({ success: true, mnemonic })",
    recheck,
  );
  assert.ok(
    authorization >= 0 &&
      authorization < lock &&
      lock < secretRead &&
      secretRead < recheck &&
      recheck < response,
  );
  assert.match(source, /passwordType === "agent"/);
  assert.match(source, /verifyMasterPassword\(password\)/);
});

test("secret implementations remain audit-sized and facades own no policy", async () => {
  for (const file of ["masterAuthorization.ts", "secretRevealHandlers.ts"]) {
    const source = await readFile(
      new URL(`../../src/chrome/${file}`, import.meta.url),
      "utf8",
    );
    assert.ok(source.split("\n").length <= 15);
    assert.doesNotMatch(source, /withStorageLock|verifyMasterPassword|getMnemonic/);
  }
  for (const file of ["masterAuthorization.ts", "revealHandlers.ts"]) {
    const source = await readFile(
      new URL(`../../src/chrome/secrets/${file}`, import.meta.url),
      "utf8",
    );
    assert.ok(source.split("\n").length <= 190, `${file} is oversized`);
    assert.doesNotMatch(source, /chrome\.runtime|sendMessage\(/);
  }
});
