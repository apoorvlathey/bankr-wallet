// Dedicated mnemonic-key and passkey compatibility matrix.
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
  if (typeof keys === "string") {
    return { [keys]: clone(storage[keys]) };
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(
      keys.map((key) => [key, clone(storage[key])]),
    );
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      clone(storage[key] ?? fallback),
    ]),
  );
}

test("dedicated mnemonic key remains compatible and isolated", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};
  const localSetCalls: StorageRecord[] = [];
  let rejectLocalSet: ((values: StorageRecord) => boolean) | null = null;

  const storageArea = (storage: StorageRecord, trackLocal = false) => ({
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
      if (trackLocal && rejectLocalSet?.(values)) {
        throw new Error("simulated local storage failure");
      }
      if (trackLocal) localSetCalls.push(clone(values));
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
    const cryptoModule = await import("../../src/chrome/crypto");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const vaultModule = await import("../../src/chrome/vaultCrypto");
    const authModule = await import("../../src/chrome/authHandlers");
    const passkeyModule = await import("../../src/chrome/passkeyUnlock");
    const passkeyCryptoModule = await import(
      "../../src/chrome/passkeyUnlockCrypto"
    );
    const sessionModule = await import("../../src/chrome/sessionCache");
    const transitionModule = await import("../../src/chrome/authTransition");
    const seedModule = await import("../../src/chrome/mnemonic/derivation");
    const seedAccountHandlers = await import(
      "../../src/chrome/mnemonic/accountHandlers"
    );
    const signerModule = await import("../../src/chrome/localSigner");

    const mnemonic =
      "test test test test test test test test test test test junk";
    const secondMnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const masterPassword = "master-password";
    const agentPassword = "agent-password";

    const reset = () => {
      for (const key of Object.keys(local)) delete local[key];
      for (const key of Object.keys(sync)) delete sync[key];
      for (const key of Object.keys(session)) delete session[key];
      sync.autoLockTimeout = 60_000;
      localSetCalls.length = 0;
      rejectLocalSet = null;
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
    };

    const payload = () => ({
      credentialId: Buffer.alloc(64, 0x31).toString("base64url"),
      prfSalt: Buffer.alloc(32, 0x32).toString("base64url"),
      prfKeyMaterial: Buffer.alloc(32, 0x33).toString("base64url"),
      authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
    });

    const installCurrentWallet = async (
      options: { withSeedAccount?: boolean } = {},
    ) => {
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

      const privateKey = options.withSeedAccount
        ? seedModule.derivePrivateKey(mnemonic, 0)
        : (`0x${"11".repeat(32)}` as `0x${string}`);
      const accountId = options.withSeedAccount
        ? "seed-account"
        : "private-account";
      local.pkVault = {
        version: 1,
        entries: [
          {
            id: accountId,
            keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
              privateKey,
              vaultKey,
            ),
          },
        ],
      };
      if (options.withSeedAccount) {
        local.seedGroups = [
          {
            id: "seed-group",
            name: "Seed #1",
            createdAt: 1,
            accountCount: 1,
          },
        ];
        local.accounts = [
          {
            id: accountId,
            type: "seedPhrase",
            address: signerModule.deriveAddress(privateKey),
            seedGroupId: "seed-group",
            derivationIndex: 0,
            createdAt: 1,
          },
        ];
      } else {
        local.accounts = [
          {
            id: accountId,
            type: "privateKey",
            address: signerModule.deriveAddress(privateKey),
            createdAt: 1,
          },
        ];
      }
      return { vaultKeyBytes, vaultKey };
    };

    await t.test(
      "password-only users keep their v1 mnemonic vault unchanged",
      async () => {
        reset();
        await installCurrentWallet();
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const before = clone(local.mnemonicVault);
        localSetCalls.length = 0;

        const unlocked = await authModule.handleUnlockWallet(masterPassword);
        assert.deepEqual(unlocked, {
          success: true,
          passwordType: "master",
        });
        assert.deepEqual(local.mnemonicVault, before);
        assert.equal(
          (local.mnemonicVault as { version: number }).version,
          1,
        );
        assert.equal(local.passkeyUnlock, undefined);
        assert.equal(sessionModule.getCachedMnemonicKey(), null);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", {
            password: masterPassword,
          }),
          mnemonic,
        );
        assert.equal(localSetCalls.length, 0);
      },
    );

    await t.test(
      "v2 passkey round-trips the mnemonic key but an agent cannot obtain it",
      async () => {
        reset();
        const { vaultKeyBytes } = await installCurrentWallet({
          withSeedAccount: true,
        });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });

        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          payload(),
          masterPassword,
        );
        assert.equal(setup.success, true);
        const storedPasskey = local.passkeyUnlock as { version: number };
        const storedMnemonicVault = local.mnemonicVault as {
          version: number;
          keyId: string;
          keyCheck?: unknown;
          entries: unknown[];
        };
        assert.equal(storedPasskey.version, 2);
        assert.equal(storedMnemonicVault.version, 2);
        assert.ok(storedMnemonicVault.keyCheck);
        assert.equal(storedMnemonicVault.entries.length, 1);
        assert.equal(JSON.stringify(local).includes(mnemonic), false);

        const recoveredMnemonicKey =
          await mnemonicModule.unlockMnemonicKeyWithPassword(masterPassword);
        assert.ok(recoveredMnemonicKey);
        const persistedState = JSON.stringify({ local, session });
        for (const secret of [
          masterPassword,
          agentPassword,
          payload().prfKeyMaterial,
          Buffer.from(recoveredMnemonicKey.keyBytes).toString("base64"),
          Buffer.from(vaultKeyBytes).toString("base64"),
          seedModule.derivePrivateKey(mnemonic, 0),
        ]) {
          assert.equal(
            persistedState.includes(secret),
            false,
            `persisted biometric state exposed ${secret.slice(0, 12)}`,
          );
        }
        recoveredMnemonicKey.keyBytes.fill(0);

        sync.autoLockTimeout = 0;
        sessionModule.updateCachedAutoLockTimeout(0);
        sessionModule.clearInMemoryAuthCache();
        const biometric = await passkeyModule.handleUnlockWithPasskey(
          payload(),
        );
        assert.equal(biometric.success, true);
        assert.equal(sessionModule.getPasswordType(), "master");
        const mnemonicKey = sessionModule.getCachedMnemonicKey();
        assert.ok(mnemonicKey);
        assert.equal(mnemonicKey.keyId, storedMnemonicVault.keyId);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", { mnemonicKey }),
          mnemonic,
        );

        const liveAuthEpoch = transitionModule.getAuthCeremonyEpoch();
        let redundantUnlockCalls = 0;
        assert.equal(
          await sessionModule.tryRestoreSession(async (credential) => {
            redundantUnlockCalls += 1;
            return authModule.handleUnlockWallet(credential);
          }),
          true,
        );
        assert.equal(
          redundantUnlockCalls,
          0,
          "a live passwordless passkey session must not be cold-restored",
        );
        assert.equal(
          transitionModule.getAuthCeremonyEpoch(),
          liveAuthEpoch,
          "a no-op restore must preserve the account-mutation epoch",
        );
        assert.equal(
          sessionModule.getCachedMnemonicKey(),
          mnemonicKey,
          "a no-op restore must preserve live V2 mnemonic authority",
        );

        const preparedBankrUpdate =
          await authModule.prepareApiKeyUpdateWithCachedPassword(
            "replacement-bankr-api-key",
          );
        assert.equal(preparedBankrUpdate.success, true);
        assert.equal(transitionModule.getAuthCeremonyEpoch(), liveAuthEpoch);
        assert.equal(sessionModule.getCachedMnemonicKey(), mnemonicKey);

        const addedSeed = await seedAccountHandlers.addSeedPhraseGroup({
          mnemonic: secondMnemonic,
          indices: [0],
          name: "Biometric import",
        });
        assert.equal(addedSeed.success, true, addedSeed.error);
        assert.equal(sessionModule.getCachedMnemonicKey(), mnemonicKey);
        const freshStatus =
          await passkeyModule.handleGetPasskeyUnlockStatus();
        assert.equal(freshStatus.mnemonicCapable, true);
        assert.equal(freshStatus.mnemonicSessionReady, true);

        sessionModule.clearInMemoryAuthCache();
        assert.equal(
          await sessionModule.tryRestoreSession(authModule.handleUnlockWallet),
          true,
        );
        assert.equal(sessionModule.getCachedPassword(), null);
        assert.equal(
          sessionModule.getCachedMnemonicKey(),
          null,
          "cold Never restore retains only routine signing authority",
        );
        const coldStatus = await passkeyModule.handleGetPasskeyUnlockStatus();
        assert.equal(coldStatus.mnemonicCapable, true);
        assert.equal(coldStatus.mnemonicSessionReady, false);
        assert.equal(
          sessionModule.getPrivateKeyFromCache("seed-account"),
          seedModule.derivePrivateKey(mnemonic, 0),
        );
        assert.equal(JSON.stringify(session).includes(mnemonic), false);

        sessionModule.clearInMemoryAuthCache();
        const agent = await authModule.hydrateAuthSessionFromVaultKeyBytes(
          vaultKeyBytes,
          "agent",
          { password: null },
        );
        assert.equal(agent.success, true);
        assert.equal(sessionModule.getPasswordType(), "agent");
        assert.equal(sessionModule.getCachedMnemonicKey(), null);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", {
            password: agentPassword,
            mnemonicKey: sessionModule.getCachedMnemonicKey(),
            legacyVaultKey: sessionModule.getCachedVaultKey(),
          }),
          null,
        );
      },
    );

    await t.test(
      "a validly wrapped but wrong biometric mnemonic key cannot authorize seed writes",
      async () => {
        reset();
        const { vaultKeyBytes } = await installCurrentWallet({
          withSeedAccount: true,
        });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const credential = payload();
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          credential,
          masterPassword,
        );
        assert.equal(setup.success, true);
        const mnemonicVault = local.mnemonicVault as {
          keyId: string;
        };

        // This is not a malformed AES record: it is a fully authenticated
        // wrapper around a different random key with the copied public keyId.
        // The vault's encrypted key check must still reject it.
        const wrongRecord = await passkeyCryptoModule.buildPasskeyRecord(
          credential,
          vaultKeyBytes,
          {
            keyBytes: cryptoModule.generateVaultKey(),
            keyId: mnemonicVault.keyId,
          },
        );
        assert.ok(wrongRecord.record);
        local.passkeyUnlock = wrongRecord.record;
        sessionModule.clearInMemoryAuthCache();

        const biometric = await passkeyModule.handleUnlockWithPasskey({
          ...credential,
          authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
        });
        assert.equal(biometric.success, false);
        assert.match(biometric.error || "", /could not be verified/i);
        assert.equal(sessionModule.getPasswordType(), null);
        assert.equal(sessionModule.getCachedMnemonicKey(), null);

        const master = await authModule.handleUnlockWallet(masterPassword);
        assert.equal(master.success, true);
        const masterMnemonicKey = sessionModule.getCachedMnemonicKey();
        assert.ok(masterMnemonicKey);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", {
            mnemonicKey: masterMnemonicKey,
          }),
          mnemonic,
        );
      },
    );

    await t.test(
      "populated pre-check v2 records retain biometric compatibility",
      async () => {
        reset();
        await installCurrentWallet({ withSeedAccount: true });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const credential = payload();
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          credential,
          masterPassword,
        );
        assert.equal(setup.success, true);
        const oldV2Vault = clone(local.mnemonicVault) as {
          keyCheck?: unknown;
        };
        delete oldV2Vault.keyCheck;
        local.mnemonicVault = oldV2Vault;
        sessionModule.clearInMemoryAuthCache();

        const biometric = await passkeyModule.handleUnlockWithPasskey({
          ...credential,
          authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
        });
        assert.equal(biometric.success, true);
        const status = await passkeyModule.handleGetPasskeyUnlockStatus();
        assert.equal(status.mnemonicCapable, true);
        const mnemonicKey = sessionModule.getCachedMnemonicKey();
        assert.ok(mnemonicKey);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", { mnemonicKey }),
          mnemonic,
        );
      },
    );

    await t.test(
      "master verification rejects a replaced wrapper during a biometric session",
      async () => {
        reset();
        await installCurrentWallet({ withSeedAccount: true });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const credential = payload();
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          credential,
          masterPassword,
        );
        assert.equal(setup.success, true);

        sessionModule.clearInMemoryAuthCache();
        const biometric = await passkeyModule.handleUnlockWithPasskey({
          ...credential,
          authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
        });
        assert.equal(biometric.success, true);
        local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
          cryptoModule.generateVaultKey(),
          masterPassword,
        );

        assert.equal(
          await authModule.verifyMasterPassword(masterPassword),
          false,
        );
        assert.ok(sessionModule.getCachedMnemonicKey());
      },
    );

    await t.test(
      "version 1 passkeys keep signing compatibility without gaining mnemonic access",
      async () => {
        reset();
        const { vaultKeyBytes } = await installCurrentWallet();
        await mnemonicModule.storeMnemonic("legacy-seed", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const credential = payload();
        const built = await passkeyCryptoModule.buildPasskeyRecord(
          credential,
          vaultKeyBytes,
        );
        assert.equal(built.success, true);
        assert.equal(built.record?.version, 1);
        local.passkeyUnlock = built.record;

        const result = await passkeyModule.handleUnlockWithPasskey(credential);
        assert.equal(result.success, true);
        assert.equal(sessionModule.getPasswordType(), "master");
        assert.ok(sessionModule.getCachedVaultKey());
        assert.equal(sessionModule.getCachedMnemonicKey(), null);
        assert.equal(
          await mnemonicModule.getMnemonic("legacy-seed", {
            mnemonicKey: sessionModule.getCachedMnemonicKey(),
            legacyVaultKey: sessionModule.getCachedVaultKey(),
          }),
          null,
        );
        const status = await passkeyModule.handleGetPasskeyUnlockStatus();
        assert.equal(status.configured, true);
        assert.equal(status.mnemonicCapable, false);
      },
    );

    await t.test(
      "transitional shared-vault seed entries migrate only during explicit biometric setup",
      async () => {
        reset();
        const { vaultKey } = await installCurrentWallet({
          withSeedAccount: true,
        });
        local.mnemonicVault = {
          version: 1,
          entries: [
            {
              id: "seed-group",
              keystore: await cryptoModule.encryptWithVaultKey(
                vaultKey,
                mnemonic,
              ),
            },
          ],
        };

        const before = clone(local.mnemonicVault);
        const unlocked = await authModule.handleUnlockWallet(masterPassword);
        assert.equal(unlocked.success, true);
        assert.deepEqual(local.mnemonicVault, before);

        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          payload(),
          masterPassword,
        );
        assert.equal(setup.success, true);
        assert.equal((local.mnemonicVault as { version: number }).version, 2);
        const mnemonicKey = sessionModule.getCachedMnemonicKey();
        assert.ok(mnemonicKey);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", { mnemonicKey }),
          mnemonic,
        );
      },
    );

    await t.test(
      "a failed v1-to-v2 commit preserves the old mnemonic vault",
      async () => {
        reset();
        await installCurrentWallet({ withSeedAccount: true });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const before = clone(local.mnemonicVault);
        rejectLocalSet = (values) =>
          "mnemonicVault" in values && "passkeyUnlock" in values;
        const originalConsoleError = console.error;
        console.error = () => {};
        const result = await passkeyModule
          .handleSetupPasskeyUnlockWithPassword(payload(), masterPassword)
          .finally(() => {
            console.error = originalConsoleError;
          });
        rejectLocalSet = null;

        assert.equal(result.success, false);
        assert.deepEqual(local.mnemonicVault, before);
        assert.equal(local.passkeyUnlock, undefined);
        assert.equal(sessionModule.getPasswordType(), null);
        assert.equal(sessionModule.getCachedMnemonicKey(), null);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", {
            password: masterPassword,
          }),
          mnemonic,
        );
      },
    );

    await t.test(
      "concurrent v2 mnemonic writes serialize without losing entries",
      async () => {
        reset();
        await installCurrentWallet({ withSeedAccount: true });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          payload(),
          masterPassword,
        );
        assert.equal(setup.success, true);
        const mnemonicKey = sessionModule.getCachedMnemonicKey();
        assert.ok(mnemonicKey);

        await Promise.all([
          mnemonicModule.storeMnemonic("seed-group-2", secondMnemonic, {
            kind: "mnemonic-key",
            key: mnemonicKey.key,
            keyId: mnemonicKey.keyId,
          }),
          mnemonicModule.storeMnemonic("seed-group-3", mnemonic, {
            kind: "mnemonic-key",
            key: mnemonicKey.key,
            keyId: mnemonicKey.keyId,
          }),
        ]);

        const vault = await mnemonicModule.loadMnemonicVault();
        assert.equal(vault?.version, 2);
        if (!vault || vault.version !== 2) {
          throw new Error("Expected a v2 mnemonic vault");
        }
        assert.equal(vault.revision, 2);
        assert.deepEqual(
          vault.entries.map(({ id }) => id).sort(),
          ["seed-group", "seed-group-2", "seed-group-3"],
        );
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group-2", { mnemonicKey }),
          secondMnemonic,
        );
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group-3", { mnemonicKey }),
          mnemonic,
        );
      },
    );

    await t.test(
      "passkey removal fails closed when the v2 mnemonic master wrapper is corrupt",
      async () => {
        reset();
        await installCurrentWallet({ withSeedAccount: true });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          payload(),
          masterPassword,
        );
        assert.equal(setup.success, true);
        const passkeyBeforeRemoval = clone(local.passkeyUnlock);
        const corruptedVault = clone(local.mnemonicVault) as {
          masterWrappedKey: { ciphertext: string };
        };
        corruptedVault.masterWrappedKey.ciphertext = Buffer.alloc(
          48,
          0x7a,
        ).toString("base64");
        local.mnemonicVault = corruptedVault;

        const result = await passkeyModule.handleRemovePasskeyUnlock(
          masterPassword,
        );

        assert.equal(result.success, false);
        assert.match(result.error || "", /not removed/i);
        assert.deepEqual(local.passkeyUnlock, passkeyBeforeRemoval);
      },
    );

    await t.test(
      "passkey removal preserves biometrics when the general master wrapper decrypts to the wrong key",
      async () => {
        reset();
        await installCurrentWallet({ withSeedAccount: true });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          payload(),
          masterPassword,
        );
        assert.equal(setup.success, true);
        const passkeyBeforeRemoval = clone(local.passkeyUnlock);
        local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
          cryptoModule.generateVaultKey(),
          masterPassword,
        );

        const result = await passkeyModule.handleRemovePasskeyUnlock(
          masterPassword,
        );

        assert.equal(result.success, false);
        assert.match(result.error || "", /not removed/i);
        assert.deepEqual(local.passkeyUnlock, passkeyBeforeRemoval);
      },
    );

    await t.test(
      "password rotation preserves the passkey when the mnemonic master wrapper decrypts to the wrong key",
      async () => {
        reset();
        await installCurrentWallet({ withSeedAccount: true });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const credential = payload();
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          credential,
          masterPassword,
        );
        assert.equal(setup.success, true);
        const passkeyBeforeRotation = clone(local.passkeyUnlock);
        const mnemonicVault = clone(local.mnemonicVault) as {
          masterWrappedKey: unknown;
        };
        mnemonicVault.masterWrappedKey = await cryptoModule.encryptVaultKey(
          cryptoModule.generateVaultKey(),
          masterPassword,
        );
        local.mnemonicVault = mnemonicVault;

        const result = await authModule.handleChangePassword(
          masterPassword,
          "new-master-password",
        );

        assert.equal(result.success, false);
        assert.match(result.error || "", /not changed/i);
        assert.deepEqual(local.passkeyUnlock, passkeyBeforeRotation);

        sessionModule.clearInMemoryAuthCache();
        const biometric = await passkeyModule.handleUnlockWithPasskey(
          {
            ...credential,
            authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
          },
        );
        assert.equal(biometric.success, true);
        const mnemonicKey = sessionModule.getCachedMnemonicKey();
        assert.ok(mnemonicKey);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", { mnemonicKey }),
          mnemonic,
        );
      },
    );

    await t.test(
      "passkey removal fails closed when a v2 phrase no longer matches its seed account",
      async () => {
        reset();
        await installCurrentWallet({ withSeedAccount: true });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          payload(),
          masterPassword,
        );
        assert.equal(setup.success, true);
        const passkeyBeforeRemoval = clone(local.passkeyUnlock);
        const accounts = local.accounts as Array<{ address: string }>;
        accounts[0].address = signerModule.deriveAddress(
          seedModule.derivePrivateKey(secondMnemonic, 0),
        );

        const result = await passkeyModule.handleRemovePasskeyUnlock(
          masterPassword,
        );

        assert.equal(result.success, false);
        assert.match(result.error || "", /does not match/i);
        assert.deepEqual(local.passkeyUnlock, passkeyBeforeRemoval);
      },
    );

    await t.test(
      "passkey removal succeeds after a complete v2 mnemonic integrity check",
      async () => {
        reset();
        await installCurrentWallet({ withSeedAccount: true });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          payload(),
          masterPassword,
        );
        assert.equal(setup.success, true);

        const result = await passkeyModule.handleRemovePasskeyUnlock(
          masterPassword,
        );

        assert.equal(result.success, true);
        assert.equal(local.passkeyUnlock, undefined);
        const unlockedMnemonicKey =
          await mnemonicModule.unlockMnemonicKeyWithPassword(masterPassword);
        assert.ok(unlockedMnemonicKey);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", {
            mnemonicKey: {
              key: unlockedMnemonicKey.key,
              keyId: unlockedMnemonicKey.keyId,
            },
          }),
          mnemonic,
        );
      },
    );

    await t.test(
      "legacy v1 and no-mnemonic wallets keep biometric removal compatibility",
      async () => {
        for (const withLegacyMnemonic of [true, false]) {
          reset();
          const { vaultKeyBytes } = await installCurrentWallet();
          if (withLegacyMnemonic) {
            await mnemonicModule.storeMnemonic("legacy-seed", mnemonic, {
              kind: "password",
              password: masterPassword,
            });
          }
          const credential = payload();
          const built = await passkeyCryptoModule.buildPasskeyRecord(
            credential,
            vaultKeyBytes,
          );
          assert.equal(built.success, true);
          local.passkeyUnlock = built.record;

          const result = await passkeyModule.handleRemovePasskeyUnlock(
            masterPassword,
          );

          assert.equal(result.success, true);
          assert.equal(local.passkeyUnlock, undefined);
          if (withLegacyMnemonic) {
            assert.equal(
              await mnemonicModule.getMnemonic("legacy-seed", {
                password: masterPassword,
              }),
              mnemonic,
            );
          }
        }
      },
    );

    await t.test(
      "passkey master sessions can set an agent factor with explicit master proof",
      async () => {
        reset();
        const { vaultKeyBytes } = await installCurrentWallet({
          withSeedAccount: true,
        });
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password: masterPassword,
        });
        const credential = payload();
        const setup = await passkeyModule.handleSetupPasskeyUnlockWithPassword(
          credential,
          masterPassword,
        );
        assert.equal(setup.success, true);
        local.encryptedVaultKeyAgent = null;
        local.agentPasswordEnabled = false;
        sessionModule.clearInMemoryAuthCache();

        const biometric = await passkeyModule.handleUnlockWithPasskey({
          ...credential,
          authCeremonyEpoch: transitionModule.getAuthCeremonyEpoch(),
        });
        assert.equal(biometric.success, true);
        assert.equal(sessionModule.getCachedPassword(), null);
        assert.equal(sessionModule.getPasswordType(), "master");

        const identicalButWrong = await authModule.handleSetAgentPassword(
          "wrong-master-password",
          "wrong-master-password",
        );
        assert.equal(identicalButWrong.success, false);
        assert.equal(identicalButWrong.error, "Invalid master password");

        const rejected = await authModule.handleSetAgentPassword(
          "replacement-agent-password",
          "wrong-master-password",
        );
        assert.equal(rejected.success, false);
        assert.equal(rejected.error, "Invalid master password");
        assert.equal(local.encryptedVaultKeyAgent, null);
        assert.equal(local.agentPasswordEnabled, false);

        const accepted = await authModule.handleSetAgentPassword(
          "replacement-agent-password",
          masterPassword,
        );
        assert.equal(accepted.success, true, accepted.error);
        assert.equal(local.agentPasswordEnabled, true);
        const recovered = await cryptoModule.tryDecryptVaultKey(
          local.encryptedVaultKeyAgent as Parameters<
            typeof cryptoModule.tryDecryptVaultKey
          >[0],
          "replacement-agent-password",
        );
        assert.deepEqual(recovered, vaultKeyBytes);
        recovered?.fill(0);
        assert.equal(sessionModule.getCachedPassword(), null);
        assert.equal(sessionModule.getPasswordType(), "master");
      },
    );

    await t.test(
      "agent-factor removal preserves the agent wrapper when master recovery is corrupt",
      async () => {
        reset();
        await installCurrentWallet();
        const agentWrapper = clone(local.encryptedVaultKeyAgent);
        local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
          cryptoModule.generateVaultKey(),
          masterPassword,
        );

        const result = await authModule.handleRemoveAgentPassword(
          masterPassword,
        );

        assert.equal(result.success, false);
        assert.match(result.error || "", /not removed/i);
        assert.deepEqual(local.encryptedVaultKeyAgent, agentWrapper);
        assert.equal(local.agentPasswordEnabled, true);
      },
    );

    await t.test(
      "agent-factor removal succeeds only after full master recovery validation",
      async () => {
        reset();
        await installCurrentWallet();

        const result = await authModule.handleRemoveAgentPassword(
          masterPassword,
        );

        assert.equal(result.success, true);
        assert.equal(local.encryptedVaultKeyAgent, null);
        assert.equal(local.agentPasswordEnabled, false);
        assert.equal(sessionModule.getPasswordType(), null);
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
