import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

test("receipt reconciliation distinguishes dropped transactions from failures", async (t) => {
  let server: ViteDevServer | null = null;
  const hash = `0x${"ab".repeat(32)}`;
  const from = "0x1111111111111111111111111111111111111111";
  const hooks = {
    currentId: "pending",
    latestNonce: 7n,
    retain: false,
    latestNonceReads: 0,
    records: new Map<string, any>(),
    updates: [] as Array<[string, Record<string, unknown>]>,
    notifications: [] as unknown[],
    advances: [] as unknown[],
  };
  Object.assign(globalThis, { __walletchanReceiptDrops: hooks });

  const pendingRecord = () => ({
    id: "pending",
    status: "pending",
    txHash: hash,
    tx: { from, nonce: 7, chainId: 1 },
    chainId: 1,
    createdAt: Date.now(),
  });
  const reset = () => {
    hooks.currentId = "pending";
    hooks.latestNonce = 7n;
    hooks.retain = false;
    hooks.latestNonceReads = 0;
    hooks.records = new Map([["pending", pendingRecord()]]);
    hooks.updates = [];
    hooks.notifications = [];
    hooks.advances = [];
  };

  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 24_000 + process.pid % 4_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "receipt-drop-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          const file = importer?.split("?", 1)[0] ?? "";
          if (file.endsWith("/forceInclusion/receiptFinalizer.ts")) {
            return ({
              "../transactions/rpcConfig": "\0drop-rpc-config",
              "../txHistoryStorage": "\0drop-history",
              "./broadcastPolicy": "\0drop-policy",
              "./receiptHistory": "\0drop-receipt-history",
              "./receiptNotification": "\0drop-notification",
              "./receiptRpc": "\0drop-receipt-rpc",
              "./receiptSideEffects": "\0drop-effects",
            } as Record<string, string>)[source] ?? null;
          }
          if (file.endsWith("/forceInclusion/receiptSideEffects.ts")) {
            return ({
              "../transactions/rpcConfig": "\0drop-rpc-config",
              "../txHistoryStorage": "\0drop-history",
            } as Record<string, string>)[source] ?? null;
          }
          return null;
        },
        load(id) {
          if (id === "\0drop-rpc-config") {
            return "export const getRpcUrl = async () => 'https://rpc.example';";
          }
          if (id === "\0drop-history") return `
            export const getTxById = async (id) => globalThis.__walletchanReceiptDrops.records.get(id) ?? null;
            export const updateTxInHistory = async (id, update) => {
              const hooks = globalThis.__walletchanReceiptDrops;
              hooks.updates.push([id, update]);
              hooks.records.set(id, { ...hooks.records.get(id), ...update });
            };`;
          if (id === "\0drop-policy") {
            return "export const shouldRetainUnobservedBroadcast = () => globalThis.__walletchanReceiptDrops.retain;";
          }
          if (id === "\0drop-receipt-history") {
            return "export const applyReceiptToHistory = async () => true;";
          }
          if (id === "\0drop-notification") {
            return "export const showReceiptNotification = async (...args) => globalThis.__walletchanReceiptDrops.notifications.push(args);";
          }
          if (id === "\0drop-receipt-rpc") return `
            export const fetchReceipt = async () => null;
            export const fetchTxByHash = async () => null;
            export const fetchLatestAccountNonce = async () => {
              const hooks = globalThis.__walletchanReceiptDrops;
              hooks.latestNonceReads += 1;
              return hooks.latestNonce;
            };`;
          if (id === "\0drop-effects") {
            return "export const maybeAdvanceSplitBundle = async (...args) => globalThis.__walletchanReceiptDrops.advances.push(args);";
          }
          return null;
        },
      }],
    });

    const finalizer = await server.ssrLoadModule(
      "/src/chrome/forceInclusion/receiptFinalizer.ts",
    );
    const sideEffects = await server.ssrLoadModule(
      "/src/chrome/forceInclusion/receiptSideEffects.ts",
    );

    await t.test("a consumed account nonce drops a missing hash immediately", async () => {
      reset();
      hooks.latestNonce = 8n;
      assert.equal(
        await finalizer.checkAndFinalizeReceipt("pending", hash, 1),
        false,
      );
      assert.equal(hooks.records.get("pending").status, "dropped");
      assert.equal(hooks.notifications.length, 1);
      assert.equal(hooks.advances.length, 1);
    });

    await t.test("one missing observation is not enough while the nonce is live", async () => {
      reset();
      assert.equal(
        await finalizer.checkAndFinalizeReceipt("pending", hash, 1),
        null,
      );
      assert.equal(hooks.records.get("pending").status, "pending");
      assert.equal(hooks.updates.length, 0);
    });

    await t.test("ambiguous broadcasts bypass both fast and timed drop checks", async () => {
      reset();
      hooks.retain = true;
      hooks.latestNonce = 8n;
      assert.equal(
        await finalizer.checkAndFinalizeReceipt("pending", hash, 1),
        null,
      );
      assert.equal(hooks.latestNonceReads, 0);
      assert.equal(hooks.records.get("pending").status, "pending");
    });

    await t.test("a mined replacement drops its exact pending replacement chain", async () => {
      reset();
      const originalHash = `0x${"cd".repeat(32)}`;
      const firstHash = `0x${"ef".repeat(32)}`;
      hooks.records.set("original", {
        ...pendingRecord(),
        id: "original",
        txHash: originalHash,
      });
      hooks.records.set("first-replacement", {
        ...pendingRecord(),
        id: "first-replacement",
        txHash: firstHash,
        replacement: {
          kind: "speedUp",
          originalTxId: "original",
          originalTxHash: originalHash,
          nonce: 7,
          minimumMaxFeePerGas: "100",
          minimumMaxPriorityFeePerGas: "10",
        },
      });
      hooks.records.set("replacement", {
        ...pendingRecord(),
        id: "replacement",
        replacement: {
          kind: "speedUp",
          originalTxId: "first-replacement",
          originalTxHash: firstHash,
          nonce: 7,
          minimumMaxFeePerGas: "130",
          minimumMaxPriorityFeePerGas: "12",
        },
      });
      await sideEffects.applyReceiptStateMirrors({
        txId: "replacement",
        txHash: hash,
        chainId: 1,
        receipt: { status: "0x1" },
        succeeded: true,
      });
      assert.equal(hooks.records.get("original").status, "dropped");
      assert.equal(hooks.records.get("first-replacement").status, "dropped");
      assert.match(hooks.records.get("original").error, /replaced/i);
    });
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanReceiptDrops");
  }
});
