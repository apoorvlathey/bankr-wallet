import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Bankr swap legs expose rejected, reverted, and ambiguous terminal states", async () => {
  const source = await readFile(
    new URL(
      "../../src/chrome/transactions/swaps/bankrLeg.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const implementation = source;

  assert.match(
    implementation,
    /kind: "reverted" \| "failed" \| "ambiguous"/,
  );
  assert.match(
    implementation,
    /result\.status === "reverted"[\s\S]*return \{ kind: "reverted"/,
  );
  assert.match(
    implementation,
    /error instanceof BankrApiError && error\.outcomeUncertain[\s\S]*kind: "ambiguous"/,
  );
  assert.match(
    implementation,
    /handleTransactionFailure\([\s\S]*return \{ kind: "failed"/,
  );
});

test("direct Bankr swaps await each leg and stop before submitting the remaining tail", async () => {
  const source = await readFile(
    new URL("../../src/chrome/transactions/swaps/direct.ts", import.meta.url),
    "utf8",
  );
  const implementation = source;

  const loopIndex = implementation.indexOf("for (const entry of transactions)");
  const awaitedLegIndex = implementation.indexOf(
    "const leg = await processSwapTxBankr(",
    loopIndex,
  );
  const stopIndex = implementation.indexOf(
    'if (leg.kind === "accepted") continue',
    awaitedLegIndex,
  );
  const skippedTailIndex = implementation.indexOf(
    "transactions.slice(txIds.length)",
    stopIndex,
  );
  const returnIndex = implementation.indexOf("return {", skippedTailIndex);

  assert.ok(loopIndex >= 0, "Bankr direct flow must remain sequential");
  assert.ok(awaitedLegIndex > loopIndex, "each Bankr leg must be awaited");
  assert.ok(stopIndex > awaitedLegIndex, "the leg result must gate the tail");
  assert.ok(
    skippedTailIndex > stopIndex,
    "all unsubmitted tail entries must be explicitly skipped",
  );
  assert.ok(returnIndex > skippedTailIndex, "the handler must return before another leg");
  assert.match(
    implementation.slice(stopIndex, returnIndex + 300),
    /leg\.kind === "ambiguous"[\s\S]*previous Bankr submission outcome is unknown/,
  );
  assert.match(
    implementation.slice(stopIndex, returnIndex + 300),
    /status: "failed"/,
  );
});

test("Bankr API transport errors distinguish uncertain broadcast outcomes", async () => {
  const [source, responseSource] = await Promise.all([
    readFile(new URL("../../src/chrome/bankr/submission.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../../src/chrome/bankr/response.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    responseSource,
    /class BankrApiError extends Error[\s\S]*outcomeUncertain/,
  );
  assert.match(
    source,
    /submission outcome is unknown[\s\S]*true/i,
    "timeout\/disconnect errors after an attempted submit must be ambiguous",
  );
});
