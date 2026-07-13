// Seed removal/derivation serialization race.
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
  const names =
    typeof keys === "string"
      ? [keys]
      : Array.isArray(keys)
        ? keys
        : Object.keys(keys);
  return Object.fromEntries(names.map((key) => [key, clone(storage[key])]));
}

test("seed removal excludes a concurrent derive until recovery cleanup commits", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};
  const writeSnapshots: StorageRecord[] = [];
  let localGetHook:
    | ((keys?: string | string[] | StorageRecord | null) => Promise<void> | void)
    | null = null;
  let recordWrites = false;
  let viteServer: ViteDevServer | null = null;

  const storageArea = (storage: StorageRecord, localArea = false) => ({
    get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      const values = selectStorageValues(storage, keys);
      const wait = localArea ? localGetHook?.(keys) : undefined;
      if (callback) {
        if (wait) {
          void Promise.resolve(wait).then(() => callback(values));
        } else {
          callback(values);
        }
        return;
      }
      return wait ? Promise.resolve(wait).then(() => values) : Promise.resolve(values);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, clone(values));
      if (localArea && recordWrites) writeSnapshots.push(clone(storage));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
      if (localArea && recordWrites) writeSnapshots.push(clone(storage));
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
      action: {
        async setBadgeText() {},
        async setBadgeBackgroundColor() {},
      },
    },
  });

  try {
    const extensionRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
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
          name: "seed-race-test-gas-cycle",
          resolveId(source, importer) {
            return source === "./gasEstimation" &&
              importer?.endsWith("/chrome/txHandlers.ts")
              ? "\0seed-race-test-gas-cycle"
              : null;
          },
          load(id) {
            return id === "\0seed-race-test-gas-cycle"
              ? "export const bumpGasForEip7702Auth = (gas) => gas;"
              : null;
          },
        },
      ],
    });
    const txModule = await viteServer.ssrLoadModule(
      "/src/chrome/txHandlers.ts",
    );
    const seedHandlers = await viteServer.ssrLoadModule(
      "/src/chrome/mnemonic/accountHandlers.ts",
    );
    const mnemonicModule = await viteServer.ssrLoadModule(
      "/src/chrome/mnemonicStorage.ts",
    );
    const vaultModule = await viteServer.ssrLoadModule(
      "/src/chrome/vaultCrypto.ts",
    );
    const seedModule = await viteServer.ssrLoadModule(
      "/src/chrome/mnemonic/derivation.ts",
    );
    const signerModule = await viteServer.ssrLoadModule(
      "/src/chrome/localSigner.ts",
    );
    const sessionModule = await viteServer.ssrLoadModule(
      "/src/chrome/sessionCache.ts",
    );

    const password = "master-password";
    const mnemonic =
      "test test test test test test test test test test test junk";
    const targetKey = seedModule.derivePrivateKey(mnemonic, 0);
    local.accounts = [
      {
        id: "seed-target",
        type: "seedPhrase",
        address: signerModule.deriveAddress(targetKey),
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
          keystore: await vaultModule.encryptPrivateKey(targetKey, password),
        },
      ],
    };
    await mnemonicModule.storeMnemonic("seed-group", mnemonic, {
      kind: "password",
      password,
    });
    sessionModule.setCachedPasswordDirect(password);
    sessionModule.setCachedPasswordType("master");
    sessionModule.updateCachedAutoLockTimeout(60_000);

    let accountReads = 0;
    let releaseRemoval!: () => void;
    let markRemovalPaused!: () => void;
    const removalGate = new Promise<void>((resolve) => {
      releaseRemoval = resolve;
    });
    const removalPaused = new Promise<void>((resolve) => {
      markRemovalPaused = resolve;
    });
    localGetHook = (keys) => {
      if (keys !== "accounts") return;
      accountReads += 1;
      if (accountReads === 3) {
        markRemovalPaused();
        return removalGate;
      }
    };
    recordWrites = true;

    const removal = txModule.handleRemoveAccount("seed-target");
    await removalPaused;
    assert.equal(
      await mnemonicModule.getMnemonic("seed-group", { password }),
      mnemonic,
    );

    let deriveSettled = false;
    const derive = seedHandlers
      .deriveSeedAccounts({ seedGroupId: "seed-group", indices: [1] })
      .then((result: { success: boolean; error?: string }) => {
        deriveSettled = true;
        return result;
      });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(deriveSettled, false);
    assert.equal(
      (local.accounts as Array<{ id: string }>).some(
        ({ id }) => id === "derived-account",
      ),
      false,
    );

    releaseRemoval();
    assert.equal((await removal).success, true);
    assert.deepEqual(await derive, {
      success: false,
      error: "Seed phrase not found or wrong password",
    });
    assert.deepEqual(
      (local.accounts as Array<{ id: string }>).map(({ id }) => id),
      ["survivor"],
    );

    for (const snapshot of writeSnapshots) {
      const seedAccounts = (
        (snapshot.accounts as Array<{
          type: string;
          seedGroupId?: string;
        }>) || []
      ).filter(({ type }) => type === "seedPhrase");
      const recoveryIds = new Set(
        (
          (snapshot.mnemonicVault as {
            entries?: Array<{ id: string }>;
          })?.entries || []
        ).map(({ id }) => id),
      );
      assert.equal(
        seedAccounts.every(
          ({ seedGroupId }) => !!seedGroupId && recoveryIds.has(seedGroupId),
        ),
        true,
      );
    }
  } finally {
    await viteServer?.close();
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
