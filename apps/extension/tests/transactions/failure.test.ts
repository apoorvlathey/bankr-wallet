import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

test("failure publishes durable history, result, and notification state", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const writes: any[] = [];
  const hooks = {
    failed: new Map(),
    results: [] as any[],
    history: [] as any[],
    notifications: [] as any[],
  };
  Object.assign(globalThis, { __walletchanTransactionFailure: hooks });
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { storage: { local: { async set(value: any) { writes.push(value); } } } },
  });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const server = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true, hmr: { port: 23_000 + process.pid % 7_000 } },
    optimizeDeps: { noDiscovery: true },
    resolve: { alias: { "@": path.join(root, "src") } },
    plugins: [{
      name: "transaction-failure-boundaries",
      enforce: "pre",
      resolveId(source, importer) {
        if (!importer?.split("?", 1)[0].endsWith("/chrome/transactions/failure.ts")) return null;
        return ({
          "./runtime": "\0failure-runtime",
          "./notification": "\0failure-notification",
          "../txHistoryStorage": "\0failure-history",
        } as Record<string, string>)[source] ?? null;
      },
      load(id) {
        if (id === "\0failure-runtime") return `
          export const failedTxResults = globalThis.__walletchanTransactionFailure.failed;
          export const writeResultToStorage = async (...args) => globalThis.__walletchanTransactionFailure.results.push(args);`;
        if (id === "\0failure-notification") return `
          export const showNotification = async (...args) => globalThis.__walletchanTransactionFailure.notifications.push(args);`;
        if (id === "\0failure-history") return `
          export const updateTxInHistory = async (...args) => globalThis.__walletchanTransactionFailure.history.push(args);`;
        return null;
      },
    }],
  });

  try {
    const failure = await server.ssrLoadModule("/src/chrome/transactions/failure.ts");
    const error = "x".repeat(120);
    await failure.handleTransactionFailure("tx-fault", {
      id: "tx-fault",
      tx: { from: `0x${"11".repeat(20)}`, chainId: 1 },
      origin: "https://app.example",
      favicon: null,
      chainName: "Ethereum",
      timestamp: 1,
    }, error);

    assert.deepEqual(hooks.history, [["tx-fault", {
      status: "failed",
      error,
      completedAt: hooks.history[0][1].completedAt,
    }]]);
    assert.equal(hooks.failed.get("tx-failed-tx-fault").error, error);
    assert.deepEqual(writes, [{
      "notification-tx-failed-tx-fault": {
        type: "error",
        txId: "tx-failed-tx-fault",
      },
    }]);
    assert.equal(hooks.notifications[0][2], `${"x".repeat(100)}...`);
    assert.deepEqual(hooks.results, [[
      "txResult:tx-fault",
      { success: false, error },
    ]]);
  } finally {
    await server.close();
    Reflect.deleteProperty(globalThis, "__walletchanTransactionFailure");
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else delete (globalThis as { chrome?: unknown }).chrome;
  }
});
