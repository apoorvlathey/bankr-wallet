import assert from "node:assert/strict";
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

test("passkey hydration supports all wallet caches and vault-key mutations", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};

  const storageArea = (storage: StorageRecord) => ({
    async get(keys?: string | string[] | StorageRecord | null) {
      return selectStorageValues(storage, keys);
    },
    async set(values: StorageRecord) {
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
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const vaultModule = await import("../../src/chrome/vaultCrypto");
    const authModule = await import("../../src/chrome/authHandlers");
    const sessionModule = await import("../../src/chrome/sessionCache");
    const signerModule = await import("../../src/chrome/localSigner");

    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);

    // Bankr accounts hydrate the decrypted API key cache.
    local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
      vaultKey,
      "bankr-api-key",
    );
    let result = await authModule.hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      { password: null },
    );
    assert.equal(result.success, true);
    assert.equal(sessionModule.getCachedApiKey(), "bankr-api-key");
    sessionModule.clearInMemoryAuthCache();

    delete local.encryptedApiKeyVault;
    const privateKey = `0x${"11".repeat(32)}` as `0x${string}`;
    local.accounts = [
      {
        id: "private-account",
        type: "privateKey",
        address: signerModule.deriveAddress(privateKey),
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
    result = await authModule.hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      { password: null },
    );
    assert.equal(result.success, true);
    assert.equal(
      sessionModule.getPrivateKeyFromCache("private-account"),
      privateKey,
    );
    sessionModule.clearInMemoryAuthCache();

    // Seed-phrase accounts sign through their derived key stored in pkVault.
    const seedDerivedKey = `0x${"22".repeat(32)}` as `0x${string}`;
    local.accounts = [
      {
        id: "seed-account",
        type: "seedPhrase",
        address: signerModule.deriveAddress(seedDerivedKey),
        seedGroupId: "seed-group",
        derivationIndex: 0,
        createdAt: 1,
      },
    ];
    local.pkVault = {
      version: 1,
      entries: [
        {
          id: "seed-account",
          keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
            seedDerivedKey,
            vaultKey,
          ),
        },
      ],
    };
    result = await authModule.hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      { password: null },
    );
    assert.equal(result.success, true);
    assert.equal(
      sessionModule.getPrivateKeyFromCache("seed-account"),
      seedDerivedKey,
    );

    // A biometric master session has no plaintext password, but it must still
    // be able to add vault-key-backed private-key entries.
    const addedPrivateKey = `0x${"33".repeat(32)}` as `0x${string}`;
    await vaultModule.addKeyToVault(
      "biometric-account",
      addedPrivateKey,
      undefined,
    );
    const addedKeystore = (
      local.pkVault as {
        entries: Array<{ id: string; keystore: { salt: string } }>;
      }
    ).entries.find((entry) => entry.id === "biometric-account")?.keystore;
    assert.equal(addedKeystore?.salt, "");

    // Bankr credential updates use the same cached vault-key capability.
    const apiKeyResult = await authModule.handleSaveApiKeyWithCachedPassword(
      "biometric-bankr-api-key",
    );
    assert.equal(apiKeyResult.success, true);
    assert.equal(
      await cryptoModule.decryptWithVaultKey(
        vaultKey,
        local.encryptedApiKeyVault as Parameters<
          typeof cryptoModule.decryptWithVaultKey
        >[1],
      ),
      "biometric-bankr-api-key",
    );

    // Password rotation from a biometric session requires the explicit old
    // master password, preserves all three wallet data paths, and invalidates
    // secondary unlock factors.
    const oldPassword = "old-master-password";
    const newPassword = "new-master-password";
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
    const mnemonic = "test test test test test test test test test test test junk";
    await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
      kind: "password",
      password: oldPassword,
    });

    assert.equal(await authModule.verifyMasterPassword(oldPassword), true);
    assert.equal(await authModule.verifyMasterPassword("wrong-password"), false);

    const passwordChangeResult = await authModule.handleChangePassword(
      oldPassword,
      newPassword,
    );
    assert.equal(passwordChangeResult.success, true);
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
    assert.equal(local.encryptedVaultKeyAgent, null);
    assert.equal(local.agentPasswordEnabled, false);
    assert.equal(local.passkeyUnlock, null);
    assert.equal(
      await cryptoModule.decryptWithVaultKey(
        vaultKey,
        local.encryptedApiKeyVault as Parameters<
          typeof cryptoModule.decryptWithVaultKey
        >[1],
      ),
      "biometric-bankr-api-key",
    );
    const rotatedVault = local.pkVault as {
      entries: Array<{ id: string; keystore: { salt: string } }>;
    };
    assert.equal(
      rotatedVault.entries.every((entry) => entry.keystore.salt === ""),
      true,
    );

    // The vault key is not sufficient on its own for a restricted agent
    // session: master-only credential mutation remains backend-enforced.
    sessionModule.clearInMemoryAuthCache();
    result = await authModule.hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "agent",
      { password: null },
    );
    assert.equal(result.success, true);
    const agentApiKeyResult =
      await authModule.handleSaveApiKeyWithCachedPassword("blocked-agent-key");
    assert.equal(agentApiKeyResult.success, false);
    assert.match(agentApiKeyResult.error || "", /master password/i);
    sessionModule.clearInMemoryAuthCache();
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
