import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../src/chrome/forceInclusion/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), "utf8");
}

function assertOrdered(text: string, markers: string[]): void {
  let cursor = -1;
  for (const marker of markers) {
    const next = text.indexOf(marker, cursor + 1);
    assert.ok(next > cursor, `expected ${marker} after offset ${cursor}`);
    cursor = next;
  }
}

test("single local force inclusion reauthorizes before send and persists before lease release", async () => {
  const text = await source("singleLocal.ts");
  assertOrdered(text, [
    "const latest = await getAccountById(account.id)",
    "await enforcePendingRequestAuthorizationAtConfirmation(",
    "effectGuard.beginEffect()",
    "const l1Hash = broadcast.txHash",
    "await updateTxInHistory(txId",
    "effectGuard.settleEffect()",
    "effectGuard.releaseIfSafe()",
  ]);
});

test("local force-inclusion batch sends in nonce order and halts an uncertain tail", async () => {
  const text = await source("batchLocalBroadcast.ts");
  assert.match(text, /for \(let index = 0; index < prepared\.deposits\.length; index\+\+\)/);
  assertOrdered(text, [
    "const latest = await getAccountById(account.id)",
    "await enforcePendingRequestAuthorizationAtConfirmation(",
    "effectGuard.beginEffect()",
    "const l1Hash = broadcast.txHash",
    "await updateTxInHistory(deposit.txId",
    "effectGuard.settleEffect()",
    "shouldHaltForceInclusionTail(broadcast)",
    "await skipTail(",
  ]);
});

test("ambiguous broadcasts are retained before dropped-transaction classification", async () => {
  const text = await source("receiptFinalizer.ts");
  assertOrdered(text, [
    "shouldRetainUnobservedBroadcast(tx, txHash)",
    "age <= DROPPED_MIN_AGE_MS",
    "count < DROPPED_NOT_FOUND_THRESHOLD",
    'error: "Transaction dropped from the mempool"',
  ]);
});

test("recovery reopens false derived-L2 drops before ordinary failed entries return", async () => {
  const text = await source("recovery.ts");
  assertOrdered(text, [
    'tx.error === "Transaction dropped from the mempool"',
    "isForceInclusionL2Hash(tx, knownL2Hash)",
    'status: "pending"',
    'import("./receiptPoller")',
    "return;",
  ]);
});

test("L1 receipt timeouts remain pending and L1 reverts feed aggregate batch status", async () => {
  const text = await source("batchLocalReceipts.ts");
  assert.match(text, /result\.success = false/);
  assertOrdered(text, [
    "timeout: L1_RECEIPT_TIMEOUT",
    "} catch {",
    'status: "pending"',
    'error: "L1 receipt is still pending"',
  ]);
});
