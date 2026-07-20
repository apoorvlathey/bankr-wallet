import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../../src/${path}`, import.meta.url), "utf8");

test("onboarding offers Ledger after View-only only when WebHID is available", async () => {
  const source = await readSource("pages/onboarding/AccountTypeStep.tsx");
  const viewOnly = source.indexOf('title="View-only"');
  const ledger = source.indexOf('title="Ledger"');
  const bankr = source.indexOf('title="Bankr API"');

  assert.ok(viewOnly >= 0 && ledger > viewOnly && bankr > ledger);
  assert.match(source, /"hid" in navigator/);
  assert.match(source, /"offscreen" in chrome/);
  assert.match(source, /LedgerLogo variant="lettermark"/);
});

test("Ledger onboarding defers persistence until after master credential setup", async () => {
  const submission = await readSource(
    "pages/onboarding/onboardingSubmission.ts",
  );
  const ledgerCommit = submission.indexOf(
    'else {\n      await initializeCredential("pk-only-mode")',
  );
  const credential = submission.indexOf(
    'await initializeCredential("pk-only-mode")',
    ledgerCommit,
  );
  const accountWrite = submission.indexOf(
    'type: "addLedgerAccounts"',
    ledgerCommit,
  );

  assert.ok(ledgerCommit >= 0 && credential > ledgerCommit);
  assert.ok(accountWrite > credential);
  assert.match(submission, /type: "rollbackOnboardingInitialization"/);
});

test("the shared Ledger flow can collect without writing accounts early", async () => {
  const source = await readSource("components/Ledger/AddLedgerFlow.tsx");

  assert.match(source, /commitAccounts\?\(selection: LedgerAccountSelection\)/);
  assert.match(source, /if \(commitAccounts\) \{/);
  assert.match(source, /await commitAccounts\(selection\)/);
  assert.match(source, /renderLayout\?\(parts: LedgerFlowLayoutParts\)/);
});
