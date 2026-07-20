import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_PRIVACY_MESSAGE_TYPES,
  createBackgroundPrivacyMessageRouter,
} from "../../src/chrome/background/privacyRouter";
import { PrivacyShieldQuoteError } from "../../src/chrome/privacy/deposit/quotePolicy";
import { PrivacyShieldReviewError } from "../../src/chrome/privacy/deposit/prepare";
import { PrivacyShieldOperationError } from "../../src/chrome/privacy/operations/prepare";

function responseCapture() {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { response, sendResponse: resolve };
}

test("privacy router declares only the reviewed Shield routes", () => {
  assert.deepEqual(BACKGROUND_PRIVACY_MESSAGE_TYPES, [
    "privacyEnsureInitialized",
    "privacyRunShieldReadinessCheck",
    "privacyRunProverSelfTest",
    "privacyQuoteShield",
    "privacyPrepareShieldReview",
    "privacyPrepareShield",
    "privacyListShieldOperations",
    "privacySyncShield",
    "privacyPrepareUnshieldQuote",
    "privacyExecuteUnshield",
    "privacyPrepareRagequit",
  ]);
});

test("privacy operation routes expose only durable public summaries", async () => {
  const operationCapture = responseCapture();
  const listCapture = responseCapture();
  let observed: unknown;
  let portfolioSeriesBalance: string | null = null;
  const operation = {
    schema: "walletchan-privacy-shield-operation-v1" as const,
    id: "00000000-0000-4000-8000-000000000001",
    requestId: "00000000-0000-4000-8000-000000000002",
    revision: 0 as const,
    state: "awaiting_wallet_confirmation" as const,
    createdAt: 1,
    updatedAt: 1,
    chainId: 11_155_111 as const,
    accountId: "pk-1",
    accountAddress: "0x1111111111111111111111111111111111111111" as const,
    accountType: "privateKey" as const,
    amountWei: "100000000000000000",
    protocolFeeWei: "1000000000000000",
    shieldedAmountWei: "99000000000000000",
    gasReserveWei: "200000000000000",
    totalRequiredWei: "100200000000000000",
    destinationAddress: "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB" as const,
    poolAddress: "0x644d5A2554d36e27509254F32ccfeBe8cd58861f" as const,
    dedupeKey: "11155111:pk-1:100000000000000000",
    txHash: null,
    blockNumber: null,
    commitment: null,
    label: null,
    poolValueWei: null,
    errorCode: null,
  };
  const route = createBackgroundPrivacyMessageRouter({
    preparePrivacyShieldOperation: (async (request: unknown) => {
      observed = request;
      return operation;
    }) as any,
    queuePrivacyShieldConfirmation: (async (operationId: string) => {
      assert.equal(operationId, operation.id);
      return operation;
    }) as any,
    listPrivacyShieldOperationSummaries: async () => [operation],
    readPrivacyCommitmentPortfolio: async () => ({
      status: "ready",
      confirmedBalanceWei: "200",
      readyBalanceWei: "100",
      maxPrivateSendWei: "0",
      pendingBalanceWei: "100",
      recoverableBalanceWei: "0",
      attentionCount: 0,
      lastUpdatedAt: null,
    }),
    readPrivacyPortfolioSeries: async (balanceWei: string) => {
      portfolioSeriesBalance = balanceWei;
      return {
        priceUsd: 3400,
        totalValueUsd: 0,
        snapshots: [],
      };
    },
    listPrivacyUnshields: async () => [],
    listPrivacyRagequits: async () => [{
      summary: {
        schema: "walletchan-privacy-ragequit-v1",
        version: 1,
        id: "00000000-0000-4000-8000-000000000031",
        requestId: "00000000-0000-4000-8000-000000000032",
        createdAt: 1,
        chainId: 11_155_111,
        accountId: "pk-1",
        accountAddress: "0x1111111111111111111111111111111111111111",
        accountType: "privateKey",
        amountWei: "1000",
        poolAddress: "0x644d5A2554d36e27509254F32ccfeBe8cd58861f",
      },
      keyId: "privacy-key",
      encryptedDetails: {
        version: 1,
        scheme: "privacy-ragequit-key",
        ciphertext: "AAAAAAAAAAAAAAAAAAAAAAA=",
        iv: "AAAAAAAAAAAAAAAA",
      },
      tracking: {
        version: 1,
        revision: 1,
        state: "wallet_rejected",
        updatedAt: 2,
        txHash: null,
        blockNumber: null,
        errorCode: "wallet-rejected",
      },
    }] as any,
  });
  const message = {
    type: "privacyPrepareShield",
    requestId: operation.requestId,
    accountId: operation.accountId,
    accountAddress: operation.accountAddress,
    accountType: operation.accountType,
    amount: "0.1",
  };
  route(message, operationCapture.sendResponse);
  const prepared = await operationCapture.response as any;
  assert.equal(prepared.success, true);
  assert.equal(prepared.status, "awaiting_wallet_confirmation");
  assert.equal(prepared.operation.id, operation.id);
  assert.equal("requestId" in prepared.operation, false);
  assert.equal("dedupeKey" in prepared.operation, false);
  assert.equal("commitment" in prepared.operation, false);
  assert.equal("label" in prepared.operation, false);
  assert.equal(JSON.stringify(prepared).includes("encrypted"), false);
  assert.deepEqual(observed, {
    requestId: message.requestId,
    accountId: message.accountId,
    accountAddress: message.accountAddress,
    accountType: message.accountType,
    amount: message.amount,
  });

  route({ type: "privacyListShieldOperations" }, listCapture.sendResponse);
  const listed = await listCapture.response as any;
  assert.equal(listed.success, true);
  assert.equal(listed.operations.length, 1);
  assert.equal(portfolioSeriesBalance, "100");
  assert.equal(listed.withdrawals.length, 0);
  assert.equal(listed.recoveries.length, 0);
  assert.equal("requestId" in listed.operations[0], false);
  assert.equal("commitment" in listed.operations[0], false);
  assert.equal(listed.portfolio.readyBalanceWei, "100");
  assert.equal(listed.series.priceUsd, 3400);
});

