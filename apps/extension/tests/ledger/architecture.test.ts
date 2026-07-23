import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const extensionRoot = new URL("../../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, extensionRoot), "utf8");
}

test("Ledger transport is Chrome-only and isolated in an offscreen document", async () => {
  const [chromeManifest, firefoxManifest, bridge, offscreen, authorization] = await Promise.all([
    source("public/manifest.json"),
    source("manifest.firefox.json"),
    source("src/chrome/ledger/offscreenBridge.ts"),
    source("src/offscreen/offscreen.ts"),
    source("src/offscreen/messageAuthorization.ts"),
  ]);
  assert.match(chromeManifest, /"offscreen"/);
  assert.doesNotMatch(firefoxManifest, /"offscreen"/);
  assert.match(bridge, /chrome\.offscreen\.createDocument/);
  assert.match(bridge, /contextTypes: \[chrome\.runtime\.ContextType\.OFFSCREEN_DOCUMENT\]/);
  assert.match(offscreen, /walletchan-ledger-offscreen/);
  assert.match(offscreen, /isTrustedLedgerBackgroundSender\(sender\)/);
  assert.match(offscreen, /activeOperationId === opId/);
  assert.match(authorization, /senderUrl\.pathname === "\/static\/js\/background\.js"/);
  assert.match(authorization, /sender\.id !== extensionId \|\| sender\.tab/);
});

test("Ledger approval allows ten minutes without relaxing device discovery", async () => {
  const signer = await source("src/offscreen/ledgerSigner.ts");
  assert.match(signer, /const DISCOVERY_TIMEOUT_MS = 8_000/);
  assert.match(signer, /const ACTION_TIMEOUT_MS = 10 \* 60_000/);
});

test("Ledger setup launches in a dedicated extension tab", async () => {
  const [addAccount, app, route, screen] = await Promise.all([
    source("src/components/AddAccount.tsx"),
    source("src/App.tsx"),
    source("src/app/ledgerSetupRoute.ts"),
    source("src/components/Ledger/LedgerSetupScreen.tsx"),
  ]);
  assert.match(addAccount, /type === "ledger"[\s\S]+openLedgerSetupTab\(\)/);
  assert.doesNotMatch(addAccount, /<AddLedgerFlow/);
  assert.match(route, /chrome\.tabs\.create/);
  assert.match(route, /closeSidePanelForWindow/);
  assert.match(route, /sourceView !== "sidepanel"/);
  assert.match(route, /LEDGER_SETUP_ROUTE = "add-ledger"/);
  assert.match(route, /searchParams\.set\("route", LEDGER_SETUP_ROUTE\)/);
  assert.match(app, /isLedgerSetupRoute\(window\.location\.search\)/);
  assert.match(
    app,
    /view === "addAccount" && ledgerSetupRequestedRef\.current/,
  );
  assert.match(app, /<LedgerSetupScreen/);
  assert.match(screen, /<AddLedgerFlow/);
});

test("Ledger identity uses local official SVG assets instead of an invented glyph", async () => {
  const [wordmark, lettermark, logo, avatar, panel, accountTypes] = await Promise.all([
    source("public/ledger-wordmark.svg"),
    source("public/ledger-lettermark.svg"),
    source("src/components/Ledger/LedgerLogo.tsx"),
    source("src/components/Ledger/LedgerAvatar.tsx"),
    source("src/components/Ledger/LedgerDevicePanel.tsx"),
    source("src/components/AddAccountTypeGrid.tsx"),
  ]);
  assert.match(wordmark, /viewBox="0 0 2000\.58 669\.35"/);
  assert.match(lettermark, /viewBox="0 0 768\.91 669\.35"/);
  assert.match(logo, /ledger-wordmark\.svg/);
  assert.match(logo, /ledger-lettermark\.svg/);
  assert.doesNotMatch(avatar, /<svg/);
  assert.match(panel, /<LedgerLogo/);
  assert.match(accountTypes, /<LedgerLogo variant="lettermark"/);
  assert.doesNotMatch(accountTypes, /HardwareWalletIcon/);

  const viewOnlyIndex = accountTypes.indexOf('type: "impersonator"');
  const ledgerIndex = accountTypes.indexOf('type: "ledger"');
  assert.ok(viewOnlyIndex >= 0);
  assert.ok(ledgerIndex > viewOnlyIndex);
});

