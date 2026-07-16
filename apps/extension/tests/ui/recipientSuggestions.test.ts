import assert from "node:assert/strict";
import test from "node:test";
import type { Account } from "../../src/chrome/types";
import { buildRecipientSuggestions } from "../../src/components/Transfer/model/recipientSuggestions";

const wallet = (id: string, address: string, displayName: string): Account => ({ id, address, displayName, type: "privateKey", createdAt: 1 });

test("recipient suggestions rank name prefixes before substrings and addresses", () => {
  const accounts = [wallet("one", "0x1111111111111111111111111111111111111111", "Major John")];
  const contacts = [
    { address: "0x2222222222222222222222222222222222222222" as const, label: "Johnny" },
    { address: "0x33333333333333333333333333333333333333jo" as `0x${string}`, label: "Alice" },
  ];
  const result = buildRecipientSuggestions("jo", accounts, contacts, (account) => account.displayName || account.address);
  assert.deepEqual(result.map(({ label }) => label), ["Johnny", "Major John", "Alice"]);
});

test("wallets win equal ranks while each group retains its stored order", () => {
  const accounts = [
    wallet("two", "0x2222222222222222222222222222222222222222", "Jo Two"),
    wallet("one", "0x1111111111111111111111111111111111111111", "Jo One"),
  ];
  const contacts = [{ address: "0x3333333333333333333333333333333333333333" as const, label: "Jo Contact" }];
  const result = buildRecipientSuggestions("jo", accounts, contacts, (account) => account.displayName || account.address);
  assert.deepEqual(result.map(({ label }) => label), ["Jo Two", "Jo One", "Jo Contact"]);
});

test("recipient suggestions match cached public names", () => {
  const contacts = [{ address: "0x3333333333333333333333333333333333333333" as const, label: "VVV" }];
  const result = buildRecipientSuggestions(
    "vita",
    [],
    contacts,
    (account) => account.displayName || account.address,
    6,
    () => "vitalik.eth",
  );
  assert.deepEqual(result.map(({ label, publicName }) => ({ label, publicName })), [
    { label: "VVV", publicName: "vitalik.eth" },
  ]);
});
