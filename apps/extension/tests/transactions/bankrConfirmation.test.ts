import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

type Hooks = {
  pending: any;
  processing: Set<string>;
  active: Map<string, AbortController>;
  submissions: any[][];
};

test("aged Bankr transactions remain confirmable in immediate and background paths", async () => {
  const hooks: Hooks = {
    pending: null,
    processing: new Set(),
    active: new Map(),
    submissions: [],
  };
  Object.assign(globalThis, { __walletchanBankrTxConfirmation: hooks });
  let server: ViteDevServer | null = null;

  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 22_000 + process.pid % 8_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "bankr-transaction-confirmation-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (!importer?.split("?", 1)[0].endsWith("/chrome/transactions/bankrConfirmation.ts")) return null;
          return ({
            "../bankr/response": "\0bankr-response",
            "../bankr/pendingAuthorization": "\0bankr-authorization",
            "../bankr/submission": "\0bankr-submission",
            "../requests/pendingTxStorage": "\0bankr-pending",
            "../requests/pendingRequestLifecycle": "\0bankr-lifecycle",
            "../requests/pendingRequestResolution": "\0bankr-resolution",
            "./bankrProcessing": "\0bankr-processing",
            "./bankrSession": "\0bankr-session",
            "./bankrPolicy": "\0bankr-policy",
            "./runtime": "\0bankr-runtime",
          } as Record<string, string>)[source] ?? null;
        },
        load(id) {
          if (id === "\0bankr-response") return `export class BankrApiError extends Error {}`;
          if (id === "\0bankr-authorization") return `
            export const authorizePendingBankrSubmit = async (_kind, _pending, beginEffect) => {
              beginEffect();
              return { authorized: true };
            };`;
          if (id === "\0bankr-submission") return `
            export const submitTransactionDirect = async (...args) => {
              await args[3]();
              globalThis.__walletchanBankrTxConfirmation.submissions.push(args);
              return { status: "confirmed", transactionHash: "0xconfirmed" };
            };`;
          if (id === "\0bankr-pending") return `
            export const getPendingTxRequestById = async (id) => {
              const pending = globalThis.__walletchanBankrTxConfirmation.pending;
              return pending?.id === id ? pending : null;
            };
            export const removePendingTxRequest = async (id) => {
              const hooks = globalThis.__walletchanBankrTxConfirmation;
              if (hooks.pending?.id === id) hooks.pending = null;
            };`;
          if (id === "\0bankr-lifecycle") return `
            export const enforcePendingRequestAuthorizationAtConfirmation = async () => ({ authorized: true });`;
          if (id === "\0bankr-resolution") return `
            export const beginPendingRequestEffectLease = () => ({ release() {} });
            export const guardPendingRequestEffectLease = () => ({
              beginEffect: () => true,
              settleEffect() {},
              releaseIfSafe() {},
            });`;
          if (id === "\0bankr-processing") return `
            export const processBankrTransactionInBackground = (...args) => {
              const hooks = globalThis.__walletchanBankrTxConfirmation;
              hooks.submissions.push(args);
              hooks.processing.delete(args[0]);
              args[4]?.release();
            };`;
          if (id === "\0bankr-session") return `
            export const getBankrApiKeyForConfirmation = async () => "bankr-key";`;
          if (id === "\0bankr-policy") return `
            export const validatePinnedBankrTransaction = async () => ({ ok: true });
            export const validateBankrTransactionChain = () => ({ ok: true });`;
          if (id === "\0bankr-runtime") return `
            export const activeAbortControllers = globalThis.__walletchanBankrTxConfirmation.active;
            export const processingTxIds = globalThis.__walletchanBankrTxConfirmation.processing;`;
          return null;
        },
      }],
    });

    const confirmation = await server.ssrLoadModule(
      "/src/chrome/transactions/bankrConfirmation.ts",
    );
    const queueAged = (id: string) => {
      hooks.pending = {
        id,
        tx: {
          from: `0x${"11".repeat(20)}`,
          to: `0x${"22".repeat(20)}`,
          chainId: 1,
        },
        origin: "internal:test",
        trustedInternal: true,
        favicon: null,
        chainName: "Ethereum",
        timestamp: Date.now() - 24 * 60 * 60 * 1000,
        accountId: "bankr-account",
        accountAddress: `0x${"11".repeat(20)}`,
        accountType: "bankr",
      };
    };

    queueAged("bankr-immediate");
    assert.deepEqual(
      await confirmation.handleConfirmTransaction("bankr-immediate", "ignored"),
      { success: true, txHash: "0xconfirmed" },
    );

    queueAged("bankr-background");
    assert.deepEqual(
      await confirmation.handleConfirmTransactionAsync(
        "bankr-background",
        "ignored",
      ),
      { success: true },
    );
    assert.equal(hooks.submissions.length, 2);
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanBankrTxConfirmation");
  }
});
