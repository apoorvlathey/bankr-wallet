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

test("master-only account mutations cannot outlive timed authorization", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const originalDateNow = Date.now;
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};
  let viteServer: ViteDevServer | null = null;
  let now = 1_000_000;
  Date.now = () => now;

  const storageArea = (storage: StorageRecord) => ({
    async get(keys?: string | string[] | StorageRecord | null) {
      return selectStorageValues(storage, keys);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, clone(values));
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
      action: {
        async setBadgeText() {},
        async setBadgeBackgroundColor() {},
      },
    },
  });

  try {
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
          name: "master-authorization-test-gas-cycle",
          resolveId(source, importer) {
            return source === "./gasEstimation" &&
              importer?.endsWith("/chrome/txHandlers.ts")
              ? "\0master-authorization-test-gas-cycle"
              : null;
          },
          load(id) {
            return id === "\0master-authorization-test-gas-cycle"
              ? "export const bumpGasForEip7702Auth = (gas) => gas;"
              : null;
          },
        },
      ],
    });

    const accountModule = await viteServer.ssrLoadModule(
      "/src/chrome/accountStorage.ts",
    );
    const vaultModule = await viteServer.ssrLoadModule(
      "/src/chrome/vaultCrypto.ts",
    );
    const mnemonicModule = await viteServer.ssrLoadModule(
      "/src/chrome/mnemonicStorage.ts",
    );
    const sessionModule = await viteServer.ssrLoadModule(
      "/src/chrome/sessionCache.ts",
    );
    const transitionModule = await viteServer.ssrLoadModule(
      "/src/chrome/authTransition.ts",
    );
    const lockModule = await viteServer.ssrLoadModule(
      "/src/chrome/storageLock.ts",
    );
    const cryptoModule = await viteServer.ssrLoadModule(
      "/src/chrome/crypto.ts",
    );
    const seedModule = await viteServer.ssrLoadModule(
      "/src/chrome/mnemonic/derivation.ts",
    );
    const signerModule = await viteServer.ssrLoadModule(
      "/src/chrome/localSigner.ts",
    );
    const txModule = await viteServer.ssrLoadModule(
      "/src/chrome/txHandlers.ts",
    );

    const password = "master-password";
    const privateKey = `0x${"11".repeat(32)}` as `0x${string}`;
    const mnemonic =
      "test test test test test test test test test test test junk";

    const reset = async () => {
      for (const key of Object.keys(local)) delete local[key];
      for (const key of Object.keys(sync)) delete sync[key];
      for (const key of Object.keys(session)) delete session[key];
      sync.autoLockTimeout = 60_000;
      now += 1_000_000;
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
      transitionModule.invalidateAuthCeremonies();
      const vaultKey = await cryptoModule.importVaultKey(
        cryptoModule.generateVaultKey(),
      );
      sessionModule.setCachedVaultKey(vaultKey);
      sessionModule.setCachedPasswordDirect(password);
      sessionModule.setCachedPasswordType("master");
      sessionModule.setCachedVault([]);
      return transitionModule.getAuthCeremonyEpoch() as string;
    };

    const expire = () => {
      now += 60_001;
    };

    const holdLock = async (key: string) => {
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocker = lockModule.withStorageLock(key, async () => {
        entered();
        await gate;
      });
      await started;
      return { release, blocker };
    };

    await t.test(
      "Bankr, private-key, seed, and view-only writes fail after a lock wait crosses expiry",
      async () => {
        const epoch = await reset();
        const held = await holdLock(
          lockModule.WALLET_SECRET_STORAGE_LOCK_KEY,
        );

        const bankr = accountModule.addBankrAccountWithCredentialUpdate(
          "0x1111111111111111111111111111111111111111",
          "Bankr",
          { encryptedApiKeyVault: { ciphertext: "not-committed" } },
          epoch,
        );
        const viewOnly = accountModule.addImpersonatorAccount(
          "0x2222222222222222222222222222222222222222",
          "Watch",
          epoch,
        );
        const seedGroup = accountModule.addSeedGroup("Seed", epoch);
        const keyWrite = vaultModule.addKeyToVault(
          "private-account",
          privateKey,
          password,
          epoch,
        );
        const phraseWrite = mnemonicModule.storeMnemonic(
          "seed-group",
          mnemonic,
          { kind: "password", password },
          epoch,
        );
        const operations = [
          bankr,
          viewOnly,
          seedGroup,
          keyWrite,
          phraseWrite,
        ];
        const outcomesPromise = Promise.allSettled(operations);

        expire();
        held.release();
        await held.blocker;

        for (const outcome of await outcomesPromise) {
          assert.equal(outcome.status, "rejected");
          assert.match(
            (outcome as PromiseRejectedResult).reason?.message ?? "",
            /Authentication state changed/,
          );
        }
        assert.equal(local.accounts, undefined);
        assert.equal(local.seedGroups, undefined);
        assert.equal(local.pkVault, undefined);
        assert.equal(local.mnemonicVault, undefined);
        assert.equal(local.encryptedApiKeyVault, undefined);
      },
    );

    await t.test(
      "a captured seed phrase cannot publish a derived account after expiry",
      async () => {
        const epoch = await reset();
        await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
          kind: "password",
          password,
        });
        local.seedGroups = [
          {
            id: "seed-group",
            name: "Seed",
            accountCount: 0,
            createdAt: 1,
          },
        ];
        local.accounts = [
          {
            id: "survivor",
            type: "impersonator",
            address: "0x3333333333333333333333333333333333333333",
            createdAt: 1,
          },
        ];

        const held = await holdLock(
          lockModule.WALLET_SECRET_STORAGE_LOCK_KEY,
        );
        let phraseRead!: () => void;
        const phraseObserved = new Promise<void>((resolve) => {
          phraseRead = resolve;
        });
        const derive = lockModule.withStorageLock(
          lockModule.WALLET_SECRET_OPERATION_LOCK_KEY,
          async () => {
            const stored = await mnemonicModule.getMnemonic("seed-group", {
              password,
            });
            assert.equal(stored, mnemonic);
            phraseRead();
            const derivedKey = seedModule.derivePrivateKey(stored, 0);
            const accountId = "derived";
            await vaultModule.addKeyToVault(
              accountId,
              derivedKey,
              password,
              epoch,
            );
            await accountModule.addSeedPhraseAccount(
              signerModule.deriveAddress(derivedKey),
              "seed-group",
              0,
              undefined,
              accountId,
              epoch,
            );
          },
        );
        const deriveOutcome = derive.then(
          () => ({ success: true as const }),
          (error: unknown) => ({ success: false as const, error }),
        );

        await phraseObserved;
        expire();
        held.release();
        await held.blocker;
        const outcome = await deriveOutcome;
        assert.equal(outcome.success, false);
        assert.match(
          outcome.error instanceof Error ? outcome.error.message : "",
          /Authentication state changed/,
        );
        assert.deepEqual(
          (local.accounts as Array<{ id: string }>).map(({ id }) => id),
          ["survivor"],
        );
        assert.equal(local.pkVault, undefined);
        assert.equal(
          await mnemonicModule.getMnemonic("seed-group", { password }),
          mnemonic,
        );
      },
    );

    for (const walletType of [
      "bankr",
      "privateKey",
      "seedPhrase",
      "impersonator",
    ] as const) {
      await t.test(
        `${walletType} account removal cannot start after queued authorization expires`,
        async () => {
          const epoch = await reset();
          const targetAddress = signerModule.deriveAddress(privateKey);
          local.accounts = [
            {
              id: "target",
              type: walletType,
              address: targetAddress,
              ...(walletType === "seedPhrase"
                ? { seedGroupId: "seed-group", derivationIndex: 0 }
                : {}),
              createdAt: 1,
            },
            {
              id: "survivor",
              type: "impersonator",
              address: "0x4444444444444444444444444444444444444444",
              createdAt: 2,
            },
          ];
          if (walletType === "privateKey" || walletType === "seedPhrase") {
            local.pkVault = {
              version: 1,
              entries: [
                {
                  id: "target",
                  keystore: await vaultModule.encryptPrivateKey(
                    privateKey,
                    password,
                  ),
                },
              ],
            };
          }
          if (walletType === "seedPhrase") {
            local.seedGroups = [
              {
                id: "seed-group",
                name: "Seed",
                accountCount: 1,
                createdAt: 1,
              },
            ];
            await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
              kind: "password",
              password,
            });
          }

          const held = await holdLock(
            lockModule.WALLET_SECRET_OPERATION_LOCK_KEY,
          );
          const removal = txModule.handleRemoveAccount("target", epoch);
          expire();
          held.release();
          await held.blocker;

          const result = await removal;
          assert.equal(result.success, false);
          assert.match(result.error, /Authentication state changed/);
          assert.equal(
            (local.accounts as Array<{ id: string }>).some(
              ({ id }) => id === "target",
            ),
            true,
          );
          if (walletType === "privateKey" || walletType === "seedPhrase") {
            assert.equal(
              (local.pkVault as { entries: Array<{ id: string }> }).entries[0]
                .id,
              "target",
            );
          }
          if (walletType === "seedPhrase") {
            assert.equal(
              await mnemonicModule.getMnemonic("seed-group", { password }),
              mnemonic,
            );
          }
        },
      );
    }
  } finally {
    Date.now = originalDateNow;
    await viteServer?.close();
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
