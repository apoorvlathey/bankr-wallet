import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const executionUrl = new URL(
  "../../src/chrome/safe/execution.ts",
  import.meta.url,
);
const syncUrl = new URL(
  "../../src/chrome/safe/sync.ts",
  import.meta.url,
);
const receiptUrl = new URL(
  "../../src/chrome/safe/executionReceipt.ts",
  import.meta.url,
);

test("Safe execution uses MV3 alarms, fallback RPCs, and resumes persisted pollers", async () => {
  const [execution, sync, receipt] = await Promise.all([
    readFile(executionUrl, "utf8"),
    readFile(syncUrl, "utf8"),
    readFile(receiptUrl, "utf8"),
  ]);

  assert.match(execution, /startSafeExecutionReconciliation\(updated\.id\)/);
  assert.match(execution, /activeExecutionReconciliations/);
  assert.match(execution, /const proposal = await reconcileSafeExecution\(id\)/);
  assert.match(execution, /RECONCILE_BACKOFF_FACTOR/);
  assert.match(execution, /SAFE_EXECUTION_RECONCILIATION_ALARM/);
  assert.match(execution, /reconcilePendingSafeExecutions/);
  assert.match(execution, /ensureSafeExecutorHistory\(prepared, true\)/);
  assert.match(execution, /trackSafeExecutorBroadcast\(updated, result, rpcUrl\)/);
  assert.match(execution, /resumeSafeExecutorHistory\(proposal\)/);
  assert.match(sync, /startSafeExecutionReconciliation\(item\.id\)/);
  assert.match(sync, /alarm\.name === SAFE_EXECUTION_RECONCILIATION_ALARM/);
  assert.match(receipt, /RPC_URLS\[chainId\]/);
  assert.match(receipt, /VIEM_CHAINS\[chainId\]/);
  assert.match(receipt, /TransactionReceiptNotFoundError/);
});
