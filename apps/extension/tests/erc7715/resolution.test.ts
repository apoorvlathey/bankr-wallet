import assert from "node:assert/strict";
import test from "node:test";

import { runErc7715PermissionResolution } from "../../src/chrome/erc7715/resolution";
import type { Erc7715PermissionResult } from "../../src/chrome/pendingErc7715PermissionStorage";
import {
  resetPendingRequestResolutionClaimsForTests,
  runWalletResetAgainstPendingResolutions,
} from "../../src/chrome/requests/pendingRequestResolution";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("concurrent ERC-7715 confirms share one resolution", async () => {
  const gate = deferred();
  let confirmations = 0;
  const approved: Erc7715PermissionResult = {
    success: true,
    result: [],
  };

  const first = runErc7715PermissionResolution("confirm-confirm", async () => {
    confirmations += 1;
    await gate.promise;
    return approved;
  });
  const second = runErc7715PermissionResolution(
    "confirm-confirm",
    async () => {
      confirmations += 1;
      throw new Error("second confirmation must not execute");
    },
  );

  assert.strictEqual(second, first);
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), [approved, approved]);
  assert.equal(confirmations, 1);
});

test("a concurrent reject cannot overtake a claimed ERC-7715 confirm", async () => {
  const gate = deferred();
  let confirmations = 0;
  let rejections = 0;
  const approved: Erc7715PermissionResult = {
    success: true,
    result: [],
  };

  const confirm = runErc7715PermissionResolution("confirm-reject", async () => {
    confirmations += 1;
    await gate.promise;
    return approved;
  });
  const reject = runErc7715PermissionResolution("confirm-reject", async () => {
    rejections += 1;
    return {
      success: false,
      error: "Permission request cancelled by user",
    };
  });

  assert.strictEqual(reject, confirm);
  gate.resolve();
  assert.deepEqual(await Promise.all([confirm, reject]), [approved, approved]);
  assert.equal(confirmations, 1);
  assert.equal(rejections, 0);
});

test("an active ERC-7715 grant blocks wallet reset", async () => {
  resetPendingRequestResolutionClaimsForTests();
  const gate = deferred();
  let resets = 0;
  const grant = runErc7715PermissionResolution("grant-blocks-reset", async () => {
    await gate.promise;
    return { success: true, result: [] };
  });

  const reset = await runWalletResetAgainstPendingResolutions({
    conflictResult: () => ({ success: false as const, error: "busy" }),
    resolve: async () => {
      resets += 1;
      return { success: true as const };
    },
  });
  assert.deepEqual(reset, { success: false, error: "busy" });
  assert.equal(resets, 0);

  gate.resolve();
  await grant;
});

test("wallet reset blocks a new ERC-7715 grant before its effect", async () => {
  resetPendingRequestResolutionClaimsForTests();
  const gate = deferred();
  let grants = 0;
  const reset = runWalletResetAgainstPendingResolutions({
    conflictResult: () => ({ success: false as const, error: "busy" }),
    resolve: async () => {
      await gate.promise;
      return { success: true as const };
    },
  });

  const grant = await runErc7715PermissionResolution(
    "reset-blocks-grant",
    async () => {
      grants += 1;
      return { success: true, result: [] };
    },
  );
  assert.equal(grant.success, false);
  assert.match(grant.error || "", /reset/i);
  assert.equal(grants, 0);

  gate.resolve();
  await reset;
});
