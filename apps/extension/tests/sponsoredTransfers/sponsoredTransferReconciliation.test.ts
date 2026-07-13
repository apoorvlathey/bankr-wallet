import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyBackgroundMessage } from "../../src/chrome/background/messageAccessPolicy";
import { classifySponsoredAuthorizationObservations } from "../../src/chrome/sponsoredTransferReconciliation";

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
      "../../src/chrome/sponsoredTransferReconciliation.ts",
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
  const source = await readFile(
    new URL("../../src/chrome/sponsoredTransferHandlers.ts", import.meta.url),
    "utf8",
  );
  const recoveredStart = source.indexOf("if (record) {");
  const createStart = source.indexOf("if (!record) {", recoveredStart);
  const recovered = source.slice(recoveredStart, createStart);

  assert.match(
    recovered,
    /reconcileSponsoredTransferRecord\(record, vaultKey\)/,
  );
  assert.match(
    source,
    /async function reconcileSponsoredTransferRecord[\s\S]*reconcileSponsoredTransferAuthorization\([\s\S]*record\.validBefore/,
  );
  assert.match(recovered, /resolution === "consumed"/);
  assert.match(recovered, /resolution === "expired-unused"/);
  assert.match(
    recovered,
    /record\.state !== "prepared"[\s\S]*outcomeUncertain: true/,
  );
  assert.doesNotMatch(recovered, /SPONSORED_TRANSFER_API|method: "POST"/);

  const postCalls = source.match(/fetchTextBounded\(\s*SPONSORED_TRANSFER_API/g) ?? [];
  assert.equal(
    postCalls.length,
    1,
    "there must be only one relayer POST site, reachable only for a new/prepared authorization",
  );

  const reconcileStart = source.indexOf(
    "async function reconcileSponsoredTransferRecord",
  );
  const reconcileEnd = source.indexOf(
    "export async function handleCheckSponsoredTransferStatus",
    reconcileStart,
  );
  const reconcile = source.slice(reconcileStart, reconcileEnd);
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
  const source = await readFile(
    new URL("../../src/components/TokenTransfer.tsx", import.meta.url),
    "utf8",
  );
  const statusStart = source.indexOf(
    "const checkSponsoredTransferStatus = useCallback(async () =>",
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
    "acknowledgeSponsoredTransfer(result.intentId)",
  );
  const clearIndex = completed.indexOf("sponsoredIntentRef.current = null");
  const navigateIndex = completed.indexOf("onTransferInitiated(true)");
  assert.ok(ackIndex >= 0);
  assert.ok(clearIndex > ackIndex);
  assert.ok(navigateIndex > ackIndex);
  assert.doesNotMatch(completed, /await acknowledgeSponsoredTransfer/);

  const start = source.indexOf("{sponsoredFailed && (");
  const end = source.indexOf("{/* Impersonator warning */}", start);
  const failureUi = source.slice(start, end);

  assert.match(
    failureUi,
    /sponsoredFailed\.outcomeUncertain\s*\? checkSponsoredTransferStatus\s*:\s*handleFallbackSend/,
  );
  assert.match(
    failureUi,
    /sponsoredFailed\.outcomeUncertain\s*\? "Check status"\s*:\s*"Send and pay gas"/,
  );
  assert.doesNotMatch(
    failureUi,
    /sponsoredFailed\.outcomeUncertain\s*\? handleFallbackSend/,
  );
});

