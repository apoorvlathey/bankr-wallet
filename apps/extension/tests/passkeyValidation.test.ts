import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  PASSKEY_RP_ID,
  isValidPasskeyCredentialPayload,
  isValidPasskeyUnlockRecord,
} from "../src/chrome/passkeyUnlock";

const base64Url = (length: number): string =>
  Buffer.alloc(length, 0x5a).toString("base64url");
const base64 = (length: number): string =>
  Buffer.alloc(length, 0xa5).toString("base64");

const validPayload = {
  credentialId: base64Url(64),
  prfSalt: base64Url(32),
  prfKeyMaterial: base64Url(32),
  authCeremonyEpoch: "test-epoch",
};

const validRecord = {
  version: 1 as const,
  rpId: PASSKEY_RP_ID,
  credentialId: validPayload.credentialId,
  prfSalt: validPayload.prfSalt,
  wrappedVaultKey: {
    ciphertext: base64(48),
    iv: base64(12),
  },
  createdAt: Date.now(),
};

test("passkey payload validation enforces exact cryptographic sizes", () => {
  assert.equal(isValidPasskeyCredentialPayload(validPayload), true);
  assert.equal(
    isValidPasskeyCredentialPayload({ ...validPayload, prfSalt: base64Url(31) }),
    false,
  );
  assert.equal(
    isValidPasskeyCredentialPayload({
      ...validPayload,
      prfKeyMaterial: base64Url(33),
    }),
    false,
  );
  assert.equal(
    isValidPasskeyCredentialPayload({
      ...validPayload,
      credentialId: base64Url(1024),
    }),
    false,
  );
  assert.equal(
    isValidPasskeyCredentialPayload({
      ...validPayload,
      credentialId: "not+base64url",
    }),
    false,
  );
  assert.equal(
    isValidPasskeyCredentialPayload({
      ...validPayload,
      authCeremonyEpoch: "",
    }),
    false,
  );
});

test("stored passkey records fail closed on malformed wrapper metadata", () => {
  assert.equal(isValidPasskeyUnlockRecord(validRecord), true);
  assert.equal(
    isValidPasskeyUnlockRecord({
      ...validRecord,
      wrappedVaultKey: { ...validRecord.wrappedVaultKey, iv: base64(11) },
    }),
    false,
  );
  assert.equal(
    isValidPasskeyUnlockRecord({
      ...validRecord,
      wrappedVaultKey: {
        ...validRecord.wrappedVaultKey,
        ciphertext: base64(47),
      },
    }),
    false,
  );
  assert.equal(
    isValidPasskeyUnlockRecord({ ...validRecord, createdAt: Number.NaN }),
    false,
  );
});
