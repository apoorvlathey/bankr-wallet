import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";
import {
  encodeBatchCalls,
  normalizeBatchCallValues,
  omitOuterValueForEip7702,
} from "../../src/chrome/batch/batchTxEncoding";

const WALLET = "0x00000000000000000000000000000000000000aa";
const TARGET_A = "0x0000000000000000000000000000000000000001";
const TARGET_B = "0x0000000000000000000000000000000000000002";

const FROZEN_TWO_CALL_ENCODING =
  "0xe9ae5c530100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000212340000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000";

test("ERC-7821 encoding stays byte-for-byte stable and sums outer value", () => {
  assert.deepEqual(
    encodeBatchCalls(
      [
        { to: TARGET_A, value: "0x1", data: "0x1234" },
        { to: TARGET_B, value: "0x2", data: "0x" },
      ],
      WALLET,
    ),
    {
      to: WALLET,
      data: FROZEN_TWO_CALL_ENCODING,
      value: "0x3",
    },
  );
});

test("the encoding boundary rejects contract creation and payload-bearing self-calls", () => {
  assert.throws(
    () =>
      encodeBatchCalls(
        [{ value: "0x0", data: "0x" }],
        WALLET,
      ),
    /Call 1 has no recipient address — contract deployments cannot be encoded in a batch/,
  );
  for (const call of [
    { to: WALLET.toUpperCase(), value: "0x0", data: "0x1234" },
    { to: WALLET, value: "0x1", data: "0x" },
  ]) {
    assert.throws(
      () => encodeBatchCalls([call], WALLET),
      /Call 1 targets your own account with payload — rejected to prevent ERC-7821 self-recursion/,
    );
  }
});

test("the encoding policy preserves allowed no-op self and zero-address calls", () => {
  assert.doesNotThrow(() =>
    encodeBatchCalls([{ to: WALLET, value: "0x0", data: "0x" }], WALLET),
  );
  assert.doesNotThrow(() =>
    encodeBatchCalls(
      [
        {
          to: "0x0000000000000000000000000000000000000000",
          value: "0x0",
          data: "0x1234",
        },
      ],
      WALLET,
    ),
  );
});

test("call-value normalization preserves errors and canonical zeroes", () => {
  assert.deepEqual(
    normalizeBatchCallValues([
      { to: TARGET_A, value: "0x00", data: "0x" },
      { to: TARGET_B, data: "0x" },
    ]),
    {
      ok: true,
      calls: [
        { to: TARGET_A, value: "0x0", data: "0x" },
        { to: TARGET_B, value: "0x0", data: "0x" },
      ],
    },
  );
  const invalid = normalizeBatchCallValues([
    { to: TARGET_A, value: "not-a-quantity", data: "0x" },
  ]);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.match(invalid.error, /^Call 1 value is invalid:/);
});

test("EIP-7702 outer-value omission is immutable", () => {
  const encoded = { to: WALLET, data: "0x1234", value: "0x9" };
  const omitted = omitOuterValueForEip7702(encoded);
  assert.deepEqual(omitted, { ...encoded, value: "0x0" });
  assert.equal(encoded.value, "0x9");
  assert.notEqual(omitted, encoded);
});

test("batchTxHandlers preserves encoder export identity behind its facade", async () => {
  const facade = await import("../../src/chrome/batchTxHandlers");
  assert.equal(facade.encodeBatchCalls, encodeBatchCalls);
  assert.equal(facade.omitOuterValueForEip7702, omitOuterValueForEip7702);
});

