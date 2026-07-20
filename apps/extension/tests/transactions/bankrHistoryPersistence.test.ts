import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

test("Bankr broadcast success is not reported failed when history persistence fails", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  let server: ViteDevServer | null = null;
  const hooks = { results: [] as any[], failures: [] as string[] };
  Object.assign(globalThis, { __walletchanBankrHistory: hooks });
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { storage: { local: { async set() {} } } },
  });
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 24_000 + process.pid % 5_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "bankr-history-persistence-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (!importer?.split("?", 1)[0].endsWith("/chrome/transactions/bankrProcessing.ts")) return null;
          return ({
            "../../constants/chainConfig": "\0bankr-chain",
            "../bankr/pendingAuthorization": "\0bankr-auth",
            "../bankr/submission": "\0bankr-submit",
            "../clearSignedMetaSnapshot": "\0bankr-clear",
            "../receiptEnrichment": "\0bankr-enrich",
            "../forceInclusion/receiptPoller": "\0bankr-poll",
            "../requests/pendingRequestLifecycle": "\0bankr-lifecycle",
            "../requests/pendingRequestResolution": "\0bankr-lease",
            "../txHistoryStorage": "\0bankr-history",
            "./displayMetadata": "\0bankr-display",
            "./failure": "\0bankr-failure",
            "./notification": "\0bankr-notification",
            "./runtime": "\0bankr-runtime",
          } as Record<string, string>)[source] ?? null;
        },
        load(id) {
          if (id === "\0bankr-chain") return "export const CHAIN_CONFIG = {};";
          if (id === "\0bankr-auth") return "export const authorizePendingBankrSubmit = async (_a,_b,begin) => begin();";
          if (id === "\0bankr-submit") return `export const submitTransactionDirect = async (_key,_tx,_signal,before) => { await before(); return { status: "success", transactionHash: "0x${"ab".repeat(32)}" }; };`;
          if (id === "\0bankr-clear") return "export const attachClearSignedMetaToHistory = () => {};";
          if (id === "\0bankr-enrich") return "export const extractAssetChangesWhenReceiptAvailable = () => {};";
          if (id === "\0bankr-poll") return "export const startReceiptPolling = () => {};";
          if (id === "\0bankr-lifecycle") return "export const enforcePendingRequestAuthorizationAtConfirmation = async () => ({ authorized: true });";
          if (id === "\0bankr-lease") return `export const guardPendingRequestEffectLease = () => ({ beginEffect() {}, settleEffect() {}, releaseIfSafe() {} });`;
          if (id === "\0bankr-history") return `
            export const addTxToHistory = async () => {};
            export const updateTxInHistory = async () => { throw new Error("history unavailable"); };`;
          if (id === "\0bankr-display") return "export const fetchAndStoreGasData = () => {}; export const lookupFunctionName = async () => null;";
          if (id === "\0bankr-failure") return `export const handleTransactionFailure = async (_id,_pending,error) => globalThis.__walletchanBankrHistory.failures.push(error);`;
          if (id === "\0bankr-notification") return "export const showNotification = async () => {};";
          if (id === "\0bankr-runtime") return `
            export const activeAbortControllers = new Map();
            export const processingTxIds = new Set();
            export const writeResultToStorage = async (...args) => globalThis.__walletchanBankrHistory.results.push(args);`;
          return null;
        },
      }],
    });
    const execution = await server.ssrLoadModule("/src/chrome/transactions/bankrProcessing.ts");
    await execution.processBankrTransactionInBackground("bankr-1", {
      id: "bankr-1",
      tx: {
        from: "0x1111111111111111111111111111111111111111",
        to: "0x2222222222222222222222222222222222222222",
        chainId: 8453,
      },
      origin: "https://example.test",
      favicon: null,
      chainName: "Base",
      timestamp: Date.now(),
      accountType: "impersonator",
    }, "api-key");
    assert.deepEqual(hooks.failures, []);
    assert.deepEqual(hooks.results.at(-1)?.[1], {
      success: true,
      txHash: `0x${"ab".repeat(32)}`,
    });
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanBankrHistory");
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else Reflect.deleteProperty(globalThis, "chrome");
  }
});
