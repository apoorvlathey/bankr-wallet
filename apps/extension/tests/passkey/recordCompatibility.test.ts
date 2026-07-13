import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import * as compatibilityFacade from "../../src/chrome/passkeyUnlockCrypto";
import * as recordCodec from "../../src/chrome/passkey/record";
import * as repository from "../../src/chrome/passkey/repository";

type StorageRecord = Record<string, unknown>;

const base64Url = (length: number): string =>
  Buffer.alloc(length, 0x3c).toString("base64url");
const base64 = (length: number): string =>
  Buffer.alloc(length, 0xc3).toString("base64");

const legacyRecord: recordCodec.PasskeyUnlockRecordV1 = {
  version: 1,
  rpId: recordCodec.PASSKEY_RP_ID,
  credentialId: base64Url(64),
  prfSalt: base64Url(32),
  wrappedVaultKey: {
    ciphertext: base64(48),
    iv: base64(12),
  },
  createdAt: 1_700_000_000_000,
  lastUsedAt: 1_700_000_000_123,
};

const currentRecord: recordCodec.PasskeyUnlockRecordV2 = {
  version: 2,
  rpId: recordCodec.PASSKEY_RP_ID,
  credentialId: base64Url(96),
  prfSalt: base64Url(32),
  wrappedVaultKey: {
    ciphertext: base64(48),
    iv: base64(12),
  },
  wrappedMnemonicKey: {
    ciphertext: Buffer.alloc(48, 0x5a).toString("base64"),
    iv: Buffer.alloc(12, 0xa5).toString("base64"),
  },
  mnemonicKeyId: "mnemonic-key-v2",
  createdAt: 1_800_000_000_000,
};

test("passkey record modules preserve legacy and current storage compatibility", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const writes: StorageRecord[] = [];

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: structuredClone(local[key]) };
          },
          async set(values: StorageRecord) {
            writes.push(structuredClone(values));
            Object.assign(local, structuredClone(values));
          },
        },
      },
    },
  });

  try {
    await t.test("the compatibility facade retains the focused module API", () => {
      assert.equal(
        compatibilityFacade.isValidPasskeyUnlockRecord,
        recordCodec.isValidPasskeyUnlockRecord,
      );
      assert.equal(
        compatibilityFacade.loadPasskeyUnlockRecord,
        repository.loadPasskeyUnlockRecord,
      );
      assert.equal(
        compatibilityFacade.PASSKEY_UNLOCK_STORAGE_KEY,
        repository.PASSKEY_UNLOCK_STORAGE_KEY,
      );
    });

    await t.test("released V1 records load byte-for-byte without writes", async () => {
      local[repository.PASSKEY_UNLOCK_STORAGE_KEY] = structuredClone(legacyRecord);
      writes.length = 0;

      assert.deepEqual(
        await compatibilityFacade.loadPasskeyUnlockRecord(),
        legacyRecord,
      );
      assert.deepEqual(local[repository.PASSKEY_UNLOCK_STORAGE_KEY], legacyRecord);
      assert.deepEqual(writes, []);
    });

    await t.test("current V2 records load byte-for-byte without writes", async () => {
      local[repository.PASSKEY_UNLOCK_STORAGE_KEY] = structuredClone(currentRecord);
      writes.length = 0;

      assert.deepEqual(await repository.loadPasskeyUnlockRecord(), currentRecord);
      assert.deepEqual(local[repository.PASSKEY_UNLOCK_STORAGE_KEY], currentRecord);
      assert.deepEqual(writes, []);
    });

    await t.test("invalid stored records fail closed without normalization", async () => {
      const invalidRecord = {
        ...currentRecord,
        wrappedMnemonicKey: {
          ...currentRecord.wrappedMnemonicKey,
          ciphertext: base64(47),
        },
      };
      local[repository.PASSKEY_UNLOCK_STORAGE_KEY] = structuredClone(invalidRecord);
      writes.length = 0;

      assert.equal(await repository.loadPasskeyUnlockRecord(), null);
      assert.deepEqual(
        local[repository.PASSKEY_UNLOCK_STORAGE_KEY],
        invalidRecord,
      );
      assert.deepEqual(writes, []);
    });

    await t.test("saving keeps the existing storage key and record shape", async () => {
      writes.length = 0;
      await compatibilityFacade.savePasskeyRecord(currentRecord);

      assert.deepEqual(writes, [
        { [repository.PASSKEY_UNLOCK_STORAGE_KEY]: currentRecord },
      ]);
      assert.deepEqual(local[repository.PASSKEY_UNLOCK_STORAGE_KEY], currentRecord);
    });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      delete (globalThis as { chrome?: unknown }).chrome;
    }
  }
});
