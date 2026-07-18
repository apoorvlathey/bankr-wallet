import assert from "node:assert/strict";
import test from "node:test";

import {
  startUiKeepaliveHeartbeat,
  UI_KEEPALIVE_HEARTBEAT_MS,
} from "../../src/app/uiKeepalive";

test("trusted UI heartbeat sends immediately and below Chrome's idle deadline", () => {
  const messages: unknown[] = [];
  let scheduled: (() => void) | null = null;
  let scheduledAfter = 0;
  let cleared: unknown = null;
  const intervalHandle = { id: 1 } as unknown as ReturnType<
    typeof globalThis.setInterval
  >;

  const stop = startUiKeepaliveHeartbeat(
    { postMessage: (message) => messages.push(message) },
    {
      setInterval: (callback, milliseconds) => {
        scheduled = callback;
        scheduledAfter = milliseconds;
        return intervalHandle;
      },
      clearInterval: (handle) => {
        cleared = handle;
      },
    },
  );

  assert.deepEqual(messages, [{ type: "wallet-ui-keepalive" }]);
  assert.equal(scheduledAfter, UI_KEEPALIVE_HEARTBEAT_MS);
  assert.ok(
    scheduledAfter < 30_000,
    "heartbeat must arrive before Chrome's MV3 idle timeout",
  );

  assert.ok(scheduled);
  (scheduled as () => void)();
  assert.deepEqual(messages, [
    { type: "wallet-ui-keepalive" },
    { type: "wallet-ui-keepalive" },
  ]);

  stop();
  assert.equal(cleared, intervalHandle);
  (scheduled as () => void)();
  assert.equal(messages.length, 2, "stopped heartbeats cannot extend worker life");
});

test("heartbeat stops and reports a disconnected port", () => {
  let scheduled: (() => void) | null = null;
  let clearCalls = 0;
  let errorCalls = 0;

  startUiKeepaliveHeartbeat(
    {
      postMessage: () => {
        throw new Error("disconnected");
      },
    },
    {
      setInterval: (callback) => {
        scheduled = callback;
        return 1 as unknown as ReturnType<typeof globalThis.setInterval>;
      },
      clearInterval: () => {
        clearCalls += 1;
      },
      onError: () => {
        errorCalls += 1;
      },
    },
  );

  assert.equal(clearCalls, 1);
  assert.equal(errorCalls, 1);
  assert.ok(scheduled);
  (scheduled as () => void)();
  assert.equal(errorCalls, 1, "a failed port must not keep retrying itself");
});
