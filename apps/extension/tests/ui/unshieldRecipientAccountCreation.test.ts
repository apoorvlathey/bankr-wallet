import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("only Unshield exposes account creation from the recipient chooser", async () => {
  const [pickerSource, unshieldSource, transferSource] = await Promise.all([
    readFile(new URL("../../src/components/Transfer/RecipientPicker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Transfer/TokenTransfer.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(pickerSource, /onAddAccount\?: \(\) => void/);
  assert.match(pickerSource, /trailing=\{onAddAccount \? \(/);
  assert.match(pickerSource, /aria-label="Add account"/);
  assert.match(unshieldSource, /<RecipientPicker[\s\S]*?onAddAccount=\{\(\) => \{[\s\S]*?setIsAddingRecipientAccount\(true\)/);
  assert.doesNotMatch(transferSource, /onAddAccount=/);
});

test("Unshield returns from Add Account with the created address selected", async () => {
  const [unshieldSource, addAccountSource] = await Promise.all([
    readFile(new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/AddAccount.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(unshieldSource, /onBack=\{\(\) => setIsAddingRecipientAccount\(false\)\}/);
  assert.match(
    unshieldSource,
    /onAccountAdded=\{\(addedAccount\) => \{[\s\S]*?recipientState\.setRecipient\(addedAccount\.address\);[\s\S]*?setIsAddingRecipientAccount\(false\)/,
  );
  assert.match(addAccountSource, /onAccountAdded: \(account: Account\) => void/);
  assert.match(addAccountSource, /onAccountAdded\(response\.account\)/);
});

test("the newly added recipient scrolls into view once its wallet row exists", async () => {
  const [pickerSource, unshieldSource] = await Promise.all([
    readFile(new URL("../../src/components/Transfer/RecipientPicker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(pickerSource, /ref=\{isRevealTarget \? revealRowRef : undefined\}/);
  assert.match(pickerSource, /revealRowRef\.current\.scrollIntoView\(\{/);
  assert.match(pickerSource, /behavior: prefersReducedMotion \? "auto" : "smooth"/);
  assert.match(pickerSource, /block: "nearest"/);
  assert.match(unshieldSource, /setRecipientAccountToReveal\(addedAccount\.address\)/);
  assert.match(unshieldSource, /revealAccountAddress=\{recipientAccountToReveal\}/);
  assert.match(unshieldSource, /onAccountRevealed=\{\(\) => setRecipientAccountToReveal\(null\)\}/);
});
