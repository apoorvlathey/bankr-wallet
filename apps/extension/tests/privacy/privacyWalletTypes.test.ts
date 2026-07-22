import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isPrivacyPoolsMutationAccountType } from "../../src/chrome/privacy/deployment/accountPolicy";
import {
  PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
  PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY,
} from "../../src/chrome/privacy/deployment/manifest";

const sourceRoot = new URL("../../src/chrome/", import.meta.url);

test("mainnet mutations support all custody wallet types and never impersonators", () => {
  for (const type of ["bankr", "privateKey", "seedPhrase"] as const) {
    assert.equal(
      isPrivacyPoolsMutationAccountType(
        type,
        PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
      ),
      true,
    );
  }
  assert.equal(
    isPrivacyPoolsMutationAccountType(
      "impersonator",
      PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
    ),
    false,
  );
  assert.equal(
    isPrivacyPoolsMutationAccountType(
      "bankr",
      PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY,
    ),
    false,
  );
});

test("Bankr Privacy Pools submission retains encrypted-intent and final-effect gates", async () => {
  const [confirmation, processing, pendingAuthorization] = await Promise.all([
    readFile(new URL("transactions/bankrConfirmation.ts", sourceRoot), "utf8"),
    readFile(new URL("transactions/bankrProcessing.ts", sourceRoot), "utf8"),
    readFile(new URL("bankr/pendingAuthorization.ts", sourceRoot), "utf8"),
  ]);

  assert.ok(
    confirmation.indexOf("authorizePrivacyConfirmation(pending)") <
      confirmation.indexOf("removePendingTxRequest(txId)"),
  );
  assert.match(confirmation, /privacyAuthorization\.shield/);
  assert.match(confirmation, /privacyAuthorization\.ragequit/);
  assert.match(confirmation, /privacyAuthorization\.directUnshield/);
  assert.ok(
    pendingAuthorization.indexOf("await beforeEffect?.()") <
      pendingAuthorization.indexOf("beginEffect();"),
  );
  assert.match(processing, /beginPrivacyShieldSubmission/);
  assert.match(processing, /beginPrivacyRagequitSubmission/);
  assert.match(processing, /beginPrivacyDirectUnshieldSubmission/);
  assert.match(processing, /recordPrivacyShieldSubmitted/);
  assert.match(processing, /recordPrivacyRagequitSubmitted/);
  assert.match(processing, /recordPrivacyDirectUnshieldSubmitted/);
  assert.match(processing, /startReceiptPolling/);
  assert.match(
    processing,
    /privacySubmissionOutcomeUncertain:[\s\S]*?error instanceof BankrApiError && error\.outcomeUncertain/,
  );
});

test("local Privacy Pools confirmation still covers private-key and seed wallets", async () => {
  const local = await readFile(
    new URL("transactions/localConfirmation.ts", sourceRoot),
    "utf8",
  );
  assert.match(
    local,
    /account\.type !== "privateKey" && account\.type !== "seedPhrase"/,
  );
  assert.match(local, /authorizePrivacyConfirmation\(pending\)/);
  assert.match(local, /privacyAuthorization\.shield/);
  assert.match(local, /privacyAuthorization\.ragequit/);
  assert.match(local, /privacyAuthorization\.directUnshield/);
  const execution = await readFile(
    new URL("transactions/localExecution.ts", sourceRoot),
    "utf8",
  );
  assert.match(execution, /let publishedTxHash: string \| null = null/);
  assert.match(
    execution,
    /recordPrivacyDirectUnshieldSubmissionFailure\(pending, \{[\s\S]*?outcomeUncertain: publishedTxHash !== null/,
  );
});

test("every public-exit execution path marks history as private activity", async () => {
  const sources = await Promise.all([
    readFile(new URL("transactions/localExecution.ts", sourceRoot), "utf8"),
    readFile(new URL("transactions/bankrHistory.ts", sourceRoot), "utf8"),
    readFile(new URL("batch/batchAtomic7702Execution.ts", sourceRoot), "utf8"),
    readFile(new URL("batch/batchBankrProcessing.ts", sourceRoot), "utf8"),
  ]);

  for (const source of sources) {
    assert.match(
      source,
      /privacyRagequitMeta:\s*pending\.privacyRagequitMeta\s*\?\s*\{ version: 1 \}/,
    );
  }
});

test("single and batch public-exit requests retain the signer-bound history marker", async () => {
  const source = await readFile(
    new URL("privacy/ragequit/submission.ts", sourceRoot),
    "utf8",
  );

  assert.match(
    source,
    /pinnedTxRequest\(account,[\s\S]*?privacyRagequitMeta: \{ version: 1, operationId: operation\.summary\.id \}/,
  );
  assert.match(
    source,
    /pinnedBatchTxRequest\(account,[\s\S]*?privacyRagequitMeta: \{ version: 1, operationIds: \[\.\.\.operationIds\] \}/,
  );
});

test("canonical receipt finalization mirrors receiver-paid Unshield into Private Activity", async () => {
  const sideEffects = await readFile(
    new URL("forceInclusion/receiptSideEffects.ts", sourceRoot),
    "utf8",
  );
  assert.match(sideEffects, /applyPrivacyUnshieldReceiptMirror/);
  assert.match(
    sideEffects,
    /await applyPrivacyUnshieldReceiptMirror\(args\)/,
  );
});
