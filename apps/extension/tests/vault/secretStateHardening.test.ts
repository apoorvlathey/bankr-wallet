import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

type StorageRecord = Record<string, unknown>;

const clone = <T>(value: T): T => structuredClone(value);

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

test("wallet secret-state mutations fail toward encrypted orphans", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};
  const runtimeMessages: unknown[] = [];
  let rejectLocalSet: ((values: StorageRecord) => boolean) | null = null;
  let viteServer: ViteDevServer | null = null;

  const storageArea = (storage: StorageRecord, localArea = false) => ({
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
      if (localArea && rejectLocalSet?.(values)) {
        throw new Error("simulated local storage failure");
      }
      // Yield to make unprotected read-modify-write races deterministic.
      await Promise.resolve();
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
        async sendMessage(message: unknown) {
          runtimeMessages.push(message);
        },
      },
      storage: {
        local: storageArea(local, true),
        sync: storageArea(sync),
        session: storageArea(session),
      },
      action: {
        async setBadgeText() {},
        async setBadgeBackgroundColor() {},
      },
    },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const vaultModule = await import("../../src/chrome/vaultCrypto");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const sessionModule = await import("../../src/chrome/sessionCache");
    const authModule = await import("../../src/chrome/authHandlers");
    const accountModule = await import("../../src/chrome/accountStorage");
    const bankrCredentialBinding = await import(
      "../../src/chrome/bankr/credentialBinding"
    );
    const storageLockModule = await import("../../src/chrome/storageLock");
    const authTerminationModule = await import(
      "../../src/chrome/auth/sessionTermination"
    );
    const extensionRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    viteServer = await createServer({
      root: extensionRoot,
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: { port: 20_000 + (process.pid % 10_000) },
        watch: { ignored: ["**/build/**", "**/build-firefox/**"] },
      },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(extensionRoot, "src") } },
      plugins: [
        {
          name: "secret-state-test-gas-cycle",
          resolveId(source, importer) {
            if (
              source === "./gasEstimation" &&
              importer?.endsWith("/chrome/txHandlers.ts")
            ) {
              return "\0secret-state-test-gas-cycle";
            }
            return null;
          },
          load(id) {
            if (id === "\0secret-state-test-gas-cycle") {
              return "export const bumpGasForEip7702Auth = (gas) => gas;";
            }
            return null;
          },
        },
      ],
    });
    const txModule = await viteServer.ssrLoadModule(
      "/src/chrome/txHandlers.ts",
    );

    const password = "master-password";
    const keyA = `0x${"11".repeat(32)}` as `0x${string}`;
    const keyB = `0x${"22".repeat(32)}` as `0x${string}`;
    const keyC = `0x${"33".repeat(32)}` as `0x${string}`;
    const mnemonic =
      "test test test test test test test test test test test junk";

    const reset = () => {
      for (const key of Object.keys(local)) delete local[key];
      for (const key of Object.keys(sync)) delete sync[key];
      for (const key of Object.keys(session)) delete session[key];
      sync.autoLockTimeout = 60_000;
      runtimeMessages.length = 0;
      rejectLocalSet = null;
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
    };

    await t.test(
      "manual lock waits for an in-flight secret mutation before clearing keys",
      async () => {
        reset();
        const vaultKey = await cryptoModule.importVaultKey(
          cryptoModule.generateVaultKey(),
        );
        sessionModule.setCachedVaultKey(vaultKey);
        sessionModule.setCachedPasswordDirect(password);
        sessionModule.setCachedPasswordType("master");

        let releaseMutation!: () => void;
        let markMutationStarted!: () => void;
        const mutationGate = new Promise<void>((resolve) => {
          releaseMutation = resolve;
        });
        const mutationStarted = new Promise<void>((resolve) => {
          markMutationStarted = resolve;
        });

        const mutation = storageLockModule.withStorageLock(
          storageLockModule.WALLET_SECRET_OPERATION_LOCK_KEY,
          async () => {
            assert.ok(sessionModule.getCachedVaultKey());
            markMutationStarted();
            await mutationGate;
            // The lock request must not clear the key from underneath the
            // operation that linearized first.
            assert.ok(sessionModule.getCachedVaultKey());
          },
        );
        await mutationStarted;

        let lockFinished = false;
        const lock = authTerminationModule
          .terminateActiveAuthSession(true)
          .then(() => {
            lockFinished = true;
          });
        await Promise.resolve();

        assert.equal(lockFinished, false);
        assert.ok(sessionModule.getCachedVaultKey());

        releaseMutation();
        await mutation;
        await lock;

        assert.equal(sessionModule.getCachedVaultKey(), null);
        assert.equal(sessionModule.getCachedPassword(), null);
        assert.equal(sessionModule.getPasswordType(), null);
        assert.deepEqual(runtimeMessages.at(-1), {
          type: "walletLockedExternal",
          suppressPasskeyAutoPrompt: true,
        });
      },
    );

    await t.test(
      "concurrent pkVault add and remove preserve unrelated entries",
      async () => {
        reset();
        local.pkVault = {
          version: 1,
          entries: [
            {
              id: "keep",
              keystore: await vaultModule.encryptPrivateKey(keyA, password),
            },
            {
              id: "remove",
              keystore: await vaultModule.encryptPrivateKey(keyB, password),
            },
          ],
        };

        await Promise.all([
          vaultModule.addKeyToVault("add", keyC, password),
          vaultModule.removeKeyFromVault("remove"),
        ]);

        const vault = await vaultModule.loadVault();
        assert.deepEqual(
          vault?.entries.map(({ id }) => id).sort(),
          ["add", "keep"],
        );
        const added = vault?.entries.find(({ id }) => id === "add");
        assert.ok(added);
        assert.equal(
          await vaultModule.decryptPrivateKey(added.keystore, password),
          keyC,
        );
      },
    );

    await t.test(
      "a migrated wallet never falls back to legacy key encryption after cache expiry",
      async () => {
        reset();
        local.encryptedVaultKeyMaster = { present: true };

        await assert.rejects(
          vaultModule.addKeyToVault("expired", keyA, password),
          /unlock again/i,
        );
        assert.equal(await vaultModule.loadVault(), null);
      },
    );

    await t.test(
      "failed private-key persistence never publishes account metadata",
      async () => {
        reset();
        local.accounts = [
          {
            id: "survivor",
            type: "impersonator",
            address: "0x1111111111111111111111111111111111111111",
            createdAt: 1,
          },
        ];
        rejectLocalSet = (values) => "pkVault" in values;
        const result = await txModule.handleAddPrivateKeyAccount(
          keyA,
          password,
          "Must not appear",
        );
        rejectLocalSet = null;

        assert.equal(result.success, false);
        assert.deepEqual(
          (local.accounts as Array<{ id: string }>).map(({ id }) => id),
          ["survivor"],
        );
        assert.equal(local.pkVault, undefined);
        assert.equal(runtimeMessages.length, 0);
      },
    );

    await t.test(
      "failed private-key cleanup leaves an encrypted orphan, not a visible account",
      async () => {
        reset();
        local.accounts = [
          {
            id: "target",
            type: "privateKey",
            address: "0x2222222222222222222222222222222222222222",
            createdAt: 1,
          },
          {
            id: "survivor",
            type: "impersonator",
            address: "0x3333333333333333333333333333333333333333",
            createdAt: 2,
          },
        ];
        sync.activeAccountId = "target";
        local.pkVault = {
          version: 1,
          entries: [
            {
              id: "target",
              keystore: await vaultModule.encryptPrivateKey(keyA, password),
            },
          ],
        };
        rejectLocalSet = (values) => "pkVault" in values;

        const result = await txModule.handleRemoveAccount("target");
        rejectLocalSet = null;
        assert.equal(result.success, false);
        assert.deepEqual(
          (local.accounts as Array<{ id: string }>).map(({ id }) => id),
          ["survivor"],
        );
        assert.equal(
          (local.pkVault as { entries: Array<{ id: string }> }).entries[0].id,
          "target",
        );
        assert.equal(sync.activeAccountId, "survivor");
      },
    );

    await t.test(
      "failed mnemonic cleanup leaves recovery ciphertext after metadata removal",
      async () => {
        reset();
        local.accounts = [
          {
            id: "seed-target",
            type: "seedPhrase",
            address: "0x4444444444444444444444444444444444444444",
            seedGroupId: "seed-group",
            derivationIndex: 0,
            createdAt: 1,
          },
          {
            id: "survivor",
            type: "impersonator",
            address: "0x5555555555555555555555555555555555555555",
            createdAt: 2,
          },
        ];
        local.seedGroups = [
          {
            id: "seed-group",
            name: "Seed",
            accountCount: 1,
            createdAt: 1,
          },
        ];
        local.pkVault = {
          version: 1,
          entries: [
            {
              id: "seed-target",
              keystore: await vaultModule.encryptPrivateKey(keyA, password),
            },
          ],
        };
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password,
        });
        const mnemonicBefore = clone(local.mnemonicVault);
        rejectLocalSet = (values) => "mnemonicVault" in values;

        const result = await txModule.handleRemoveAccount("seed-target");
        rejectLocalSet = null;
        assert.equal(result.success, false);
        assert.deepEqual(
          (local.accounts as Array<{ id: string }>).map(({ id }) => id),
          ["survivor"],
        );
        assert.deepEqual(local.mnemonicVault, mnemonicBefore);
        assert.deepEqual(
          (local.pkVault as { entries: unknown[] }).entries,
          [],
        );
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", { password }),
          mnemonic,
        );
      },
    );

    await t.test(
      "API-key mutation requires an exact master session",
      async () => {
        reset();
        const vaultKeyBytes = cryptoModule.generateVaultKey();
        const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
        const initial = clone(local);

        let result = await authModule.handleSaveApiKeyWithCachedPassword(
          "locked-key",
        );
        assert.equal(result.success, false);
        assert.match(result.error || "", /master password/i);
        assert.deepEqual(local, initial);

        let hydrated = await authModule.hydrateAuthSessionFromVaultKeyBytes(
          vaultKeyBytes,
          "agent",
          { password: null },
        );
        assert.equal(hydrated.success, true);
        result = await authModule.handleSaveApiKeyWithCachedPassword(
          "agent-key",
        );
        assert.equal(result.success, false);
        assert.match(result.error || "", /master password/i);
        assert.equal(local.encryptedApiKeyVault, undefined);

        sessionModule.clearInMemoryAuthCache();
        hydrated = await authModule.hydrateAuthSessionFromVaultKeyBytes(
          vaultKeyBytes,
          "master",
          { password: null },
        );
        assert.equal(hydrated.success, true);
        result = await authModule.handleSaveApiKeyWithCachedPassword(
          "master-key",
        );
        assert.equal(result.success, true);
        assert.equal(
          await cryptoModule.decryptWithVaultKey(
            vaultKey,
            local.encryptedApiKeyVault as Parameters<
              typeof cryptoModule.decryptWithVaultKey
            >[1],
          ),
          "master-key",
        );
      },
    );

    await t.test(
      "Bankr credential and account metadata commit atomically",
      async () => {
        reset();
        const vaultKeyBytes = cryptoModule.generateVaultKey();
        const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
        const hydrated = await authModule.hydrateAuthSessionFromVaultKeyBytes(
          vaultKeyBytes,
          "master",
          { password: null },
        );
        assert.equal(hydrated.success, true);

        local.accounts = [
          {
            id: "bankr-existing",
            type: "bankr",
            address: `0x${"11".repeat(20)}`,
            createdAt: 1,
          },
        ];
        const oldCredential = await cryptoModule.encryptWithVaultKey(
          vaultKey,
          "old-bankr-key",
        );
        local.encryptedApiKeyVault = oldCredential;
        const oldCredentialTag =
          await bankrCredentialBinding.getCurrentBankrCredentialTag();
        assert.match(oldCredentialTag ?? "", /^[0-9a-f]{64}$/);

        const prepared =
          await authModule.prepareApiKeyUpdateWithCachedPassword(
            "new-bankr-key",
          );
        if (!prepared.success) throw new Error(prepared.error);

        rejectLocalSet = (values) =>
          "accounts" in values && "encryptedApiKeyVault" in values;
        await assert.rejects(
          accountModule.updateBankrAccountAddressWithCredentialUpdate(
            "bankr-existing",
            `0x${"22".repeat(20)}`,
            prepared.storageUpdate,
          ),
          /simulated local storage failure/,
        );
        assert.equal(
          (local.accounts as Array<{ address: string }>)[0].address,
          `0x${"11".repeat(20)}`,
        );
        assert.deepEqual(local.encryptedApiKeyVault, oldCredential);
        assert.equal(
          await bankrCredentialBinding.getCurrentBankrCredentialTag(),
          oldCredentialTag,
        );

        const existingAccounts = clone(local.accounts);
        local.accounts = [];
        await assert.rejects(
          accountModule.addBankrAccountWithCredentialUpdate(
            `0x${"33".repeat(20)}`,
            "second",
            prepared.storageUpdate,
          ),
          /simulated local storage failure/,
        );
        assert.equal((local.accounts as unknown[]).length, 0);
        assert.deepEqual(local.encryptedApiKeyVault, oldCredential);
        local.accounts = existingAccounts;

        rejectLocalSet = null;
        await assert.rejects(
          accountModule.addBankrAccountWithCredentialUpdate(
            `0x${"44".repeat(20)}`,
            "bypassed-ui-second",
            prepared.storageUpdate,
          ),
          /only one Bankr account/i,
        );
        assert.equal((local.accounts as unknown[]).length, 1);
        assert.deepEqual(local.encryptedApiKeyVault, oldCredential);

        const updated =
          await accountModule.updateBankrAccountAddressWithCredentialUpdate(
            "bankr-existing",
            `0x${"22".repeat(20)}`,
            prepared.storageUpdate,
          );
        authModule.commitPreparedApiKeyUpdate(prepared);
        assert.equal(updated.address, `0x${"22".repeat(20)}`);
        assert.equal(
          await cryptoModule.decryptWithVaultKey(
            vaultKey,
            local.encryptedApiKeyVault as Parameters<
              typeof cryptoModule.decryptWithVaultKey
            >[1],
          ),
          "new-bankr-key",
        );
        assert.equal(sessionModule.getCachedApiKey(), "new-bankr-key");
        assert.notEqual(
          await bankrCredentialBinding.getCurrentBankrCredentialTag(),
          oldCredentialTag,
        );
      },
    );
  } finally {
    await viteServer?.close();
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
