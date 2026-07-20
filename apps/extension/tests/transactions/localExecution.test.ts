import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

type Hooks = {
  mode: "success" | "account-race" | "safe-fault" | "ambiguous-fault" | "history-fault";
  liveAccount: any;
  processing: Set<string>;
  active: Map<string, AbortController>;
  signed: any[];
  authorizationNonces: number[];
  events: string[];
  updates: any[];
  failures: string[];
  resets: any[];
  results: any[];
  polls: any[];
};

test("local execution revalidates immediately before one broadcast", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  let server: ViteDevServer | null = null;
  const storage: Record<string, any> = {};
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: { lastError: undefined, getURL: (path: string) => path },
      storage: {
        local: { async set(value: any) { Object.assign(storage, value); } },
        sync: { async get() { return {}; } },
      },
    },
  });
  const hooks: Hooks = {
    mode: "success",
    liveAccount: null,
    processing: new Set(),
    active: new Map(),
    signed: [],
    authorizationNonces: [],
    events: [],
    updates: [],
    failures: [],
    resets: [],
    results: [],
    polls: [],
  };
  Object.assign(globalThis, { __walletchanLocalTxExecution: hooks });

  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 22_000 + process.pid % 8_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "local-transaction-execution-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (!importer?.split("?", 1)[0].endsWith("/chrome/transactions/localExecution.ts")) return null;
          if (
            source === "@/lib/chains" ||
            source.endsWith("/src/lib/chains.ts")
          ) return "\0local-execution-chains";
          return ({
            "../accountStorage": "\0local-execution-accounts",
            "../clearSignedMetaSnapshot": "\0local-execution-clear-signing",
            "../delegatedAuthorityPolicy": "\0local-execution-delegation",
            "../gasEstimation": "\0local-execution-gas",
            "../localSigner": "\0local-execution-signer",
            "../forceInclusion/nonceManager": "\0local-execution-nonce",
            "../requests/pendingRequestLifecycle": "\0local-execution-lifecycle",
            "./runtime": "\0local-execution-runtime",
            "./displayMetadata": "\0local-execution-display",
            "./failure": "\0local-execution-failure",
            "../txHistoryStorage": "\0local-execution-history",
            "../forceInclusion/receiptPoller": "\0local-execution-receipt",
          } as Record<string, string>)[source] ?? null;
        },
        load(id) {
          if (id === "\0local-execution-chains") return `
            export const getStoredResolvedChainById = async () => {
              globalThis.__walletchanLocalTxExecution.events.push("chain");
              return { rpcUrl: "https://rpc.example" };
            };`;
          if (id === "\0local-execution-accounts") return `
            export const getAccountById = async () => globalThis.__walletchanLocalTxExecution.liveAccount;`;
          if (id === "\0local-execution-clear-signing") {
            return `export const attachClearSignedMetaToHistory = () => globalThis.__walletchanLocalTxExecution.events.push("clear");`;
          }
          if (id === "\0local-execution-delegation") {
            return `export const assertDelegatedAuthorityMasterAuthorization = () => {};`;
          }
          if (id === "\0local-execution-gas") {
            return `export const bumpGasForEip7702Auth = (_chainId, gas) => {
              globalThis.__walletchanLocalTxExecution.events.push("gas");
              return gas;
            };`;
          }
          if (id === "\0local-execution-signer") return `
            export const signEip7702Authorization = async (_key, params) => {
              globalThis.__walletchanLocalTxExecution.authorizationNonces.push(params.nonce);
              return {};
            }
            export const signAndBroadcastTransaction = async (...args) => {
              const hooks = globalThis.__walletchanLocalTxExecution;
              hooks.signed.push(args[1]);
              hooks.events.push("signed");
              if (hooks.mode === "safe-fault") throw new Error("preparation failed");
              if (hooks.mode === "account-race") {
                hooks.liveAccount = { ...hooks.liveAccount, address: "0x${"44".repeat(20)}" };
              }
              await args[4]();
              hooks.events.push("rpc");
              if (hooks.mode === "ambiguous-fault") throw new Error("socket closed after write");
              return { txHash: "0x${"ab".repeat(32)}", signedGasLimit: "21000" };
            };`;
          if (id === "\0local-execution-nonce") return `
            export const getNextNonce = async () => {
              globalThis.__walletchanLocalTxExecution.events.push("nonce");
              return 7;
            };
            export const reserveNonce = (_address, _chainId, nonce) => {
              globalThis.__walletchanLocalTxExecution.events.push("reserve");
              return nonce;
            };
            export const resetNonce = (...args) => globalThis.__walletchanLocalTxExecution.resets.push(args);`;
          if (id === "\0local-execution-lifecycle") return `
            export const enforcePendingRequestAuthorizationAtConfirmation = async () => {
              globalThis.__walletchanLocalTxExecution.events.push("authorize");
              return { authorized: true };
            };`;
          if (id === "\0local-execution-runtime") return `
            export const processingTxIds = globalThis.__walletchanLocalTxExecution.processing;
            export const activeAbortControllers = globalThis.__walletchanLocalTxExecution.active;
            export const writeResultToStorage = async (...args) => globalThis.__walletchanLocalTxExecution.results.push(args);`;
          if (id === "\0local-execution-display") {
            return `export const lookupFunctionName = async () => null;`;
          }
          if (id === "\0local-execution-failure") return `
            export const handleTransactionFailure = async (_id, _pending, error) => globalThis.__walletchanLocalTxExecution.failures.push(error);`;
          if (id === "\0local-execution-history") return `
            export const addTxToHistory = async (...args) => globalThis.__walletchanLocalTxExecution.updates.push(["add", ...args]);
            export const updateTxInHistory = async (...args) => {
              if (globalThis.__walletchanLocalTxExecution.mode === "history-fault") throw new Error("history unavailable");
              globalThis.__walletchanLocalTxExecution.updates.push(["update", ...args]);
            };`;
          if (id === "\0local-execution-receipt") return `
            export const applyReceiptToHistory = async (...args) => globalThis.__walletchanLocalTxExecution.updates.push(["receipt", ...args]);
            export const startReceiptPolling = (...args) => globalThis.__walletchanLocalTxExecution.polls.push(args);`;
          return null;
        },
      }],
    });

    const execution = await server.ssrLoadModule("/src/chrome/transactions/localExecution.ts");
    const resolution = await server.ssrLoadModule(
      "/src/chrome/requests/pendingRequestResolution.ts",
    );
    const address = "0x1111111111111111111111111111111111111111";
    const pending = (
      id: string,
      type: "privateKey" | "seedPhrase",
      delegated = false,
    ) => ({
      id,
      tx: { from: address, to: `0x${"22".repeat(20)}`, chainId: 1, gasPrice: "0x5" },
      origin: "internal:test",
      trustedInternal: true,
      favicon: null,
      chainName: "Ethereum",
      timestamp: Date.now(),
      accountId: `${type}-account`,
      accountAddress: address,
      accountType: type,
      ...(delegated
        ? {
            delegation7702Meta: {
              kind: "setDelegate",
              targetDelegate: `0x${"55".repeat(20)}`,
            },
          }
        : {}),
    });
    const account = (type: "privateKey" | "seedPhrase") => ({
      id: `${type}-account`, type, address, createdAt: 1,
      ...(type === "seedPhrase" ? { seedGroupId: "seed", derivationIndex: 0 } : {}),
    });
    const reset = (type: "privateKey" | "seedPhrase", mode: Hooks["mode"]) => {
      hooks.mode = mode;
      hooks.liveAccount = account(type);
      hooks.processing.clear();
      hooks.active.clear();
      hooks.signed = [];
      hooks.authorizationNonces = [];
      hooks.events = [];
      hooks.updates = [];
      hooks.failures = [];
      hooks.resets = [];
      hooks.results = [];
      hooks.polls = [];
    };
    const execute = async (
      id: string,
      type: "privateKey" | "seedPhrase",
      nonce?: number,
      delegated = false,
    ) => {
      hooks.processing.add(id);
      const lease = resolution.beginPendingRequestEffectLease("transaction", id);
      assert.ok(lease);
      await execution.processLocalTransactionInBackground(
        id,
        pending(id, type, delegated),
        hooks.liveAccount,
        `0x${"11".repeat(32)}`,
        "transfer",
        { gasLimit: "0x5208", maxFeePerGas: "0x10", maxPriorityFeePerGas: "0x2" },
        lease,
        undefined,
        nonce,
      );
    };
    const resetResult = () => resolution.runWalletResetAgainstPendingResolutions({
      resolve: async () => "allowed",
      conflictResult: () => "blocked",
    });

    await t.test("a seed transaction signs once, revalidates, and publishes its hash", async () => {
      reset("seedPhrase", "success");
      await execute("seed-success", "seedPhrase");
      assert.deepEqual(
        hooks.events,
        ["clear", "nonce", "gas", "authorize", "signed", "authorize", "rpc"],
        JSON.stringify({ failures: hooks.failures, updates: hooks.updates }),
      );
      assert.equal(hooks.signed.length, 1);
      assert.equal(hooks.signed[0].nonce, 7);
      assert.equal(hooks.signed[0].gasPrice, undefined);
      assert.equal(
        hooks.updates.find(
          ([kind, id, update]) =>
            kind === "update" && id === "seed-success" && update.tx,
        )?.[2].tx.nonce,
        7,
      );
      assert.equal(hooks.polls.length, 1);
      assert.match(hooks.results[0][1].txHash, /^0x/);
      assert.equal(await resetResult(), "allowed");
    });

    for (const type of ["privateKey", "seedPhrase"] as const) {
      await t.test(`${type} signs and broadcasts the reviewed nonce`, async () => {
        reset(type, "success");
        await execute(`${type}-custom-nonce`, type, 19);
        assert.deepEqual(hooks.events, [
          "clear",
          "reserve",
          "gas",
          "authorize",
          "signed",
          "authorize",
          "rpc",
        ]);
        assert.equal(hooks.signed[0].nonce, 19);
        assert.equal(
          hooks.updates.find(
            ([kind, id, update]) =>
              kind === "update" &&
              id === `${type}-custom-nonce` &&
              update.tx,
          )?.[2].tx.nonce,
          19,
        );
      });
    }

    await t.test("EIP-7702 derives its authorization from the reviewed nonce", async () => {
      reset("privateKey", "success");
      await execute("pk-delegation-nonce", "privateKey", 19, true);
      assert.equal(hooks.signed[0].nonce, 19);
      assert.deepEqual(hooks.authorizationNonces, [20]);
    });

    await t.test("account replacement after signing suppresses the raw RPC effect", async () => {
      reset("privateKey", "account-race");
      await execute("pk-account-race", "privateKey");
      assert.deepEqual(hooks.events, ["clear", "nonce", "gas", "authorize", "signed"]);
      assert.deepEqual(hooks.failures, ["Pending request account is no longer available"]);
      assert.equal(hooks.resets.length, 1);
      assert.equal(hooks.results.length, 0);
      assert.equal(await resetResult(), "allowed");
    });

    await t.test("a preparation fault releases its effect lease safely", async () => {
      reset("privateKey", "safe-fault");
      await execute("pk-safe-fault", "privateKey");
      assert.deepEqual(hooks.events, ["clear", "nonce", "gas", "authorize", "signed"]);
      assert.deepEqual(hooks.failures, ["preparation failed"]);
      assert.equal(await resetResult(), "allowed");
    });

    await t.test("a post-boundary transport fault remains fail-closed", async () => {
      reset("privateKey", "ambiguous-fault");
      await execute("pk-ambiguous", "privateKey");
      assert.deepEqual(
        hooks.events,
        ["clear", "nonce", "gas", "authorize", "signed", "authorize", "rpc"],
      );
      assert.deepEqual(hooks.failures, ["socket closed after write"]);
      assert.equal(await resetResult(), "blocked");
    });

    for (const type of ["privateKey", "seedPhrase"] as const) {
      await t.test(`${type} broadcast success survives a history write fault`, async () => {
        reset(type, "history-fault");
        await execute(`${type}-history-fault`, type);
        assert.deepEqual(hooks.failures, []);
        assert.equal(hooks.resets.length, 0);
        assert.deepEqual(hooks.results.at(-1)?.[1], {
          success: true,
          txHash: `0x${"ab".repeat(32)}`,
        });
      });
    }
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanLocalTxExecution");
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else delete (globalThis as { chrome?: unknown }).chrome;
  }
});
