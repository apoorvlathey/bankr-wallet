import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("txHandlers preserves focused transaction and signature identities", async () => {
  const [
    facade,
    intake,
    runtime,
    popup,
    accounts,
    reset,
    transfer,
    rpc,
    signatureConfirmation,
    localTransactionConfirmation,
    notifications,
  ] = await Promise.all([
    import("../../src/chrome/txHandlers"),
    import("../../src/chrome/transactions/requestIntake"),
    import("../../src/chrome/transactions/runtime"),
    import("../../src/chrome/extensionPopup"),
    import("../../src/chrome/transactions/accountMutations"),
    import("../../src/chrome/transactions/securityReset"),
    import("../../src/chrome/transactions/internalTransfer"),
    import("../../src/chrome/transactions/rpcConfig"),
    import("../../src/chrome/signatures/confirmationHandlers"),
    import("../../src/chrome/transactions/localConfirmation"),
    import("../../src/chrome/transactions/notification"),
  ]);

  assert.equal(facade.handleTransactionRequest, intake.handleTransactionRequest);
  assert.equal(facade.handleSignatureRequest, intake.handleSignatureRequest);
  assert.equal(facade.writeResultToStorage, runtime.writeResultToStorage);
  assert.equal(facade.resolvePinnedAccount, runtime.resolvePinnedAccount);
  assert.equal(facade.activeAbortControllers, runtime.activeAbortControllers);
  assert.equal(facade.failedTxResults, runtime.failedTxResults);
  assert.equal(facade.openExtensionPopup, popup.openExtensionPopup);
  assert.equal(facade.openPopupWindow, popup.openPopupWindow);
  assert.equal(
    facade.handleAddPrivateKeyAccount,
    accounts.handleAddPrivateKeyAccount,
  );
  assert.equal(facade.handleRemoveAccount, accounts.handleRemoveAccount);
  assert.equal(facade.performSecurityReset, reset.performSecurityReset);
  assert.equal(facade.handleInitiateTransfer, transfer.handleInitiateTransfer);
  assert.equal(facade.getRpcUrl, rpc.getRpcUrl);
  assert.equal(
    facade.handleConfirmSignatureRequest,
    signatureConfirmation.handleConfirmSignatureRequest,
  );
  assert.equal(
    facade.handleConfirmSignatureRequestBankr,
    signatureConfirmation.handleConfirmSignatureRequestBankr,
  );
  assert.equal(
    facade.handleConfirmTransactionAsyncPK,
    localTransactionConfirmation.handleConfirmTransactionAsyncPK,
  );
  assert.equal(facade.showNotification, notifications.showNotification);
});

test("focused transaction modules stay one-way and audit-sized", async () => {
  const budgets: Record<string, number> = {
    "transactions/runtime.ts": 140,
    "transactions/requestIntake.ts": 300,
    "extensionPopup.ts": 220,
    "signatures/requestSigner.ts": 60,
    "transactions/accountMutations.ts": 240,
    "transactions/securityReset.ts": 100,
    "transactions/internalTransfer.ts": 100,
    "transactions/rpcConfig.ts": 40,
    "signatures/confirmationPolicy.ts": 180,
    "signatures/confirmationHandlers.ts": 320,
    "transactions/localConfirmation.ts": 240,
    "transactions/localExecution.ts": 320,
    "transactions/failure.ts": 100,
    "transactions/displayMetadata.ts": 160,
    "transactions/notification.ts": 80,
  };

  for (const [name, maximumLines] of Object.entries(budgets)) {
    const source = await readModule(name);
    assert.doesNotMatch(
      source,
      /from ["']\.\/txHandlers["']|import\(["']\.\/txHandlers["']\)/,
      `${name} must not import the compatibility facade`,
    );
    const lines = source.split("\n").length;
    assert.ok(
      lines <= maximumLines,
      `${name} has ${lines} lines; audit budget is ${maximumLines}`,
    );
  }

  const rootEntries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
  );
  assert.deepEqual(
    rootEntries.filter((name) =>
      /^(?:pendingRequest(?:Intake|Runtime)|localTransaction|transaction(?:Failure|DisplayMetadata)|extensionNotification|internalTransferRequest|txSecurityReset|txRpcConfig|accountMutationHandlers|signatureConfirmation|signatureRequestSigner)\.ts$/.test(
        name,
      ),
    ),
    [],
  );
  assert.match(await readModule("transactions/README.md"), /Effect order/);
  assert.match(await readModule("signatures/README.md"), /releas/);

  const facade = await readModule("txHandlers.ts");
  assert.ok(
    facade.split("\n").length <= 1_600,
    "txHandlers.ts must keep shrinking as focused domains are extracted",
  );
  assert.doesNotMatch(facade, /function handleTransactionRequest\(/);
  assert.doesNotMatch(facade, /function openExtensionPopup\(/);
  assert.doesNotMatch(facade, /function handleAddPrivateKeyAccount\(/);
  assert.doesNotMatch(facade, /function performSecurityReset\(/);
  assert.doesNotMatch(facade, /function handleInitiateTransfer\(/);
  assert.doesNotMatch(facade, /function handleConfirmSignatureRequest\(/);
  assert.doesNotMatch(
    facade,
    /function handleConfirmSignatureRequestBankr\(/,
  );
  assert.doesNotMatch(facade, /function handleConfirmTransactionAsyncPK\(/);
  assert.doesNotMatch(facade, /function processLocalTransactionInBackground\(/);
  assert.doesNotMatch(facade, /function showNotification\(/);
  assert.doesNotMatch(facade, /function handleTransactionFailure\(/);
});
