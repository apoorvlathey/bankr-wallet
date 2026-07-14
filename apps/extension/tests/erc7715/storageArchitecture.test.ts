import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("ERC-7715 persistence separates types, prompts, grants, and results", async () => {
  const [facade, types, pending, grants, results] = await Promise.all([
    readChromeModule("pendingErc7715PermissionStorage.ts"),
    readChromeModule("erc7715/types.ts"),
    readChromeModule("erc7715/pendingRequestStorage.ts"),
    readChromeModule("erc7715/grantStorage.ts"),
    readChromeModule("erc7715/resultStorage.ts"),
  ]);

  assert.match(facade, /Stable facade/);
  assert.doesNotMatch(facade, /chrome\.|\b(?:async )?function\b/);
  assert.doesNotMatch(types, /chrome\.|from ["'].\/(?:sessionCache|localSigner|storageLock)["']/);
  assert.doesNotMatch(pending, /masterAuthorization|localSigner|walletConnect/);
  assert.match(grants, /from ["']\.\.\/masterAuthorization["']/);
  assert.doesNotMatch(grants, /localSigner|walletConnect/);
  assert.doesNotMatch(results, /masterAuthorization|localSigner|erc7715GrantStorage/);
  assert.doesNotMatch(results, /setTimeout|requestExecutionPermissions timeout/);
});

test("ERC-7715 storage facade preserves every public runtime identity", async () => {
  const [facade, types, pending, grants, results] = await Promise.all([
    import("../../src/chrome/pendingErc7715PermissionStorage"),
    import("../../src/chrome/erc7715/types"),
    import("../../src/chrome/erc7715/pendingRequestStorage"),
    import("../../src/chrome/erc7715/grantStorage"),
    import("../../src/chrome/erc7715/resultStorage"),
  ]);
  const expected = {
    ERC7715_PERMISSION_RESULT_PREFIX: types.ERC7715_PERMISSION_RESULT_PREFIX,
    getPendingErc7715PermissionRequestById:
      pending.getPendingErc7715PermissionRequestById,
    getPendingErc7715PermissionRequests:
      pending.getPendingErc7715PermissionRequests,
    removePendingErc7715PermissionRequest:
      pending.removePendingErc7715PermissionRequest,
    savePendingErc7715PermissionRequest:
      pending.savePendingErc7715PermissionRequest,
    commitErc7715PermissionGrantApproval:
      grants.commitErc7715PermissionGrantApproval,
    getActiveErc7715PermissionGrants: grants.getActiveErc7715PermissionGrants,
    getErc7715PermissionGrantById: grants.getErc7715PermissionGrantById,
    getErc7715PermissionGrants: grants.getErc7715PermissionGrants,
    revokeErc7715PermissionGrant: grants.revokeErc7715PermissionGrant,
    saveErc7715PermissionGrant: grants.saveErc7715PermissionGrant,
    waitForErc7715PermissionResult: results.waitForErc7715PermissionResult,
    writeErc7715PermissionResult: results.writeErc7715PermissionResult,
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(facade[name], value, name);
  }
});
