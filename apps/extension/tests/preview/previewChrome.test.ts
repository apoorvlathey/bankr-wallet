import assert from "node:assert/strict";
import test from "node:test";
import {
  createPreviewChrome,
  responseForPreviewMessage,
} from "../../src/preview/previewChrome";
import {
  createPreviewEnvironment,
  createPreviewFetch,
} from "../../src/preview/previewEnvironment";

const immediate = (callback: () => void) => callback();

test("preview environment follows wallet, route, theme, and frame URL state", async () => {
  const { previewChrome, environment } = createPreviewChrome(
    "http://localhost:4317/preview/tx?theme=bauhaus&frame=window&wallet=seedPhrase&scenario=default",
    { schedule: immediate },
  );
  const api = previewChrome as any;

  assert.equal(environment.activeAccount.type, "seedPhrase");
  assert.equal(environment.pendingTxRequests.length, 1);
  assert.equal(environment.pendingTxRequests[0].accountType, "seedPhrase");
  assert.equal(environment.storage.local.selectedThemeId, "bauhaus");
  assert.ok(environment.storage.local.encryptedApiKeyVault);
  assert.equal((await api.windows.getCurrent()).type, "popup");
  assert.equal(await api.runtime.sendMessage({ type: "isWalletUnlocked" }), true);
  assert.equal(
    (await api.runtime.sendMessage({ type: "getActiveAccount" })).type,
    "seedPhrase",
  );
});

test("unlock and sidepanel routes expose production-compatible state", async () => {
  const { previewChrome, environment } = createPreviewChrome(
    "http://localhost:4317/preview/unlock?frame=sidepanel&wallet=privateKey",
    { schedule: immediate },
  );
  const api = previewChrome as any;

  assert.equal(await api.runtime.sendMessage({ type: "isWalletUnlocked" }), false);
  assert.deepEqual(
    await api.runtime.sendMessage({ type: "getSidePanelMode" }),
    { enabled: true },
  );
  assert.equal((await api.windows.getCurrent()).type, "normal");
  assert.ok(environment.accounts.every((account) => account.createdAt < Date.now()));
});

test("onboarding starts from an empty deterministic vault", () => {
  const environment = createPreviewEnvironment(
    "http://localhost:4317/preview/onboarding?frame=compact&wallet=bankr",
  );
  assert.equal(environment.unlocked, false);
  assert.equal(environment.storage.local.encryptedApiKey, undefined);
  assert.equal(environment.storage.local.encryptedApiKeyVault, undefined);
});

test("App, Settings, and portfolio reads have explicit response shapes", async () => {
  const environment = createPreviewEnvironment(
    "http://localhost:4317/preview/home?wallet=bankr",
  );
  const readTypes = [
    "getPendingTxRequests",
    "getPendingSignatureRequests",
    "getPendingBatchTxRequests",
    "getPendingErc7715PermissionRequests",
    "getPendingWatchAssetRequests",
    "getPendingAddChainRequests",
    "getTxHistory",
  ];
  for (const type of readTypes) {
    assert.ok(Array.isArray(responseForPreviewMessage(environment, { type })));
  }

  assert.deepEqual(
    responseForPreviewMessage(environment, { type: "walletConnectGetSessions" }),
    { success: true, sessions: [], activeChainId: 8453 },
  );
  assert.deepEqual(
    responseForPreviewMessage(environment, { type: "getAutoLockTimeout" }),
    { timeout: 900_000 },
  );
  assert.deepEqual(
    responseForPreviewMessage(environment, { type: "getCachedPassword" }),
    { hasCachedPassword: true },
  );
  assert.deepEqual(
    responseForPreviewMessage(environment, { type: "checkPremiumStatus" }),
    { isPremium: false, balance: "0", sponsoredTransfersEnabled: false },
  );
  assert.deepEqual(
    responseForPreviewMessage(environment, {
      type: "fetchNativePrice",
      chainId: 8453,
    }),
    { success: true, priceUsd: 1749.69 },
  );
  assert.deepEqual(
    responseForPreviewMessage(environment, {
      type: "fetchTokenPrice",
      chainId: 8453,
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    }),
    { success: true, priceUsd: 1 },
  );
  assert.deepEqual(
    responseForPreviewMessage(environment, {
      type: "probeDelegateContract",
      chainId: 8453,
      address: "0x1111111111111111111111111111111111111111",
    }),
    { success: true, supports7821: true },
  );
  assert.deepEqual(
    responseForPreviewMessage(environment, {
      type: "getTransactionNonce",
      txId: environment.pendingTxRequests[0]?.id,
    }),
    { success: true, nonce: 42 },
  );
  assert.deepEqual(
    responseForPreviewMessage(environment, {
      type: "getErc7715PermissionGrantsForAccount",
      accountId: environment.activeAccount.id,
    }),
    { success: true, grants: [] },
  );
  assert.ok(Array.isArray((environment.storage.local.bungeeChains as any).chains));
  assert.ok(
    Array.isArray((environment.storage.local["bungeeTokens:8453"] as any).tokens),
  );

  const batchGas = responseForPreviewMessage(environment, {
    type: "estimateBatchGasSequential",
    calls: [{ to: "0x1" }, { to: "0x2" }],
  }) as Array<{ gasLimit: string; estimatedCostWei: string }>;
  assert.equal(batchGas.length, 2);
  assert.equal(batchGas[0].gasLimit, "138000");
  assert.equal(batchGas[1].gasLimit, "162000");
  assert.ok(BigInt(batchGas[1].estimatedCostWei) > BigInt(batchGas[0].estimatedCostWei));
});