test("all successful sponsored submissions return the stored intent id and dispatch ACK before navigation", async () => {
  const [handlerSource, uiSource] = await Promise.all([
    readFile(
      new URL("../../src/chrome/sponsoredTransferHandlers.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/TokenTransfer.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  const handlerStart = handlerSource.indexOf(
    "export async function handleSponsoredTransfer(",
  );
  const handler = handlerSource.slice(handlerStart);
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
    "acknowledgeSponsoredTransfer(result.intentId)",
  );
  assert.ok(ackIndex >= 0);
  assert.ok(
    submitSuccess.indexOf("sponsoredIntentRef.current = null") > ackIndex,
  );
  assert.ok(submitSuccess.indexOf("onTransferInitiated(true)") > ackIndex);
  assert.doesNotMatch(submitSuccess, /await acknowledgeSponsoredTransfer/);

  const ackHelperStart = uiSource.indexOf(
    "const acknowledgeSponsoredTransfer = useCallback(",
  );
  const ackHelperEnd = uiSource.indexOf(
    "const checkSponsoredTransferStatus",
    ackHelperStart,
  );
  const ackHelper = uiSource.slice(ackHelperStart, ackHelperEnd);
  assert.match(ackHelper, /void chrome\.runtime[\s\S]*sendMessage\(/);
  assert.match(ackHelper, /\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(ackHelper, /await|new Promise/);
});

test("lost relayer responses remain recoverable after the transfer screen reopens", async () => {
  const [handlerSource, uiSource] = await Promise.all([
    readFile(
      new URL("../../src/chrome/sponsoredTransferHandlers.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/TokenTransfer.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  const handlerStart = handlerSource.indexOf(
    "export async function handleSponsoredTransfer(",
  );
  const handler = handlerSource.slice(handlerStart);
  const catchStart = handler.lastIndexOf("} catch (error) {");
  const ambiguous = handler.slice(catchStart);
  assert.match(
    ambiguous,
    /updateSponsoredTransferIntent\(record\.id,[\s\S]*state: "ambiguous"/,
  );
  assert.match(ambiguous, /intentId: record\.id/);
  assert.match(ambiguous, /outcomeUncertain: true/);

  const mountCheckStart = uiSource.indexOf(
    "const checkKey = `${fromAddress.toLowerCase()}:8453:usdc`;",
  );
  const mountCheck = uiSource.slice(mountCheckStart, mountCheckStart + 350);
  assert.match(mountCheck, /void checkSponsoredTransferStatus\(\)/);
  assert.doesNotMatch(mountCheck, /recipient|amount|canSubmit/);
});

test("status and acknowledgement messages are extension-only routed handlers", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background.ts", import.meta.url),
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
    /case "checkSponsoredTransferStatus":[\s\S]*handleCheckSponsoredTransferStatus\(message\.fromAddress\)/,
  );
  assert.match(
    source,
    /case "acknowledgeSponsoredTransfer":[\s\S]*handleAcknowledgeSponsoredTransfer\([\s\S]*message\.intentId,[\s\S]*message\.fromAddress/,
  );
});

test("account removal and reset cannot destroy unresolved sponsored recovery state", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background.ts", import.meta.url),
    "utf8",
  );
  const removalStart = source.indexOf('case "removeAccount"');
  const removalEnd = source.indexOf('case "revealPrivateKey"', removalStart);
  const removal = source.slice(removalStart, removalEnd);
  assert.match(removal, /withSponsoredTransferOperation\(/);
  assert.match(
    removal,
    /hasUnresolvedSponsoredTransferIntent\(account\.address\)/,
  );
  assert.match(removal, /removeAccountWithDappPrivacyBoundary/);

  const resetStart = source.indexOf('case "resetExtension"');
  const resetEnd = source.indexOf("default:", resetStart);
  const reset = source.slice(resetStart, resetEnd);
  assert.match(reset, /runWalletResetAgainstPendingResolutions/);
  assert.match(reset, /hasUnresolvedSponsoredTransferIntent\(\)/);

  const sponsoredStart = source.indexOf('case "sponsoredTransfer"');
  const sponsoredEnd = source.indexOf('case "checkPremiumStatus"', sponsoredStart);
  assert.match(
    source.slice(sponsoredStart, sponsoredEnd),
    /runInternalIrreversibleOperation\(\(\) => handleSponsoredTransfer\(message\)\)/,
  );

  const resetKeys = await readFile(
    new URL("../../src/chrome/walletResetStorage.ts", import.meta.url),
    "utf8",
  );
  assert.match(resetKeys, /"sponsoredTransferIntents"/);
});