test("pure encoding policy cannot reach wallet state or side effects", async () => {
  const source = await readFile(
    new URL("../../src/chrome/batch/batchTxEncoding.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /chrome\.|fetch\(|from ["']\.\.\/(?:accountStorage|sessionCache|txHandlers|localSigner|bankr(?:Api|\/[^"']+)|pendingBatchTxStorage|bundleStatusStorage)["']/,
  );
  assert.match(source, /from ["']\.\.\/transactionValidation["']/);
});

test("batch request status exports preserve facade identity", async () => {
  const [facade, statusHandlers] = await Promise.all([
    import("../../src/chrome/batchTxHandlers"),
    import("../../src/chrome/batch/batchRequestStatusHandlers"),
  ]);
  for (const name of [
    "handleRejectBatchTransaction",
    "handleRemoveCallFromPendingBatch",
    "handleUpdateCallInPendingBatch",
    "handleWalletGetCallsStatus",
    "handleWalletShowCallsStatus",
  ] as const) {
    assert.equal(facade[name], statusHandlers[name], name);
  }
});

test("wallet_getCallsStatus remains fail-closed and origin-scoped", async () => {
  const harness = createChromeStorageHarness({
    local: {
      bundleStatuses: [
        {
          id: "owned",
          chainId: 8453,
          status: 200,
          atomic: true,
          createdAt: 1,
          origin: "https://owned.example",
        },
        {
          id: "legacy",
          chainId: 1,
          status: 100,
          atomic: false,
          createdAt: 1,
        },
      ],
    },
  });
  try {
    const { handleWalletGetCallsStatus } = await import(
      "../../src/chrome/batch/batchRequestStatusHandlers"
    );
    const unknown = { error: "Unknown bundle ID", code: 5730 };
    assert.deepEqual(
      await handleWalletGetCallsStatus("missing", "https://owned.example"),
      unknown,
    );
    assert.deepEqual(
      await handleWalletGetCallsStatus("legacy", undefined),
      unknown,
    );
    assert.deepEqual(
      await handleWalletGetCallsStatus("owned", "https://other.example"),
      unknown,
    );
    assert.deepEqual(
      await handleWalletGetCallsStatus("owned", "https://owned.example"),
      {
        version: "2.0.0",
        id: "owned",
        chainId: "0x2105",
        status: 200,
        atomic: true,
        receipts: undefined,
      },
    );
    assert.equal(harness.writes.length, 0);
  } finally {
    harness.restore();
  }
});

test("status and pending-call controls cannot reach credentials or signing", async () => {
  const source = await readFile(
    new URL("../../src/chrome/batch/batchRequestStatusHandlers.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /from ["']\.\.\/(?:txHandlers|sessionCache|authHandlers|vaultCrypto|mnemonicStorage|localSigner|bankr(?:Api|\/[^"']+)|delegationStorage)["']/,
  );
  assert.doesNotMatch(source, /privateKey|apiKey|mnemonic|password/i);
  assert.match(source, /from ["']\.\.\/transactions\/runtime["']/);
});

test("wallet_sendCalls intake preserves its facade identity and focused boundary", async () => {
  const [facade, intake, source] = await Promise.all([
    import("../../src/chrome/batchTxHandlers"),
    import("../../src/chrome/batch/batchRequestIntake"),
    readFile(new URL("../../src/chrome/batch/batchRequestIntake.ts", import.meta.url), "utf8"),
  ]);
  assert.equal(facade.handleWalletSendCalls, intake.handleWalletSendCalls);
  assert.doesNotMatch(
    source,
    /from ["']\.\.\/(?:txHandlers|localSigner|sessionCache|authHandlers|vaultCrypto|mnemonicStorage|bankr(?:Api|\/[^"']+))["']/,
  );
  assert.match(source, /capturePendingRequestAuthorizationCommitSnapshot/);
  assert.match(source, /removePendingBatchTxRequest/);
  assert.match(source, /removeBundleStatus/);
});

test("intake compensates a durable acknowledgement write failure", async () => {
  const harness = createChromeStorageHarness();
  harness.failNext({ area: "local", operation: "set", key: "batchTxAck:fault" });
  try {
    const { handleWalletSendCalls } = await import("../../src/chrome/batch/batchRequestIntake");
    await handleWalletSendCalls(
      { version: "1.0.0", chainId: "0x1", calls: [] },
      "fault",
      "https://dapp.example",
      null,
    );
    const local = harness.snapshot("local") as Record<string, any>;
    assert.deepEqual(local.pendingBatchTxRequests ?? [], []);
    assert.deepEqual(local.bundleStatuses ?? [], []);
    assert.deepEqual(local["batchTxAck:fault"].result, {
      success: false,
      error: "Simulated storage set failure",
      code: -32000,
    });
  } finally {
    harness.restore();
  }
});

test("validating batch rows are non-actionable until the ready commit", async () => {
  const request = {
    id: "validating-batch",
    params: {
      version: "2.0.0",
      chainId: "0x1",
      calls: [{ to: TARGET_A, data: "0x", value: "0x0" }],
    },
    origin: "https://dapp.example",
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    timestamp: Date.now(),
    intakeStatus: "validating",
    accountId: "private-key-account",
    accountAddress: WALLET,
    accountType: "privateKey",
  } as const;
  const harness = createChromeStorageHarness({
    local: { pendingBatchTxRequests: [request] },
  });
  try {
    const storage = await import(
      "../../src/chrome/requests/pendingBatchTxStorage"
    );
    assert.deepEqual(
      await storage.updateCallInPendingBatchTxRequest(
        request.id,
        0,
        "0x1234",
      ),
      { success: false, error: "Batch request is still being validated" },
    );
    assert.deepEqual(
      await storage.removeCallFromPendingBatchTxRequest(request.id, 0),
      {
        found: true,
        remainingCalls: 1,
        error: "Batch request is still being validated",
      },
    );

    const ready = await storage.markPendingBatchTxRequestReady(request.id);
    assert.equal(ready?.intakeStatus, undefined);
    assert.equal(
      (harness.snapshot("local").pendingBatchTxRequests as any[])[0]
        .intakeStatus,
      undefined,
    );
  } finally {
    harness.restore();
  }
});

test("every batch execution or move boundary rejects validating rows", async () => {
  const sources = await Promise.all([
    "batch/batchBankrExecution.ts",
    "batch/batchLocalConfirmation.ts",
    "forceInclusion/splitBatchSequencer.ts",
    "crossDappBatch/intake.ts",
  ].map((name) => readFile(
    new URL(`../../src/chrome/${name}`, import.meta.url),
    "utf8",
  )));
  for (const source of sources) {
    assert.match(source, /intakeStatus === ["']validating["']/);
    assert.match(source, /Batch request is still being validated/);
  }
});

test("Bankr batch execution preserves facade identity and credential boundary", async () => {
  const [facade, bankr, source] = await Promise.all([
    import("../../src/chrome/batchTxHandlers"),
    import("../../src/chrome/batch/batchBankrExecution"),
    readFile(new URL("../../src/chrome/batch/batchBankrExecution.ts", import.meta.url), "utf8"),
  ]);
  assert.equal(facade.handleConfirmBatchTransaction, bankr.handleConfirmBatchTransaction);
  assert.match(source, /authorizePendingBankrSubmit/);
  assert.match(source, /enforcePendingRequestAuthorizationAtConfirmation/);
  assert.match(source, /beginPendingRequestEffectLease/);
  assert.doesNotMatch(source, /privateKey|mnemonic|signAndBroadcastTransaction/);
});

test("local batch confirmation isolates key restoration and path selection", async () => {
  const source = await readFile(new URL("../../src/chrome/batch/batchLocalConfirmation.ts", import.meta.url), "utf8");
  assert.match(source, /getPrivateKeyFromCache/);
  assert.match(source, /tryRestoreSession/);
  assert.match(source, /decryptAllKeys/);
  assert.match(source, /resolveActiveDelegate/);
  assert.match(source, /executors\.processSingle/);
  assert.match(source, /executors\.processAtomic7702/);
  assert.match(source, /executors\.processNonAtomic/);
  assert.doesNotMatch(source, /signAndBroadcastTransaction|submitTransactionDirect/);
});

test("sequential local execution keeps ambiguity and authorization in one boundary", async () => {
  const source = await readFile(new URL("../../src/chrome/batch/batchSequentialExecution.ts", import.meta.url), "utf8");
  assert.match(source, /isBroadcastOutcomeUncertain/);
  assert.match(source, /guardPendingRequestEffectLease/);
  assert.match(source, /signAndBroadcastTransaction/);
  assert.match(source, /trackCompletion/);
  assert.doesNotMatch(source, /getPrivateKeyFromCache|decryptAllKeys|resolveActiveDelegate/);
});

test("atomic EIP-7702 execution keeps authorization and sign-once ordering together", async () => {
  const source = await readFile(
    new URL("../../src/chrome/batch/batchAtomic7702Execution.ts", import.meta.url),
    "utf8",
  );
  const guardAt = source.indexOf("assertAutomaticEip7702AuthorizationAllowed(delegate)");
  const authAt = source.indexOf("const auth = await signEip7702Authorization");
  const revalidateAt = source.lastIndexOf("enforcePendingRequestAuthorizationAtConfirmation");
  const broadcastAt = source.indexOf("const result = await signAndBroadcastTransaction");
  const finalTransportAt = source.indexOf("dependencies.authorizeBeforeBroadcast", broadcastAt);
  assert.ok(guardAt >= 0 && guardAt < authAt);
  assert.ok(revalidateAt >= 0 && revalidateAt < broadcastAt);
  assert.ok(finalTransportAt > broadcastAt);
  assert.match(source, /trackCompletion/);
  assert.doesNotMatch(source, /getPrivateKeyFromCache|decryptAllKeys/);
});

test("batch facade preserves remaining focused implementation identities", async () => {
  const [facade, capabilities, local] = await Promise.all([
    import("../../src/chrome/batchTxHandlers"),
    import("../../src/chrome/batch/batchCapabilities"),
    import("../../src/chrome/batch/batchLocalCoordinator"),
  ]);
  assert.equal(
    facade.handleWalletGetCapabilities,
    capabilities.handleWalletGetCapabilities,
  );
  assert.equal(
    facade.handleConfirmBatchTransactionPK,
    local.handleConfirmBatchTransactionPK,
  );
  assert.equal(
    facade.processBatchTransactionAtomic7702InBackground,
    local.processBatchTransactionAtomic7702InBackground,
  );
});

test("batch facade and focused modules remain one-way and audit-sized", async () => {
  const budgets: Record<string, number> = {
    "batchTxHandlers.ts": 50,
    "batch/batchCapabilities.ts": 170,
    "batch/batchCompletionTracking.ts": 220,
    "batch/batchLocalAuthorization.ts": 60,
    "batch/batchLocalCoordinator.ts": 120,
    "batch/batchSingleExecution.ts": 200,
  };
  for (const [name, maximumLines] of Object.entries(budgets)) {
    const source = await readFile(
      new URL(`../../src/chrome/${name}`, import.meta.url),
      "utf8",
    );
    assert.ok(
      source.split("\n").length <= maximumLines,
      `${name} exceeds its ${maximumLines}-line audit budget`,
    );
    if (name !== "batchTxHandlers.ts") {
      assert.doesNotMatch(
        source,
        /(?:from\s+|import\()["'](?:[^"']*\/)?batchTxHandlers["']/,
      );
    }
  }
  const facade = await readFile(
    new URL("../../src/chrome/batchTxHandlers.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(facade, /(?:async\s+)?function\s+/);
  assert.doesNotMatch(
    facade,
    /getCached|privateKey|submitTransactionDirect|signAndBroadcast|beginPendingRequestEffectLease/,
  );
});

test("capabilities reject an address that is not the connected account before probing chains", async () => {
  const { handleWalletGetCapabilities } = await import(
    "../../src/chrome/batch/batchCapabilities"
  );
  assert.deepEqual(
    await handleWalletGetCapabilities(TARGET_A, undefined, {
      id: "bankr-1",
      type: "bankr",
      address: TARGET_B,
      createdAt: 1,
    }),
    {},
  );
});

test("local batch effects retain final account authorization and completion ownership", async () => {
  const [authorization, single, coordinator] = await Promise.all([
    readFile(
      new URL(
        "../../src/chrome/batch/batchLocalAuthorization.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/batch/batchSingleExecution.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/batch/batchLocalCoordinator.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const accountCheck = authorization.indexOf("getAccountById(");
  const transportCheck = authorization.indexOf(
    "enforcePendingRequestAuthorizationAtConfirmation(",
  );
  const effect = authorization.indexOf("beginEffect();");
  assert.ok(accountCheck >= 0 && transportCheck > accountCheck);
  assert.ok(effect > transportCheck);
  assert.match(single, /authorizePendingLocalBatchBroadcast/);
  assert.match(single, /trackAtomicBundleCompletion/);
  assert.match(coordinator, /trackNonAtomicBundleCompletion/);
  assert.match(coordinator, /trackAtomicBundleCompletion/);
});