test("tab getInfo and promise sendMessage use the active account shape", async () => {
  const { previewChrome, environment } = createPreviewChrome(
    "http://localhost:4317/preview/home?wallet=privateKey",
    { schedule: immediate },
  );
  const api = previewChrome as any;
  const info = await api.tabs.sendMessage(1, { type: "getInfo" });

  assert.equal(info.address, environment.activeAccount.address);
  assert.equal(info.displayAddress, environment.activeAccount.displayName);
  assert.equal(info.chainName, "Base");
  assert.deepEqual(await api.tabs.sendMessage(1, { type: "setChainId" }), {
    success: true,
  });
});

test("unknown reads fail loudly instead of silently succeeding", () => {
  const errors: string[] = [];
  const environment = createPreviewEnvironment("http://localhost/preview/home");
  const response = responseForPreviewMessage(
    environment,
    { type: "getUnexpectedPreviewData" },
    {
      error: (message) => errors.push(message),
      warn: () => assert.fail("unknown read should be an error"),
    },
  ) as { success: boolean; error: string };

  assert.equal(response.success, false);
  assert.match(response.error, /Unhandled runtime message/);
  assert.equal(errors.length, 1);
});

test("preview fetch returns local portfolio data and blocks live IO", async () => {
  const blocked: string[] = [];
  const previewFetch = createPreviewFetch((message) => blocked.push(message));
  const portfolio = await previewFetch(
    "http://localhost:3030/api/portfolio?address=0x1234",
  );
  const body = await portfolio.json();
  assert.equal(body.tokens.length, 2);

  const rpc = await previewFetch("https://mainnet.base.org", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "eth_getBalance" }),
  });
  const rpcBody = await rpc.json();
  assert.equal(BigInt(rpcBody.result), 2_812_260_000_000_000_000n);

  await assert.rejects(
    previewFetch("https://api.example.com/live"),
    /Blocked live fetch/,
  );
  assert.equal(blocked.length, 1);
});

test("scenario fixtures expose signing restrictions and visible failures", () => {
  const viewOnlyTx = createPreviewEnvironment(
    "http://localhost/preview/tx?scenario=impersonator-disabled&wallet=bankr",
  );
  assert.equal(
    viewOnlyTx.pendingTxRequests[0].tx.from,
    "0x3333333333333333333333333333333333333333",
  );

  const malformedBatch = createPreviewEnvironment(
    "http://localhost/preview/batch?scenario=malformed-disabled&wallet=privateKey",
  );
  assert.equal(
    malformedBatch.pendingBatchRequests[0].params.calls.at(-1)?.data,
    "0x123",
  );

  const simulationError = createPreviewEnvironment(
    "http://localhost/preview/tx?scenario=simulation-error&wallet=privateKey",
  );
  const simulation = responseForPreviewMessage(simulationError, {
    type: "simulateAssetChanges",
  }) as { simulationFailed: boolean; simulationError?: string };
  assert.equal(simulation.simulationFailed, true);
  assert.match(simulation.simulationError ?? "", /preview simulation unavailable/i);

  const metadataError = createPreviewEnvironment(
    "http://localhost/preview/permission?scenario=metadata-unverified&wallet=privateKey",
  );
  assert.deepEqual(
    responseForPreviewMessage(metadataError, { type: "resolveTokenMetadata" }),
    { success: false, data: null },
  );
});

test("loading and submitting scenarios remain pending without live services", async () => {
  const { previewChrome: pickerChrome } = createPreviewChrome(
    "http://localhost/preview/swap-picker?scenario=loading&wallet=bankr",
  );
  const pickerResult = await Promise.race([
    (pickerChrome as any).storage.local.get("bungeeChains").then(() => "resolved"),
    Promise.resolve("pending"),
  ]);
  assert.equal(pickerResult, "pending");

  const { previewChrome: signatureChrome } = createPreviewChrome(
    "http://localhost/preview/signature?scenario=submitting&wallet=privateKey",
  );
  const submitResult = await Promise.race([
    (signatureChrome as any).runtime
      .sendMessage({ type: "confirmSignatureRequest" })
      .then(() => "resolved"),
    Promise.resolve("pending"),
  ]);
  assert.equal(submitResult, "pending");
});

test("portfolio lifecycle responses are deterministic per route scenario", async () => {
  const emptyEnvironment = createPreviewEnvironment(
    "http://localhost/preview/portfolio?scenario=empty&wallet=bankr",
  );
  const emptyFetch = createPreviewFetch(undefined, emptyEnvironment);
  const empty = await emptyFetch("http://localhost/api/portfolio");
  assert.deepEqual(await empty.json(), {
    tokens: [],
    defiPositions: [],
    totalValueUsd: 0,
  });

  const errorEnvironment = createPreviewEnvironment(
    "http://localhost/preview/home?scenario=portfolio-error&wallet=bankr",
  );
  const errorFetch = createPreviewFetch(undefined, errorEnvironment);
  const error = await errorFetch("http://localhost/api/portfolio");
  assert.equal(error.status, 503);

  const loadingEnvironment = createPreviewEnvironment(
    "http://localhost/preview/swap?scenario=portfolio-loading&wallet=bankr",
  );
  const loadingFetch = createPreviewFetch(undefined, loadingEnvironment);
  const loadingResult = await Promise.race([
    loadingFetch("http://localhost/api/portfolio").then(() => "resolved"),
    Promise.resolve("pending"),
  ]);
  assert.equal(loadingResult, "pending");
});
