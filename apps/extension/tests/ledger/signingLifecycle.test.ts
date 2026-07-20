import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

type Hooks = {
  account: Record<string, unknown>;
  pendingTx: Record<string, any> | null;
  pendingSignature: Record<string, any> | null;
  deviceGate: Deferred;
  deviceError: string | null;
  events: string[];
  history: any[];
  transactionNonces: number[];
  processing: Set<string>;
  active: Map<string, AbortController>;
};

function deferred(): Deferred {
  let resolve = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForEvent(hooks: Hooks, event: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!hooks.events.includes(event)) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for ${event}; observed ${hooks.events.join(", ") || "nothing"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("Ledger pending requests cross the terminal boundary only after device approval", async (t) => {
  let server: ViteDevServer | null = null;
  const address = "0x1111111111111111111111111111111111111111";
  const hooks: Hooks = {
    account: {
      id: "ledger-account",
      type: "ledger",
      address,
      deviceId: address.toLowerCase(),
      hdPath: "m/44'/60'/0'/0/0",
      hdIndex: 0,
      createdAt: 1,
    },
    pendingTx: null,
    pendingSignature: null,
    deviceGate: deferred(),
    deviceError: null,
    events: [],
    history: [],
    transactionNonces: [],
    processing: new Set(),
    active: new Map(),
  };
  Object.assign(globalThis, { __walletchanLedgerLifecycle: hooks });

  const reset = () => {
    hooks.pendingTx = {
      id: "ledger-tx",
      tx: {
        from: address,
        to: "0x2222222222222222222222222222222222222222",
        value: "0x0",
        data: "0x",
        chainId: 1,
      },
      origin: "https://example.test",
      favicon: null,
      chainName: "Ethereum",
      timestamp: 1,
      accountId: hooks.account.id,
      accountAddress: address,
      accountType: "ledger",
    };
    hooks.pendingSignature = {
      id: "ledger-signature",
      signature: {
        method: "personal_sign",
        params: ["0x1234", address],
        chainId: 1,
      },
      origin: "https://example.test",
      favicon: null,
      chainName: "Ethereum",
      timestamp: 1,
      accountId: hooks.account.id,
      accountAddress: address,
      accountType: "ledger",
    };
    hooks.deviceGate = deferred();
    hooks.deviceError = null;
    hooks.events = [];
    hooks.history = [];
    hooks.transactionNonces = [];
    hooks.processing.clear();
    hooks.active.clear();
  };

  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: { port: 21_000 + (process.pid % 9_000) },
      },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [
        {
          name: "ledger-signing-lifecycle-boundaries",
          enforce: "pre",
          resolveId(source, importer) {
            const file = importer?.split("?", 1)[0] ?? "";
            if (file.endsWith("/chrome/ledger/transactionExecution.ts")) {
              if (/\/src\/lib\/chains(?:\.ts)?$/u.test(source)) {
                return "\0ledger-chains";
              }
              return (
                {
                  "@/lib/chains": "\0ledger-chains",
                  "../accountStorage": "\0ledger-account",
                  "../clearSignedMetaSnapshot": "\0ledger-clear-signing",
                  "../forceInclusion/nonceManager": "\0ledger-nonce",
                  "../forceInclusion/receiptPoller": "\0ledger-receipt",
                  "../requests/pendingRequestResolution": "\0ledger-resolution",
                  "../requests/pendingRequestLifecycle": "\0ledger-authorization",
                  "../requests/pendingTxStorage": "\0ledger-pending-tx",
                  "../txHistoryStorage": "\0ledger-history",
                  "../transactions/displayMetadata": "\0ledger-display",
                  "../transactions/failure": "\0ledger-failure",
                  "../transactions/runtime": "\0ledger-runtime",
                  "./offscreenBridge": "\0ledger-offscreen",
                  "./session": "\0ledger-session",
                  "./signing": "\0ledger-signing",
                } as Record<string, string>
              )[source] ?? null;
            }
            if (file.endsWith("/chrome/ledger/signatureConfirmation.ts")) {
              return (
                {
                  "../requests/pendingRequestResolution": "\0ledger-resolution",
                  "../requests/pendingRequestLifecycle": "\0ledger-authorization",
                  "../requests/pendingSignatureRelease": "\0ledger-signature-release",
                  "../requests/pendingSignatureStorage": "\0ledger-pending-signature",
                  "../signatures/confirmationPolicy": "\0ledger-signature-policy",
                  "./session": "\0ledger-session",
                  "./signing": "\0ledger-signing",
                } as Record<string, string>
              )[source] ?? null;
            }
            return null;
          },
          load(id) {
            if (id === "\0ledger-chains") {
              return "export const getStoredResolvedChainById = async () => { globalThis.__walletchanLedgerLifecycle.events.push('chains'); return { rpcUrl: 'https://rpc.test' }; };";
            }
            if (id === "\0ledger-account") {
              return "export const getAccountById = async () => globalThis.__walletchanLedgerLifecycle.account;";
            }
            if (id === "\0ledger-clear-signing") {
              return "export const attachClearSignedMetaToHistory = async () => {};";
            }
            if (id === "\0ledger-nonce") {
              return `
                export const getNextNonce = async () => { globalThis.__walletchanLedgerLifecycle.events.push("nonce"); return 7; };
                export const normalizeTransactionNonce = (value) => value;
                export const reserveNonce = (_address, _chainId, nonce) => {
                  globalThis.__walletchanLedgerLifecycle.events.push("reserve");
                  return nonce;
                };
                export const resetNonce = () => {};`;
            }
            if (id === "\0ledger-receipt") {
              return "export const applyReceiptToHistory = async () => {}; export const startReceiptPolling = () => {};";
            }
            if (id === "\0ledger-resolution") {
              return `
                export const beginPendingRequestEffectLease = () => ({ release() {} });
                export const guardPendingRequestEffectLease = () => ({
                  beginEffect() { globalThis.__walletchanLedgerLifecycle.events.push("effect"); },
                  settleEffect() {},
                  releaseIfSafe() {},
                });`;
            }
            if (id === "\0ledger-authorization") {
              return "export const enforcePendingRequestAuthorizationAtConfirmation = async () => { globalThis.__walletchanLedgerLifecycle.events.push('authorization'); return { authorized: true }; };";
            }
            if (id === "\0ledger-pending-tx") {
              return `
                export const getPendingTxRequestById = async (id) => {
                  const pending = globalThis.__walletchanLedgerLifecycle.pendingTx;
                  return pending?.id === id ? pending : null;
                };
                export const removePendingTxRequest = async () => {
                  const hooks = globalThis.__walletchanLedgerLifecycle;
                  hooks.events.push("remove-tx");
                  hooks.pendingTx = null;
                };`;
            }
            if (id === "\0ledger-history") {
              return `
                export const addTxToHistory = async (tx) => {
                  globalThis.__walletchanLedgerLifecycle.events.push("history");
                  globalThis.__walletchanLedgerLifecycle.history.push(tx);
                };
                export const updateTxInHistory = async () => {};`;
            }
            if (id === "\0ledger-display") {
              return "export const lookupFunctionName = async () => null;";
            }
            if (id === "\0ledger-failure") {
              return "export const handleTransactionFailure = async () => globalThis.__walletchanLedgerLifecycle.events.push('failure');";
            }
            if (id === "\0ledger-runtime") {
              return `
                export const activeAbortControllers = globalThis.__walletchanLedgerLifecycle.active;
                export const processingTxIds = globalThis.__walletchanLedgerLifecycle.processing;
                export const resolvePinnedAccount = async () => ({ ok: true, account: globalThis.__walletchanLedgerLifecycle.account });
                export const writeResultToStorage = async () => globalThis.__walletchanLedgerLifecycle.events.push("result");`;
            }
            if (id === "\0ledger-offscreen") {
              return "export const cancelLedgerOperation = async () => {};";
            }
            if (id === "\0ledger-session") {
              return "export const ensureLedgerSigningSession = async () => globalThis.__walletchanLedgerLifecycle.events.push('session');";
            }
            if (id === "\0ledger-signing") {
              return `
                export const signAndBroadcastLedgerTransaction = async (input) => {
                  const hooks = globalThis.__walletchanLedgerLifecycle;
                  hooks.transactionNonces.push(input.tx.nonce);
                  hooks.events.push("device-tx");
                  await hooks.deviceGate.promise;
                  if (hooks.deviceError) throw new Error(hooks.deviceError);
                  await input.beforeBroadcast();
                  hooks.events.push("broadcast");
                  return { txHash: "0xhash" };
                };
                export const signLedgerSignatureRequest = async () => {
                  const hooks = globalThis.__walletchanLedgerLifecycle;
                  hooks.events.push("device-signature");
                  await hooks.deviceGate.promise;
                  if (hooks.deviceError) throw new Error(hooks.deviceError);
                  return "0xsignature";
                };`;
            }
            if (id === "\0ledger-signature-release") {
              return "export const revalidatePendingSignatureBeforeRelease = async () => ({ authorized: true });";
            }
            if (id === "\0ledger-pending-signature") {
              return `
                export const removePendingSignatureRequest = async () => {
                  const hooks = globalThis.__walletchanLedgerLifecycle;
                  hooks.events.push("remove-signature");
                  hooks.pendingSignature = null;
                };`;
            }
            if (id === "\0ledger-signature-policy") {
              return `
                export const prepareSignatureConfirmation = async () => ({
                  ok: true,
                  value: {
                    pending: globalThis.__walletchanLedgerLifecycle.pendingSignature,
                    account: globalThis.__walletchanLedgerLifecycle.account,
                  },
                });`;
            }
            return null;
          },
        },
      ],
    });

    const transaction = await server.ssrLoadModule(
      "/src/chrome/ledger/transactionExecution.ts",
    );
    const signature = await server.ssrLoadModule(
      "/src/chrome/ledger/signatureConfirmation.ts",
    );

    await t.test("transaction stays pending until the device signs", async () => {
      reset();
      const resultPromise = transaction.handleConfirmTransactionAsyncLedger(
        "ledger-tx",
        "",
      );
      await waitForEvent(hooks, "device-tx");
      assert.ok(hooks.pendingTx);
      assert.deepEqual(hooks.events, [
        "session",
        "authorization",
        "chains",
        "nonce",
        "device-tx",
      ]);

      hooks.deviceGate.resolve();
      assert.deepEqual(await resultPromise, { success: true });
      assert.equal(hooks.pendingTx, null);
      assert.deepEqual(hooks.transactionNonces, [7]);
      assert.equal(hooks.history[0].tx.nonce, 7);
      assert.deepEqual(hooks.events, [
        "session",
        "authorization",
        "chains",
        "nonce",
        "device-tx",
        "authorization",
        "remove-tx",
        "history",
        "effect",
        "broadcast",
        "result",
      ]);
    });

    await t.test("a transaction signs and broadcasts the reviewed nonce", async () => {
      reset();
      const resultPromise = transaction.handleConfirmTransactionAsyncLedger(
        "ledger-tx",
        "",
        undefined,
        undefined,
        undefined,
        false,
        23,
      );
      await waitForEvent(hooks, "device-tx");
      hooks.deviceGate.resolve();
      assert.deepEqual(await resultPromise, { success: true });
      assert.deepEqual(hooks.transactionNonces, [23]);
      assert.equal(hooks.history[0].tx.nonce, 23);
      assert.ok(hooks.events.includes("reserve"));
      assert.ok(!hooks.events.includes("nonce"));
    });

    await t.test("an invalid reviewed nonce never reaches the device", async () => {
      reset();
      assert.deepEqual(
        await transaction.handleConfirmTransactionAsyncLedger(
          "ledger-tx",
          "",
          undefined,
          undefined,
          undefined,
          false,
          "23",
        ),
        {
          success: false,
          error: "Transaction nonce must be a non-negative safe integer",
        },
      );
      assert.ok(hooks.pendingTx);
      assert.deepEqual(hooks.events, []);
      assert.deepEqual(hooks.transactionNonces, []);
    });

    await t.test("a replacement enforces its nonce and fee floor before the device", async () => {
      reset();
      hooks.pendingTx!.replacement = {
        kind: "cancel",
        originalTxId: "original",
        originalTxHash: `0x${"aa".repeat(32)}`,
        nonce: 23,
        minimumMaxFeePerGas: "130",
        minimumMaxPriorityFeePerGas: "12",
      };
      const blocked = await transaction.handleConfirmTransactionAsyncLedger(
        "ledger-tx", "", undefined, undefined,
        { gasLimit: "21000", maxFeePerGas: "130", maxPriorityFeePerGas: "11" },
        false, 23,
      );
      assert.match(blocked.error, /priority fee.*minimum/i);
      assert.deepEqual(hooks.events, []);

      const resultPromise = transaction.handleConfirmTransactionAsyncLedger(
        "ledger-tx", "", undefined, undefined,
        { gasLimit: "21000", maxFeePerGas: "130", maxPriorityFeePerGas: "12" },
        false, 23,
      );
      await waitForEvent(hooks, "device-tx");
      hooks.deviceGate.resolve();
      assert.deepEqual(await resultPromise, { success: true });
      assert.deepEqual(hooks.transactionNonces, [23]);
    });

    await t.test("a rejected transaction signature remains retryable", async () => {
      reset();
      hooks.deviceError = "Rejected on device";
      const resultPromise = transaction.handleConfirmTransactionAsyncLedger(
        "ledger-tx",
        "",
      );
      await waitForEvent(hooks, "device-tx");
      hooks.deviceGate.resolve();
      assert.deepEqual(await resultPromise, {
        success: false,
        error: "Rejected on device",
      });
      assert.ok(hooks.pendingTx);
      assert.deepEqual(hooks.events, [
        "session",
        "authorization",
        "chains",
        "nonce",
        "device-tx",
      ]);
    });

    await t.test("signature stays pending until final release", async () => {
      reset();
      const resultPromise = signature.handleConfirmLedgerSignatureRequest(
        "ledger-signature",
        "",
      );
      await waitForEvent(hooks, "device-signature");
      assert.ok(hooks.pendingSignature);

      hooks.deviceGate.resolve();
      assert.deepEqual(await resultPromise, {
        success: true,
        signature: "0xsignature",
      });
      assert.equal(hooks.pendingSignature, null);
      assert.deepEqual(hooks.events, [
        "session",
        "authorization",
        "effect",
        "device-signature",
        "remove-signature",
      ]);
    });

    await t.test("a rejected message signature remains retryable", async () => {
      reset();
      hooks.deviceError = "Rejected on device";
      const resultPromise = signature.handleConfirmLedgerSignatureRequest(
        "ledger-signature",
        "",
      );
      await waitForEvent(hooks, "device-signature");
      hooks.deviceGate.resolve();
      assert.deepEqual(await resultPromise, {
        success: false,
        error: "Rejected on device",
      });
      assert.ok(hooks.pendingSignature);
      assert.deepEqual(hooks.events, [
        "session",
        "authorization",
        "effect",
        "device-signature",
      ]);
    });
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanLedgerLifecycle");
  }
});
