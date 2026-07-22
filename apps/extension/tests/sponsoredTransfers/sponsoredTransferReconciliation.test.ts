import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyBackgroundMessage } from "../../src/chrome/background/messageAccessPolicy";
import { classifySponsoredAuthorizationObservations } from "../../src/chrome/sponsoredTransfers/reconciliation";

test("finalized ERC-3009 observations classify only unanimous terminal outcomes", () => {
  const validBefore = 1_000;

  assert.equal(
    classifySponsoredAuthorizationObservations(
      [
        { used: true, blockTimestamp: 900 },
        { used: true, blockTimestamp: 1_100 },
      ],
      validBefore,
    ),
    "consumed",
  );
  assert.equal(
    classifySponsoredAuthorizationObservations(
      [
        { used: false, blockTimestamp: 1_000 },
        { used: false, blockTimestamp: 1_001 },
      ],
      validBefore,
    ),
    "expired-unused",
  );

  for (const observations of [
    [
      { used: true, blockTimestamp: 1_100 },
      { used: false, blockTimestamp: 1_100 },
    ],
    [
      { used: false, blockTimestamp: 999 },
      { used: false, blockTimestamp: 1_001 },
    ],
    [{ used: true, blockTimestamp: 1_100 }],
  ]) {
    assert.equal(
      classifySponsoredAuthorizationObservations(observations, validBefore),
      "unresolved",
    );
  }
  assert.equal(
    classifySponsoredAuthorizationObservations(
      [
        { used: false, blockTimestamp: 1_100 },
        { used: false, blockTimestamp: 1_100 },
      ],
      0,
    ),
    "unresolved",
  );
});

