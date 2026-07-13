import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

type Store = Record<string, any>;

const store: Store = {};
const tabUrls = new Map<number, string>();
let pendingTxReadGate: Promise<void> | null = null;
let tabReadGate: Promise<void> | null = null;
let metadataReadGate: Promise<void> | null = null;
const tabReadGates = new Map<number, Promise<void>>();

function getResult(keys: string | string[] | Record<string, unknown> | null) {
  if (keys === null) return { ...store };
  if (typeof keys === "string") return { [keys]: store[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, store[key]]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      store[key] === undefined ? fallback : store[key],
    ]),
  );
}

Object.defineProperty(globalThis, "chrome", {
  configurable: true,
  value: {
    storage: {
      local: {
        async get(keys: string | string[] | Record<string, unknown> | null) {
          if (
            pendingTxReadGate &&
            (keys === "pendingTxRequests" ||
              (Array.isArray(keys) && keys.includes("pendingTxRequests")))
          ) {
            await pendingTxReadGate;
          }
          if (
            metadataReadGate &&
            (keys === "pendingAddChainRequests" ||
              keys === "pendingWatchAssetRequests")
          ) {
            await metadataReadGate;
          }
          return getResult(keys);
        },
        async set(items: Store) {
          Object.assign(store, items);
        },
        async remove(keys: string | string[]) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete store[key];
          }
        },
      },
      onChanged: {
        addListener() {},
        removeListener() {},
      },
    },
    action: {
      async setBadgeText() {},
      async setBadgeBackgroundColor() {},
    },
    tabs: {
      async get(tabId: number) {
        const gate = tabReadGates.get(tabId) ?? tabReadGate;
        if (gate) await gate;
        const url = tabUrls.get(tabId);
        if (!url) throw new Error("No tab");
        return { id: tabId, url };
      },
      async query() {
        return [];
      },
      async sendMessage() {},
    },
    runtime: {
      async sendMessage() {},
    },
  },
});

const lifecycle = await import("../../src/chrome/pendingRequestLifecycle");
const bankrCredentialBinding = await import(
  "../../src/chrome/bankrCredentialBinding"
);
const dappLifecycle = await import(
  "../../src/chrome/pendingDappRequestLifecycle"
);
const walletConnectLifecycle = await import(
  "../../src/chrome/pendingWalletConnectLifecycle"
);
const dappPermissionStorage = await import(
  "../../src/chrome/dappPermissionStorage"
);
const pendingTxStorage = await import("../../src/chrome/pendingTxStorage");
const pendingSignatureStorage = await import(
  "../../src/chrome/pendingSignatureStorage"
);
const pendingBatchStorage = await import(
  "../../src/chrome/pendingBatchTxStorage"
);
const metadataLifecycle = await import(
  "../../src/chrome/pendingMetadataPromptLifecycle"
);
const batchAcknowledgementLifecycle = await import(
  "../../src/chrome/pendingBatchAcknowledgementLifecycle"
);
const pendingAddChainStorage = await import(
  "../../src/chrome/pendingAddChainStorage"
);
const pendingWatchAssetStorage = await import(
  "../../src/chrome/pendingWatchAssetStorage"
);
const resolution = await import("../../src/chrome/pendingRequestResolution");
const crossDappLifecycle = await import(
  "../../src/chrome/crossDappBatchLifecycle"
);
const erc7715Resolution = await import(
  "../../src/chrome/erc7715/resolution"
);

function transaction(id: string, origin: string, tabId = 7) {
  return {
    id,
    tx: {
      from: "0x0000000000000000000000000000000000000001",
      to: "0x0000000000000000000000000000000000000002",
      value: "0x0",
      data: "0x",
      chainId: 1,
    },
    origin,
    senderOrigin: origin,
    tabId,
    frameId: 0,
    favicon: null,
    chainName: "Ethereum",
    timestamp: Date.now(),
    accountId: "account-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: "privateKey" as const,
  };
}

function signature(id: string, origin: string, tabId = 7) {
  return {
    id,
    signature: { method: "personal_sign", params: [], chainId: 1 },
    origin,
    senderOrigin: origin,
    tabId,
    frameId: 0,
    favicon: null,
    chainName: "Ethereum",
    timestamp: Date.now(),
    accountId: "account-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: "privateKey" as const,
  };
}

const finalEffectRoutes = [
  { name: "Bankr transaction", kind: "transaction" as const, family: "transaction" as const, accountType: "bankr" },
  { name: "private-key transaction", kind: "transaction" as const, family: "transaction" as const, accountType: "privateKey" },
  { name: "seed-phrase transaction", kind: "transaction" as const, family: "transaction" as const, accountType: "seedPhrase" },
  { name: "Bankr signature", kind: "signature" as const, family: "signature" as const, accountType: "bankr" },
  { name: "private-key signature", kind: "signature" as const, family: "signature" as const, accountType: "privateKey" },
  { name: "seed-phrase signature", kind: "signature" as const, family: "signature" as const, accountType: "seedPhrase" },
  { name: "Bankr wallet_sendCalls", kind: "batchTransaction" as const, family: "batchTransaction" as const, accountType: "bankr" },
  { name: "private-key wallet_sendCalls", kind: "batchTransaction" as const, family: "batchTransaction" as const, accountType: "privateKey" },
  { name: "seed-phrase wallet_sendCalls", kind: "batchTransaction" as const, family: "batchTransaction" as const, accountType: "seedPhrase" },
];

let bankrCredentialTag = "";

