import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return structuredClone(storage);
  const names =
    typeof keys === "string"
      ? [keys]
      : Array.isArray(keys)
        ? keys
        : Object.keys(keys);
  return Object.fromEntries(
    names.map((key) => [key, structuredClone(storage[key])]),
  );
}

test("password rotation rewraps an empty passkey-v2 mnemonic vault", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};

  const storageArea = (storage: StorageRecord) => ({
    get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      const values = selectStorageValues(storage, keys);
      if (callback) {
        callback(values);
        return;
      }
      return Promise.resolve(values);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, structuredClone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
    async clear() {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        async sendMessage() {},
      },
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
        session: storageArea(session),
      },
    },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const vaultModule = await import("../../src/chrome/vaultCrypto");
    const authModule = await import("../../src/chrome/authHandlers");
    const passkeyModule = await import("../../src/chrome/passkeyUnlock");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const sessionModule = await import("../../src/chrome/sessionCache");
    const transitionModule = await import("../../src/chrome/authTransition");

    const oldPassword = "old-master-password";
    const newPassword = "new-master-password";
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
    local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
      vaultKeyBytes,
      oldPassword,
    );
    local.pkVault = {
      version: 1,
      entries: [
        {
          id: "private-account",
          keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
            `0x${"11".repeat(32)}` as `0x${string}`,
            vaultKey,
          ),
        },
      ],
    };

    const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
      {
        credentialId: Buffer.alloc(64, 0x21).toString("base64url"),
        prfSalt: Buffer.alloc(32, 0x22).toString("base64url"),
        prfKeyMaterial: Buffer.alloc(32, 0x23).toString("base64url"),
        authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
      },
      oldPassword,
    );
    assert.equal(setup.success, true);
    const emptyVault = await mnemonicModule.loadMnemonicVault();
    assert.equal(emptyVault?.version, 2);
    assert.equal(emptyVault?.entries.length, 0);
    assert.equal((local.passkeyUnlock as { version: number }).version, 2);

    const rotated = await authModule.handleChangePassword(
      oldPassword,
      newPassword,
    );
    assert.equal(rotated.success, true);
    assert.equal(local.passkeyUnlock, null);
    assert.equal(
      await mnemonicModule.unlockMnemonicKeyWithPassword(oldPassword),
      null,
    );
    assert.ok(await mnemonicModule.unlockMnemonicKeyWithPassword(newPassword));

    assert.equal((await authModule.handleUnlockWallet(oldPassword)).success, false);
    const reUnlocked = await authModule.handleUnlockWallet(newPassword);
    assert.deepEqual(reUnlocked, {
      success: true,
      passwordType: "master",
    });
    const mnemonicKey = sessionModule.getCachedMnemonicKey();
    assert.ok(mnemonicKey);
    const mnemonic =
      "test test test test test test test test test test test junk";
    await mnemonicModule.storeMnemonic("later-seed", mnemonic, {
      kind: "mnemonic-key",
      key: mnemonicKey.key,
      keyId: mnemonicKey.keyId,
    });
    assert.equal(
      await mnemonicModule.getMnemonic("later-seed", { mnemonicKey }),
      mnemonic,
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
