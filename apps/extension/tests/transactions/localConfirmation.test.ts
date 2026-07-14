import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

type Store = Record<string, any>;
type Hooks = {
  account: any;
  privateKey: string | null;
  autoLockTimeout: number;
  restore: boolean;
  restoreCalls: number;
  processing: Set<string>;
  active: Map<string, AbortController>;
  dispatched: any[][];
  pending: any;
};

function storageArea(store: Store) {
  return {
    async get(keys?: string | string[] | Store | null) {
      if (keys == null) return structuredClone(store);
      if (typeof keys === "string") return { [keys]: structuredClone(store[keys]) };
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, structuredClone(store[key])]));
      }
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [
        key,
        structuredClone(store[key] ?? fallback),
      ]));
    },
    async set(values: Store) { Object.assign(store, structuredClone(values)); },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
    },
  };
}

test("local confirmation preserves PK, seed, and Never sessions", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: Store = {};
  let server: ViteDevServer | null = null;
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: { lastError: undefined, async sendMessage() {} },
      storage: {
        local: storageArea(local),
        sync: storageArea({}),
        session: storageArea({}),
      },
      action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    },
  });

  const hooks: Hooks = {
    account: null,
    privateKey: null,
    autoLockTimeout: 60_000,
    restore: false,
    restoreCalls: 0,
    processing: new Set(),
    active: new Map(),
    dispatched: [],
    pending: null,
  };
  Object.assign(globalThis, { __walletchanLocalTxConfirmation: hooks });

  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 21_000 + process.pid % 9_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "local-transaction-confirmation-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (!importer?.split("?", 1)[0].endsWith("/chrome/transactions/localConfirmation.ts")) return null;
          return ({
            "./localExecution": "\0local-tx-execution",
            "../sessionCache": "\0local-tx-session",
            "../crypto": "\0local-tx-crypto",
            "../vaultCrypto": "\0local-tx-vault",
            "../delegatedAuthorityPolicy": "\0local-tx-delegation",
            "./runtime": "\0local-tx-runtime",
            "../requests/pendingRequestLifecycle": "\0local-tx-lifecycle",
            "../requests/pendingTxStorage": "\0local-tx-pending",
            "../authHandlers": "\0local-tx-auth",
          } as Store)[source] ?? null;
        },
        load(id) {
          if (id === "\0local-tx-execution") return `
            export const processLocalTransactionInBackground = async (...args) => {
              const hooks = globalThis.__walletchanLocalTxConfirmation;
              hooks.dispatched.push(args);
              args[6]?.release();
              hooks.processing.delete(args[0]);
            };`;
          if (id === "\0local-tx-session") return `
            export const getCachedVaultKey = () => null;
            export const getPrivateKeyFromCache = () => globalThis.__walletchanLocalTxConfirmation.privateKey;
            export const getAutoLockTimeout = async () => globalThis.__walletchanLocalTxConfirmation.autoLockTimeout;
            export const tryRestoreSession = async () => {
              const hooks = globalThis.__walletchanLocalTxConfirmation;
              hooks.restoreCalls += 1;
              if (hooks.restore) hooks.privateKey = "0x${"11".repeat(32)}";
              return hooks.restore;
            };
            export const setCachedApiKey = () => {};
            export const setCachedVault = () => {};`;
          if (id === "\0local-tx-crypto") return `
            export const hasEncryptedApiKey = async () => false;
            export const loadDecryptedApiKey = async () => null;`;
          if (id === "\0local-tx-vault") {
            return `export const decryptAllKeys = async () => null;`;
          }
          if (id === "\0local-tx-delegation") {
            return `export const captureEip7702DelegationAuthorization = async () => undefined;`;
          }
          if (id === "\0local-tx-runtime") return `
            export const processingTxIds = globalThis.__walletchanLocalTxConfirmation.processing;
            export const activeAbortControllers = globalThis.__walletchanLocalTxConfirmation.active;
            export const resolvePinnedAccount = async () => ({ ok: true, account: globalThis.__walletchanLocalTxConfirmation.account });`;
          if (id === "\0local-tx-lifecycle") {
            return `export const enforcePendingRequestAuthorizationAtConfirmation = async () => ({ authorized: true });`;
          }
          if (id === "\0local-tx-pending") return `
            export const getPendingTxRequestById = async (id) => {
              const pending = globalThis.__walletchanLocalTxConfirmation.pending;
              return pending?.id === id ? pending : null;
            };
            export const removePendingTxRequest = async (id) => {
              const hooks = globalThis.__walletchanLocalTxConfirmation;
              if (hooks.pending?.id === id) hooks.pending = null;
            };`;
          if (id === "\0local-tx-auth") return `
            export const handleUnlockWallet = async () => ({ success: true });
            export const decryptAllKeysWithVaultKey = async () => null;`;
          return null;
        },
      }],
    });

    const confirmation = await server.ssrLoadModule("/src/chrome/transactions/localConfirmation.ts");
    const address = "0x1111111111111111111111111111111111111111";
    const queue = async (type: "privateKey" | "seedPhrase", id: string) => {
      const account = {
        id: `${type}-account`, type, address, createdAt: 1,
        ...(type === "seedPhrase" ? { seedGroupId: "seed", derivationIndex: 0 } : {}),
      };
      hooks.account = account;
      local.accounts = [account];
      hooks.pending = {
        id,
        tx: { from: address, to: `0x${"22".repeat(20)}`, chainId: 1 },
        origin: "internal:test",
        trustedInternal: true,
        favicon: null,
        chainName: "Ethereum",
        timestamp: Date.now(),
        accountId: account.id,
        accountAddress: account.address,
        accountType: account.type,
      };
      return account;
    };
    const reset = () => {
      hooks.pending = null;
      hooks.privateKey = `0x${"11".repeat(32)}`;
      hooks.autoLockTimeout = 60_000;
      hooks.restore = false;
      hooks.restoreCalls = 0;
      hooks.processing.clear();
      hooks.dispatched = [];
    };

    for (const [type, authority] of [["privateKey", "master"], ["seedPhrase", "agent"]] as const) {
      await t.test(`${type} cached key signs during a ${authority} session`, async () => {
        reset();
        await queue(type, `${type}-cached`);
        const result = await confirmation.handleConfirmTransactionAsyncPK(`${type}-cached`, "ignored");
        assert.deepEqual(result, { success: true });
        assert.equal(hooks.dispatched.length, 1);
        assert.equal(hooks.dispatched[0][2].type, type);
        assert.equal(hooks.pending, null);
      });
    }

    await t.test("Never mode restores a local key before consuming the prompt", async () => {
      reset();
      hooks.privateKey = null;
      hooks.autoLockTimeout = 0;
      hooks.restore = true;
      await queue("seedPhrase", "seed-never");
      const result = await confirmation.handleConfirmTransactionAsyncPK("seed-never", "ignored");
      assert.deepEqual(result, { success: true });
      assert.equal(hooks.restoreCalls, 1);
      assert.equal(hooks.dispatched.length, 1);
    });

    for (const type of ["privateKey", "seedPhrase"] as const) {
      await t.test(`an aged ${type} transaction remains confirmable`, async () => {
        reset();
        const id = `aged-${type}`;
        await queue(type, id);
        hooks.pending.timestamp = Date.now() - 24 * 60 * 60 * 1000;
        const result = await confirmation.handleConfirmTransactionAsyncPK(id, "ignored");
        assert.deepEqual(result, { success: true });
        assert.equal(hooks.dispatched.length, 1);
        assert.equal(hooks.dispatched[0][2].type, type);
      });
    }

    await t.test("a mismatched from address leaves the prompt retryable", async () => {
      reset();
      const account = await queue("privateKey", "from-mismatch");
      hooks.pending = {
        ...hooks.pending,
        tx: { ...hooks.pending.tx, from: `0x${"33".repeat(20)}` },
      };
      hooks.account = account;
      const result = await confirmation.handleConfirmTransactionAsyncPK("from-mismatch", "ignored");
      assert.equal(result.success, false);
      assert.equal(result.error, "Transaction 'from' does not match active account");
      assert.ok(hooks.pending);
      assert.equal(hooks.dispatched.length, 0);
    });
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanLocalTxConfirmation");
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else delete (globalThis as { chrome?: unknown }).chrome;
  }
});