test("Unshield routes expose the reviewed quote but no commitment linkage", async () => {
  const quoteCapture = responseCapture();
  const invalidCapture = responseCapture();
  const executeCapture = responseCapture();
  let observedQuoteInput: unknown;
  const summary = {
    schema: "walletchan-privacy-unshield-v1" as const,
    version: 1 as const,
    id: "00000000-0000-4000-8000-000000000011",
    requestId: "00000000-0000-4000-8000-000000000012",
    createdAt: 1,
    chainId: 11_155_111 as const,
    amountWei: "100000000000000000",
    netRecipientAmountWei: "99900000000000000",
    relayFeeWei: "100000000000000",
    feeBPS: "10",
    recipient: "0x2222222222222222222222222222222222222222" as const,
    relayerName: "Testnet Relay",
    expiresAt: 60_001,
    recipientMatchesDepositor: false,
  };
  const record = {
    summary,
    keyId: "secret-key-id",
    encryptedDetails: { version: 1, scheme: "privacy-unshield-key", ciphertext: "secret", iv: "secret" },
    tracking: {
      version: 1,
      revision: 0,
      state: "quote_ready",
      updatedAt: 1,
      relayerRequestId: null,
      txHash: null,
      blockNumber: null,
      errorCode: null,
    },
  };
  const route = createBackgroundPrivacyMessageRouter({
    preparePrivacyUnshieldQuote: (async (input: unknown) => {
      observedQuoteInput = input;
      return record;
    }) as any,
    executePrivacyUnshield: (async () => ({
      ...record,
      tracking: { ...record.tracking, state: "submitted", revision: 1, txHash: `0x${"44".repeat(32)}` },
    })) as any,
  });
  route({
    type: "privacyPrepareUnshieldQuote",
    requestId: summary.requestId,
    amountWei: summary.amountWei,
    recipient: summary.recipient,
    accountId: "must-not-bind-private-balance",
  }, invalidCapture.sendResponse);
  assert.deepEqual(await invalidCapture.response, {
    success: false,
    code: "invalid-request",
    error: "Invalid request",
  });
  route({
    type: "privacyPrepareUnshieldQuote",
    requestId: summary.requestId,
    amountWei: summary.amountWei,
    recipient: summary.recipient,
  }, quoteCapture.sendResponse);
  const quoted = await quoteCapture.response as any;
  assert.deepEqual(observedQuoteInput, {
    requestId: summary.requestId,
    amountWei: summary.amountWei,
    recipient: summary.recipient,
  });
  assert.equal(quoted.success, true);
  assert.equal(quoted.operation.relayerName, "Testnet Relay");
  assert.equal("commitment" in quoted.operation, false);
  assert.equal("expectedSpentNullifier" in quoted.operation, false);
  assert.equal(JSON.stringify(quoted).includes("secret-key-id"), false);

  route({ type: "privacyExecuteUnshield", operationId: summary.id }, executeCapture.sendResponse);
  const submitted = await executeCapture.response as any;
  assert.equal(submitted.success, true);
  assert.equal(submitted.operation.state, "submitted");
  assert.equal("encryptedDetails" in submitted.operation, false);
});

