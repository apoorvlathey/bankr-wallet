import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

type Store = Record<string, any>;

const store: Store = {};
const tabUrls = new Map<number, string>();
let tabReadGate: Promise<void> | null = null;
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

const lifecycle = await import("../../src/chrome/requests/pendingRequestLifecycle");
const bankrCredentialBinding = await import(
  "../../src/chrome/bankr/credentialBinding"
);
const dappLifecycle = await import(
  "../../src/chrome/requests/pendingDappRequestLifecycle"
);
const walletConnectLifecycle = await import(
  "../../src/chrome/requests/pendingWalletConnectLifecycle"
);
const dappPermissionStorage = await import(
  "../../src/chrome/requests/dappPermissionStorage"
);
const pendingTxStorage = await import("../../src/chrome/requests/pendingTxStorage");
const pendingSignatureStorage = await import(
  "../../src/chrome/requests/pendingSignatureStorage"
);
const pendingBatchStorage = await import(
  "../../src/chrome/requests/pendingBatchTxStorage"
);
const metadataLifecycle = await import(
  "../../src/chrome/requests/pendingMetadataPromptLifecycle"
);
const pendingAddChainStorage = await import(
  "../../src/chrome/requests/pendingAddChainStorage"
);
const pendingWatchAssetStorage = await import(
  "../../src/chrome/requests/pendingWatchAssetStorage"
);
const pendingErc7715PermissionStorage = await import(
  "../../src/chrome/erc7715/pendingRequestStorage"
);
const resolution = await import("../../src/chrome/requests/pendingRequestResolution");
const crossDappLifecycle = await import(
  "../../src/chrome/crossDappBatch/lifecycle"
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
  tabReadGate = null;
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
  tabReadGate = null;
  tabReadGates.clear();
});

test("saving new prompts preserves every aged pending request", async () => {
  const origin = "https://app.example";
  const otherOrigin = "https://other.example";
  const agedAt = Date.now() - 24 * 60 * 60 * 1000;
  store.pendingTxRequests = [
    {
      ...transaction("tx-aged", origin),
      timestamp: agedAt,
    },
  ];
  store.pendingSignatureRequests = [
    { ...signature("sig-aged", origin), timestamp: agedAt },
  ];
  store.pendingBatchTxRequests = [
    {
      id: "batch-aged",
      params: { version: "2.0.0", chainId: "0x1", calls: [] },
      origin,
      senderOrigin: origin,
      tabId: 7,
      frameId: 0,
      favicon: null,
      chainName: "Ethereum",
      chainId: 1,
      timestamp: agedAt,
      accountId: "account-1",
      accountAddress: "0x0000000000000000000000000000000000000001",
      accountType: "privateKey",
    },
  ];
  store.pendingDappConnectionRequests = [{
    id: "connect-aged",
    origin,
    hostname: "app.example",
    tabId: 7,
    frameId: 0,
    timestamp: agedAt,
  }];
  store.pendingAddChainRequests = [{
    id: "add-aged",
    chainId: 123,
    origin,
    senderOrigin: origin,
    tabId: 7,
    frameId: 0,
    favicon: null,
    timestamp: agedAt,
  }];
  store.pendingWatchAssetRequests = [{
    id: "watch-aged",
    asset: {
      address: "0x0000000000000000000000000000000000000002",
      symbol: "OLD",
      decimals: 18,
    },
    chainId: 1,
    origin,
    senderOrigin: origin,
    tabId: 7,
    frameId: 0,
    favicon: null,
    timestamp: agedAt,
  }];
  store.pendingErc7715PermissionRequests = [{
    id: "permission-aged",
    origin,
    senderOrigin: origin,
    tabId: 7,
    frameId: 0,
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: agedAt,
    request: {},
    permissionType: "native-token-stream",
    caveats: [],
    accountId: "account-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: "privateKey",
  }];

  await pendingTxStorage.savePendingTxRequest(transaction("tx-new", origin));
  await pendingSignatureStorage.savePendingSignatureRequest(
    signature("sig-new", origin),
  );
  await pendingBatchStorage.savePendingBatchTxRequest({
    ...store.pendingBatchTxRequests[0],
    id: "batch-new",
    timestamp: Date.now(),
  });
  await dappPermissionStorage.savePendingDappConnectionRequest({
    id: "connect-new",
    origin: otherOrigin,
    hostname: "other.example",
    tabId: 8,
    frameId: 0,
    timestamp: Date.now(),
  });
  await pendingAddChainStorage.savePendingAddChainRequest({
    ...store.pendingAddChainRequests[0],
    id: "add-new",
    timestamp: Date.now(),
  });
  await pendingWatchAssetStorage.savePendingWatchAssetRequest({
    ...store.pendingWatchAssetRequests[0],
    id: "watch-new",
    timestamp: Date.now(),
  });
  await pendingErc7715PermissionStorage.savePendingErc7715PermissionRequest({
    ...store.pendingErc7715PermissionRequests[0],
    id: "permission-new",
    timestamp: Date.now(),
  });

  assert.deepEqual(
    store.pendingTxRequests.map((request: { id: string }) => request.id),
    ["tx-aged", "tx-new"],
  );
  assert.deepEqual(
    store.pendingSignatureRequests.map((request: { id: string }) => request.id),
    ["sig-aged", "sig-new"],
  );
  assert.deepEqual(
    store.pendingBatchTxRequests.map((request: { id: string }) => request.id),
    ["batch-aged", "batch-new"],
  );
  assert.deepEqual(
    store.pendingDappConnectionRequests.map((request: { id: string }) => request.id),
    ["connect-aged", "connect-new"],
  );
  assert.deepEqual(
    store.pendingAddChainRequests.map((request: { id: string }) => request.id),
    ["add-aged", "add-new"],
  );
  assert.deepEqual(
    store.pendingWatchAssetRequests.map((request: { id: string }) => request.id),
    ["watch-aged", "watch-new"],
  );
  assert.deepEqual(
    store.pendingErc7715PermissionRequests.map((request: { id: string }) => request.id),
    ["permission-aged", "permission-new"],
  );
  assert.equal(store["txResult:tx-aged"], undefined);
  assert.equal(store["sigResult:sig-aged"], undefined);
  assert.equal(store["batchTxAck:batch-aged"], undefined);
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

test("aged metadata prompts remain confirmable but navigation still revokes authority", async () => {
  const origin = "https://app.example";
  store.dappPermissions = {
    [origin]: {
      origin,
      hostname: "app.example",
      approvedAt: 1,
      lastConnectedAt: 1,
    },
  };
  const navigated = {
    id: "watch-aged",
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
    timestamp: Date.now() - 24 * 60 * 60 * 1000,
  };
  tabUrls.set(7, `${origin}/`);
  store.pendingWatchAssetRequests = [navigated];
  const allowed =
    await metadataLifecycle.enforceMetadataPromptAuthorizationAtConfirmation(
      "watchAsset",
      navigated,
    );
  assert.deepEqual(allowed, { authorized: true });
  assert.equal(store.pendingWatchAssetRequests.length, 1);

  tabUrls.set(7, "https://other.example/");
  const denied =
    await metadataLifecycle.enforceMetadataPromptAuthorizationAtConfirmation(
      "watchAsset",
      navigated,
    );
  assert.equal(denied.authorized, false);
  assert.deepEqual(store.pendingWatchAssetRequests, []);
  assert.equal(store["watchAssetResult:watch-aged"].result.code, 4100);
});