function pendingForFinalEffectRoute(
  route: (typeof finalEffectRoutes)[number],
  id: string,
  origin: string,
  walletConnect?: { topic: string; requestId: number; method: string },
): any {
  const transport = walletConnect
    ? { origin: `walletconnect:${walletConnect.topic}`, walletConnect }
    : { origin, senderOrigin: origin, tabId: 7, frameId: 0 };
  if (route.kind === "transaction") {
    return {
      ...transaction(id, transport.origin),
      ...transport,
      accountType: route.accountType,
      bankrCredentialTag:
        route.accountType === "bankr" ? bankrCredentialTag : undefined,
    };
  }
  if (route.kind === "signature") {
    return {
      ...signature(id, transport.origin),
      ...transport,
      accountType: route.accountType,
      bankrCredentialTag:
        route.accountType === "bankr" ? bankrCredentialTag : undefined,
    };
  }
  return {
    id,
    params: { version: "2.0.0", chainId: "0x1", calls: [] },
    ...transport,
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: Date.now(),
    accountId: "account-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: route.accountType,
    bankrCredentialTag:
      route.accountType === "bankr" ? bankrCredentialTag : undefined,
  };
}

function storeFinalEffectPending(
  kind: (typeof finalEffectRoutes)[number]["kind"],
  pending: any,
): () => Promise<void> {
  if (kind === "transaction") {
    store.pendingTxRequests = [pending];
    return () => pendingTxStorage.removePendingTxRequest(pending.id);
  }
  if (kind === "signature") {
    store.pendingSignatureRequests = [pending];
    return () =>
      pendingSignatureStorage.removePendingSignatureRequest(pending.id);
  }
  store.pendingBatchTxRequests = [pending];
  store.bundleStatuses = [
    {
      id: pending.id,
      chainId: 1,
      status: 100,
      atomic: false,
      createdAt: Date.now(),
    },
  ];
  return () => pendingBatchStorage.removePendingBatchTxRequest(pending.id);
}

beforeEach(async () => {
  for (const key of Object.keys(store)) delete store[key];
  tabUrls.clear();
  pendingTxReadGate = null;
  tabReadGate = null;
  metadataReadGate = null;
  tabReadGates.clear();
  resolution.resetPendingRequestResolutionClaimsForTests();
  lifecycle.resetPendingRequestLifecycleForTests();
  walletConnectLifecycle.resetPendingWalletConnectLifecycleForTests();
  store.encryptedApiKeyVault = {
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAA==",
    iv: "AAAAAAAAAAAAAAAA",
    salt: "",
  };
  bankrCredentialTag =
    (await bankrCredentialBinding.getCurrentBankrCredentialTag()) ?? "";
  assert.match(bankrCredentialTag, /^[0-9a-f]{64}$/);
});

afterEach(() => {
  pendingTxReadGate = null;
  tabReadGate = null;
  metadataReadGate = null;
  tabReadGates.clear();
});

test("the injected 5-minute timeout atomically terminalizes its exact request", async () => {
  const origin = "https://app.example";
  tabUrls.set(7, `${origin}/swap`);
  store.pendingTxRequests = [transaction("tx-timeout", origin)];

  let releaseRead!: () => void;
  pendingTxReadGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const expiry = lifecycle.expireInjectedProviderRequest(
    "transaction",
    "tx-timeout",
    {
      origin,
      url: `${origin}/swap`,
      frameId: 0,
      tab: { id: 7, url: `${origin}/swap` },
    } as chrome.runtime.MessageSender,
  );

  let confirmRan = false;
  const competingConfirm = resolution.runPendingRequestResolution({
    family: "transaction",
    requestId: "tx-timeout",
    action: "confirm",
    conflictResult: (winningAction) => ({ winningAction }),
    resolve: async () => {
      confirmRan = true;
      return { success: true };
    },
  });
  assert.deepEqual(await competingConfirm, { winningAction: "expire" });
  assert.equal(confirmRan, false);

  releaseRead();
  assert.deepEqual(await expiry, { success: true, expired: true });
  assert.deepEqual(store.pendingTxRequests, []);
  assert.equal(store["txResult:tx-timeout"].result.success, false);
  assert.match(store["txResult:tx-timeout"].result.error, /timed out/i);
});

test("timeout handshakes cannot cancel another tab or origin's request", async () => {
  const origin = "https://app.example";
  const otherOrigin = "https://other.example";
  tabUrls.set(8, `${otherOrigin}/`);
  store.pendingSignatureRequests = [signature("sig-scoped", origin, 7)];

  const result = await lifecycle.expireInjectedProviderRequest(
    "signature",
    "sig-scoped",
    {
      origin: otherOrigin,
      url: `${otherOrigin}/`,
      frameId: 0,
      tab: { id: 8, url: `${otherOrigin}/` },
    } as chrome.runtime.MessageSender,
  );
  assert.deepEqual(result, {
    success: false,
    error: "Pending request not found",
  });
  assert.equal(store.pendingSignatureRequests.length, 1);
  assert.equal(store["sigResult:sig-scoped"], undefined);
});

test("wallet_sendCalls acknowledgement expiry terminalizes only its exact batch", async () => {
  const origin = "https://app.example";
  const otherOrigin = "https://other.example";
  const pending = pendingForFinalEffectRoute(
    finalEffectRoutes.find((route) => route.kind === "batchTransaction")!,
    "batch-ack-timeout",
    origin,
  );
  storeFinalEffectPending("batchTransaction", pending);

  const wrongSender = await batchAcknowledgementLifecycle.expireBatchAcknowledgement(
    pending.id,
    {
      origin: otherOrigin,
      url: `${otherOrigin}/`,
      frameId: 0,
      tab: { id: 8, url: `${otherOrigin}/` },
    } as chrome.runtime.MessageSender,
  );
  assert.deepEqual(wrongSender, {
    success: false,
    error: "Pending request not found",
  });
  assert.equal(store.pendingBatchTxRequests.length, 1);
  assert.equal(store[`batchTxAck:${pending.id}`], undefined);

  const expired = await batchAcknowledgementLifecycle.expireBatchAcknowledgement(
    pending.id,
    {
      origin,
      url: `${origin}/`,
      frameId: 0,
      tab: { id: 7, url: `${origin}/` },
    } as chrome.runtime.MessageSender,
  );
  assert.deepEqual(expired, { success: true, expired: true });
  assert.deepEqual(store.pendingBatchTxRequests, []);
  assert.equal(store.bundleStatuses[0].status, 400);
  assert.match(store[`batchTxAck:${pending.id}`].result.error, /timed out/i);
});

