import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { supportsEditableTransactionNonce } from "../../src/components/TransactionConfirmation/transactionNonceModel";
import {
  MAX_TRANSACTION_NONCE,
  normalizeTransactionNonce,
  parseTransactionNonceInput,
} from "../../src/lib/transactionNonce";

test("editable transaction nonces are limited to PK, seed, and Ledger accounts", () => {
  assert.equal(supportsEditableTransactionNonce("privateKey"), true);
  assert.equal(supportsEditableTransactionNonce("seedPhrase"), true);
  assert.equal(supportsEditableTransactionNonce("ledger"), true);
  assert.equal(supportsEditableTransactionNonce("bankr"), false);
  assert.equal(supportsEditableTransactionNonce("impersonator"), false);
  assert.equal(supportsEditableTransactionNonce(undefined), false);
});

test("parses editable decimal nonces without lossy number coercion", () => {
  assert.deepEqual(parseTransactionNonceInput("0"), {
    valid: true,
    nonce: 0,
  });
  assert.deepEqual(parseTransactionNonceInput(" 42 "), {
    valid: true,
    nonce: 42,
  });
  assert.deepEqual(parseTransactionNonceInput(String(MAX_TRANSACTION_NONCE)), {
    valid: true,
    nonce: MAX_TRANSACTION_NONCE,
  });
  assert.equal(parseTransactionNonceInput("1.5").valid, false);
  assert.equal(parseTransactionNonceInput("-1").valid, false);
  assert.equal(
    parseTransactionNonceInput(String(MAX_TRANSACTION_NONCE + 1)).valid,
    false,
  );
});

test("the background boundary accepts only safe non-negative nonce numbers", () => {
  assert.equal(normalizeTransactionNonce(undefined), undefined);
  assert.equal(normalizeTransactionNonce(0), 0);
  assert.equal(normalizeTransactionNonce(99), 99);
  assert.throws(() => normalizeTransactionNonce("99"), /nonce/i);
  assert.throws(() => normalizeTransactionNonce(-1), /nonce/i);
  assert.throws(() => normalizeTransactionNonce(Number.MAX_SAFE_INTEGER), /nonce/i);
});

test("transaction details place the persisted nonce after gas diagnostics", async () => {
  const source = await readFile(
    new URL(
      "../../src/components/TransactionDetails/AdvancedDetails.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(source.indexOf("<GasDetails") < source.indexOf('label="Address nonce"'));
});
