import assert from "node:assert/strict";
import test from "node:test";
import type { Account } from "../../src/chrome/types";
import {
  getAccountRemovalCopy,
  willDeleteSeedPhrase,
} from "../../src/components/accountRemovalModel";

const bankrAccount: Account = {
  id: "bankr",
  type: "bankr",
  address: "0x0000000000000000000000000000000000000001",
  createdAt: 1,
};
const privateKeyAccount: Account = {
  id: "private-key",
  type: "privateKey",
  address: "0x0000000000000000000000000000000000000002",
  createdAt: 2,
};
const viewOnlyAccount: Account = {
  id: "view-only",
  type: "impersonator",
  address: "0x0000000000000000000000000000000000000003",
  createdAt: 3,
};
const seedAccount: Account = {
  id: "seed-0",
  type: "seedPhrase",
  address: "0x0000000000000000000000000000000000000004",
  createdAt: 4,
  seedGroupId: "seed-group-a",
  derivationIndex: 0,
};
const siblingSeedAccount: Account = {
  ...seedAccount,
  id: "seed-1",
  address: "0x0000000000000000000000000000000000000005",
  derivationIndex: 1,
};
const otherGroupSeedAccount: Account = {
  ...seedAccount,
  id: "other-seed-0",
  address: "0x0000000000000000000000000000000000000006",
  seedGroupId: "seed-group-b",
};

test("only the last account in the same seed group deletes its seed phrase", () => {
  assert.equal(
    willDeleteSeedPhrase(seedAccount, [seedAccount, siblingSeedAccount]),
    false,
  );
  assert.equal(
    willDeleteSeedPhrase(seedAccount, [seedAccount, otherGroupSeedAccount]),
    true,
  );
  assert.equal(willDeleteSeedPhrase(bankrAccount, [bankrAccount]), false);
  assert.equal(
    willDeleteSeedPhrase(privateKeyAccount, [privateKeyAccount]),
    false,
  );
  assert.equal(willDeleteSeedPhrase(viewOnlyAccount, [viewOnlyAccount]), false);
});

test("last seed account copy names both destructive outcomes", () => {
  const review = getAccountRemovalCopy(
    seedAccount,
    [seedAccount, bankrAccount],
    "review",
  );
  assert.equal(review.title, "Remove account and seed phrase?");
  assert.equal(review.warningTitle, "Your seed phrase will also be deleted.");
  assert.match(review.warningDescription ?? "", /cannot restore this account/u);
  assert.equal(review.actionLabel, "Continue");

  const final = getAccountRemovalCopy(
    seedAccount,
    [seedAccount, bankrAccount],
    "final",
  );
  assert.equal(final.title, "Delete seed phrase permanently?");
  assert.equal(final.actionLabel, "Delete account and phrase");
  assert.match(final.caution, /cannot recover the seed phrase/u);
  assert.equal(final.successTitle, "Account and seed phrase removed");
});

test("other wallet types retain account-only removal copy", () => {
  for (const account of [bankrAccount, privateKeyAccount, viewOnlyAccount]) {
    const final = getAccountRemovalCopy(account, [account], "final");
    assert.equal(final.title, "Are you absolutely sure?");
    assert.equal(final.actionLabel, "Yes, remove account");
    assert.equal(final.successTitle, "Account removed");
  }
});
