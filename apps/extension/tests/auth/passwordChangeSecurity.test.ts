import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return { ...storage };
  if (typeof keys === "string") return { [keys]: storage[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storage[key]]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      storage[key] ?? fallback,
    ]),
  );
}

test("password rotation preserves every wallet type and fails closed", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};
  const localSetCalls: StorageRecord[] = [];
  let rejectLocalSet = false;

  const storageArea = (storage: StorageRecord, trackSets = false) => ({
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
      if (trackSets && rejectLocalSet) {
        throw new Error("simulated local storage failure");
      }
      if (trackSets) localSetCalls.push(structuredClone(values));
      Object.assign(storage, values);
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
        local: storageArea(local, true),
        sync: storageArea(sync),
        session: storageArea(session),
      },
    },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const vaultModule = await import("../../src/chrome/vaultCrypto");
    const authModule = await import("../../src/chrome/authHandlers");
    const passkeyCryptoModule = await import(
      "../../src/chrome/passkeyUnlockCrypto"
    );
    const seedModule = await import("../../src/chrome/mnemonic/derivation");
    const signerModule = await import("../../src/chrome/localSigner");
    const sessionModule = await import("../../src/chrome/sessionCache");

    const reset = () => {
      for (const key of Object.keys(local)) delete local[key];
      for (const key of Object.keys(session)) delete session[key];
      localSetCalls.length = 0;
      rejectLocalSet = false;
      sessionModule.clearInMemoryAuthCache();
    };

    async function installV2SeedRecoveryState(
      masterPassword: string,
      mismatchedMasterWrapper: boolean,
    ) {
      const mnemonic =
        "test test test test test test test test test test test junk";
      const seedGroupId = "v2-seed-group";
      const seedAccountId = "v2-seed-account";
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        masterPassword,
      );

      await mnemonicModule.storeMnemonic(seedGroupId, mnemonic, {
        kind: "password",
        password: masterPassword,
      });
      const mnemonicKeyBytes = cryptoModule.generateVaultKey();
      const mnemonicKey = await cryptoModule.importVaultKey(mnemonicKeyBytes);
      const mnemonicKeyId = "v2-mnemonic-key";
      const masterWrappedKey = await cryptoModule.encryptVaultKey(
        mismatchedMasterWrapper
          ? cryptoModule.generateVaultKey()
          : mnemonicKeyBytes,
        masterPassword,
      );
      const preparedMnemonicVault =
        await mnemonicModule.prepareMnemonicKeyVault(
          masterPassword,
          mnemonicKey,
          mnemonicKeyId,
          masterWrappedKey,
        );
      assert.ok(preparedMnemonicVault);
      local.mnemonicVault = preparedMnemonicVault;

      const seedPrivateKey = seedModule.derivePrivateKey(mnemonic, 0);
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      local.pkVault = {
        version: 1,
        entries: [
          {
            id: seedAccountId,
            keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
              seedPrivateKey,
              vaultKey,
            ),
          },
        ],
      };
      local.accounts = [
        {
          id: seedAccountId,
          type: "seedPhrase",
          address: signerModule.deriveAddress(seedPrivateKey),
          seedGroupId,
          derivationIndex: 0,
          createdAt: 1,
        },
      ];
      local.seedGroups = [
        {
          id: seedGroupId,
          name: "Seed #1",
          createdAt: 1,
          accountCount: 1,
        },
      ];

      const passkey = await passkeyCryptoModule.buildPasskeyRecord(
        {
          credentialId: Buffer.alloc(64, 0x41).toString("base64url"),
          prfSalt: Buffer.alloc(32, 0x42).toString("base64url"),
          prfKeyMaterial: Buffer.alloc(32, 0x43).toString("base64url"),
          authCeremonyEpoch: "test-epoch",
        },
        vaultKeyBytes,
        { keyBytes: mnemonicKeyBytes, keyId: mnemonicKeyId },
      );
      assert.equal(passkey.success, true);
      assert.ok(passkey.record);
      local.passkeyUnlock = passkey.record;

      return { mnemonic, seedGroupId, vaultKeyBytes };
    }

    await t.test(
      "a biometric session atomically rotates Bankr, mixed PK, and seed data",
      async () => {
        reset();
        const oldPassword = "old-master-password";
        const newPassword = "new-master-password";
        const vaultKeyBytes = cryptoModule.generateVaultKey();
        const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
        const modernPrivateKey = `0x${"11".repeat(32)}` as `0x${string}`;
        const legacySeedKey = `0x${"22".repeat(32)}` as `0x${string}`;
        const modernKeystore = await vaultModule.encryptPrivateKeyWithVaultKey(
          modernPrivateKey,
          vaultKey,
        );

        local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
          vaultKeyBytes,
          oldPassword,
        );
        local.encryptedVaultKeyAgent = await cryptoModule.encryptVaultKey(
          vaultKeyBytes,
          "agent-password",
        );
        local.agentPasswordEnabled = true;
        local.passkeyUnlock = { configured: true };
        local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
          vaultKey,
          "bankr-api-key",
        );
        local.pkVault = {
          version: 1,
          entries: [
            { id: "private-account", keystore: modernKeystore },
          ],
        };
        const mnemonic =
          "test test test test test test test test test test test junk";
        await mnemonicModule.storeMnemonic(
          "seed-group",
          mnemonic,
          { kind: "password", password: oldPassword },
        );

        // Hydrate the same master capability produced by biometric unlock:
        // vault key present, plaintext master password absent.
        const hydrated = await authModule.hydrateAuthSessionFromVaultKeyBytes(
          vaultKeyBytes,
          "master",
          { password: null },
        );
        assert.equal(hydrated.success, true);

        // Simulate a valid partial migration discovered after hydration.
        (local.pkVault as { entries: unknown[] }).entries.push({
          id: "seed-account",
          keystore: await vaultModule.encryptPrivateKey(
            legacySeedKey,
            oldPassword,
          ),
        });
        await sessionModule.storeSessionAtomic(
          "stale-session",
          true,
          "master",
          oldPassword,
        );
        localSetCalls.length = 0;

        const result = await authModule.handleChangePassword(
          oldPassword,
          newPassword,
        );
        assert.equal(result.success, true);

        assert.equal(localSetCalls.length >= 1, true);
        const rotationWrite = localSetCalls[0];
        assert.ok(rotationWrite.encryptedVaultKeyMaster);
        assert.ok(rotationWrite.mnemonicVault);
        assert.ok(rotationWrite.pkVault);
        assert.equal(rotationWrite.encryptedVaultKeyAgent, null);
        assert.equal(rotationWrite.agentPasswordEnabled, false);
        assert.equal(rotationWrite.passkeyUnlock, null);

        assert.equal(
          await cryptoModule.tryDecryptVaultKey(
            local.encryptedVaultKeyMaster as Parameters<
              typeof cryptoModule.tryDecryptVaultKey
            >[0],
            oldPassword,
          ),
          null,
        );
        assert.ok(
          await cryptoModule.tryDecryptVaultKey(
            local.encryptedVaultKeyMaster as Parameters<
              typeof cryptoModule.tryDecryptVaultKey
            >[0],
            newPassword,
          ),
        );
        assert.equal(
          await cryptoModule.decryptWithVaultKey(
            vaultKey,
            local.encryptedApiKeyVault as Parameters<
              typeof cryptoModule.decryptWithVaultKey
            >[1],
          ),
          "bankr-api-key",
        );
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", {
            password: newPassword,
          }),
          mnemonic,
        );
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", {
            password: oldPassword,
          }),
          null,
        );

        const rotatedVault = local.pkVault as {
          entries: Array<{
            id: string;
            keystore: Parameters<
              typeof vaultModule.decryptPrivateKeyWithVaultKey
            >[0];
          }>;
        };
        assert.equal(
          rotatedVault.entries.every((entry) => entry.keystore.salt === ""),
          true,
        );
        assert.equal(
          await vaultModule.decryptPrivateKeyWithVaultKey(
            rotatedVault.entries[0].keystore,
            vaultKey,
          ),
          modernPrivateKey,
        );
        assert.equal(
          await vaultModule.decryptPrivateKeyWithVaultKey(
            rotatedVault.entries[1].keystore,
            vaultKey,
          ),
          legacySeedKey,
        );
        assert.equal(local.encryptedVaultKeyAgent, null);
        assert.equal(local.agentPasswordEnabled, false);
        assert.equal(local.passkeyUnlock, null);
        assert.deepEqual(session, {});
        assert.equal(local.sessionEncKey, undefined);
        assert.equal(sessionModule.getCachedVaultKey(), null);
        assert.equal(sessionModule.getPasswordType(), null);
      },
    );

    await t.test(
      "a mismatched but decryptable v2 mnemonic wrapper preserves the passkey",
      async () => {
        reset();
        const oldPassword = "old-master-password";
        const masterWrapperBefore = await installV2SeedRecoveryState(
          oldPassword,
          true,
        ).then(() => structuredClone(local.encryptedVaultKeyMaster));
        const mnemonicVaultBefore = structuredClone(local.mnemonicVault);
        const passkeyBefore = structuredClone(local.passkeyUnlock);
        localSetCalls.length = 0;

        const result = await authModule.handleChangePassword(
          oldPassword,
          "replacement-password",
        );

        assert.equal(result.success, false);
        assert.match(result.error || "", /seed phrases.*not changed/i);
        assert.equal(localSetCalls.length, 0);
        assert.deepEqual(local.encryptedVaultKeyMaster, masterWrapperBefore);
        assert.deepEqual(local.mnemonicVault, mnemonicVaultBefore);
        assert.deepEqual(local.passkeyUnlock, passkeyBefore);
      },
    );

    await t.test(
      "a mismatched but decryptable general master wrapper preserves every factor",
      async () => {
        reset();
        const oldPassword = "old-master-password";
        await installV2SeedRecoveryState(oldPassword, false);
        local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
          cryptoModule.generateVaultKey(),
          oldPassword,
        );
        const masterWrapperBefore = structuredClone(
          local.encryptedVaultKeyMaster,
        );
        const mnemonicVaultBefore = structuredClone(local.mnemonicVault);
        const passkeyBefore = structuredClone(local.passkeyUnlock);
        const privateKeyVaultBefore = structuredClone(local.pkVault);
        localSetCalls.length = 0;

        const result = await authModule.handleChangePassword(
          oldPassword,
          "replacement-password",
        );

        assert.equal(result.success, false);
        assert.match(
          result.error || "",
          /wallet secrets|private-key vault|not changed/i,
        );
        assert.equal(localSetCalls.length, 0);
        assert.deepEqual(local.encryptedVaultKeyMaster, masterWrapperBefore);
        assert.deepEqual(local.mnemonicVault, mnemonicVaultBefore);
        assert.deepEqual(local.passkeyUnlock, passkeyBefore);
        assert.deepEqual(local.pkVault, privateKeyVaultBefore);
      },
    );

    await t.test(
      "a valid populated v2 mnemonic vault rotates and remains recoverable",
      async () => {
        reset();
        const oldPassword = "old-master-password";
        const newPassword = "new-master-password";
        const { mnemonic, seedGroupId } = await installV2SeedRecoveryState(
          oldPassword,
          false,
        );
        localSetCalls.length = 0;

        const result = await authModule.handleChangePassword(
          oldPassword,
          newPassword,
        );

        assert.equal(result.success, true);
        assert.equal(local.passkeyUnlock, null);
        assert.equal(
          await mnemonicModule.unlockMnemonicKeyWithPassword(oldPassword),
          null,
        );
        const unlocked =
          await mnemonicModule.unlockMnemonicKeyWithPassword(newPassword);
        assert.ok(unlocked);
        assert.equal(
          await mnemonicModule.getMnemonic(seedGroupId, {
            mnemonicKey: { key: unlocked.key, keyId: unlocked.keyId },
          }),
          mnemonic,
        );
      },
    );

    await t.test(
      "a partial legacy API migration is completed before password rotation",
      async () => {
        reset();
        const oldPassword = "old-master-password";
        const newPassword = "new-master-password";
        const vaultKeyBytes = cryptoModule.generateVaultKey();
        const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
        local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
          vaultKeyBytes,
          oldPassword,
        );
        local.encryptedApiKey = await cryptoModule.encrypt(
          "legacy-bankr-api-key",
          oldPassword,
        );
        local.accounts = [
          {
            id: "legacy-bankr-account",
            type: "bankr",
            address: `0x${"55".repeat(20)}`,
            createdAt: 1,
          },
        ];
        local.passkeyUnlock = { configured: true };
        localSetCalls.length = 0;

        const result = await authModule.handleChangePassword(
          oldPassword,
          newPassword,
        );

        assert.equal(result.success, true);
        assert.equal(local.encryptedApiKey, null);
        assert.ok(local.encryptedApiKeyVault);
        assert.equal(
          await cryptoModule.decryptWithVaultKey(
            vaultKey,
            local.encryptedApiKeyVault as Parameters<
              typeof cryptoModule.decryptWithVaultKey
            >[1],
          ),
          "legacy-bankr-api-key",
        );
        assert.equal(
          await cryptoModule.tryDecryptVaultKey(
            local.encryptedVaultKeyMaster as Parameters<
              typeof cryptoModule.tryDecryptVaultKey
            >[0],
            oldPassword,
          ),
          null,
        );
        assert.ok(
          await cryptoModule.tryDecryptVaultKey(
            local.encryptedVaultKeyMaster as Parameters<
              typeof cryptoModule.tryDecryptVaultKey
            >[0],
            newPassword,
          ),
        );
        assert.equal(local.passkeyUnlock, null);
      },
    );

    await t.test(
      "an authenticated but empty Bankr credential preserves existing factors",
      async () => {
        reset();
        const oldPassword = "old-master-password";
        const vaultKeyBytes = cryptoModule.generateVaultKey();
        const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
        local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
          vaultKeyBytes,
          oldPassword,
        );
        local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
          vaultKey,
          "",
        );
        local.accounts = [
          {
            id: "bankr-account",
            type: "bankr",
            address: `0x${"66".repeat(20)}`,
            createdAt: 1,
          },
        ];
        local.passkeyUnlock = { configured: true };
        const masterWrapperBefore = structuredClone(
          local.encryptedVaultKeyMaster,
        );
        const passkeyBefore = structuredClone(local.passkeyUnlock);
        localSetCalls.length = 0;

        const result = await authModule.handleChangePassword(
          oldPassword,
          "replacement-password",
        );

        assert.equal(result.success, false);
        assert.match(result.error || "", /Bankr credential.*not changed/i);
        assert.equal(localSetCalls.length, 0);
        assert.deepEqual(local.encryptedVaultKeyMaster, masterWrapperBefore);
        assert.deepEqual(local.passkeyUnlock, passkeyBefore);
      },
    );

    await t.test("wrong passwords and agent sessions perform no writes", async () => {
      const currentPassword = "current-master-password";
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      reset();
      local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        currentPassword,
      );
      local.encryptedVaultKeyAgent = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        "agent-password",
      );
      local.agentPasswordEnabled = true;
      local.passkeyUnlock = { configured: true };
      local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
        vaultKey,
        "bankr-api-key",
      );
      localSetCalls.length = 0;

      let result = await authModule.handleChangePassword(
        "wrong-password",
        "replacement-password",
      );
      assert.equal(result.success, false);
      assert.equal(localSetCalls.length, 0);
      assert.ok(local.encryptedVaultKeyAgent);
      assert.equal(local.passkeyUnlock != null, true);

      const hydrated = await authModule.hydrateAuthSessionFromVaultKeyBytes(
        vaultKeyBytes,
        "agent",
        { password: null },
      );
      assert.equal(hydrated.success, true);
      localSetCalls.length = 0;
      result = await authModule.handleChangePassword(
        currentPassword,
        "replacement-password",
      );
      assert.equal(result.success, false);
      assert.match(result.error || "", /master password/i);
      assert.equal(localSetCalls.length, 0);
    });

    await t.test("corrupt password-derived data aborts before any write", async () => {
      reset();
      const oldPassword = "old-master-password";
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        oldPassword,
      );
      local.encryptedVaultKeyAgent = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        "agent-password",
      );
      local.agentPasswordEnabled = true;
      local.passkeyUnlock = { configured: true };
      local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
        vaultKey,
        "bankr-api-key",
      );
      local.mnemonicVault = {
        version: 1,
        entries: [
          {
            id: "corrupt-seed",
            keystore: { ciphertext: "bad", iv: "bad", salt: "bad" },
          },
        ],
      };
      const hydrated = await authModule.hydrateAuthSessionFromVaultKeyBytes(
        vaultKeyBytes,
        "master",
        { password: null },
      );
      assert.equal(hydrated.success, true);
      const originalWrapper = structuredClone(local.encryptedVaultKeyMaster);
      localSetCalls.length = 0;

      const result = await authModule.handleChangePassword(
        oldPassword,
        "replacement-password",
      );
      assert.equal(result.success, false);
      assert.match(result.error || "", /mnemonic vault/i);
      assert.equal(localSetCalls.length, 0);
      assert.deepEqual(local.encryptedVaultKeyMaster, originalWrapper);
      assert.ok(local.encryptedVaultKeyAgent);
      assert.equal(local.passkeyUnlock != null, true);
    });

    await t.test("an atomic storage failure preserves the old password and factors", async () => {
      reset();
      const oldPassword = "old-master-password";
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        oldPassword,
      );
      local.encryptedVaultKeyAgent = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        "agent-password",
      );
      local.agentPasswordEnabled = true;
      local.passkeyUnlock = { configured: true };
      local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
        vaultKey,
        "bankr-api-key",
      );
      const originalWrapper = structuredClone(local.encryptedVaultKeyMaster);
      rejectLocalSet = true;
      const originalConsoleError = console.error;
      console.error = () => {};
      const result = await authModule
        .handleChangePassword(oldPassword, "replacement-password")
        .finally(() => {
          console.error = originalConsoleError;
        });
      rejectLocalSet = false;
      assert.equal(result.success, false);
      assert.deepEqual(local.encryptedVaultKeyMaster, originalWrapper);
      assert.ok(
        await cryptoModule.tryDecryptVaultKey(
          local.encryptedVaultKeyMaster as Parameters<
            typeof cryptoModule.tryDecryptVaultKey
          >[0],
          oldPassword,
        ),
      );
      assert.equal(
        await cryptoModule.tryDecryptVaultKey(
          local.encryptedVaultKeyMaster as Parameters<
            typeof cryptoModule.tryDecryptVaultKey
          >[0],
          "replacement-password",
        ),
        null,
      );
      assert.ok(local.encryptedVaultKeyAgent);
      assert.equal(local.agentPasswordEnabled, true);
      assert.equal(local.passkeyUnlock != null, true);
    });

    await t.test("a restored agent session still blocks master rotation", async () => {
      reset();
      const masterPassword = "master-password";
      const agentPassword = "agent-password";
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        masterPassword,
      );
      local.encryptedVaultKeyAgent = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        agentPassword,
      );
      local.agentPasswordEnabled = true;
      local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
        vaultKey,
        "bankr-api-key",
      );
      // Session restoration deliberately trusts the persisted auto-lock
      // setting, not a renderer/service-worker cache override. Model a real
      // existing user who explicitly selected Never.
      sync.autoLockTimeout = 0;
      await sessionModule.storeSessionAtomic(
        "agent-session",
        true,
        "agent",
        agentPassword,
      );
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(0);
      const originalMasterWrapper = structuredClone(
        local.encryptedVaultKeyMaster,
      );
      const originalAgentWrapper = structuredClone(local.encryptedVaultKeyAgent);

      const result = await authModule.handleChangePassword(
        masterPassword,
        "replacement-password",
      );
      sync.autoLockTimeout = 60_000;
      assert.equal(result.success, false);
      assert.match(result.error || "", /master password/i);
      assert.deepEqual(local.encryptedVaultKeyMaster, originalMasterWrapper);
      assert.deepEqual(local.encryptedVaultKeyAgent, originalAgentWrapper);
      assert.equal(sessionModule.getPasswordType(), "agent");
      sessionModule.updateCachedAutoLockTimeout(60_000);
    });

    await t.test("legacy Bankr, private-key, and seed data rotate together", async () => {
      reset();
      const oldPassword = "legacy-old-password";
      const newPassword = "legacy-new-password";
      const privateKey = `0x${"33".repeat(32)}` as `0x${string}`;
      const seedKey = `0x${"44".repeat(32)}` as `0x${string}`;
      local.encryptedApiKey = await cryptoModule.encrypt(
        "legacy-bankr-key",
        oldPassword,
      );
      local.pkVault = {
        version: 1,
        entries: [
          {
            id: "private-account",
            keystore: await vaultModule.encryptPrivateKey(
              privateKey,
              oldPassword,
            ),
          },
          {
            id: "seed-account",
            keystore: await vaultModule.encryptPrivateKey(seedKey, oldPassword),
          },
        ],
      };
      const mnemonic =
        "test test test test test test test test test test test junk";
      await mnemonicModule.storeMnemonic(
        "legacy-seed-group",
        mnemonic,
        { kind: "password", password: oldPassword },
      );
      localSetCalls.length = 0;

      const result = await authModule.handleChangePassword(
        oldPassword,
        newPassword,
      );
      assert.equal(result.success, true);
      assert.equal(localSetCalls.length >= 1, true);
      const rotationWrite = localSetCalls[0];
      assert.ok(rotationWrite.encryptedApiKey);
      assert.ok(rotationWrite.pkVault);
      assert.ok(rotationWrite.mnemonicVault);
      assert.equal(
        await cryptoModule.decrypt(
          local.encryptedApiKey as Parameters<typeof cryptoModule.decrypt>[0],
          newPassword,
        ),
        "legacy-bankr-key",
      );
      await assert.rejects(
        cryptoModule.decrypt(
          local.encryptedApiKey as Parameters<typeof cryptoModule.decrypt>[0],
          oldPassword,
        ),
      );
      const legacyVault = local.pkVault as {
        entries: Array<{
          keystore: Parameters<typeof vaultModule.decryptPrivateKey>[0];
        }>;
      };
      assert.equal(
        await vaultModule.decryptPrivateKey(
          legacyVault.entries[0].keystore,
          newPassword,
        ),
        privateKey,
      );
      assert.equal(
        await vaultModule.decryptPrivateKey(
          legacyVault.entries[1].keystore,
          newPassword,
        ),
        seedKey,
      );
      assert.equal(
        await mnemonicModule.getMnemonic("legacy-seed-group", {
          password: newPassword,
        }),
        mnemonic,
      );
    });

    await t.test("legacy verification never trusts a cached vault key", async () => {
      reset();
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
        vaultKey,
        "orphaned-api-key",
      );
      const hydrated = await authModule.hydrateAuthSessionFromVaultKeyBytes(
        vaultKeyBytes,
        "master",
        { password: null },
      );
      assert.equal(hydrated.success, true);
      assert.equal(
        await authModule.verifyMasterPassword("not-a-real-password"),
        false,
      );
    });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
