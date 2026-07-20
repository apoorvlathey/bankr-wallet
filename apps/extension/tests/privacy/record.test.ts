import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  isValidPrivacyVaultRecord,
  PRIVACY_DERIVATION_V1,
} from "../../src/chrome/privacy/record";

function base64(bytes: number): string {
  return Buffer.alloc(bytes, 7).toString("base64");
}

function validRecord(): Record<string, unknown> {
  return {
    version: 1,
    keyId: "privacy-key-id",
    revision: 1,
    createdAt: 1,
    derivation: { ...PRIVACY_DERIVATION_V1 },
    masterWrappedKey: {
      ciphertext: base64(48),
      iv: base64(12),
      salt: base64(16),
    },
    keyCheck: {
      version: 1,
      scheme: "privacy-key-check",
      ciphertext: base64(40),
      iv: base64(12),
    },
    recovery: {
      version: 1,
      scheme: "privacy-key",
      ciphertext: base64(96),
      iv: base64(12),
    },
  };
}

test("privacy vault accepts only the exact released V1 record", () => {
  assert.equal(isValidPrivacyVaultRecord(validRecord()), true);
  assert.equal(
    isValidPrivacyVaultRecord({
      ...validRecord(),
      passkeyWrappedKey: { ciphertext: base64(48), iv: base64(12) },
    }),
    true,
  );
  const passkeyOnly = validRecord();
  delete passkeyOnly.masterWrappedKey;
  passkeyOnly.passkeyWrappedKey = {
    ciphertext: base64(48),
    iv: base64(12),
  };
  assert.equal(isValidPrivacyVaultRecord(passkeyOnly), true);

  const withoutRecoveryFactor = validRecord();
  delete withoutRecoveryFactor.masterWrappedKey;
  assert.equal(isValidPrivacyVaultRecord(withoutRecoveryFactor), false);
  assert.equal(isValidPrivacyVaultRecord({ ...validRecord(), extra: true }), false);
  assert.equal(
    isValidPrivacyVaultRecord({ ...validRecord(), passkeyWrappedKey: undefined }),
    false,
  );
});

test("privacy vault rejects malformed and oversized cryptographic fields", () => {
  const malformed = validRecord();
  (malformed.masterWrappedKey as Record<string, unknown>).iv = "not-base64";
  assert.equal(isValidPrivacyVaultRecord(malformed), false);

  const oversized = validRecord();
  (oversized.recovery as Record<string, unknown>).ciphertext = base64(1_025);
  assert.equal(isValidPrivacyVaultRecord(oversized), false);

  assert.equal(
    isValidPrivacyVaultRecord({ ...validRecord(), keyId: "x".repeat(129) }),
    false,
  );
});

test("privacy derivation metadata is fixed instead of inferred at runtime", () => {
  const changed = validRecord();
  changed.derivation = {
    ...PRIVACY_DERIVATION_V1,
    derivationVariant: "number-v1",
  };
  assert.equal(isValidPrivacyVaultRecord(changed), false);
});
