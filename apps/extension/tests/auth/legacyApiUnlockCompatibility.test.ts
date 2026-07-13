import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

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

test("partial vault-key upgrades preserve legacy Bankr access", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};
  let rejectCredentialMigration = false;
  let gateNextPkVaultRead = false;
  let releasePkVaultRead: (() => void) | null = null;
  let observePkVaultRead: (() => void) | null = null;

  const storageArea = (storage: StorageRecord, isLocal = false) => ({
    async get(keys?: string | string[] | StorageRecord | null) {
      const values = selectStorageValues(storage, keys);
      if (
        isLocal &&
        gateNextPkVaultRead &&
        (keys === "pkVault" ||
          (Array.isArray(keys) && keys.includes("pkVault")))
      ) {
        gateNextPkVaultRead = false;
        observePkVaultRead?.();
        await new Promise<void>((resolve) => {
          releasePkVaultRead = resolve;
        });
      }
      return values;
    },
    async set(values: StorageRecord) {
      if (
        isLocal &&
        rejectCredentialMigration &&
        "encryptedApiKeyVault" in values &&
        values.encryptedApiKey === null
      ) {
        throw new Error("simulated migration storage failure");
      }
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
        local: storageArea(local, true),
        sync: storageArea(sync),
        session: storageArea(session),
      },
    },
  });

  try {
    const authModule = await import("../../src/chrome/authHandlers");
    const cryptoModule = await import("../../src/chrome/crypto");
    const passkeyModule = await import("../../src/chrome/passkeyUnlock");
    const passkeyCryptoModule = await import(
      "../../src/chrome/passkeyUnlockCrypto"
    );
    const sessionModule = await import("../../src/chrome/sessionCache");
    const transitionModule = await import("../../src/chrome/authTransition");

    const masterPassword = "legacy-master-password";
    const agentPassword = "legacy-agent-password";
    const legacyApiKey = "legacy-bankr-api-key";
    const credentialBase = {
      credentialId: Buffer.alloc(64, 0x51).toString("base64url"),
      prfSalt: Buffer.alloc(32, 0x52).toString("base64url"),
      prfKeyMaterial: Buffer.alloc(32, 0x53).toString("base64url"),
    };

    async function installPartialUpgrade() {
      for (const key of Object.keys(local)) delete local[key];
      for (const key of Object.keys(session)) delete session[key];
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
      rejectCredentialMigration = false;
      gateNextPkVaultRead = false;
      releasePkVaultRead = null;
      observePkVaultRead = null;

      const vaultKeyBytes = cryptoModule.generateVaultKey();
      local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        masterPassword,
      );
      local.encryptedVaultKeyAgent = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        agentPassword,
      );
      local.agentPasswordEnabled = true;
      local.encryptedApiKey = await cryptoModule.encrypt(
        legacyApiKey,
        masterPassword,
      );
      local.accounts = [
        {
          id: "legacy-bankr",
          type: "bankr",
          address: `0x${"11".repeat(20)}`,
          createdAt: 1,
        },
      ];
      const passkeyPayload = {
        ...credentialBase,
        authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
      };
      const passkeyRecord = await passkeyCryptoModule.buildPasskeyRecord(
        passkeyPayload,
        vaultKeyBytes,
      );
      assert.ok(passkeyRecord.record);
      local.passkeyUnlock = passkeyRecord.record;
      return { passkeyPayload, vaultKeyBytes };
    }

    await t.test(
      "passkey fails clearly until one master unlock migrates the credential",
      async () => {
        const { passkeyPayload } = await installPartialUpgrade();

        const beforeMaster = await passkeyModule.handleUnlockWithPasskey(
          passkeyPayload,
        );
        assert.equal(beforeMaster.success, false);
        assert.match(beforeMaster.error || "", /master password.*migrate/i);
        assert.equal(sessionModule.isWalletUnlocked(), false);
        assert.ok(local.encryptedApiKey);
        assert.equal(local.encryptedApiKeyVault, undefined);

        const agent = await authModule.handleUnlockWallet(agentPassword);
        assert.equal(agent.success, false);
        assert.match(agent.error || "", /master password.*migrate/i);
        assert.equal(sessionModule.isWalletUnlocked(), false);

        const master = await authModule.handleUnlockWallet(masterPassword);
        assert.deepEqual(master, {
          success: true,
          passwordType: "master",
        });
        assert.equal(sessionModule.getCachedApiKey(), legacyApiKey);
        assert.ok(local.encryptedApiKeyVault);
        assert.equal(local.encryptedApiKey, null);

        sessionModule.clearInMemoryAuthCache();
        const afterMaster = await passkeyModule.handleUnlockWithPasskey({
          ...passkeyPayload,
          authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
        });
        assert.equal(afterMaster.success, true);
        assert.equal(sessionModule.getCachedApiKey(), legacyApiKey);
      },
    );

    await t.test(
      "session hydration and a concurrent credential update commit one ordered cache generation",
      async () => {
        const { vaultKeyBytes } = await installPartialUpgrade();
        const master = await authModule.handleUnlockWallet(masterPassword);
        assert.equal(master.success, true);
        assert.equal(sessionModule.getCachedApiKey(), legacyApiKey);

        gateNextPkVaultRead = true;
        const pkVaultRead = new Promise<void>((resolve) => {
          observePkVaultRead = resolve;
        });
        const hydration = authModule.hydrateAuthSessionFromVaultKeyBytes(
          vaultKeyBytes,
          "master",
          { password: masterPassword },
        );
        await pkVaultRead;

        let updateSettled = false;
        const update = authModule
          .handleSaveApiKeyWithCachedPassword("new-bankr-api-key")
          .then((result) => {
            updateSettled = true;
            return result;
          });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        assert.equal(updateSettled, false);

        releasePkVaultRead?.();
        assert.equal((await hydration).success, true);
        assert.equal((await update).success, true);
        assert.equal(sessionModule.getCachedApiKey(), "new-bankr-api-key");

        const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
        assert.equal(
          await cryptoModule.decryptWithVaultKey(
            vaultKey,
            local.encryptedApiKeyVault as Parameters<
              typeof cryptoModule.decryptWithVaultKey
            >[1],
          ),
          "new-bankr-api-key",
        );
      },
    );

    await t.test(
      "a migration write failure does not lock the master out of the legacy credential",
      async () => {
        await installPartialUpgrade();
        rejectCredentialMigration = true;
        const originalWarn = console.warn;
        console.warn = () => {};
        const master = await authModule
          .handleUnlockWallet(masterPassword)
          .finally(() => {
            console.warn = originalWarn;
          });

        assert.deepEqual(master, {
          success: true,
          passwordType: "master",
        });
        assert.equal(sessionModule.getCachedApiKey(), legacyApiKey);
        assert.ok(local.encryptedApiKey);
        assert.equal(local.encryptedApiKeyVault, undefined);
      },
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