test("Ledger storage contains public metadata and participates in reset", async () => {
  const [types, handlers, storage, reset] = await Promise.all([
    source("src/chrome/types.ts"),
    source("src/chrome/ledger/accountHandlers.ts"),
    source("src/chrome/ledger/storage.ts"),
    source("src/chrome/storage/resetManifest.ts"),
  ]);
  assert.match(types, /interface LedgerAccount/);
  assert.match(types, /deviceId: string/);
  assert.match(types, /hdPath: string/);
  const ledgerAccount = types.match(/interface LedgerAccount[^}]+}/)?.[0] ?? "";
  assert.doesNotMatch(ledgerAccount, /privateKey/);
  assert.match(handlers, /passwordType !== "master"/);
  assert.match(handlers, /WALLET_SECRET_OPERATION_LOCK_KEY/);
  assert.match(storage, /LEDGER_DEVICES_STORAGE_KEY = "ledgerDevices"/);
  assert.match(storage, /assertAccountStorageAuthorized\(expectedAuthEpoch\)/);
  assert.match(storage, /setActiveAccountId[\s\S]+\.catch\(/);
  assert.match(reset, /"ledgerDevices"/);
});

test("Ledger transaction and signature effects retain final account and authorization checks", async () => {
  const [transaction, signature] = await Promise.all([
    source("src/chrome/ledger/transactionExecution.ts"),
    source("src/chrome/ledger/signatureConfirmation.ts"),
  ]);
  assert.match(transaction, /beforeBroadcast/);
  assert.match(transaction, /getAccountById\(account\.id\)/);
  assert.match(transaction, /enforcePendingRequestAuthorizationAtConfirmation/);
  assert.match(transaction, /guardPendingRequestEffectLease/);
  assert.match(transaction, /authorizePrivacyConfirmation\(pending\)/);
  assert.match(transaction, /beginPrivacyShieldSubmission/);
  assert.match(transaction, /beginPrivacyRagequitSubmission/);
  assert.match(transaction, /beginPrivacyDirectUnshieldSubmission/);
  assert.match(signature, /prepareSignatureConfirmation/);
  assert.match(signature, /revalidatePendingSignatureBeforeRelease/);
  assert.match(signature, /guardPendingRequestEffectLease/);
});

test("Ledger requests remain reviewable and immutable until hardware approval", async () => {
  const [
    transaction,
    signature,
    txUi,
    txActions,
    signatureUi,
    signatureScreen,
    status,
  ] = await Promise.all([
      source("src/chrome/ledger/transactionExecution.ts"),
      source("src/chrome/ledger/signatureConfirmation.ts"),
      source(
        "src/components/TransactionConfirmation/TransactionConfirmation.tsx",
      ),
      source("src/components/TransactionConfirmation/ConfirmationActions.tsx"),
      source(
        "src/components/SignatureConfirmation/SignatureRequestConfirmation.tsx",
      ),
      source(
        "src/components/SignatureConfirmation/SignatureConfirmationScreen.tsx",
      ),
      source("src/components/Ledger/LedgerSigningStatus.tsx"),
    ]);

  const txSigning = transaction.indexOf(
    "result = await signAndBroadcastLedgerTransaction",
  );
  const txRemoval = transaction.indexOf("await removePendingTxRequest(txId)");
  const signatureSigning = signature.indexOf(
    "signature = await signLedgerSignatureRequest",
  );
  const signatureRemoval = signature.indexOf(
    "await removePendingSignatureRequest(sigId)",
  );

  assert.ok(txSigning >= 0);
  assert.ok(txRemoval > txSigning);
  assert.ok(signatureSigning >= 0);
  assert.ok(signatureRemoval > signatureSigning);
  assert.match(txUi, /isReadOnly=\{isLedgerWaiting\}/);
  assert.match(txUi, /waitingForLedger=\{isLedgerWaiting\}/);
  assert.doesNotMatch(txUi, /isBackDisabled=\{isLedgerWaiting\}/);
  assert.match(
    txActions,
    /color="accentFg\.highlight"/,
  );
  assert.match(
    txUi,
    /requestState=\{isLedgerWaiting \? "ready" : actions\.state\}/,
  );
  assert.match(txUi, /actions\.state === "error" && accountType !== "ledger"/);
  assert.match(signatureUi, /loadingText=\{isLedgerWaiting \? "Waiting"/);
  assert.match(
    signatureUi,
    /color="accentFg\.highlight"/,
  );
  assert.match(signatureUi, /isInteractionLocked=\{isLedgerWaiting\}/);
  assert.doesNotMatch(
    signatureScreen,
    /isBackDisabled=\{isInteractionLocked\}/,
  );
  assert.match(status, /Sign the request in your Ledger/);
  assert.match(status, /LedgerLogo/);
  assert.match(status, /bg="black"/);
  assert.match(status, /color="accentFg\.highlight"/);
});

test("unsupported Ledger execution modes fail closed", async () => {
  const [batch, swap, transaction] = await Promise.all([
    source("src/components/BatchConfirmation/BatchTransactionConfirmation.tsx"),
    source("src/components/Swap/usePreparedSwap.ts"),
    source("src/chrome/ledger/transactionExecution.ts"),
  ]);
  assert.match(batch, /accountType !== "ledger"/);
  assert.match(swap, /accountType === "ledger"/);
  assert.match(transaction, /Force inclusion is not supported for Ledger accounts/);
  assert.match(transaction, /EIP-7702 delegation is not supported for Ledger accounts/);
});
