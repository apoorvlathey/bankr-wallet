import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

test("replacement preparation supports PK, seed, and Ledger but rejects Bankr and impersonator", async () => {
  let server: ViteDevServer | null = null;
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const from = "0x1111111111111111111111111111111111111111";
  const to = "0x2222222222222222222222222222222222222222";
  const txHash = `0x${"ab".repeat(32)}`;
  const hooks = {
    history: null as any,
    account: null as any,
    pending: [] as any[],
    notifications: [] as any[],
    latestNonce: "0x7",
  };
  Object.assign(globalThis, {
    __walletchanReplacementPreparation: hooks,
    chrome: {
      runtime: {
        sendMessage: async (message: unknown) => hooks.notifications.push(message),
      },
    },
  });

  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 26_000 + process.pid % 4_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "replacement-preparation-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (!importer?.split("?", 1)[0].endsWith("/transactions/replacementPreparation.ts")) return null;
          return ({
            "../gasEstimation": "\0replacement-gas",
            "../network/rpcClient": "\0replacement-rpc",
            "../accountStorage": "\0replacement-account",
            "../requests/pinnedRequest": "\0replacement-pinned",
            "../requests/pendingTxStorage": "\0replacement-pending",
            "../storageLock": "\0replacement-lock",
            "../txHistoryStorage": "\0replacement-history",
            "./rpcConfig": "\0replacement-config",
          } as Record<string, string>)[source] ?? null;
        },
        load(id) {
          if (id === "\0replacement-gas") return `export const estimateGas = async () => ({
            tiers: { fast: { maxFeePerGas: "150", maxPriorityFeePerGas: "15" } },
            predictedNextBaseFee: "100",
          });`;
          if (id === "\0replacement-rpc") return `export const fetchRpcResult = async (_url, method) => {
            const h = globalThis.__walletchanReplacementPreparation;
            if (method === "eth_getTransactionReceipt") return null;
            if (method === "eth_getTransactionCount") return h.latestNonce;
            return {
              hash: "${txHash}", from: "${from}", to: "${to}", input: "0x1234",
              value: "0x2a", chainId: "0x2105", nonce: "0x7", gas: "0x5208",
              maxFeePerGas: "0x64", maxPriorityFeePerGas: "0xa", type: "0x2",
              blockHash: null, blockNumber: null,
            };
          };`;
          if (id === "\0replacement-account") return `
            export const getAccountById = async () => globalThis.__walletchanReplacementPreparation.account;
            export const findNonImpersonatorAccountByAddress = async () => globalThis.__walletchanReplacementPreparation.account;`;
          if (id === "\0replacement-pinned") return `export const pinnedTxRequest = (account, base) => ({
            ...base, accountId: account.id, accountAddress: account.address.toLowerCase(), accountType: account.type,
          });`;
          if (id === "\0replacement-pending") return `
            export const getPendingTxRequests = async () => globalThis.__walletchanReplacementPreparation.pending;
            export const savePendingTxRequest = async (request) => globalThis.__walletchanReplacementPreparation.pending.push(request);`;
          if (id === "\0replacement-lock") return "export const withStorageLock = async (_key, operation) => operation();";
          if (id === "\0replacement-history") return "export const getTxById = async () => globalThis.__walletchanReplacementPreparation.history;";
          if (id === "\0replacement-config") return "export const getRpcUrl = async () => 'https://rpc.example';";
          return null;
        },
      }],
    });
    const module = await server.ssrLoadModule(
      "/src/chrome/transactions/replacementPreparation.ts",
    );
    const reset = (type: string) => {
      hooks.account = {
        id: `${type}-account`, type, address: from, createdAt: 1,
        ...(type === "seedPhrase" ? { seedGroupId: "seed", derivationIndex: 0 } : {}),
        ...(type === "ledger" ? { deviceId: "ledger", hdPath: "m/44'/60'/0'/0/0", hdIndex: 0 } : {}),
      };
      hooks.history = {
        id: `${type}-history`, status: "pending", txHash,
        tx: { from, to, chainId: 8453 }, chainId: 8453, chainName: "Base",
        origin: "https://app.example",
        favicon: "https://app.example/icon.png",
        functionName: "transfer",
        accountId: hooks.account.id, accountType: type,
      };
      hooks.pending = [];
      hooks.notifications = [];
      hooks.latestNonce = "0x7";
    };

    for (const type of ["privateKey", "seedPhrase", "ledger"]) {
      reset(type);
      const result = await module.prepareTransactionReplacement(
        hooks.history.id,
        "speedUp",
      );
      assert.equal(result.success, true, type);
      assert.deepEqual(result.txRequest.tx, {
        from,
        to,
        data: "0x1234",
        value: "0x2a",
        chainId: 8453,
        nonce: 7,
        gas: "0x5208",
        maxFeePerGas: "215",
        maxPriorityFeePerGas: "15",
      });
      assert.equal(result.txRequest.accountType, type);
      assert.equal(result.txRequest.origin, hooks.history.origin);
      assert.equal(result.txRequest.favicon, hooks.history.favicon);
      assert.equal(result.txRequest.replacement.originalFunctionName, "transfer");
      assert.equal(hooks.notifications[0].type, "newPendingTxRequest");
    }

    reset("privateKey");
    const cancelled = await module.prepareTransactionReplacement(
      hooks.history.id,
      "cancel",
    );
    assert.equal(cancelled.success, true);
    assert.equal(cancelled.txRequest.origin, "WalletChan");
    assert.equal(cancelled.txRequest.favicon, "/walletchan-icon.png");
    assert.equal(cancelled.txRequest.replacement.originalFunctionName, undefined);
    assert.deepEqual(
      {
        to: cancelled.txRequest.tx.to,
        data: cancelled.txRequest.tx.data,
        value: cancelled.txRequest.tx.value,
        gas: cancelled.txRequest.tx.gas,
        nonce: cancelled.txRequest.tx.nonce,
      },
      { to: from, data: "0x", value: "0x0", gas: undefined, nonce: 7 },
    );

    for (const type of ["bankr", "impersonator"]) {
      reset(type);
      const result = await module.prepareTransactionReplacement(
        hooks.history.id,
        "speedUp",
      );
      assert.equal(result.success, false);
      assert.match(result.error, /local or Ledger/i);
      assert.equal(hooks.pending.length, 0);
    }

    reset("privateKey");
    hooks.latestNonce = "0x6";
    const blocked = await module.prepareTransactionReplacement(
      hooks.history.id,
      "cancel",
    );
    assert.equal(blocked.success, false);
    assert.match(blocked.error, /oldest pending transaction.*nonce 6/i);
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanReplacementPreparation");
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
