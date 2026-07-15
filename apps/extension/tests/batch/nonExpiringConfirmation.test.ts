import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

type Hooks = {
  account: any;
  pending: any;
  processing: Set<string>;
  dispatched: string[];
  backgroundDone: Promise<void>;
  finishBackground: () => void;
};

test("aged batches remain confirmable for Bankr, private-key, and seed accounts", async (t) => {
  const hooks: Hooks = {
    account: null,
    pending: null,
    processing: new Set(),
    dispatched: [],
    backgroundDone: Promise.resolve(),
    finishBackground: () => {},
  };
  Object.assign(globalThis, { __walletchanNonExpiringBatch: hooks });
  let server: ViteDevServer | null = null;

  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 23_000 + process.pid % 7_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "non-expiring-batch-confirmation-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          const file = importer?.split("?", 1)[0];
          if (file?.endsWith("/chrome/batch/batchLocalConfirmation.ts")) {
            return ({
              "../accountStorage": "\0batch-account",
              "../authHandlers": "\0batch-auth",
              "../crypto": "\0batch-crypto",
              "../../utils/delegationResolution": "\0batch-delegation",
              "../../lib/chains": "\0batch-chains",
              "./bundleStatusStorage": "\0batch-status",
              "./batchExecutionRuntime": "\0batch-runtime",
              "../requests/pendingBatchTxStorage": "\0batch-pending",
              "../requests/pendingRequestLifecycle": "\0batch-lifecycle",
              "../requests/pendingRequestResolution": "\0batch-resolution",
              "../sessionCache": "\0batch-session",
              "../vaultCrypto": "\0batch-vault",
            } as Record<string, string>)[source] ?? null;
          }
          if (file?.endsWith("/chrome/batch/batchBankrExecution.ts")) {
            return ({
              "../../constants/networks": "\0bankr-networks",
              "../../constants/chainConfig": "\0bankr-chain-config",
              "../bankr/submission": "\0bankr-submission",
              "../bankr/pendingAuthorization": "\0bankr-authorization",
              "./batchTxEncoding": "\0bankr-encoding",
              "./batchExecutionRuntime": "\0batch-runtime",
              "./batchGasEnrichment": "\0bankr-gas",
              "./batchFailure": "\0bankr-failure",
              "../accountStorage": "\0batch-account",
              "../authHandlers": "\0batch-auth",
              "../crypto": "\0batch-crypto",
              "../erc5792Types": "\0bankr-erc5792",
              "./bundleStatusStorage": "\0batch-status",
              "../requests/pendingBatchTxStorage": "\0batch-pending",
              "../requests/pendingRequestLifecycle": "\0batch-lifecycle",
              "../requests/pendingRequestResolution": "\0batch-resolution",
              "../transactions/runtime": "\0bankr-tx-runtime",
              "../receiptEnrichment": "\0bankr-receipts",
              "../sessionCache": "\0batch-session",
              "../forceInclusion/receiptPoller": "\0bankr-poller",
              "../txHistoryStorage": "\0bankr-history",
              "../transactions/notification": "\0bankr-notification",
            } as Record<string, string>)[source] ?? null;
          }
          return null;
        },
        load(id) {
          if (id === "\0batch-account") return `export const getAccountById = async () => globalThis.__walletchanNonExpiringBatch.account;`;
          if (id === "\0batch-auth") return `export const handleUnlockWallet = async () => ({ success: true }); export const decryptAllKeysWithVaultKey = async () => null;`;
          if (id === "\0batch-crypto") return `export const hasEncryptedApiKey = async () => false; export const loadDecryptedApiKey = async () => null;`;
          if (id === "\0batch-delegation") return `export const resolveActiveDelegate = async () => ({ delegate: null, needsAuthorization: false });`;
          if (id === "\0batch-chains") return `export const getStoredResolvedChainById = async () => null;`;
          if (id === "\0batch-status") return `export const updateBundleStatus = async () => {};`;
          if (id === "\0batch-runtime") return `export const processingBundleIds = globalThis.__walletchanNonExpiringBatch.processing;`;
          if (id === "\0batch-pending") return `
            export const getPendingBatchTxRequestById = async (id) => {
              const pending = globalThis.__walletchanNonExpiringBatch.pending;
              return pending?.id === id ? pending : null;
            };
            export const removePendingBatchTxRequest = async (id) => {
              const hooks = globalThis.__walletchanNonExpiringBatch;
              if (hooks.pending?.id === id) hooks.pending = null;
            };`;
          if (id === "\0batch-lifecycle") return `export const enforcePendingRequestAuthorizationAtConfirmation = async () => ({ authorized: true });`;
          if (id === "\0batch-resolution") return `
            export const beginPendingRequestEffectLease = () => ({ release() {} });
            export const guardPendingRequestEffectLease = () => ({ beginEffect: () => true, settleEffect() {}, releaseIfSafe() {} });`;
          if (id === "\0batch-session") return `
            export const getPrivateKeyFromCache = () => "0x${"11".repeat(32)}";
            export const getCachedVaultKey = () => null;
            export const getAutoLockTimeout = async () => 60000;
            export const tryRestoreSession = async () => false;
            export const setCachedVault = () => {};
            export const setCachedApiKey = () => {};
            export const getCachedApiKey = () => "bankr-key";
            export const getCachedPassword = () => "password";`;
          if (id === "\0batch-vault") return `export const decryptAllKeys = async () => null;`;
          if (id === "\0bankr-networks") return `export const BANKR_SUPPORTED_CHAIN_IDS = new Set([1]); export const CHAIN_NAMES = { 1: "Ethereum" };`;
          if (id === "\0bankr-chain-config") return `export const CHAIN_CONFIG = {};`;
          if (id === "\0bankr-submission") return `export const submitTransactionDirect = async () => ({ status: "pending", transactionHash: "0xhash" });`;
          if (id === "\0bankr-authorization") return `export const authorizePendingBankrSubmit = async (_kind, _pending, beginEffect) => { beginEffect(); return { authorized: true }; };`;
          if (id === "\0bankr-encoding") return `export const encodeBatchCalls = (_calls, from) => ({ to: from, data: "0x", value: "0x0" });`;
          if (id === "\0bankr-gas") return `export const fetchAndStoreBatchGasData = () => {};`;
          if (id === "\0bankr-failure") return `export const handleBatchFailure = async () => {};`;
          if (id === "\0bankr-erc5792") return `export const BUNDLE_STATUS = { REVERTED: 500, CONFIRMED: 200, PENDING: 100 };`;
          if (id === "\0bankr-tx-runtime") return `export const writeResultToStorage = async () => globalThis.__walletchanNonExpiringBatch.finishBackground();`;
          if (id === "\0bankr-receipts") return `export const fetchRawTransactionReceipt = async () => null; export const toBundleReceipt = () => null; export const extractAssetChangesWhenReceiptAvailable = () => {};`;
          if (id === "\0bankr-poller") return `export const startReceiptPolling = () => {};`;
          if (id === "\0bankr-history") return `export const addTxToHistory = async () => {}; export const updateTxInHistory = async () => {};`;
          if (id === "\0bankr-notification") return `export const showNotification = async () => {};`;
          return null;
        },
      }],
    });

    const local = await server.ssrLoadModule("/src/chrome/batch/batchLocalConfirmation.ts");
    const bankr = await server.ssrLoadModule("/src/chrome/batch/batchBankrExecution.ts");
    const address = `0x${"11".repeat(20)}`;
    const queue = (type: "bankr" | "privateKey" | "seedPhrase", id: string) => {
      hooks.processing.clear();
      hooks.dispatched = [];
      hooks.account = { id: `${type}-account`, type, address };
      hooks.pending = {
        id,
        params: {
          version: "2.0.0",
          chainId: "0x1",
          calls: [{ to: `0x${"22".repeat(20)}`, data: "0x", value: "0x0" }],
        },
        origin: "internal:test",
        trustedInternal: true,
        favicon: null,
        chainName: "Ethereum",
        chainId: 1,
        timestamp: Date.now() - 24 * 60 * 60 * 1000,
        accountId: hooks.account.id,
        accountAddress: address,
        accountType: type,
      };
    };

    for (const type of ["privateKey", "seedPhrase"] as const) {
      await t.test(`aged ${type} batch remains confirmable`, async () => {
        const id = `aged-${type}`;
        queue(type, id);
        const result = await local.confirmLocalBatchWithExecutors(
          {
            processSingle: () => hooks.dispatched.push(type),
            processNonAtomic: () => assert.fail("single call must not be sequential"),
            processAtomic7702: () => assert.fail("single call must not use 7702"),
          },
          id,
          "ignored",
        );
        assert.deepEqual(result, { success: true });
        assert.deepEqual(hooks.dispatched, [type]);
        assert.equal(hooks.pending, null);
      });
    }

    await t.test("aged Bankr batch remains confirmable", async () => {
      queue("bankr", "aged-bankr");
      hooks.backgroundDone = new Promise<void>((resolve) => {
        hooks.finishBackground = resolve;
      });
      const result = await bankr.handleConfirmBatchTransaction(
        "aged-bankr",
        "ignored",
      );
      assert.deepEqual(result, { success: true });
      assert.equal(hooks.pending, null);
      await hooks.backgroundDone;
    });

    for (const type of ["privateKey", "seedPhrase"] as const) {
      await t.test(`validating ${type} batch cannot sign`, async () => {
        const id = `validating-${type}`;
        queue(type, id);
        hooks.pending.intakeStatus = "validating";
        const result = await local.confirmLocalBatchWithExecutors(
          {
            processSingle: () => hooks.dispatched.push(type),
            processNonAtomic: () => hooks.dispatched.push(type),
            processAtomic7702: () => hooks.dispatched.push(type),
          },
          id,
          "ignored",
        );
        assert.deepEqual(result, {
          success: false,
          error: "Batch request is still being validated",
        });
        assert.deepEqual(hooks.dispatched, []);
        assert.equal(hooks.pending?.id, id);
      });
    }

    await t.test("validating Bankr batch cannot submit", async () => {
      queue("bankr", "validating-bankr");
      hooks.pending.intakeStatus = "validating";
      const result = await bankr.handleConfirmBatchTransaction(
        "validating-bankr",
        "ignored",
      );
      assert.deepEqual(result, {
        success: false,
        error: "Batch request is still being validated",
      });
      assert.deepEqual(hooks.dispatched, []);
      assert.equal(hooks.pending?.id, "validating-bankr");
    });
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanNonExpiringBatch");
  }
});
