import assert from "node:assert/strict";
import test from "node:test";
import type { Account } from "../../src/chrome/types";
import {
  formatTokenAmount,
  getAccountTypeLabel,
} from "../../src/components/Transfer/formatting";

test("transfer amount formatting stays compact at send-screen precision", () => {
  assert.equal(formatTokenAmount(0), "0");
  assert.equal(formatTokenAmount(0.0000001), "<0.000001");
  assert.equal(formatTokenAmount(1.23456789), "1.23457");
});

test("transfer account labels keep every supported wallet type distinct", () => {
  const label = (type: Account["type"]) =>
    getAccountTypeLabel({ type } as Account);

  assert.equal(label("bankr"), "Bankr");
  assert.equal(label("privateKey"), "Private Key");
  assert.equal(label("seedPhrase"), "Seed Phrase");
  assert.equal(label("impersonator"), "View Only");
});
