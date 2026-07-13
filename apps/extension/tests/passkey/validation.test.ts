import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  PASSKEY_RP_ID,
  isValidPasskeyCredentialPayload,
  isValidPasskeyUnlockRecord,
} from "../../src/chrome/passkeyUnlock";
import {
  buildPasskeyRecord,
  unwrapPasskeyRecordKeys,
} from "../../src/chrome/passkeyUnlockCrypto";

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
  assert.equal(
    isValidPasskeyCredentialPayload({
      ...validPayload,
      authCeremonyEpoch: "a".repeat(128),
    }),
    true,
  );
  assert.equal(
    isValidPasskeyCredentialPayload({
      ...validPayload,
      authCeremonyEpoch: "a".repeat(129),
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
  assert.equal(
    isValidPasskeyUnlockRecord({
      ...validRecord,
      wrappedVaultKey: {
        ...validRecord.wrappedVaultKey,
        iv: `${validRecord.wrappedVaultKey.iv}====`,
      },
    }),
    false,
  );
});

test("version 2 passkey records enforce mnemonic wrapper and key-id bounds", () => {
  const validV2Record = {
    ...validRecord,
    version: 2 as const,
    wrappedMnemonicKey: {
      ciphertext: base64(48),
      iv: base64(12),
    },
    mnemonicKeyId: "mnemonic-key-id",
  };
  assert.equal(isValidPasskeyUnlockRecord(validV2Record), true);
  assert.equal(
    isValidPasskeyUnlockRecord({ ...validV2Record, mnemonicKeyId: "" }),
    false,
  );
  assert.equal(
    isValidPasskeyUnlockRecord({
      ...validV2Record,
      mnemonicKeyId: "k".repeat(129),
    }),
    false,
  );
  assert.equal(
    isValidPasskeyUnlockRecord({
      ...validV2Record,
      wrappedMnemonicKey: {
        ...validV2Record.wrappedMnemonicKey,
        iv: base64(11),
      },
    }),
    false,
  );
  assert.equal(
    isValidPasskeyUnlockRecord({
      ...validV2Record,
      wrappedMnemonicKey: {
        ...validV2Record.wrappedMnemonicKey,
        ciphertext: base64(47),
      },
    }),
    false,
  );
});

test("passkey record construction rejects non-256-bit wallet keys", async () => {
  assert.equal(
    (
      await buildPasskeyRecord(
        validPayload,
        new Uint8Array(31),
      )
    ).success,
    false,
  );
  assert.equal(
    (
      await buildPasskeyRecord(
        validPayload,
        new Uint8Array(33),
      )
    ).success,
    false,
  );
  assert.equal(
    (
      await buildPasskeyRecord(validPayload, new Uint8Array(32), {
        keyBytes: new Uint8Array(31),
        keyId: "mnemonic-key-id",
      })
    ).success,
    false,
  );
  assert.equal(
    (
      await buildPasskeyRecord(validPayload, new Uint8Array(32), {
        keyBytes: new Uint8Array(33),
        keyId: "mnemonic-key-id",
      })
    ).success,
    false,
  );
  assert.equal(
    (
      await buildPasskeyRecord(validPayload, new Uint8Array(32), {
        keyBytes: new Uint8Array(32),
        keyId: "k".repeat(129),
      })
    ).success,
    false,
  );
});

test("passkey wrapping copies exact 32-byte views instead of backing buffers", async () => {
  const vaultBacking = new Uint8Array(64).fill(0x11);
  const mnemonicBacking = new Uint8Array(96).fill(0x22);
  const vaultKey = vaultBacking.subarray(16, 48);
  const mnemonicKey = mnemonicBacking.subarray(32, 64);
  const built = await buildPasskeyRecord(validPayload, vaultKey, {
    keyBytes: mnemonicKey,
    keyId: "mnemonic-key-id",
  });
  assert.equal(built.success, true);
  assert.ok(built.record);

  const unwrapped = await unwrapPasskeyRecordKeys(
    built.record,
    validPayload.prfKeyMaterial,
  );
  assert.ok(unwrapped);
  assert.deepEqual(unwrapped.vaultKeyBytes, vaultKey);
  assert.deepEqual(unwrapped.mnemonicKeyBytes, mnemonicKey);
});
