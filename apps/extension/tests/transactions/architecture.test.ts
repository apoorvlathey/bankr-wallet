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
    bankrConfirmation,
    requestActions,
    directSwap,
    batchSwap,
    atomicSwap,
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
    import("../../src/chrome/transactions/bankrConfirmation"),
    import("../../src/chrome/transactions/requestActions"),
    import("../../src/chrome/transactions/swaps/direct"),
    import("../../src/chrome/transactions/swaps/batch"),
    import("../../src/chrome/transactions/swaps/atomic"),
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
  assert.equal(
    facade.handleConfirmTransaction,
    bankrConfirmation.handleConfirmTransaction,
  );
  assert.equal(
    facade.handleConfirmTransactionAsync,
    bankrConfirmation.handleConfirmTransactionAsync,
  );
  assert.equal(
    facade.handleRejectTransaction,
    requestActions.handleRejectTransaction,
  );
  assert.equal(
    facade.handleCancelTransaction,
    requestActions.handleCancelTransaction,
  );
  assert.equal(
    facade.handleCancelProcessingTx,
    requestActions.handleCancelProcessingTx,
  );
  assert.equal(facade.handleExecuteSwapDirect, directSwap.handleExecuteSwapDirect);
  assert.equal(facade.handleExecuteSwapBatch, batchSwap.handleExecuteSwapBatch);
  assert.equal(
    facade.handleExecuteSwapAtomicPK,
    atomicSwap.handleExecuteSwapAtomicPK,
  );
});

test("focused transaction modules stay one-way and audit-sized", async () => {
  const budgets: Record<string, number> = {
    "transactions/runtime.ts": 140,
    "transactions/requestIntake.ts": 300,
    "extensionPopup.ts": 20,
    "signatures/requestSigner.ts": 60,
    "transactions/accountMutations.ts": 240,
    "transactions/securityReset.ts": 100,
    "transactions/internalTransfer.ts": 100,
    "transactions/rpcConfig.ts": 40,
    "signatures/confirmationPolicy.ts": 180,
    "signatures/confirmationHandlers.ts": 320,
    "transactions/localConfirmation.ts": 240,
    "transactions/localExecution.ts": 320,
    "transactions/impersonatedExecution.ts": 250,
    "transactions/failure.ts": 100,
    "transactions/displayMetadata.ts": 160,
    "transactions/notification.ts": 80,
    "transactions/bankrSession.ts": 60,
    "transactions/bankrPolicy.ts": 80,
    "transactions/bankrProcessing.ts": 180,
    "transactions/bankrConfirmation.ts": 200,
    "transactions/requestActions.ts": 100,
    "transactions/swaps/types.ts": 60,
    "transactions/swaps/accountPolicy.ts": 130,
    "transactions/swaps/bankrLeg.ts": 180,
    "transactions/swaps/localBroadcast.ts": 140,
    "transactions/swaps/direct.ts": 320,
    "transactions/swaps/batch.ts": 160,
    "transactions/swaps/atomic.ts": 200,
  };

  for (const [name, maximumLines] of Object.entries(budgets)) {
    const source = await readModule(name);
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\()["'](?:[^"']*\/)?txHandlers["']/,
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
    facade.split("\n").length <= 80,
    "txHandlers.ts must remain an implementation-free compatibility facade",
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
  assert.doesNotMatch(facade, /(?:async\s+)?function\s+/);
  assert.doesNotMatch(facade, /beginPendingRequestEffectLease/);
  assert.doesNotMatch(facade, /signAndBroadcastTransaction/);
  assert.doesNotMatch(facade, /submitTransactionDirect/);
});

test("swap coordinators preserve account locks and effect leases", async () => {
  const [direct, batch, atomic] = await Promise.all([
    readModule("transactions/swaps/direct.ts"),
    readModule("transactions/swaps/batch.ts"),
    readModule("transactions/swaps/atomic.ts"),
  ]);

  const directLock = direct.indexOf("resolveLockedSwapAccount(accountLock)");
  const directValidation = direct.indexOf(
    "validateLockedSwapTransactions(",
    directLock,
  );
  const bankrCredential = direct.indexOf(
    "getUnlockedBankrApiKey()",
    directValidation,
  );
  const localPreparation = direct.indexOf(
    "prepareLocalSwap(",
    directValidation,
  );
  const localBroadcast = direct.indexOf(
    "broadcastSwapTxLocal(",
    localPreparation,
  );
  assert.ok(directLock >= 0 && directValidation > directLock);
  assert.ok(bankrCredential > directValidation);
  assert.ok(localPreparation > directValidation && localBroadcast > localPreparation);
  assert.match(
    direct,
    /broadcastUncertain[\s\S]*Skipped because the previous transaction's broadcast is still unconfirmed/,
  );

  const batchBinding = batch.indexOf("bindPendingBankrCredential(");
  const batchLease = batch.indexOf(
    "beginPendingRequestEffectLease(",
    batchBinding,
  );
  const batchEffect = batch.indexOf("void processSwapTxBankr(", batchLease);
  assert.ok(batchBinding >= 0 && batchLease > batchBinding);
  assert.ok(batchEffect > batchLease);

  const atomicBinding = atomic.indexOf("pinnedBatchTxRequest(");
  const atomicLease = atomic.indexOf(
    "beginPendingRequestEffectLease(",
    atomicBinding,
  );
  const atomicEffect = atomic.indexOf(
    "void processBatchTransactionAtomic7702InBackground(",
    atomicLease,
  );
  assert.ok(atomicBinding >= 0 && atomicLease > atomicBinding);
  assert.ok(atomicEffect > atomicLease);
});
