import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

test("nonce review reads only the exact pinned PK, seed, or Ledger account", async () => {
  let server: ViteDevServer | null = null;
  const address = "0x1111111111111111111111111111111111111111";
  const hooks = {
    pending: null as Record<string, any> | null,
    account: null as Record<string, any> | null,
    reads: [] as unknown[][],
  };
  Object.assign(globalThis, { __walletchanNonceReview: hooks });

  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 24_000 + process.pid % 6_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "transaction-nonce-review-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (!importer?.split("?", 1)[0].endsWith("/transactions/nonceReview.ts")) {
            return null;
          }
          return ({
            "../forceInclusion/nonceManager": "\0nonce-review-manager",
            "../requests/pendingTxStorage": "\0nonce-review-pending",
            "./runtime": "\0nonce-review-runtime",
          } as Record<string, string>)[source] ?? null;
        },
        load(id) {
          if (id === "\0nonce-review-manager") return `
            export const peekNextNonce = async (...args) => {
              globalThis.__walletchanNonceReview.reads.push(args);
              return 17;
            };`;
          if (id === "\0nonce-review-pending") return `
            export const getPendingTxRequestById = async (id) => {
              const pending = globalThis.__walletchanNonceReview.pending;
              return pending?.id === id ? pending : null;
            };`;
          if (id === "\0nonce-review-runtime") return `
            export const resolvePinnedAccount = async () => {
              const account = globalThis.__walletchanNonceReview.account;
              return account
                ? { ok: true, account }
                : { ok: false, error: "Account no longer exists" };
            };`;
          return null;
        },
      }],
    });

    const review = await server.ssrLoadModule(
      "/src/chrome/transactions/nonceReview.ts",
    );
    const setRequest = (type: string, accountAddress = address) => {
      hooks.pending = {
        id: `${type}-tx`,
        tx: { from: address, chainId: 8453 },
      };
      hooks.account = { id: `${type}-account`, type, address: accountAddress };
      hooks.reads = [];
    };

    for (const type of ["privateKey", "seedPhrase", "ledger"]) {
      setRequest(type);
      assert.deepEqual(
        await review.getTransactionNonceForReview(`${type}-tx`),
        { success: true, nonce: 17 },
      );
      assert.deepEqual(hooks.reads, [[address, 8453]]);
    }

    setRequest("ledger");
    hooks.pending!.replacement = {
      kind: "cancel",
      originalTxId: "original",
      originalTxHash: `0x${"ab".repeat(32)}`,
      nonce: 9,
      minimumMaxFeePerGas: "130",
      minimumMaxPriorityFeePerGas: "12",
    };
    assert.deepEqual(await review.getTransactionNonceForReview("ledger-tx"), {
      success: true,
      nonce: 9,
    });
    assert.deepEqual(hooks.reads, []);

    setRequest("bankr");
    assert.deepEqual(await review.getTransactionNonceForReview("bankr-tx"), {
      success: false,
      error: "This account does not support custom transaction nonces",
    });
    assert.deepEqual(hooks.reads, []);

    setRequest("ledger", "0x2222222222222222222222222222222222222222");
    assert.deepEqual(await review.getTransactionNonceForReview("ledger-tx"), {
      success: false,
      error: "Transaction 'from' does not match active account",
    });
    assert.deepEqual(hooks.reads, []);
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanNonceReview");
  }
});