test("wallet_sendCalls queue ownership prevents a false local timeout", async () => {
  const origin = "https://app.example";
  const id = "batch-ack-queue-wins";
  let releaseQueue!: () => void;
  const queueGate = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  const queue = resolution.runPendingRequestResolution({
    family: "batchTransaction",
    requestId: id,
    action: "confirm",
    conflictResult: () => ({ success: false }),
    resolve: async () => {
      await queueGate;
      await chrome.storage.local.set({
        [`batchTxAck:${id}`]: {
          result: { success: true, id },
          timestamp: Date.now(),
        },
      });
      return { success: true };
    },
  });

  const expiry = await batchAcknowledgementLifecycle.expireBatchAcknowledgement(
    id,
    {
      origin,
      url: `${origin}/`,
      frameId: 0,
      tab: { id: 7, url: `${origin}/` },
    } as chrome.runtime.MessageSender,
  );
  assert.deepEqual(expiry, {
    success: false,
    error: "Request is already being resolved",
  });
  assert.equal(store[`batchTxAck:${id}`], undefined);

  releaseQueue();
  await queue;
  assert.equal(store[`batchTxAck:${id}`].result.success, true);
});

test("wallet_sendCalls timeout ownership blocks a delayed queue operation", async () => {
  const origin = "https://app.example";
  const id = "batch-ack-timeout-wins";
  const expiry = batchAcknowledgementLifecycle.expireBatchAcknowledgement(id, {
    origin,
    url: `${origin}/`,
    frameId: 0,
    tab: { id: 7, url: `${origin}/` },
  } as chrome.runtime.MessageSender);

  let queued = false;
  const delayedQueue = await resolution.runPendingRequestResolution({
    family: "batchTransaction",
    requestId: id,
    action: "confirm",
    conflictResult: (winner) => winner,
    resolve: async () => {
      queued = true;
      return "queued";
    },
  });
  assert.equal(delayedQueue, "expire");
  assert.equal(queued, false);
  assert.deepEqual(await expiry, { success: true, expired: true });
  assert.equal(store[`batchTxAck:${id}`].result.success, false);
});

test("revoking one exact origin cancels all of its approval families only", async () => {
  const origin = "https://app.example";
  const otherOrigin = "https://other.example";
  const ownTx = transaction("tx-own", origin);
  const otherTx = transaction("tx-other", otherOrigin, 8);
  const ownSig = signature("sig-own", origin);
  const otherSig = signature("sig-other", otherOrigin, 8);
  const batch = {
    id: "batch-own",
    params: { version: "2.0.0", chainId: "0x1", calls: [] },
    origin,
    senderOrigin: origin,
    tabId: 7,
    frameId: 0,
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: Date.now(),
    accountId: "account-1",
    accountAddress: ownTx.accountAddress,
    accountType: "privateKey",
  };
  const permission = {
    id: "permission-own",
    origin,
    senderOrigin: origin,
    tabId: 7,
    frameId: 0,
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: Date.now(),
    request: {},
    permissionType: "native-token-stream",
    caveats: [],
    accountId: "account-1",
    accountAddress: ownTx.accountAddress,
    accountType: "privateKey",
  };
  store.pendingTxRequests = [ownTx, otherTx];
  store.pendingSignatureRequests = [ownSig, otherSig];
  store.pendingBatchTxRequests = [batch];
  store.pendingErc7715PermissionRequests = [permission];
  store.bundleStatuses = [
    {
      id: batch.id,
      chainId: 1,
      status: 100,
      atomic: false,
      createdAt: Date.now(),
    },
  ];

  await dappLifecycle.cancelPendingRequestsForDappOrigin(origin);

  assert.deepEqual(
    store.pendingTxRequests.map((item: { id: string }) => item.id),
    ["tx-other"],
  );
  assert.deepEqual(
    store.pendingSignatureRequests.map((item: { id: string }) => item.id),
    ["sig-other"],
  );
  assert.deepEqual(store.pendingBatchTxRequests, []);
  assert.deepEqual(store.pendingErc7715PermissionRequests, []);
  assert.equal(store["txResult:tx-own"].result.code, 4100);
  assert.equal(store["sigResult:sig-own"].result.code, 4100);
  assert.match(
    store["erc7715PermissionResult:permission-own"].result.error,
    /no longer active/i,
  );
  assert.equal(store.bundleStatuses[0].status, 400);
});

test("a revocation gate blocks confirmation before its storage write finishes", async () => {
  const origin = "https://app.example";
  tabUrls.set(7, `${origin}/`);
  store.dappPermissions = {
    [origin]: {
      origin,
      hostname: "app.example",
      approvedAt: 1,
      lastConnectedAt: 1,
    },
  };
  const pending = transaction("tx-gated", origin);

  lifecycle.beginDappOriginRevocation(origin);
  const denied = await lifecycle.validateInjectedPendingRequestAuthorization(
    pending,
  );
  assert.equal(denied.authorized, false);

  lifecycle.finishDappOriginRevocation(origin);
  const allowed = await lifecycle.validateInjectedPendingRequestAuthorization(
    pending,
  );
  assert.deepEqual(allowed, { authorized: true });
});

test("a completed revoke still invalidates an authorization read already in flight", async () => {
  const origin = "https://app.example";
  tabUrls.set(7, `${origin}/`);
  store.dappPermissions = {
    [origin]: {
      origin,
      hostname: "app.example",
      approvedAt: 1,
      lastConnectedAt: 1,
    },
  };
  let releaseTab!: () => void;
  tabReadGate = new Promise<void>((resolve) => {
    releaseTab = resolve;
  });

  const authorization = lifecycle.validateInjectedPendingRequestAuthorization(
    transaction("tx-in-flight", origin),
  );
  await Promise.resolve();
  lifecycle.beginDappOriginRevocation(origin);
  lifecycle.finishDappOriginRevocation(origin);
  releaseTab();

  const result = await authorization;
  assert.equal(result.authorized, false);
});