test("each authorization read is pinned to its fetched finalized block", async () => {
  const source = await readFile(
    new URL(
      "../../src/chrome/sponsoredTransfers/reconciliation.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const start = source.indexOf("async function observeAuthorization");
  const end = source.indexOf("/**\n * Resolve an ambiguous", start);
  const observation = source.slice(start, end);

  const finalizedBlock = observation.indexOf('"eth_getBlockByNumber"');
  const blockNumber = observation.indexOf("const blockNumber = parseBlockNumber(block)");
  const stateRead = observation.indexOf('"eth_call"');
  assert.ok(finalizedBlock >= 0);
  assert.match(observation, /\["finalized", false\]/);
  assert.ok(blockNumber > finalizedBlock);
  assert.ok(stateRead > blockNumber);
  assert.match(
    observation.slice(stateRead),
    /\[\{ to: BASE_USDC_ADDRESS, data \}, blockNumber\]/,
  );
  assert.doesNotMatch(observation, /"latest"/);
});

test("an ambiguous or submitting authorization reconciles but never re-POSTs", async () => {
  const [handlers, recovery, submission] = await Promise.all([
    readFile(
      new URL(
        "../../src/chrome/sponsoredTransfers/handlers.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/sponsoredTransfers/recovery.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/sponsoredTransfers/submission.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const recoveredStart = handlers.indexOf("if (record) {");
  const createStart = handlers.indexOf("if (!record) {", recoveredStart);
  const recovered = handlers.slice(recoveredStart, createStart);

  assert.match(
    recovered,
    /reconcileSponsoredTransferRecord\(record, vaultKey\)/,
  );
  assert.match(
    recovery,
    /reconcileSponsoredTransferRecord[\s\S]*reconcileSponsoredTransferAuthorization\([\s\S]*record\.validBefore/,
  );
  assert.match(recovered, /reconciled\.status === "consumed"/);
  assert.match(recovered, /reconciled\.status === "expired-unused"/);
  assert.match(
    handlers,
    /record\.state !== "prepared"[\s\S]*markExistingTransferAmbiguous[\s\S]*outcomeUncertain: true/,
  );
  assert.doesNotMatch(recovered, /SPONSORED_TRANSFER_API|method: "POST"/);

  const postCalls =
    submission.match(/fetchTextBounded\(\s*SPONSORED_TRANSFER_API/g) ?? [];
  assert.equal(
    postCalls.length,
    1,
    "there must be only one relayer POST site, reachable only for a new/prepared authorization",
  );

  const reconcile = recovery;
  const consumedStart = reconcile.indexOf('if (status === "consumed")');
  const expiredStart = reconcile.indexOf(
    '} else if (status === "expired-unused")',
    consumedStart,
  );
  const consumed = reconcile.slice(consumedStart, expiredStart);
  assert.match(
    consumed,
    /updateSponsoredTransferIntent\(record\.id,[\s\S]*state: "consumed"/,
  );
  assert.doesNotMatch(
    consumed,
    /removeSponsoredTransferIntent/,
    "chain-consumed records must survive until trusted-UI acknowledgement",
  );
});

test("uncertain sponsored UI uses a dedicated status action and never the normal gas fallback", async () => {
  const [source, notices] = await Promise.all([
    readFile(
      new URL(
        "../../src/components/Transfer/hooks/useSponsoredTransfer.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/Transfer/TransferNotices.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const statusStart = source.indexOf(
    "const checkStatus = useCallback(async () =>",
  );
  const statusEnd = source.indexOf("useEffect(() =>", statusStart);
  const statusAction = source.slice(statusStart, statusEnd);
  assert.ok(statusStart >= 0);
  assert.match(statusAction, /type: "checkSponsoredTransferStatus"/);
  assert.doesNotMatch(statusAction, /canSubmit|handleSubmit|handleFallbackSend/);

  const completedStart = statusAction.indexOf("if (result.completed)");
  const completedEnd = statusAction.indexOf("if (result.hasUnresolved", completedStart);
  const completed = statusAction.slice(completedStart, completedEnd);
  const ackIndex = completed.indexOf(
    "acknowledgeTransfer(result.intentId)",
  );
  const clearIndex = completed.indexOf("intentRef.current = null");
  const navigateIndex = completed.indexOf("onTransferInitiated(true)");
  assert.ok(ackIndex >= 0);
  assert.ok(clearIndex > ackIndex);
  assert.ok(navigateIndex > ackIndex);
  assert.doesNotMatch(completed, /await acknowledgeTransfer/);

  const start = notices.indexOf("{failure && (");
  const end = notices.indexOf('{accountType === "impersonator"', start);
  const failureUi = notices.slice(start, end);

  assert.match(
    failureUi,
    /failure\.outcomeUncertain\s*\? checkStatus\s*:\s*onFallbackSend/,
  );
  assert.match(
    failureUi,
    /failure\.outcomeUncertain\s*\? "Check status"\s*:\s*"Send and pay gas"/,
  );
  assert.doesNotMatch(
    failureUi,
    /failure\.outcomeUncertain\s*\? onFallbackSend/,
  );
});

test("all successful sponsored submissions return the stored intent id and dispatch ACK before navigation", async () => {
  const [handlerSource, submissionSource, uiSource] = await Promise.all([
    readFile(
      new URL(
        "../../src/chrome/sponsoredTransfers/handlers.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/sponsoredTransfers/submission.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/Transfer/hooks/useSponsoredTransfer.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const handlerStart = handlerSource.indexOf(
    "export async function handleSponsoredTransfer(",
  );
  const handler = `${handlerSource.slice(handlerStart)}\n${submissionSource}`;
  const successReturns = [...handler.matchAll(/return\s*\{([\s\S]*?)\};/g)]
    .map((match) => match[1] ?? "")
    .filter((body) => /success:\s*true/.test(body));
  assert.ok(successReturns.length >= 4);
  for (const body of successReturns) {
    assert.match(
      body,
      /intentId:/,
      `successful sponsored path omitted its stored intent id: ${body}`,
    );
  }

  const submitStart = uiSource.indexOf("if (result.success) {");
  const submitEnd = uiSource.indexOf("} else if (result.retryReady)", submitStart);
  const submitSuccess = uiSource.slice(submitStart, submitEnd);
  const ackIndex = submitSuccess.indexOf(
    "acknowledgeTransfer(result.intentId)",
  );
  assert.ok(ackIndex >= 0);
  assert.ok(
    submitSuccess.indexOf("intentRef.current = null") > ackIndex,
  );
  assert.ok(submitSuccess.indexOf("onTransferInitiated(true)") > ackIndex);
  assert.doesNotMatch(submitSuccess, /await acknowledgeTransfer/);

  const ackHelperStart = uiSource.indexOf(
    "const acknowledgeTransfer = useCallback(",
  );
  const ackHelperEnd = uiSource.indexOf(
    "const checkStatus",
    ackHelperStart,
  );
  const ackHelper = uiSource.slice(ackHelperStart, ackHelperEnd);
  assert.match(ackHelper, /void chrome\.runtime[\s\S]*sendMessage\(/);
  assert.match(ackHelper, /\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(ackHelper, /await|new Promise/);
});

test("lost relayer responses remain recoverable after the transfer screen reopens", async () => {
  const [submissionSource, uiSource] = await Promise.all([
    readFile(
      new URL(
        "../../src/chrome/sponsoredTransfers/submission.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/Transfer/hooks/useSponsoredTransfer.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const catchStart = submissionSource.lastIndexOf("} catch (error) {");
  const ambiguous = submissionSource.slice(catchStart);
  assert.match(
    ambiguous,
    /updateSponsoredTransferIntent\(record\.id,[\s\S]*state: "ambiguous"/,
  );
  assert.match(ambiguous, /intentId: record\.id/);
  assert.match(ambiguous, /outcomeUncertain: true/);

  const mountCheckStart = uiSource.indexOf(
    "const key = `${fromAddress.toLowerCase()}:8453:usdc`;",
  );
  const mountCheckEnd = uiSource.indexOf("const execute =", mountCheckStart);
  const mountCheck = uiSource.slice(mountCheckStart, mountCheckEnd);
  assert.match(mountCheck, /void checkStatus\(\)/);
  assert.doesNotMatch(mountCheck, /recipient|amount|canSubmit/);
});

test("status and acknowledgement messages are extension-only routed handlers", async () => {
  const source = await readFile(
    new URL(
      "../../src/chrome/background/sponsoredTransferRouter.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    classifyBackgroundMessage("checkSponsoredTransferStatus"),
    "wallet-ui",
  );
  assert.equal(
    classifyBackgroundMessage("acknowledgeSponsoredTransfer"),
    "wallet-ui",
  );

  assert.match(
    source,
    /case "checkSponsoredTransferStatus":[\s\S]*dependencies\s*\.handleCheckSponsoredTransferStatus\(message\.fromAddress\)/,
  );
  assert.match(
    source,
    /case "acknowledgeSponsoredTransfer":[\s\S]*dependencies\s*\.handleAcknowledgeSponsoredTransfer\([\s\S]*message\.intentId,[\s\S]*message\.fromAddress/,
  );
});

test("account removal and reset cannot destroy unresolved sponsored recovery state", async () => {
  const [
    accountComposition,
    executionComposition,
    dataComposition,
    accountRouter,
    sponsoredRouter,
    resetRouter,
    resetExecution,
  ] = await Promise.all([
    readFile(
      new URL(
        "../../src/chrome/background/composition/accountRoutes.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/background/composition/executionRoutes.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/background/composition/dataRoutes.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/background/accountManagementRouter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/background/sponsoredTransferRouter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/background/resetRouter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/background/reset/execution.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const removalStart = accountRouter.indexOf("async function removeAccount(");
  const removalEnd = accountRouter.indexOf(
    "export function createBackgroundAccountManagementMessageRouter",
    removalStart,
  );
  assert.ok(removalStart >= 0 && removalEnd > removalStart);
  const removal = accountRouter.slice(removalStart, removalEnd);
  assert.match(
    removal,
    /dependencies\.withSponsoredTransferOperation\(\(\) =>[\s\S]*dependencies\.removeAccountWithDappPrivacyBoundary\(\{[\s\S]*validateRemoval:[\s\S]*dependencies\.hasUnresolvedSponsoredTransferIntent\([\s\S]*account\.address[\s\S]*removeAccount: \(\) =>[\s\S]*dependencies\.handleRemoveAccount/,
  );
  assert.match(
    removal,
    /dependencies\.hasUnresolvedSponsoredTransferIntent\(\s*account\.address,?\s*\)/,
  );

  const compositionStart = accountComposition.indexOf(
    "createBackgroundAccountManagementMessageRouter({",
  );
  const compositionEnd = accountComposition.indexOf(
    "createBackgroundSecretManagementMessageRouter({",
    compositionStart,
  );
  assert.ok(compositionStart >= 0 && compositionEnd > compositionStart);
  assert.match(
    accountComposition.slice(compositionStart, compositionEnd),
    /withSponsoredTransferOperation,[\s\S]*removeAccountWithDappPrivacyBoundary,[\s\S]*hasUnresolvedSponsoredTransferIntent,/,
  );

  assert.match(resetRouter, /runWalletResetAgainstPendingResolutions/);
  assert.match(
    resetExecution,
    /dependencies\.hasUnresolvedSponsoredTransferIntent\(\)/,
  );
  assert.match(
    dataComposition,
    /createBackgroundResetMessageRouter\(\{[\s\S]*runWalletResetAgainstPendingResolutions:[\s\S]*hasUnresolvedSponsoredTransferIntent,/,
  );

  assert.match(
    sponsoredRouter,
    /case "sponsoredTransfer":[\s\S]*dependencies\s*\.runInternalIrreversibleOperation\(\(\) =>[\s\S]*dependencies\.handleSponsoredTransfer\(message\)/,
  );
  const sponsoredCompositionStart = executionComposition.indexOf(
    "createBackgroundSponsoredTransferMessageRouter({",
  );
  const sponsoredCompositionEnd = executionComposition.indexOf(
    "createBackgroundTransactionStatusMessageRouter({",
    sponsoredCompositionStart,
  );
  assert.ok(
    sponsoredCompositionStart >= 0 &&
      sponsoredCompositionEnd > sponsoredCompositionStart,
  );
  assert.match(
    executionComposition.slice(sponsoredCompositionStart, sponsoredCompositionEnd),
    /runInternalIrreversibleOperation,[\s\S]*handleSponsoredTransfer,[\s\S]*handleCheckSponsoredTransferStatus,[\s\S]*handleAcknowledgeSponsoredTransfer/,
  );

  const resetKeys = await readFile(
    new URL("../../src/chrome/storage/resetManifest.ts", import.meta.url),
    "utf8",
  );
  assert.match(resetKeys, /"sponsoredTransferIntents"/);
});