test("public recovery route queues only a bounded public operation", async () => {
  const capture = responseCapture();
  let materialized = false;
  const record = {
    summary: {
      schema: "walletchan-privacy-ragequit-v1",
      version: 1,
      id: "00000000-0000-4000-8000-000000000021",
      requestId: "00000000-0000-4000-8000-000000000022",
      createdAt: 1,
      chainId: 11_155_111,
      accountId: "pk-1",
      accountAddress: "0x1111111111111111111111111111111111111111",
      accountType: "privateKey",
      amountWei: "1000",
      poolAddress: "0x644d5A2554d36e27509254F32ccfeBe8cd58861f",
    },
    keyId: "must-not-leave-background",
    encryptedDetails: { ciphertext: "secret", iv: "secret" },
    tracking: {
      version: 1,
      revision: 0,
      state: "awaiting_wallet_confirmation",
      updatedAt: 1,
      txHash: null,
      blockNumber: null,
      errorCode: null,
    },
  };
  const publicOperation = {
    id: record.summary.id,
    state: record.tracking.state,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    chainId: 11_155_111,
    amountWei: "1000",
    accountAddress: record.summary.accountAddress,
    txHash: null,
    blockNumber: null,
    errorCode: null,
  };
  const route = createBackgroundPrivacyMessageRouter({
    materializeIndexedPrivacyShieldCommitments: async () => {
      materialized = true;
      return { status: "current", materialized: 1 };
    },
    preparePrivacyRagequit: (async () => record) as any,
    queuePrivacyRagequitConfirmation: async () => publicOperation as any,
  });
  route({
    type: "privacyPrepareRagequit",
    requestId: record.summary.requestId,
    accountId: record.summary.accountId,
    accountAddress: record.summary.accountAddress,
    accountType: record.summary.accountType,
  }, capture.sendResponse);
  const response = await capture.response as any;
  assert.equal(response.success, true);
  assert.equal(materialized, true);
  assert.deepEqual(response.operation, publicOperation);
  assert.equal(JSON.stringify(response).includes("must-not-leave-background"), false);
  assert.equal(JSON.stringify(response).includes("encryptedDetails"), false);
});

test("privacy operation route rejects malformed and agent-gated requests", async () => {
  const invalidCapture = responseCapture();
  const failedCapture = responseCapture();
  let calls = 0;
  const route = createBackgroundPrivacyMessageRouter({
    warnPrivacyOperationFailure: () => {},
    preparePrivacyShieldOperation: (async () => {
      calls += 1;
      throw new PrivacyShieldOperationError("auth-required");
    }) as any,
  });
  const request = {
    type: "privacyPrepareShield",
    requestId: "00000000-0000-4000-8000-000000000002",
    accountId: "pk-1",
    accountAddress: "0x1111111111111111111111111111111111111111",
    accountType: "privateKey",
    amount: "0.1",
  };
  route({ ...request, extra: true }, invalidCapture.sendResponse);
  assert.deepEqual(await invalidCapture.response, {
    success: false,
    code: "invalid-request",
    error: "Invalid request",
  });
  route(request, failedCapture.sendResponse);
  assert.deepEqual(await failedCapture.response, {
    success: false,
    code: "auth-required",
    error: "Unlock with your main password or biometrics and try again.",
  });
  assert.equal(calls, 1);
});

