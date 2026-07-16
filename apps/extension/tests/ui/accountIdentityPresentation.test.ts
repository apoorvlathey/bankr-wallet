import assert from "node:assert/strict";
import test from "node:test";

import type { Account } from "../../src/chrome/types";
import {
  getAccountPickerDisplayName,
  getAccountPickerSecondaryIdentity,
} from "../../src/lib/accountIdentityPresentation";

const account: Account = {
  id: "account-1",
  type: "privateKey",
  address: "0x1111111111111111111111111111111111111111",
  displayName: "Wallet name",
  createdAt: 1,
};

test("contact labels override wallet and ENS text in account identity rows", () => {
  assert.equal(getAccountPickerDisplayName(account, "wallet.eth", "My contact"), "My contact");
  assert.equal(getAccountPickerSecondaryIdentity(account, "wallet.eth", "My contact"), "0x1111...1111");
});

test("account identity rows retain their released fallback order without a contact", () => {
  assert.equal(getAccountPickerDisplayName(account, "wallet.eth"), "Wallet name");
  assert.equal(getAccountPickerSecondaryIdentity(account, "wallet.eth"), "wallet.eth · 0x1111...1111");
});
