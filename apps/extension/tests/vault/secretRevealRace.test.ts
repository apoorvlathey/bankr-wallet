import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

const clone = <T>(value: T): T => structuredClone(value);

function requestedKeys(
  keys?: string | string[] | StorageRecord | null,
): string[] {
  if (keys == null) return [];
  if (typeof keys === "string") return [keys];
  return Array.isArray(keys) ? keys : Object.keys(keys);
}

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return clone(storage);
  const entries =
    typeof keys === "string"
      ? [[keys, storage[keys]]]
      : Array.isArray(keys)
        ? keys.map((key) => [key, storage[key]])
        : Object.entries(keys).map(([key, fallback]) => [
            key,
            storage[key] ?? fallback,
          ]);
  return Object.fromEntries(clone(entries));
}

test("master secret reveals are linearized against auth teardown", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};
  let beforeLocalGet:
    | ((keys: string[]) => Promise<void> | void)
    | null = null;

  const storageArea = (storage: StorageRecord, isLocal = false) => ({
    async get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      if (isLocal) await beforeLocalGet?.(requestedKeys(keys));
      const values = selectStorageValues(storage, keys);
      if (callback) callback(values);
      return values;
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
        local: storageArea(local, true),
        sync: storageArea(sync),
        session: storageArea(session),
      },
    },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const vaultModule = await import("../../src/chrome/vaultCrypto");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const seedModule = await import("../../src/chrome/mnemonic/derivation");
    const signerModule = await import("../../src/chrome/localSigner");
    const sessionModule = await import("../../src/chrome/sessionCache");
    const authModule = await import("../../src/chrome/authHandlers");
    const passkeyModule = await import("../../src/chrome/passkeyUnlock");
    const transitionModule = await import("../../src/chrome/authTransition");
    const terminationModule = await import(
      "../../src/chrome/auth/sessionTermination"
    );
    const storageLockModule = await import("../../src/chrome/storageLock");
    const revealModule = await import("../../src/chrome/secretRevealHandlers");

    const password = "master-password";
    const mnemonic =
      "test test test test test test test test test test test junk";
    const seedPrivateKey = seedModule.derivePrivateKey(mnemonic, 0);
    const seedAddress = signerModule.deriveAddress(seedPrivateKey).toLowerCase();
    const privateKey = `0x${"22".repeat(32)}` as `0x${string}`;
    const privateAddress = signerModule.deriveAddress(privateKey).toLowerCase();

    const reset = () => {
      for (const key of Object.keys(local)) delete local[key];
      for (const key of Object.keys(sync)) delete sync[key];
      for (const key of Object.keys(session)) delete session[key];
      sync.autoLockTimeout = 60_000;
      beforeLocalGet = null;
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
      transitionModule.invalidateAuthCeremonies();
    };

    const installLegacySeedWallet = async () => {
      local.encryptedApiKey = await cryptoModule.encrypt(
        "legacy-bankr-credential",
        password,
      );
      local.accounts = [
        {
          id: "legacy-seed-account",
          type: "seedPhrase",
          address: seedAddress,
          seedGroupId: "legacy-seed-group",
          derivationIndex: 0,
          createdAt: 1,
        },
      ];
      local.seedGroups = [
        {
          id: "legacy-seed-group",
          name: "Legacy seed",
          accountCount: 1,
          createdAt: 1,
        },
      ];
      local.pkVault = {
        version: 1,
        entries: [
          {
            id: "legacy-seed-account",
            keystore: await vaultModule.encryptPrivateKey(
              seedPrivateKey,
              password,
            ),
          },
        ],
      };
      await mnemonicModule.storeMnemonic("legacy-seed-group", mnemonic, {
        kind: "password",
        password,
      });
      sessionModule.setCachedApiKey("legacy-bankr-credential", password);
      sessionModule.setCachedVault([
        { id: "legacy-seed-account", privateKey: seedPrivateKey },
      ]);
      sessionModule.setCachedPasswordType("master");
    };

    const installModernSeedWallet = async () => {
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      const mnemonicKeyBytes = cryptoModule.generateVaultKey();
      const mnemonicKey = await cryptoModule.importVaultKey(mnemonicKeyBytes);
      const mnemonicKeyId = "mnemonic-key-id";

      local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        password,
      );
      local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
        vaultKey,
        "modern-bankr-credential",
      );
      local.accounts = [
        {
          id: "modern-seed-account",
          type: "seedPhrase",
          address: seedAddress,
          seedGroupId: "modern-seed-group",
          derivationIndex: 0,
          createdAt: 1,
        },
      ];
      local.seedGroups = [
        {
          id: "modern-seed-group",
          name: "Modern seed",
          accountCount: 1,
          createdAt: 1,
        },
      ];
      local.pkVault = {
        version: 1,
        entries: [
          {
            id: "modern-seed-account",
            keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
              seedPrivateKey,
              vaultKey,
            ),
          },
        ],
      };
      await mnemonicModule.storeMnemonic("modern-seed-group", mnemonic, {
        kind: "password",
        password,
      });
      const masterWrappedKey = await cryptoModule.encryptVaultKey(
        mnemonicKeyBytes,
        password,
      );
      const prepared = await mnemonicModule.prepareMnemonicKeyVault(
        password,
        mnemonicKey,
        mnemonicKeyId,
        masterWrappedKey,
        vaultKey,
      );
      assert.ok(prepared);
      local.mnemonicVault = prepared;
      local.passkeyUnlock = { configured: true };

      const hydrated = await authModule.hydrateAuthSessionFromVaultKeyBytes(
        vaultKeyBytes,
        "master",
        {
          password,
          mnemonicKey: { key: mnemonicKey, keyId: mnemonicKeyId },
        },
      );
      assert.equal(hydrated.success, true);
      return { vaultKeyBytes, vaultKey };
    };

    const installModernPrivateKeyWallet = async () => {
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      local.encryptedVaultKeyMaster = await cryptoModule.encryptVaultKey(
        vaultKeyBytes,
        password,
      );
      local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
        vaultKey,
        "modern-bankr-credential",
      );
      local.accounts = [
        {
          id: "private-account",
          type: "privateKey",
          address: privateAddress,
          createdAt: 1,
        },
      ];
      local.pkVault = {
        version: 1,
        entries: [
          {
            id: "private-account",
            keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
              privateKey,
              vaultKey,
            ),
          },
        ],
      };
      const hydrated = await authModule.hydrateAuthSessionFromVaultKeyBytes(
        vaultKeyBytes,
        "master",
        { password },
      );
      assert.equal(hydrated.success, true);
    };

    await t.test(
      "a manual lock during V1 mnemonic verification prevents plaintext release",
      async () => {
        reset();
        await installLegacySeedWallet();

        let releaseWrapperRead!: () => void;
        let wrapperReadStarted!: () => void;
        const wrapperReadGate = new Promise<void>((resolve) => {
          releaseWrapperRead = resolve;
        });
        const wrapperReadObserved = new Promise<void>((resolve) => {
          wrapperReadStarted = resolve;
        });
        let gateUsed = false;
        beforeLocalGet = async (keys) => {
          if (!gateUsed && keys.includes("encryptedVaultKeyMaster")) {
            gateUsed = true;
            wrapperReadStarted();
            await wrapperReadGate;
          }
        };

        let response: unknown;
        const reveal = revealModule.handleRevealSeedPhrase(
          "legacy-seed-group",
          password,
          (value) => {
            response = value;
          },
        );
        await wrapperReadObserved;
        await terminationModule.terminateActiveAuthSession();
        releaseWrapperRead();
        await reveal;

        assert.deepEqual(response, {
          success: false,
          error: "Authentication state changed. Unlock and try again.",
        });
      },
    );

    await t.test(
      "V2 passkey-factor removal wins before a queued mnemonic reveal",
      async () => {
        reset();
        await installModernSeedWallet();

        let releaseRemovalRead!: () => void;
        let removalReadStarted!: () => void;
        const removalReadGate = new Promise<void>((resolve) => {
          releaseRemovalRead = resolve;
        });
        const removalReadObserved = new Promise<void>((resolve) => {
          removalReadStarted = resolve;
        });
        let gateUsed = false;
        beforeLocalGet = async (keys) => {
          if (!gateUsed && keys.includes("encryptedVaultKeyMaster")) {
            gateUsed = true;
            removalReadStarted();
            await removalReadGate;
          }
        };

        const removal = passkeyModule.handleRemovePasskeyUnlock(password);
        await removalReadObserved;
        let response: unknown;
        const reveal = revealModule.handleRevealSeedPhrase(
          "modern-seed-group",
          password,
          (value) => {
            response = value;
          },
        );
        releaseRemovalRead();

        assert.equal((await removal).success, true);
        await reveal;
        assert.equal(local.passkeyUnlock, undefined);
        assert.equal((response as { success?: boolean })?.success, false);
        assert.equal(
          Object.prototype.hasOwnProperty.call(response ?? {}, "mnemonic"),
          false,
        );
      },
    );

    await t.test(
      "a cache-miss private-key response is emitted before queued password rotation",
      async () => {
        reset();
        await installModernPrivateKeyWallet();
        // Keep the authenticated vault key but force the reveal down its async
        // encrypted-vault read path.
        sessionModule.setCachedVault([]);

        let pkVaultReads = 0;
        let releaseRevealRead!: () => void;
        let revealReadStarted!: () => void;
        const revealReadGate = new Promise<void>((resolve) => {
          releaseRevealRead = resolve;
        });
        const revealReadObserved = new Promise<void>((resolve) => {
          revealReadStarted = resolve;
        });
        beforeLocalGet = async (keys) => {
          if (keys.includes("pkVault")) {
            pkVaultReads += 1;
            // First read is the explicit-master integrity proof; the second is
            // the actual cache-miss reveal while it owns the operation lock.
            if (pkVaultReads === 2) {
              revealReadStarted();
              await revealReadGate;
            }
          }
        };

        let rotationFinished = false;
        let responseBeforeRotation = false;
        let response: unknown;
        const reveal = revealModule.handleRevealPrivateKey(
          "private-account",
          password,
          (value) => {
            responseBeforeRotation = !rotationFinished;
            response = value;
          },
        );
        await revealReadObserved;
        const rotation = authModule
          .handleChangePassword(password, "new-master-password")
          .then((value) => {
            rotationFinished = true;
            return value;
          });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        assert.equal(rotationFinished, false);

        releaseRevealRead();
        await reveal;
        assert.deepEqual(response, { success: true, privateKey });
        assert.equal(responseBeforeRotation, true);
        assert.equal((await rotation).success, true);
      },
    );

    await t.test(
      "passkey password preflight cannot adopt an epoch created by a concurrent lock",
      async () => {
        reset();
        await installModernPrivateKeyWallet();

        let releaseWrapperRead!: () => void;
        let wrapperReadStarted!: () => void;
        const wrapperReadGate = new Promise<void>((resolve) => {
          releaseWrapperRead = resolve;
        });
        const wrapperReadObserved = new Promise<void>((resolve) => {
          wrapperReadStarted = resolve;
        });
        let gateUsed = false;
        beforeLocalGet = async (keys) => {
          if (!gateUsed && keys.includes("encryptedVaultKeyMaster")) {
            gateUsed = true;
            wrapperReadStarted();
            await wrapperReadGate;
          }
        };

        const preflight = passkeyModule.handleVerifyPasskeySetupPassword(
          password,
        );
        await wrapperReadObserved;
        await terminationModule.terminateActiveAuthSession();
        releaseWrapperRead();
        const result = await preflight;

        assert.equal(result.success, false);
        assert.match(result.error || "", /authentication state changed/i);
        assert.equal(result.authCeremonyEpoch, undefined);
      },
    );

    await t.test(
      "cached-session passkey preflight also rejects a concurrent lock epoch",
      async () => {
        reset();
        await installModernPrivateKeyWallet();

        let releaseWrapperRead!: () => void;
        let wrapperReadStarted!: () => void;
        const wrapperReadGate = new Promise<void>((resolve) => {
          releaseWrapperRead = resolve;
        });
        const wrapperReadObserved = new Promise<void>((resolve) => {
          wrapperReadStarted = resolve;
        });
        let gateUsed = false;
        beforeLocalGet = async (keys) => {
          if (!gateUsed && keys.includes("encryptedVaultKeyMaster")) {
            gateUsed = true;
            wrapperReadStarted();
            await wrapperReadGate;
          }
        };

        const preflight = passkeyModule.handleCanSetupPasskeyUnlock();
        await wrapperReadObserved;
        await terminationModule.terminateActiveAuthSession();
        releaseWrapperRead();
        const result = await preflight;

        assert.equal(result.success, false);
        assert.match(result.error || "", /authentication state changed/i);
        assert.equal(result.authCeremonyEpoch, undefined);
      },
    );

    await t.test(
      "current-session passkey setup cannot revive a session that expires while waiting for the secret lock",
      async () => {
        const originalDateNow = Date.now;
        let now = 10_000_000;
        Date.now = () => now;
        try {
          reset();
          await installModernPrivateKeyWallet();
          const preflight = await passkeyModule.handleCanSetupPasskeyUnlock();
          assert.equal(preflight.success, true);
          assert.ok(preflight.authCeremonyEpoch);

          let releaseLock!: () => void;
          let lockEntered!: () => void;
          const lockGate = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          const lockObserved = new Promise<void>((resolve) => {
            lockEntered = resolve;
          });
          const blocker = storageLockModule.withStorageLock(
            storageLockModule.WALLET_SECRET_OPERATION_LOCK_KEY,
            async () => {
              lockEntered();
              await lockGate;
            },
          );
          await lockObserved;

          let wrapperRead!: () => void;
          const wrapperReadObserved = new Promise<void>((resolve) => {
            wrapperRead = resolve;
          });
          let observed = false;
          beforeLocalGet = (keys) => {
            if (!observed && keys.includes("encryptedVaultKeyMaster")) {
              observed = true;
              wrapperRead();
            }
          };

          const setup = passkeyModule.handleSetupPasskeyUnlock({
            credentialId: Buffer.alloc(64, 0x31).toString("base64url"),
            prfSalt: Buffer.alloc(32, 0x32).toString("base64url"),
            prfKeyMaterial: Buffer.alloc(32, 0x33).toString("base64url"),
            authCeremonyEpoch: preflight.authCeremonyEpoch!,
          });
          await wrapperReadObserved;
          now += 60_001;
          releaseLock();
          await blocker;

          const result = await setup;
          assert.equal(result.success, false);
          assert.match(result.error || "", /authentication state changed/i);
          assert.equal(local.passkeyUnlock, undefined);
          assert.equal(local.mnemonicVault, undefined);
          assert.equal(sessionModule.getPasswordType(), null);
        } finally {
          Date.now = originalDateNow;
          beforeLocalGet = null;
        }
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