test("privacy router projects a prepared intent without calldata or secrets", async () => {
  const capture = responseCapture();
  let observed: unknown;
  const route = createBackgroundPrivacyMessageRouter({
    preparePrivacyShieldReview: (async (request: unknown) => {
      observed = request;
      return {
        accountId: "pk-1",
        accountType: "privateKey",
        quote: {},
        intent: {
          chainId: 11_155_111,
          sourceAddress: "0x1111111111111111111111111111111111111111",
          destinationAddress: "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
          valueWei: 100_000_000_000_000_000n,
          callData: "must-not-leave-background",
        },
      };
    }) as any,
  });
  const message = {
    type: "privacyPrepareShieldReview",
    accountId: "pk-1",
    accountAddress: "0x1111111111111111111111111111111111111111",
    accountType: "privateKey",
    amount: "0.1",
  };

  assert.deepEqual(route(message, capture.sendResponse), {
    handled: true,
    keepChannelOpen: true,
  });
  const response = await capture.response;
  assert.deepEqual(response, {
    success: true,
    status: "ready",
    review: {
      chainId: 11_155_111,
      accountId: "pk-1",
      accountAddress: message.accountAddress,
      accountType: "privateKey",
      amountWei: "100000000000000000",
      destinationAddress: "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
    },
  });
  assert.equal(JSON.stringify(response).includes("callData"), false);
  assert.deepEqual(observed, {
    accountId: message.accountId,
    accountAddress: message.accountAddress,
    accountType: message.accountType,
    amount: message.amount,
  });
});

test("privacy review route rejects extra fields and bounds authorization failures", async () => {
  let calls = 0;
  const invalidCapture = responseCapture();
  const failedCapture = responseCapture();
  const route = createBackgroundPrivacyMessageRouter({
    warnPrivacyReviewFailure: () => {},
    preparePrivacyShieldReview: (async () => {
      calls += 1;
      throw new PrivacyShieldReviewError("auth-required");
    }) as any,
  });
  const request = {
    type: "privacyPrepareShieldReview",
    accountId: "pk-1",
    accountAddress: "0x1111111111111111111111111111111111111111",
    accountType: "privateKey",
    amount: "0.1",
  };

  assert.deepEqual(
    route({ ...request, extra: true }, invalidCapture.sendResponse),
    { handled: true, keepChannelOpen: false },
  );
  assert.deepEqual(await invalidCapture.response, {
    success: false,
    code: "invalid-request",
    error: "Invalid request",
  });
  route(request, failedCapture.sendResponse);
  assert.deepEqual(await failedCapture.response, {
    success: false,
    code: "auth-required",
    error: "Unlock with your main password or biometrics and try again.",
  });
  assert.equal(calls, 1);
});

test("privacy router returns a public quote for an exact account snapshot", async () => {
  const capture = responseCapture();
  let observed: unknown;
  const quote = {
    chainId: 11_155_111,
    amountWei: "1000000000000000",
    balanceWei: "500000000000000000",
    minimumAmountWei: "1000000000000000",
    protocolFeeWei: "10000000000000",
    shieldedAmountWei: "990000000000000",
    gasReserveWei: "200000000000000",
    totalRequiredWei: "1200000000000000",
    maxShieldableWei: "499800000000000000",
    vettingFeeBPS: "100",
    canAfford: true,
  };
  const route = createBackgroundPrivacyMessageRouter({
    quotePrivacyShield: async (request) => {
      observed = request;
      return quote;
    },
  });
  const message = {
    type: "privacyQuoteShield",
    accountId: "pk-1",
    accountAddress: "0x1111111111111111111111111111111111111111",
    accountType: "privateKey",
    amount: "0.001",
  };

  assert.deepEqual(route(message, capture.sendResponse), {
    handled: true,
    keepChannelOpen: true,
  });
  assert.deepEqual(await capture.response, { success: true, quote });
  assert.deepEqual(observed, {
    accountId: message.accountId,
    accountAddress: message.accountAddress,
    accountType: message.accountType,
    amount: message.amount,
  });
});

