import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChrome = (path: string) =>
  readFile(new URL(`../../src/chrome/${path}`, import.meta.url), "utf8");

test("cross-dapp facade preserves every public implementation identity", async () => {
  const [facade, intake, staging, confirmation] = await Promise.all([
    import("../../src/chrome/crossDappBatchHandlers"),
    import("../../src/chrome/crossDappBatch/intake"),
    import("../../src/chrome/crossDappBatch/staging"),
    import("../../src/chrome/crossDappBatch/confirmation"),
  ]);
  for (const name of [
    "handleAddToCrossDappBatch",
    "handleAddCallsToCrossDappBatch",
  ] as const) {
    assert.equal(facade[name], intake[name], name);
  }
  for (const name of [
    "handleUpdateCallInCrossDappBatch",
    "handleRemoveFromCrossDappBatch",
    "handleRejectCrossDappBatch",
  ] as const) {
    assert.equal(facade[name], staging[name], name);
  }
  assert.equal(
    facade.handleConfirmCrossDappBatch,
    confirmation.handleConfirmCrossDappBatch,
  );
});

test("cross-dapp domain is one-way, audit-sized, and has no root clutter", async () => {
  const budgets: Record<string, number> = {
    "crossDappBatchHandlers.ts": 30,
    "crossDappBatch/accountPolicy.ts": 120,
    "crossDappBatch/bankr.ts": 130,
    "crossDappBatch/completion.ts": 280,
    "crossDappBatch/confirmation.ts": 180,
    "crossDappBatch/intake.ts": 260,
    "crossDappBatch/lifecycle.ts": 320,
    "crossDappBatch/local.ts": 340,
    "crossDappBatch/runtime.ts": 30,
    "crossDappBatch/staging.ts": 150,
    "crossDappBatch/storage.ts": 120,
    "crossDappBatch/types.ts": 50,
  };
  for (const [path, maximumLines] of Object.entries(budgets)) {
    const source = await readChrome(path);
    assert.ok(
      source.split("\n").length <= maximumLines,
      `${path} exceeds its ${maximumLines}-line audit budget`,
    );
    if (path !== "crossDappBatchHandlers.ts") {
      assert.doesNotMatch(
        source,
        /(?:from\s+|import\()["'](?:[^"']*\/)?crossDappBatchHandlers["']/,
      );
    }
  }
  const facade = await readChrome("crossDappBatchHandlers.ts");
  assert.doesNotMatch(facade, /(?:async\s+)?function\s+/);
  assert.doesNotMatch(
    facade,
    /privateKey|submitTransactionDirect|signAndBroadcast|chrome\.storage|beginPendingRequestEffectLease/,
  );

  const root = await readdir(new URL("../../src/chrome/", import.meta.url));
  assert.deepEqual(
    root.filter((name) =>
      /^crossDappBatch(?:Lifecycle|Storage)\.ts$/.test(name),
    ),
    [],
  );
});

test("staging keeps the released storage schema and source-removal ordering", async () => {
  const [storage, intake, lifecycle] = await Promise.all([
    readChrome("crossDappBatch/storage.ts"),
    readChrome("crossDappBatch/intake.ts"),
    readChrome("crossDappBatch/lifecycle.ts"),
  ]);
  assert.match(storage, /const STORAGE_KEY = "crossDappBatch"/);
  for (const field of [
    "fromAddress",
    "chainId",
    "chainName",
    "accountType",
    "entries",
    "createdAt",
    "accountId",
    "bankrCredentialTag",
    "walletConnect",
  ]) {
    assert.match(storage, new RegExp(`\\b${field}\\b`), field);
  }
  const persistTx = intake.indexOf("await setCrossDappBatch(next)");
  const removeTx = intake.indexOf("await removePendingTxRequest", persistTx);
  const persistCalls = intake.lastIndexOf("await setCrossDappBatch(next)");
  const removeCalls = intake.indexOf(
    "await removePendingBatchTxRequest",
    persistCalls,
  );
  assert.ok(persistTx >= 0 && removeTx > persistTx);
  assert.ok(persistCalls >= 0 && removeCalls > persistCalls);
  const persistRemaining = lifecycle.indexOf("persistRemainingBatch(");
  const publishResult = lifecycle.indexOf(
    "writeResultToStorage(`txResult:",
    persistRemaining,
  );
  assert.ok(persistRemaining >= 0 && publishResult > persistRemaining);
});

test("Bankr and local effects retain final account and transport commits", async () => {
  const [bankr, local, confirmation] = await Promise.all([
    readChrome("crossDappBatch/bankr.ts"),
    readChrome("crossDappBatch/local.ts"),
    readChrome("crossDappBatch/confirmation.ts"),
  ]);
  const bankrSubmit = bankr.indexOf("submitTransactionDirect(");
  const bankrAccount = bankr.indexOf("getAccountById(", bankrSubmit);
  const bankrAuthorization = bankr.indexOf(
    "enforceCrossDappBatchAuthorizationAtConfirmation(batch)",
    bankrAccount,
  );
  const bankrCommit = bankr.indexOf("finalAuthorization.commit()", bankrAuthorization);
  const bankrEffect = bankr.indexOf("effectGuard.beginEffect()", bankrCommit);
  assert.ok(bankrSubmit >= 0 && bankrAccount > bankrSubmit);
  assert.ok(bankrAuthorization > bankrAccount && bankrCommit > bankrAuthorization);
  assert.ok(bankrEffect > bankrCommit);

  const localSign = local.indexOf("signAndBroadcastTransaction(");
  const localAuthorization = local.indexOf(
    "args.authorizeBeforeEffect()",
    localSign,
  );
  const localAccount = local.indexOf("getAccountById(args.accountId)", localAuthorization);
  const localCommit = local.indexOf("finalAuthorization.commit()", localAccount);
  const localEffect = local.indexOf("effectGuard.beginEffect()", localCommit);
  assert.ok(localSign >= 0 && localAuthorization > localSign);
  assert.ok(localAccount > localAuthorization && localCommit > localAccount);
  assert.ok(localEffect > localCommit);

  assert.ok(
    confirmation.indexOf("beginCrossDappBatchProcessing()") <
      confirmation.indexOf("getCrossDappBatch()"),
    "the duplicate-confirmation lock must be acquired before async reads",
  );
});

test("completion keeps transaction and wallet_sendCalls result routing separate", async () => {
  const [source, bankr] = await Promise.all([
    readChrome("crossDappBatch/completion.ts"),
    readChrome("crossDappBatch/bankr.ts"),
  ]);
  assert.match(source, /entry\.source\?\.kind !== "wallet_sendCalls"/);
  assert.match(source, /`txResult:\$\{entry\.txId\}`/);
  assert.match(source, /BUNDLE_STATUS\.PENDING/);
  assert.match(source, /BUNDLE_STATUS\.CONFIRMED/);
  assert.match(source, /BUNDLE_STATUS\.REVERTED/);
  assert.match(source, /BUNDLE_STATUS\.OFFCHAIN_FAILURE/);
  assert.match(source, /atomic: true/);
  assert.match(source, /trackCrossDappBatchCompletion/);
  assert.match(bankr, /kind: "retryable", error: "Invalid password"/);
  const retryable = source.indexOf('ship.kind === "retryable"');
  const clear = source.indexOf("clearCrossDappBatch()", retryable);
  assert.ok(retryable >= 0 && (clear === -1 || clear > source.indexOf('ship.kind === "error"')));
});