for (const route of finalEffectRoutes) {
  test(`${route.name}: revoke while final removal is held produces zero effect`, async () => {
    const origin = "https://final-effect.example";
    const id = `revoke-${route.kind}-${route.accountType}`;
    tabUrls.set(7, `${origin}/confirm`);
    store.dappPermissions = {
      [origin]: {
        origin,
        hostname: "final-effect.example",
        approvedAt: 1,
        lastConnectedAt: 1,
      },
    };
    const pending = pendingForFinalEffectRoute(route, id, origin);
    const removePending = storeFinalEffectPending(route.kind, pending);
    let releaseRemoval!: () => void;
    const removalGate = new Promise<void>((resolve) => {
      releaseRemoval = resolve;
    });
    let effects = 0;

    const confirm = resolution.runPendingRequestResolution({
      family: route.family,
      requestId: id,
      action: "confirm",
      conflictResult: () => ({ authorized: false as const, error: "conflict" }),
      resolve: async () => {
        await removalGate;
        await removePending();
        const authorization =
          await lifecycle.enforcePendingRequestAuthorizationAtConfirmation(
            route.kind,
            pending,
          );
        if (authorization.authorized) effects += 1;
        return authorization;
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    lifecycle.beginDappOriginRevocation(origin);
    delete store.dappPermissions[origin];
    lifecycle.finishDappOriginRevocation(origin);
    releaseRemoval();

    const result = await confirm;
    assert.equal(result.authorized, false);
    assert.equal(effects, 0);
  });

  test(`${route.name}: WalletConnect termination while final removal is held produces zero effect`, async () => {
    const topic = `topic-${route.kind}-${route.accountType}`;
    const id = `disconnect-${route.kind}-${route.accountType}`;
    const method =
      route.kind === "transaction"
        ? "eth_sendTransaction"
        : route.kind === "signature"
          ? "personal_sign"
          : "wallet_sendCalls";
    const walletConnect = { topic, requestId: 42, method };
    const pending = pendingForFinalEffectRoute(
      route,
      id,
      "",
      walletConnect,
    );
    const removePending = storeFinalEffectPending(route.kind, pending);
    if (route.kind !== "batchTransaction") {
      store.walletConnectPendingRequests = {
        [id]: {
          id,
          kind: route.kind,
          topic,
          requestId: walletConnect.requestId,
          method,
          timestamp: Date.now(),
        },
      };
    }
    let releaseRemoval!: () => void;
    const removalGate = new Promise<void>((resolve) => {
      releaseRemoval = resolve;
    });
    let effects = 0;

    const confirm = resolution.runPendingRequestResolution({
      family: route.family,
      requestId: id,
      action: "confirm",
      conflictResult: () => ({ authorized: false as const, error: "conflict" }),
      resolve: async () => {
        await removalGate;
        await removePending();
        const authorization =
          await lifecycle.enforcePendingRequestAuthorizationAtConfirmation(
            route.kind,
            pending,
          );
        if (authorization.authorized) effects += 1;
        return authorization;
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    await walletConnectLifecycle.cancelPendingRequestsForWalletConnectTopic(
      topic,
    );
    releaseRemoval();

    const result = await confirm;
    assert.equal(result.authorized, false);
    assert.equal(effects, 0);
  });
}

test("cross-dapp commit rejects origin A revoked while origin B is still awaiting", async () => {
  const originA = "https://a.example";
  const originB = "https://b.example";
  tabUrls.set(7, `${originA}/`);
  tabUrls.set(8, `${originB}/`);
  store.dappPermissions = {
    [originA]: {
      origin: originA,
      hostname: "a.example",
      approvedAt: 1,
      lastConnectedAt: 1,
    },
    [originB]: {
      origin: originB,
      hostname: "b.example",
      approvedAt: 1,
      lastConnectedAt: 1,
    },
  };
  const entry = (
    bundleId: string,
    origin: string,
    tabId: number,
  ) => ({
    txId: `${bundleId}:0`,
    tx: {
      from: "0x0000000000000000000000000000000000000001",
      to: "0x0000000000000000000000000000000000000002",
      value: "0x0",
      data: "0x",
      chainId: 1,
    },
    origin,
    favicon: null,
    addedAt: Date.now(),
    source: {
      kind: "wallet_sendCalls" as const,
      bundleId,
      callIndex: 0,
      totalCalls: 1,
    },
    tabId,
    frameId: 0,
    senderOrigin: origin,
  });
  const batch = {
    fromAddress: "0x0000000000000000000000000000000000000001",
    chainId: 1,
    chainName: "Ethereum",
    accountType: "privateKey" as const,
    accountId: "account-1",
    entries: [entry("bundle-a", originA, 7), entry("bundle-b", originB, 8)],
    createdAt: Date.now(),
  };
  store.crossDappBatch = batch;
  store.bundleStatuses = [
    { id: "bundle-a", chainId: 1, status: 100, atomic: false, createdAt: 1 },
    { id: "bundle-b", chainId: 1, status: 100, atomic: false, createdAt: 1 },
  ];

  let releaseB!: () => void;
  tabReadGates.set(
    8,
    new Promise<void>((resolve) => {
      releaseB = resolve;
    }),
  );
  const authorization =
    crossDappLifecycle.enforceCrossDappBatchAuthorizationAtConfirmation(batch);

  // Drain every runnable continuation. Origin A has completed its async tab +
  // permission check; origin B remains held at chrome.tabs.get.
  await new Promise<void>((resolve) => setImmediate(resolve));
  lifecycle.beginDappOriginRevocation(originA);
  delete store.dappPermissions[originA];
  lifecycle.finishDappOriginRevocation(originA);
  releaseB();

  const prepared = await authorization;
  assert.equal(prepared.authorized, true);
  let effects = 0;
  if (prepared.authorized) {
    const committed = prepared.commit();
    if (committed.authorized) {
      effects += 1;
    } else {
      await committed.terminalize();
    }
  }

  assert.equal(effects, 0);
  assert.deepEqual(
    store.crossDappBatch.entries.map(
      (item: { source: { bundleId: string } }) => item.source.bundleId,
    ),
    ["bundle-b"],
  );
  assert.equal(store.bundleStatuses[0].status, 400);
  assert.equal(store.bundleStatuses[1].status, 100);
});

test("cross-dapp cancellation removes only the exact origin or WalletConnect topic", async () => {
  const makeEntry = (
    bundleId: string,
    origin: string,
    transport:
      | { tabId: number; senderOrigin: string }
      | { walletConnect: { topic: string; requestId: number; method: string } },
  ) => ({
    txId: `${bundleId}:0`,
    tx: {
      from: "0x0000000000000000000000000000000000000001",
      to: "0x0000000000000000000000000000000000000002",
      value: "0x0",
      data: "0x",
      chainId: 1,
    },
    origin,
    favicon: null,
    addedAt: Date.now(),
    source: {
      kind: "wallet_sendCalls" as const,
      bundleId,
      callIndex: 0,
      totalCalls: 1,
    },
    frameId: 0,
    ...transport,
  });
  const origin = "https://kept-by-topic.example";
  const batch = {
    fromAddress: "0x0000000000000000000000000000000000000001",
    chainId: 1,
    chainName: "Ethereum",
    accountType: "privateKey" as const,
    accountId: "account-1",
    entries: [
      makeEntry("bundle-topic-a", "walletconnect:topic-a", {
        walletConnect: {
          topic: "topic-a",
          requestId: 1,
          method: "wallet_sendCalls",
        },
      }),
      makeEntry("bundle-topic-b", "walletconnect:topic-b", {
        walletConnect: {
          topic: "topic-b",
          requestId: 2,
          method: "wallet_sendCalls",
        },
      }),
      makeEntry("bundle-origin", origin, { tabId: 9, senderOrigin: origin }),
    ],
    createdAt: Date.now(),
  };
  store.crossDappBatch = batch;
  store.bundleStatuses = batch.entries.map((item) => ({
    id: item.source.bundleId,
    chainId: 1,
    status: 100,
    atomic: false,
    createdAt: 1,
  }));

  const topicCancelled =
    await crossDappLifecycle.cancelCrossDappBatchForWalletConnectTopic(
      "topic-a",
    );
  assert.deepEqual(topicCancelled, {
    transactions: 0,
    bundles: 1,
    removedEntries: 1,
  });
  assert.deepEqual(
    store.crossDappBatch.entries.map(
      (item: { source: { bundleId: string } }) => item.source.bundleId,
    ),
    ["bundle-topic-b", "bundle-origin"],
  );

  const originCancelled =
    await crossDappLifecycle.cancelCrossDappBatchForDappOrigin(origin);
  assert.deepEqual(originCancelled, {
    transactions: 0,
    bundles: 1,
    removedEntries: 1,
  });
  assert.deepEqual(
    store.crossDappBatch.entries.map(
      (item: { source: { bundleId: string } }) => item.source.bundleId,
    ),
    ["bundle-topic-b"],
  );
  assert.equal(store.bundleStatuses[0].status, 400);
  assert.equal(store.bundleStatuses[1].status, 100);
  assert.equal(store.bundleStatuses[2].status, 400);
});

test("an ERC-7715 revoke during local signing prevents grant publication", async () => {
  const origin = "https://app.example";
  tabUrls.set(7, `${origin}/`);
  store.dappPermissions = {
    [origin]: {
      origin,
      hostname: "app.example",
      approvedAt: 1,
      lastConnectedAt: 1,
    },
  };
  const pending = {
    id: "permission-sign-race",
    origin,
    senderOrigin: origin,
    tabId: 7,
    frameId: 0,
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: Date.now(),
    request: {},
    permissionType: "native-token-stream",
    caveats: [],
    accountId: "account-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: "privateKey",
  };
  store.pendingErc7715PermissionRequests = [pending];

  assert.deepEqual(
    await lifecycle.enforcePendingRequestAuthorizationAtConfirmation(
      "erc7715Permission",
      pending,
    ),
    { authorized: true },
  );

  // Model the awaited local signature preparation. The resulting signature is
  // not publishable until the handler's post-sign authorization check passes.
  lifecycle.beginDappOriginRevocation(origin);
  delete store.dappPermissions[origin];
  lifecycle.finishDappOriginRevocation(origin);
  let grantsPublished = 0;
  const finalAuthorization =
    await lifecycle.enforcePendingRequestAuthorizationAtConfirmation(
      "erc7715Permission",
      pending,
    );
  if (finalAuthorization.authorized) grantsPublished += 1;

  assert.equal(finalAuthorization.authorized, false);
  assert.equal(grantsPublished, 0);
  assert.deepEqual(store.pendingErc7715PermissionRequests, []);
  assert.match(
    store["erc7715PermissionResult:permission-sign-race"].result.error,
    /no longer active/i,
  );
});

test("ERC-7715 confirmation claimed before revoke cannot publish after signing", async () => {
  const origin = "https://erc-final.example";
  tabUrls.set(7, `${origin}/`);
  store.dappPermissions = {
    [origin]: {
      origin,
      hostname: "erc-final.example",
      approvedAt: 1,
      lastConnectedAt: 1,
    },
  };
  const pending = {
    id: "erc-final-revoke",
    origin,
    senderOrigin: origin,
    tabId: 7,
    frameId: 0,
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: Date.now(),
    request: {},
    permissionType: "native-token-stream",
    caveats: [],
    accountId: "account-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: "privateKey",
  };
  store.pendingErc7715PermissionRequests = [pending];
  let releaseSigning!: () => void;
  const signingGate = new Promise<void>((resolve) => {
    releaseSigning = resolve;
  });
  let grantsPublished = 0;
  const grant = erc7715Resolution.runErc7715PermissionResolution(
    pending.id,
    async () => {
      await signingGate;
      const authorization =
        await lifecycle.enforcePendingRequestAuthorizationAtConfirmation(
          "erc7715Permission",
          pending,
        );
      if (authorization.authorized) grantsPublished += 1;
      return authorization.authorized
        ? { success: true, result: [] }
        : { success: false, error: authorization.error };
    },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));

  lifecycle.beginDappOriginRevocation(origin);
  delete store.dappPermissions[origin];
  lifecycle.finishDappOriginRevocation(origin);
  releaseSigning();

  assert.equal((await grant).success, false);
  assert.equal(grantsPublished, 0);
});

test("ERC-7715 confirmation claimed before WalletConnect termination cannot publish after signing", async () => {
  const topic = "erc-final-topic";
  const pending = {
    id: "erc-final-disconnect",
    origin: `walletconnect:${topic}`,
    walletConnect: {
      topic,
      requestId: 77,
      method: "wallet_grantPermissions",
    },
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: Date.now(),
    request: {},
    permissionType: "native-token-stream",
    caveats: [],
    accountId: "account-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: "privateKey",
  };
  store.pendingErc7715PermissionRequests = [pending];
  store.walletConnectPendingRequests = {
    [pending.id]: {
      id: pending.id,
      kind: "erc7715Permission",
      topic,
      requestId: pending.walletConnect.requestId,
      method: pending.walletConnect.method,
      timestamp: Date.now(),
    },
  };
  let releaseSigning!: () => void;
  const signingGate = new Promise<void>((resolve) => {
    releaseSigning = resolve;
  });
  let grantsPublished = 0;
  const grant = erc7715Resolution.runErc7715PermissionResolution(
    pending.id,
    async () => {
      await signingGate;
      const authorization =
        await lifecycle.enforcePendingRequestAuthorizationAtConfirmation(
          "erc7715Permission",
          pending,
        );
      if (authorization.authorized) grantsPublished += 1;
      return authorization.authorized
        ? { success: true, result: [] }
        : { success: false, error: authorization.error };
    },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));

  const disconnect =
    walletConnectLifecycle.cancelPendingRequestsForWalletConnectTopic(topic);
  await new Promise<void>((resolve) => setImmediate(resolve));
  releaseSigning();

  const [grantResult] = await Promise.all([grant, disconnect]);
  assert.equal(grantResult.success, false);
  assert.equal(grantsPublished, 0);
});

test("WalletConnect disconnect cancels only its topic and drops routes only after confirmation", async () => {
  const makeBatch = (id: string, topic: string) => ({
    id,
    params: { version: "2.0.0", chainId: "0x1", calls: [] },
    origin: `https://${topic}.example`,
    senderOrigin: `https://${topic}.example`,
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: Date.now(),
    accountId: "account-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: "privateKey",
    walletConnect: {
      topic,
      requestId: topic === "topic-a" ? 11 : 22,
      method: "wallet_sendCalls",
    },
  });
  store.pendingBatchTxRequests = [
    makeBatch("batch-a", "topic-a"),
    makeBatch("batch-b", "topic-b"),
  ];
  store.bundleStatuses = [
    {
      id: "batch-a",
      chainId: 1,
      status: 100,
      atomic: false,
      createdAt: Date.now(),
    },
    {
      id: "batch-b",
      chainId: 1,
      status: 100,
      atomic: false,
      createdAt: Date.now(),
    },
  ];
  store.walletConnectPendingRequests = {
    "claim-a": {
      id: "claim-a",
      kind: "claim",
      topic: "topic-a",
      requestId: 31,
      method: "personal_sign",
      timestamp: Date.now(),
    },
    "claim-b": {
      id: "claim-b",
      kind: "claim",
      topic: "topic-b",
      requestId: 32,
      method: "personal_sign",
      timestamp: Date.now(),
    },
  };

  const cancelled =
    await walletConnectLifecycle.cancelPendingRequestsForWalletConnectTopic(
      "topic-a",
    );
  assert.deepEqual(cancelled, {
    transactions: 0,
    signatures: 0,
    batches: 1,
    permissions: 0,
  });
  assert.deepEqual(
    store.pendingBatchTxRequests.map((item: { id: string }) => item.id),
    ["batch-b"],
  );
  assert.equal(store.bundleStatuses[0].status, 400);
  assert.equal(store.bundleStatuses[1].status, 100);
  // Pre-disconnect cleanup must preserve an outbox/claim if SDK disconnect
  // fails; only a confirmed termination makes route deletion safe.
  assert.ok(store.walletConnectPendingRequests["claim-a"]);

  await walletConnectLifecycle.finalizeWalletConnectTopicTermination(
    "topic-a",
  );
  assert.equal(store.walletConnectPendingRequests["claim-a"], undefined);
  assert.ok(store.walletConnectPendingRequests["claim-b"]);
});

test("a connect confirmation that owns the timeout race publishes the eventual durable result", async () => {
  const origin = "https://app.example";
  tabUrls.set(7, `${origin}/`);
  store.pendingDappConnectionRequests = [
    {
      id: "connect-confirm-wins",
      origin,
      hostname: "app.example",
      tabId: 7,
      frameId: 0,
      timestamp: Date.now(),
    },
  ];
  let releaseConfirm!: () => void;
  const confirmGate = new Promise<void>((resolve) => {
    releaseConfirm = resolve;
  });
  const confirm = resolution.runPendingRequestResolution({
    family: "dappConnection",
    requestId: "all",
    action: "confirm",
    conflictResult: () => ({ success: false }),
    resolve: async () => {
      await confirmGate;
      store.pendingDappConnectionRequests = [];
      await chrome.storage.local.set({
        "dappConnectionResult:connect-confirm-wins": {
          result: { success: true, accounts: ["0x1"] },
          timestamp: Date.now(),
        },
      });
      return { success: true };
    },
  });

  const expiry = await dappLifecycle.expireDappConnectionRequest(
    "connect-confirm-wins",
    {
      origin,
      url: `${origin}/`,
      frameId: 0,
      tab: { id: 7, url: `${origin}/` },
    } as chrome.runtime.MessageSender,
  );
  assert.deepEqual(expiry, {
    success: false,
    error: "Request is already being resolved",
  });
  assert.equal(
    store["dappConnectionResult:connect-confirm-wins"],
    undefined,
  );

  releaseConfirm();
  await confirm;
  assert.equal(
    store["dappConnectionResult:connect-confirm-wins"].result.success,
    true,
  );
});

test("connect expiry is exact-tab scoped and the periodic sweep writes a terminal result", async () => {
  const origin = "https://app.example";
  const otherOrigin = "https://other.example";
  tabUrls.set(8, `${otherOrigin}/`);
  store.pendingDappConnectionRequests = [
    {
      id: "connect-expired",
      origin,
      hostname: "app.example",
      tabId: 7,
      frameId: 0,
      timestamp:
        Date.now() -
        dappPermissionStorage.DAPP_CONNECTION_REQUEST_EXPIRY_MS -
        1,
    },
  ];

  const wrongSender = await dappLifecycle.expireDappConnectionRequest(
    "connect-expired",
    {
      origin: otherOrigin,
      url: `${otherOrigin}/`,
      frameId: 0,
      tab: { id: 8, url: `${otherOrigin}/` },
    } as chrome.runtime.MessageSender,
  );
  assert.deepEqual(wrongSender, {
    success: false,
    error: "Pending request not found",
  });
  assert.equal(store.pendingDappConnectionRequests.length, 1);

  await dappPermissionStorage.clearExpiredDappConnectionRequests();
  assert.deepEqual(store.pendingDappConnectionRequests, []);
  assert.deepEqual(
    store["dappConnectionResult:connect-expired"].result,
    {
      success: false,
      error: "Connection request timed out",
      code: -32000,
    },
  );
});

test("periodic tx, signature, and batch expiry publishes durable terminal state", async () => {
  const origin = "https://app.example";
  const expiredTimestamp = Date.now() - 31 * 60 * 1000;
  store.pendingTxRequests = [
    { ...transaction("tx-periodic-expired", origin), timestamp: expiredTimestamp },
  ];
  store.pendingSignatureRequests = [
    {
      ...signature("sig-periodic-expired", origin),
      timestamp: expiredTimestamp,
    },
  ];
  store.pendingBatchTxRequests = [
    {
      id: "batch-periodic-expired",
      params: { version: "2.0.0", chainId: "0x1", calls: [] },
      origin,
      senderOrigin: origin,
      tabId: 7,
      frameId: 0,
      favicon: null,
      chainName: "Ethereum",
      chainId: 1,
      timestamp: expiredTimestamp,
      accountId: "account-1",
      accountAddress: "0x0000000000000000000000000000000000000001",
      accountType: "privateKey",
    },
  ];
  store.bundleStatuses = [
    {
      id: "batch-periodic-expired",
      chainId: 1,
      status: 100,
      atomic: false,
      createdAt: expiredTimestamp,
    },
  ];

  await Promise.all([
    pendingTxStorage.clearExpiredTxRequests(),
    pendingSignatureStorage.clearExpiredSignatureRequests(),
    pendingBatchStorage.clearExpiredBatchTxRequests(),
  ]);

  assert.deepEqual(store.pendingTxRequests, []);
  assert.deepEqual(store.pendingSignatureRequests, []);
  assert.deepEqual(store.pendingBatchTxRequests, []);
  assert.match(
    store["txResult:tx-periodic-expired"].result.error,
    /expired/i,
  );
  assert.match(
    store["sigResult:sig-periodic-expired"].result.error,
    /expired/i,
  );
  assert.equal(store.bundleStatuses[0].status, 400);
  assert.match(store.bundleStatuses[0].error, /expired/i);
});

test("a confirmation claim prevents the periodic expiry sweep from overtaking it", async () => {
  const origin = "https://app.example";
  store.pendingTxRequests = [
    {
      ...transaction("tx-confirm-vs-sweep", origin),
      timestamp: Date.now() - 31 * 60 * 1000,
    },
  ];
  let releaseConfirm!: () => void;
  const confirmGate = new Promise<void>((resolve) => {
    releaseConfirm = resolve;
  });
  const confirm = resolution.runPendingRequestResolution({
    family: "transaction",
    requestId: "tx-confirm-vs-sweep",
    action: "confirm",
    conflictResult: () => ({ success: false }),
    resolve: async () => {
      await confirmGate;
      store.pendingTxRequests = [];
      await chrome.storage.local.set({
        "txResult:tx-confirm-vs-sweep": {
          result: { success: true, txHash: "0xconfirmed" },
          timestamp: Date.now(),
        },
      });
      return { success: true };
    },
  });

  await pendingTxStorage.clearExpiredTxRequests();
  assert.equal(store.pendingTxRequests.length, 1);
  assert.equal(store["txResult:tx-confirm-vs-sweep"], undefined);

  releaseConfirm();
  await confirm;
  assert.deepEqual(store["txResult:tx-confirm-vs-sweep"].result, {
    success: true,
    txHash: "0xconfirmed",
  });
});

test("an effect lease blocks expiry after the outer confirm resolver releases", async () => {
  const origin = "https://app.example";
  store.pendingSignatureRequests = [
    {
      ...signature("sig-effect-lease", origin),
      timestamp: Date.now() - 31 * 60 * 1000,
    },
  ];
  const lease = resolution.beginPendingRequestEffectLease(
    "signature",
    "sig-effect-lease",
  );
  assert.ok(lease);

  await pendingSignatureStorage.clearExpiredSignatureRequests();
  assert.equal(store.pendingSignatureRequests.length, 1);
  assert.equal(store["sigResult:sig-effect-lease"], undefined);

  lease.release();
  await pendingSignatureStorage.clearExpiredSignatureRequests();
  assert.deepEqual(store.pendingSignatureRequests, []);
  assert.match(store["sigResult:sig-effect-lease"].result.error, /expired/i);
});

test("metadata prompt expiry wins atomically against confirm and reject", async () => {
  const origin = "https://app.example";
  tabUrls.set(7, `${origin}/`);
  store.pendingAddChainRequests = [
    {
      id: "add-chain-expiry-race",
      chainId: 123,
      rpcUrls: ["https://rpc.example"],
      origin,
      senderOrigin: origin,
      tabId: 7,
      frameId: 0,
      favicon: null,
      timestamp: Date.now(),
    },
  ];
  let releaseRead!: () => void;
  metadataReadGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });

  const expiry = metadataLifecycle.expireMetadataPrompt(
    "addChain",
    "add-chain-expiry-race",
    {
      origin,
      url: `${origin}/`,
      frameId: 0,
      tab: { id: 7, url: `${origin}/` },
    } as chrome.runtime.MessageSender,
  );
  let confirmed = false;
  let rejected = false;
  const confirm = resolution.runPendingRequestResolution({
    family: "addChain",
    requestId: "add-chain-expiry-race",
    action: "confirm",
    conflictResult: (winner) => winner,
    resolve: async () => {
      confirmed = true;
      return "confirm";
    },
  });
  const reject = resolution.runPendingRequestResolution({
    family: "addChain",
    requestId: "add-chain-expiry-race",
    action: "reject",
    conflictResult: (winner) => winner,
    resolve: async () => {
      rejected = true;
      return "reject";
    },
  });
  assert.equal(await confirm, "expire");
  assert.equal(await reject, "expire");
  assert.equal(confirmed, false);
  assert.equal(rejected, false);

  releaseRead();
  assert.deepEqual(await expiry, { success: true, expired: true });
  assert.deepEqual(store.pendingAddChainRequests, []);
  assert.match(
    store["addChainResult:add-chain-expiry-race"].result.error,
    /timed out/i,
  );
});

test("metadata confirmation fails closed after expiry or navigation", async () => {
  const origin = "https://app.example";
  tabUrls.set(7, "https://other.example/");
  store.dappPermissions = {
    [origin]: {
      origin,
      hostname: "app.example",
      approvedAt: 1,
      lastConnectedAt: 1,
    },
  };
  const navigated = {
    id: "watch-navigated",
    asset: {
      address: "0x0000000000000000000000000000000000000001",
      symbol: "TEST",
      decimals: 18,
    },
    chainId: 1,
    origin,
    senderOrigin: origin,
    tabId: 7,
    frameId: 0,
    favicon: null,
    timestamp: Date.now(),
  };
  store.pendingWatchAssetRequests = [navigated];
  const denied =
    await metadataLifecycle.enforceMetadataPromptAuthorizationAtConfirmation(
      "watchAsset",
      navigated,
    );
  assert.equal(denied.authorized, false);
  assert.deepEqual(store.pendingWatchAssetRequests, []);
  assert.equal(store["watchAssetResult:watch-navigated"].result.code, 4100);

  const expired = {
    ...navigated,
    id: "watch-expired",
    timestamp: Date.now() - metadataLifecycle.metadataPromptExpiryMs - 1,
  };
  store.pendingWatchAssetRequests = [expired];
  const timedOut =
    await metadataLifecycle.enforceMetadataPromptAuthorizationAtConfirmation(
      "watchAsset",
      expired,
    );
  assert.equal(timedOut.authorized, false);
  assert.match(
    store["watchAssetResult:watch-expired"].result.error,
    /timed out/i,
  );
});

test("periodic metadata prompt cleanup writes durable timeout results", async () => {
  const expiredTimestamp = Date.now() - 6 * 60 * 1000;
  store.pendingAddChainRequests = [
    {
      id: "add-periodic",
      chainId: 123,
      origin: "https://app.example",
      favicon: null,
      timestamp: expiredTimestamp,
    },
  ];
  store.pendingWatchAssetRequests = [
    {
      id: "watch-periodic",
      asset: {
        address: "0x0000000000000000000000000000000000000001",
        symbol: "TEST",
        decimals: 18,
      },
      chainId: 1,
      origin: "https://app.example",
      favicon: null,
      timestamp: expiredTimestamp,
    },
  ];

  await Promise.all([
    pendingAddChainStorage.clearExpiredAddChainRequests(),
    pendingWatchAssetStorage.clearExpiredWatchAssetRequests(),
  ]);
  assert.deepEqual(store.pendingAddChainRequests, []);
  assert.deepEqual(store.pendingWatchAssetRequests, []);
  assert.match(store["addChainResult:add-periodic"].result.error, /timed out/i);
  assert.match(
    store["watchAssetResult:watch-periodic"].result.error,
    /timed out/i,
  );
});

test("ERC-7715 timeout handshake is exact-origin scoped and durable", async () => {
  const origin = "https://app.example";
  const otherOrigin = "https://other.example";
  const permission = {
    id: "permission-timeout",
    origin,
    senderOrigin: origin,
    tabId: 7,
    frameId: 0,
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: Date.now(),
    request: {},
    permissionType: "native-token-stream",
    caveats: [],
    accountId: "account-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: "privateKey",
  };
  store.pendingErc7715PermissionRequests = [permission];
  tabUrls.set(8, `${otherOrigin}/`);

  const wrongOrigin = await dappLifecycle.expireErc7715PermissionRequest(
    permission.id,
    {
      origin: otherOrigin,
      url: `${otherOrigin}/`,
      frameId: 0,
      tab: { id: 8, url: `${otherOrigin}/` },
    } as chrome.runtime.MessageSender,
  );
  assert.deepEqual(wrongOrigin, {
    success: false,
    error: "Pending request not found",
  });
  assert.equal(store.pendingErc7715PermissionRequests.length, 1);

  tabUrls.set(7, `${origin}/`);
  const expired = await dappLifecycle.expireErc7715PermissionRequest(
    permission.id,
    {
      origin,
      url: `${origin}/`,
      frameId: 0,
      tab: { id: 7, url: `${origin}/` },
    } as chrome.runtime.MessageSender,
  );
  assert.match(expired.error || "", /timed out/i);
  assert.deepEqual(store.pendingErc7715PermissionRequests, []);
  assert.match(
    store["erc7715PermissionResult:permission-timeout"].result.error,
    /timed out/i,
  );
});