test("privacy quote route rejects extra fields and bounds domain failures", async () => {
  let calls = 0;
  const invalidCapture = responseCapture();
  const failedCapture = responseCapture();
  const route = createBackgroundPrivacyMessageRouter({
    warnPrivacyQuoteFailure: () => {},
    quotePrivacyShield: async () => {
      calls += 1;
      throw new PrivacyShieldQuoteError("view-only-account");
    },
  });
  const request = {
    type: "privacyQuoteShield",
    accountId: "watch-1",
    accountAddress: "0x1111111111111111111111111111111111111111",
    accountType: "impersonator",
    amount: "0.001",
  };

  assert.deepEqual(
    route({ ...request, extra: true }, invalidCapture.sendResponse),
    { handled: true, keepChannelOpen: false },
  );
  assert.deepEqual(await invalidCapture.response, {
    success: false,
    code: "invalid-request",
    error: "Invalid request",
  });
  route(request, failedCapture.sendResponse);
  assert.deepEqual(await failedCapture.response, {
    success: false,
    code: "view-only-account",
    error: "View-only accounts can’t Shield.",
  });
  assert.equal(calls, 1);
});

test("privacy router delegates initialization without exposing secrets", async () => {
  const capture = responseCapture();
  let calls = 0;
  const route = createBackgroundPrivacyMessageRouter({
    ensurePrivacyIdentityInitialized: async () => {
      calls += 1;
      return { success: true, status: "ready" };
    },
  });

  assert.deepEqual(route({ type: "unrelated" }, () => {}), {
    handled: false,
  });
  assert.deepEqual(
    route({ type: "privacyEnsureInitialized" }, capture.sendResponse),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, { success: true, status: "ready" });
  assert.equal(calls, 1);
});

test("privacy router returns a bounded repair state on failure", async () => {
  const capture = responseCapture();
  const route = createBackgroundPrivacyMessageRouter({
    ensurePrivacyIdentityInitialized: async () => {
      throw new Error("secret internal detail");
    },
  });

  route({ type: "privacyEnsureInitialized" }, capture.sendResponse);
  assert.deepEqual(await capture.response, {
    success: false,
    status: "action-required",
    error: "Shield recovery needs attention before you continue.",
  });
});

test("privacy router returns only readiness after deployment and proof checks", async () => {
  const capture = responseCapture();
  let calls = 0;
  const route = createBackgroundPrivacyMessageRouter({
    warnPrivacyReadinessFailure: () => {},
    runPrivacyShieldReadinessCheck: async () => {
      calls += 1;
    },
  });

  assert.deepEqual(
    route({ type: "privacyRunShieldReadinessCheck" }, capture.sendResponse),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, {
    success: true,
    status: "ready",
  });
  assert.equal(calls, 1);
});

test("packaged prover QA route exposes timings but no proof or fixture inputs", async () => {
  const capture = responseCapture();
  const route = createBackgroundPrivacyMessageRouter({
    runPrivacyProverFixedSelfTest: async () => ({
      version: 1,
      id: "00000000-0000-4000-8000-000000000101",
      kind: "result",
      ok: true,
      commitmentMs: 100,
      withdrawalMs: 200,
      totalMs: 300,
    }),
  });
  route({ type: "privacyRunProverSelfTest" }, capture.sendResponse);
  assert.deepEqual(await capture.response, {
    success: true,
    status: "ready",
    commitmentMs: 100,
    withdrawalMs: 200,
    totalMs: 300,
  });
});

test("privacy router fails closed on extra fields and readiness errors", async () => {
  let calls = 0;
  const invalidCapture = responseCapture();
  const failedCapture = responseCapture();
  const route = createBackgroundPrivacyMessageRouter({
    warnPrivacyReadinessFailure: () => {},
    runPrivacyShieldReadinessCheck: async () => {
      calls += 1;
      throw new Error("internal deployment detail");
    },
  });

  assert.deepEqual(
    route(
      { type: "privacyRunShieldReadinessCheck", input: "not-accepted" },
      invalidCapture.sendResponse,
    ),
    { handled: true, keepChannelOpen: false },
  );
  assert.deepEqual(await invalidCapture.response, {
    success: false,
    error: "Invalid request",
  });
  route({ type: "privacyRunShieldReadinessCheck" }, failedCapture.sendResponse);
  assert.deepEqual(await failedCapture.response, {
    success: false,
    status: "failed",
    error: "Shield check failed. Try again.",
  });
  assert.equal(calls, 1);
});
