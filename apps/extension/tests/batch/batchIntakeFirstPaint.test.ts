import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

type WalletType = "bankr" | "privateKey" | "seedPhrase" | "impersonator";

type Hooks = {
  account: { id: string; address: string; type: WalletType };
  events: string[];
  pending: any;
  releaseDelegate: (() => void) | null;
  delegateStarted: Promise<void>;
  signalDelegateStarted: () => void;
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("batch review is published before slow intake work for every signing wallet", async (t) => {
  const address = `0x${"11".repeat(20)}`;
  const started = deferred();
  const hooks: Hooks = {
    account: { id: "bankr-account", address, type: "bankr" },
    events: [],
    pending: null,
    releaseDelegate: null,
    delegateStarted: started.promise,
    signalDelegateStarted: started.resolve,
  };
  Object.assign(globalThis, { __walletchanBatchFirstPaint: hooks });
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        sendMessage: async () => {
          hooks.events.push("publish");
        },
      },
    },
  });

  let server: ViteDevServer | null = null;
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 24_000 + process.pid % 6_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "batch-intake-first-paint-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (!importer?.split("?", 1)[0].endsWith("/chrome/batch/batchRequestIntake.ts")) {
            return null;
          }
          return ({
            "../../constants/chainRegistry": "\0first-paint-chain-registry",
            "../../constants/networks": "\0first-paint-networks",
            "../../lib/chains": "\0first-paint-chains",
            "../../utils/delegationResolution": "\0first-paint-delegation",
            "../accountStorage": "\0first-paint-account",
            "./batchTxEncoding": "\0first-paint-encoding",
            "./bundleStatusStorage": "\0first-paint-status",
            "../erc5792Types": "\0first-paint-types",
            "../extensionPopup": "\0first-paint-popup",
            "../requests/pendingRequestLifecycle": "\0first-paint-lifecycle",
            "../transactions/runtime": "\0first-paint-runtime",
            "../requests/pendingBatchTxStorage": "\0first-paint-pending",
            "../requests/pinnedRequest": "\0first-paint-pinned",
            "../provider/batchValidation": "\0first-paint-validation",
            "../windowing/providerRequestSurface": "\0first-paint-surface",
          } as Record<string, string>)[source] ?? null;
        },
        load(id) {
          if (id === "\0first-paint-chain-registry") {
            return `export const ALLOWED_CHAIN_IDS = new Set([1]);`;
          }
          if (id === "\0first-paint-networks") {
            return `export const BANKR_SUPPORTED_CHAIN_IDS = new Set([1]); export const CHAIN_NAMES = { 1: "Ethereum" };`;
          }
          if (id === "\0first-paint-chains") {
            return `export const getStoredResolvedChainById = async () => ({ rpcUrl: "https://rpc.example" });`;
          }
          if (id === "\0first-paint-delegation") {
            return `export const resolveActiveDelegate = async () => {
              const hooks = globalThis.__walletchanBatchFirstPaint;
              hooks.events.push("delegate-start");
              hooks.signalDelegateStarted();
              await new Promise((resolve) => { hooks.releaseDelegate = resolve; });
              hooks.events.push("delegate-finish");
              return { delegate: "0x${"22".repeat(20)}" };
            };`;
          }
          if (id === "\0first-paint-account") {
            return `export const getActiveAccount = async () => globalThis.__walletchanBatchFirstPaint.account;
              export const getTabAccount = getActiveAccount;`;
          }
          if (id === "\0first-paint-encoding") {
            return `export const normalizeBatchCallValues = (calls) => ({ ok: true, calls });`;
          }
          if (id === "\0first-paint-status") {
            return `export const saveBundleStatus = async () => globalThis.__walletchanBatchFirstPaint.events.push("status");
              export const removeBundleStatus = async () => {};`;
          }
          if (id === "\0first-paint-types") {
            return `export const ERC5792_ERRORS = { ATOMIC_NOT_SUPPORTED: 5702, UNSUPPORTED_CAPABILITY: 5700, UNSUPPORTED_CHAIN: 5710, UNAUTHORIZED: 4100 };
              export const BUNDLE_STATUS = { PENDING: 100 };`;
          }
          if (id === "\0first-paint-popup") {
            return `export const openExtensionPopup = () => { globalThis.__walletchanBatchFirstPaint.events.push("open"); return Promise.resolve(); };`;
          }
          if (id === "\0first-paint-lifecycle") {
            return `export const pendingRequestLifecycleErrors = { authorizationRevoked: "revoked" };
              export const capturePendingRequestAuthorizationCommitSnapshot = async () => ({ isCurrent: () => true });
              export const validatePendingRequestAuthorization = async (_kind, request) =>
                request.accountType !== "bankr" || request.bankrCredentialTag === "${"a".repeat(64)}"
                  ? ({ authorized: true })
                  : ({ authorized: false, error: "The Bankr credential changed", code: 4100 });`;
          }
          if (id === "\0first-paint-runtime") {
            return `export const writeResultToStorage = async (key, value) => {
              if (value.success === true) globalThis.__walletchanBatchFirstPaint.events.push("ack");
            };`;
          }
          if (id === "\0first-paint-pending") {
            return `export const bindPendingBatchTxRequestCredential = async (request) =>
                request.accountType === "bankr"
                  ? ({ ...request, bankrCredentialTag: "${"a".repeat(64)}" })
                  : request;
              export const savePendingBatchTxRequest = async (request) => {
                const hooks = globalThis.__walletchanBatchFirstPaint;
                hooks.pending = request;
                hooks.events.push("save");
              };
              export const getPendingBatchTxRequestById = async () => globalThis.__walletchanBatchFirstPaint.pending;
              export const removePendingBatchTxRequest = async () => { globalThis.__walletchanBatchFirstPaint.pending = null; };
              export const markPendingBatchTxRequestReady = async () => {
                const hooks = globalThis.__walletchanBatchFirstPaint;
                if (!hooks.pending) return null;
                const { intakeStatus, ...ready } = hooks.pending;
                hooks.pending = ready;
                hooks.events.push("ready");
                return ready;
              };`;
          }
          if (id === "\0first-paint-pinned") {
            return `export const pinnedBatchTxRequest = (account, request) => ({
              ...request,
              accountId: account.id,
              accountAddress: account.address.toLowerCase(),
              accountType: account.type,
            });`;
          }
          if (id === "\0first-paint-validation") {
            return `export const validateWalletSendCallsPayload = () => ({ valid: true });`;
          }
          if (id === "\0first-paint-surface") {
            return `export const clearProviderRequestSurfaceHint = () => {};`;
          }
          return null;
        },
      }],
    });

    const { handleWalletSendCalls } = await server.ssrLoadModule(
      "/src/chrome/batch/batchRequestIntake.ts",
    );
    const params = {
      version: "2.0.0",
      chainId: "0x1",
      atomicRequired: true,
      calls: [
        { to: `0x${"33".repeat(20)}`, data: "0x", value: "0x0" },
        { to: `0x${"44".repeat(20)}`, data: "0x", value: "0x0" },
      ],
    };

    for (const walletType of ["privateKey", "seedPhrase"] as const) {
      await t.test(`${walletType} paints before the delegate RPC settles`, async () => {
        const delegate = deferred();
        hooks.account = { id: `${walletType}-account`, address, type: walletType };
        hooks.events = [];
        hooks.pending = null;
        hooks.releaseDelegate = null;
        hooks.delegateStarted = delegate.promise;
        hooks.signalDelegateStarted = delegate.resolve;

        const intake = handleWalletSendCalls(
          params,
          `${walletType}-bundle`,
          "https://dapp.example",
          null,
          1,
          "https://dapp.example",
          2,
          0,
        );
        await hooks.delegateStarted;

        assert.deepEqual(hooks.events.slice(0, 4), [
          "save",
          "publish",
          "open",
          "delegate-start",
        ]);
        assert.equal(hooks.pending?.intakeStatus, "validating");
        assert.equal(hooks.events.includes("ready"), false);

        hooks.releaseDelegate?.();
        await intake;
        assert.ok(hooks.events.indexOf("ready") > hooks.events.indexOf("delegate-finish"));
        assert.ok(hooks.events.indexOf("ack") > hooks.events.indexOf("ready"));
        assert.equal(hooks.pending?.intakeStatus, undefined);
      });
    }

    await t.test("Bankr publishes before the remaining durable commit", async () => {
      hooks.account = { id: "bankr-account", address, type: "bankr" };
      hooks.events = [];
      hooks.pending = null;
      await handleWalletSendCalls(
        params,
        "bankr-bundle",
        "https://dapp.example",
        null,
        1,
        "https://dapp.example",
        2,
        0,
      );
      assert.deepEqual(hooks.events.slice(0, 3), ["save", "publish", "open"]);
      assert.equal(hooks.pending?.bankrCredentialTag, "a".repeat(64));
      assert.ok(hooks.events.indexOf("ready") > hooks.events.indexOf("open"));
      assert.ok(hooks.events.indexOf("ack") > hooks.events.indexOf("ready"));
    });

    await t.test("view-only intake remains credential-free and review-only", async () => {
      hooks.account = { id: "impersonator-account", address, type: "impersonator" };
      hooks.events = [];
      hooks.pending = null;
      await handleWalletSendCalls(
        params,
        "impersonator-bundle",
        "https://dapp.example",
        null,
        1,
        "https://dapp.example",
        2,
        0,
      );
      assert.deepEqual(hooks.events.slice(0, 3), ["save", "publish", "open"]);
      assert.equal(hooks.pending?.bankrCredentialTag, undefined);
      assert.ok(hooks.events.includes("ack"));
    });
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanBatchFirstPaint");
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else Reflect.deleteProperty(globalThis, "chrome");
  }
});
