import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as authorityFacade from "../../src/chrome/delegatedAuthorityPolicy";
import * as handlerFacade from "../../src/chrome/delegationHandlers";
import * as storageFacade from "../../src/chrome/delegationStorage";
import * as authority from "../../src/chrome/delegation/authorityPolicy";
import * as probe from "../../src/chrome/delegation/probe";
import * as revoke from "../../src/chrome/delegation/revokeRequest";
import * as set from "../../src/chrome/delegation/setRequest";
import * as status from "../../src/chrome/delegation/status";
import * as storage from "../../src/chrome/delegation/storage";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("delegation facades preserve every public runtime identity", () => {
  assert.equal(handlerFacade.handleGetDelegationStatus, status.handleGetDelegationStatus);
  assert.equal(handlerFacade.handleProbeDelegateContract, probe.handleProbeDelegateContract);
  assert.equal(handlerFacade.handleInitiateSetDelegation, set.handleInitiateSetDelegation);
  assert.equal(handlerFacade.handleInitiateRevokeDelegation, revoke.handleInitiateRevokeDelegation);
  assert.equal(handlerFacade.removeAllDelegatesForAccount, storage.removeAllDelegatesForAccount);

  assert.equal(storageFacade.getCustomDelegate, storage.getCustomDelegate);
  assert.equal(storageFacade.setCustomDelegate, storage.setCustomDelegate);
  assert.equal(storageFacade.removeCustomDelegate, storage.removeCustomDelegate);
  assert.equal(storageFacade.getAllDelegatesForAccount, storage.getAllDelegatesForAccount);
  assert.equal(storageFacade.removeAllDelegatesForAccount, storage.removeAllDelegatesForAccount);

  assert.equal(
    authorityFacade.assertAutomaticEip7702AuthorizationAllowed,
    authority.assertAutomaticEip7702AuthorizationAllowed,
  );
  assert.equal(
    authorityFacade.assertDelegatedAuthorityMasterAuthorization,
    authority.assertDelegatedAuthorityMasterAuthorization,
  );
  assert.equal(
    authorityFacade.captureDelegatedAuthorityMasterAuthorization,
    authority.captureDelegatedAuthorityMasterAuthorization,
  );
  assert.equal(
    authorityFacade.captureEip7702DelegationAuthorization,
    authority.captureEip7702DelegationAuthorization,
  );
  assert.equal(
    authorityFacade.requiresMasterForEip7702Delegation,
    authority.requiresMasterForEip7702Delegation,
  );
  assert.equal(
    authorityFacade.CUSTOM_DELEGATE_REAUTHORIZATION_ERROR,
    authority.CUSTOM_DELEGATE_REAUTHORIZATION_ERROR,
  );
  assert.equal(
    authorityFacade.DELEGATED_AUTHORITY_MASTER_REQUIRED_ERROR,
    authority.DELEGATED_AUTHORITY_MASTER_REQUIRED_ERROR,
  );
});

test("delegation root paths contain no policy, storage, or authorization effects", async () => {
  for (const path of [
    "delegationHandlers.ts",
    "delegationStorage.ts",
    "delegatedAuthorityPolicy.ts",
  ]) {
    const text = await source(path);
    assert.ok(text.split("\n").length <= 15, path);
    assert.doesNotMatch(
      text,
      /\b(?:function|chrome\.|withStorageLock|savePendingTxRequest|resolvePasswordType)\b/,
      path,
    );
  }
});

test("delegation dependency direction keeps revoke free of grant expansion", async () => {
  const construction = await source("delegation/requestConstruction.ts");
  assert.doesNotMatch(
    construction,
    /\b(?:chrome\.|withStorageLock|savePendingTxRequest|resolvePasswordType|probeErc7821Support)\b/,
  );

  const setSource = await source("delegation/setRequest.ts");
  for (const dependency of [
    "authorityPolicy",
    "requestConstruction",
    "requestQueue",
  ]) {
    assert.match(setSource, new RegExp(`from ["']\\./${dependency}["']`));
  }
  assert.match(setSource, /probeErc7821Support/);

  const revokeSource = await source("delegation/revokeRequest.ts");
  assert.match(revokeSource, /from ["']\.\/requestConstruction["']/);
  assert.match(revokeSource, /from ["']\.\/requestQueue["']/);
  assert.doesNotMatch(
    revokeSource,
    /authorityPolicy|resolvePasswordType|probeErc7821Support/,
  );

  const storageSource = await source("delegation/storage.ts");
  assert.match(storageSource, /withStorageLock/);
  assert.match(storageSource, /local:\$\{CUSTOM_DELEGATES_STORAGE_KEY\}/);
});

test("delegation modules remain independently auditable", async () => {
  const budgets: Record<string, number> = {
    "delegation/types.ts": 40,
    "delegation/constants.ts": 15,
    "delegation/storage.ts": 105,
    "delegation/authorityPolicy.ts": 75,
    "delegation/status.ts": 70,
    "delegation/probe.ts": 60,
    "delegation/requestConstruction.ts": 55,
    "delegation/requestQueue.ts": 60,
    "delegation/setRequest.ts": 155,
    "delegation/revokeRequest.ts": 75,
  };
  for (const [path, maximum] of Object.entries(budgets)) {
    const lines = (await source(path)).split("\n").length;
    assert.ok(lines <= maximum, `${path}: ${lines} > ${maximum}`);
  }
});
