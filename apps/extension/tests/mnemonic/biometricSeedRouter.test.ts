// Biometric seed-route compatibility.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

const clone = <T>(value: T): T => structuredClone(value);

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return clone(storage);
  const names =
    typeof keys === "string"
      ? [keys]
      : Array.isArray(keys)
        ? keys
        : Object.keys(keys);
  return Object.fromEntries(
    names.map((key) => [key, clone(storage[key])]),
  );
}

test("addSeedPhraseGroup supports passwordless V2 biometric sessions", async (t) => {
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
      Object.assign(storage, clone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete storage[key];
      }
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
    const accountModule = await import("../../src/chrome/accountStorage");
    const authModule = await import("../../src/chrome/authHandlers");
    const cryptoModule = await import("../../src/chrome/crypto");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const passkeyModule = await import("../../src/chrome/passkeyUnlock");
    const seedModule = await import("../../src/chrome/mnemonic/derivation");
    const sessionModule = await import("../../src/chrome/sessionCache");
    const signerModule = await import("../../src/chrome/localSigner");
    const transitionModule = await import("../../src/chrome/authTransition");
    const vaultModule = await import("../../src/chrome/vaultCrypto");

    const masterPassword = "biometric-seed-master";
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
    local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
      vaultKeyBytes,
      masterPassword,
    );
    local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
      vaultKey,
      "pk-only-mode",
    );
    local.accounts = [
      {
        id: "existing-view-only",
        type: "impersonator",
        address: "0x1111111111111111111111111111111111111111",
        createdAt: 1,
      },
    ];

    const credential = {
      credentialId: Buffer.alloc(64, 0x61).toString("base64url"),
      prfSalt: Buffer.alloc(32, 0x62).toString("base64url"),
      prfKeyMaterial: Buffer.alloc(32, 0x63).toString("base64url"),
    };
    const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
      {
        ...credential,
        authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
      },
      masterPassword,
    );
    assert.equal(setup.success, true);
    assert.equal(
      (local.mnemonicVault as { version?: number })?.version,
      2,
    );

    sessionModule.clearInMemoryAuthCache();
    const unlocked = await passkeyModule.handleUnlockWithPasskey({
      ...credential,
      authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
    });
    assert.equal(unlocked.success, true);
    assert.equal(sessionModule.getPasswordType(), "master");
    assert.equal(sessionModule.getCachedPassword(), null);
    const mnemonicKey = sessionModule.getCachedMnemonicKey();
    assert.ok(mnemonicKey);

    const generatedMnemonic = seedModule.generateNewMnemonic();
    const importedMnemonic =
      "test test test test test test test test test test test junk";
    const formPayloads = [
      { source: "generate", mnemonic: generatedMnemonic },
      { source: "import", mnemonic: importedMnemonic },
    ] as const;
    const committed: Array<{
      source: "generate" | "import";
      groupId: string;
      accountId: string;
      mnemonic: string;
      privateKey: `0x${string}`;
    }> = [];

    for (const payload of formPayloads) {
      await t.test(`${payload.source} payload`, async () => {
        assert.equal(sessionModule.getCachedPassword(), null);
        const authEpoch = transitionModule.getAuthCeremonyEpoch();
        const group = await accountModule.addSeedGroup(
          `${payload.source} group`,
          authEpoch,
        );
        await mnemonicModule.storeMnemonic(
          group.id,
          payload.mnemonic,
          {
            kind: "mnemonic-key",
            key: mnemonicKey.key,
            keyId: mnemonicKey.keyId,
          },
          authEpoch,
        );
        const privateKey = seedModule.derivePrivateKey(payload.mnemonic, 0);
        const accountId = crypto.randomUUID();
        await vaultModule.addKeyToVault(
          accountId,
          privateKey,
          undefined,
          authEpoch,
        );
        const account = await accountModule.addSeedPhraseAccount(
          signerModule.deriveAddress(privateKey),
          group.id,
          0,
          `${payload.source} account`,
          accountId,
          authEpoch,
        );
        await accountModule.updateSeedGroupCount(group.id, 1, authEpoch);

        assert.equal(sessionModule.getCachedPassword(), null);
        assert.equal(
          await mnemonicModule.getMnemonic(group.id, { mnemonicKey }),
          payload.mnemonic,
        );
        committed.push({
          source: payload.source,
          groupId: group.id,
          accountId: account.id,
          mnemonic: payload.mnemonic,
          privateKey,
        });
      });
    }

    await t.test("master-password recovery still opens both persisted forms", async () => {
      sessionModule.clearInMemoryAuthCache();
      const masterUnlock = await authModule.handleUnlockWallet(masterPassword);
      assert.deepEqual(masterUnlock, {
        success: true,
        passwordType: "master",
      });
      const recoveredMnemonicKey = sessionModule.getCachedMnemonicKey();
      assert.ok(recoveredMnemonicKey);

      for (const record of committed) {
        assert.equal(
          await mnemonicModule.getMnemonic(record.groupId, {
            password: masterPassword,
            mnemonicKey: recoveredMnemonicKey,
            legacyVaultKey: sessionModule.getCachedVaultKey(),
          }),
          record.mnemonic,
          `${record.source} phrase must remain recoverable`,
        );
        assert.equal(
          sessionModule.getPrivateKeyFromCache(record.accountId),
          record.privateKey,
          `${record.source} derived signer must remain recoverable`,
        );
      }
    });

  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
