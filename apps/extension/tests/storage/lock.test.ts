import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  WALLET_SECRET_STORAGE_LOCK_KEY,
  withStorageLock,
} from "../../src/chrome/storageLock";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("same-key storage mutations execute in enqueue order", async () => {
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = withStorageLock("test:ordered", async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
    return 1;
  });
  const second = withStorageLock("test:ordered", async () => {
    events.push("second:start");
    return 2;
  });

  await nextTurn();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});

test("a rejected mutation does not poison its lock queue", async () => {
  const first = withStorageLock("test:rejection", async () => {
    throw new Error("write failed");
  });
  const second = withStorageLock("test:rejection", async () => "recovered");

  await assert.rejects(first, /write failed/);
  assert.equal(await second, "recovered");
});

test("different lock keys remain independent", async () => {
  let releaseBlocked!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseBlocked = resolve;
  });
  const blocked = withStorageLock("test:blocked", () => gate);
  const independent = withStorageLock("test:independent", async () => 7);

  assert.equal(await independent, 7);
  releaseBlocked();
  await blocked;
});

test("wallet operation and repository locks remain distinct and nest safely", async () => {
  assert.notEqual(
    WALLET_SECRET_OPERATION_LOCK_KEY,
    WALLET_SECRET_STORAGE_LOCK_KEY,
  );
  const result = await withStorageLock(
    WALLET_SECRET_OPERATION_LOCK_KEY,
    () => withStorageLock(WALLET_SECRET_STORAGE_LOCK_KEY, async () => "ok"),
  );
  assert.equal(result, "ok");
});
