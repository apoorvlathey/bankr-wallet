import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePrivateKey,
  generateNewMnemonic,
  isValidMnemonic,
  normalizeMnemonicForPersistence,
} from "../../src/chrome/mnemonic/derivation";
import {
  generatePrivateKey,
  validateAndDeriveAddress,
} from "../../src/utils/privateKeyUtils";

test("generated private keys are always valid secp256k1 signers", () => {
  const generated = new Set<string>();
  for (let index = 0; index < 64; index += 1) {
    const privateKey = generatePrivateKey();
    const validation = validateAndDeriveAddress(privateKey);
    assert.equal(validation.valid, true);
    assert.equal(validation.normalizedKey, privateKey);
    assert.equal(typeof validation.address, "string");
    generated.add(privateKey);
  }
  assert.equal(generated.size, 64);
});

test("generated phrases validate and derivation rejects unsafe path indices", () => {
  const mnemonic = generateNewMnemonic();
  assert.equal(isValidMnemonic(mnemonic), true);
  assert.match(derivePrivateKey(mnemonic, 0), /^0x[0-9a-f]{64}$/);
  assert.match(derivePrivateKey(mnemonic, 0x7fffffff), /^0x[0-9a-f]{64}$/);

  for (const index of [
    -1,
    1.5,
    0x80000000,
    Number.MAX_SAFE_INTEGER + 1,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.throws(() => derivePrivateKey(mnemonic, index), /derivation index/i);
  }
});

test("seed persistence never silently generates an unacknowledged phrase", () => {
  const mnemonic =
    "test test test test test test test test test test test junk";
  assert.equal(normalizeMnemonicForPersistence(undefined), null);
  assert.equal(normalizeMnemonicForPersistence(""), null);
  assert.equal(normalizeMnemonicForPersistence("test ".repeat(12)), null);
  assert.equal(
    normalizeMnemonicForPersistence(`  ${mnemonic.toUpperCase()}  `),
    mnemonic,
  );
});
