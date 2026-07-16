// Background auth transport contract.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_AUTH_MESSAGE_TYPES,
  createBackgroundAuthMessageRouter,
} from "../../src/chrome/background/authRouter";

function responseCapture(events?: string[]) {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => {
    resolve = done;
  });
  return {
    response,
    sendResponse(value?: unknown) {
      events?.push("response");
      resolve(value);
    },
  };
}

test("declared auth routes exactly match the delegated router switch", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/authRouter.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.split(/\r?\n/).length <= 400,
    "background auth transport must stay within its 400-line review budget",
  );
  const switchTypes = [
    ...source.matchAll(/^ {6}case ["']([^"']+)["']/gm),
  ].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(switchTypes)].sort(),
    [...BACKGROUND_AUTH_MESSAGE_TYPES].sort(),
  );
  assert.equal(
    BACKGROUND_AUTH_MESSAGE_TYPES.length,
    new Set(BACKGROUND_AUTH_MESSAGE_TYPES).size,
  );
});

test("unhandled and synchronous auth routes preserve listener semantics", () => {
  const responses: unknown[] = [];
  const route = createBackgroundAuthMessageRouter({
    isApiKeyCached: () => true,
    getCurrentSessionId: () => "session-1",
    isWalletUnlocked: () => true,
  });
  const sendResponse = (value?: unknown) => responses.push(value);

  assert.deepEqual(route({ type: "notAnAuthRoute" }, sendResponse), {
    handled: false,
  });
  assert.deepEqual(route({ type: "isApiKeyCached" }, sendResponse), {
    handled: true,
    keepChannelOpen: false,
  });
  assert.deepEqual(route({ type: "validateSession" }, sendResponse), {
    handled: true,
    keepChannelOpen: false,
  });
  assert.deepEqual(responses, [
    true,
    { valid: true, sessionId: "session-1" },
  ]);
});

test("password unlock stays serialized and broadcasts only after success", async () => {
  const events: string[] = [];
  const capture = responseCapture(events);
  const route = createBackgroundAuthMessageRouter({
    runSerializedAuthTransition: async (operation) => {
      events.push("transition:start");
      const result = await operation();
      events.push("transition:end");
      return result;
    },
    handleUnlockWallet: async (password) => {
      events.push(`unlock:${password}`);
      return { success: true, passwordType: "master" };
    },
    invalidateAuthCeremonies: () => {
      events.push("invalidate");
      return "epoch";
    },
    sendRuntimeMessage: async (message) => {
      events.push(`broadcast:${String(message.type)}`);
    },
  });

  assert.deepEqual(
    route(
      { type: "unlockWallet", password: "master-password" },
      capture.sendResponse,
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, {
    success: true,
    passwordType: "master",
  });
  assert.deepEqual(events, [
    "transition:start",
    "unlock:master-password",
    "invalidate",
    "transition:end",
    "broadcast:walletUnlockedExternal",
    "response",
  ]);
});

test("manual lock preserves the suppress-prompt flag and transition ordering", async () => {
  const events: string[] = [];
  const capture = responseCapture(events);
  const route = createBackgroundAuthMessageRouter({
    runSerializedAuthTransition: async (operation) => {
      events.push("transition:start");
      const result = await operation();
      events.push("transition:end");
      return result;
    },
    terminateActiveAuthSession: async (suppress) => {
      events.push(`terminate:${String(suppress)}`);
      return { success: true };
    },
  });

  assert.deepEqual(route({ type: "lockWallet" }, capture.sendResponse), {
    handled: true,
    keepChannelOpen: true,
  });
  assert.deepEqual(await capture.response, { success: true });
  assert.deepEqual(events, [
    "transition:start",
    "terminate:true",
    "transition:end",
    "response",
  ]);
});

test("manual lock reports teardown failure instead of confirming lock", async () => {
  const capture = responseCapture();
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    const route = createBackgroundAuthMessageRouter({
      runSerializedAuthTransition: async (operation) => operation(),
      terminateActiveAuthSession: async () => {
        throw new Error("both recovery halves survived");
      },
    });

    route({ type: "lockWallet" }, capture.sendResponse);
    assert.deepEqual(await capture.response, {
      success: false,
      error: "Failed to lock wallet",
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test("successful passkey hydration preserves the external unlock broadcast", async () => {
  const broadcasts: unknown[] = [];
  const capture = responseCapture();
  const route = createBackgroundAuthMessageRouter({
    runSerializedAuthTransition: async (operation) => operation(),
    handleUnlockWithPasskey: async () => ({
      success: true,
      passwordType: "master",
    }),
    sendRuntimeMessage: async (message) => {
      broadcasts.push(message);
    },
  });

  assert.deepEqual(
    route({ type: "unlockWithPasskey" }, capture.sendResponse),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, {
    success: true,
    passwordType: "master",
  });
  assert.deepEqual(broadcasts, [{ type: "walletUnlockedExternal" }]);
});

test("unlocked-state checks restore only an explicit Never session", async () => {
  let timeoutReads = 0;
  let restoreCalls = 0;
  const capture = responseCapture();
  const route = createBackgroundAuthMessageRouter({
    getAutoLockTimeout: async () => {
      timeoutReads += 1;
      return 0;
    },
    isWalletUnlocked: () => false,
    tryRestoreSession: async () => {
      restoreCalls += 1;
      return true;
    },
  });

  assert.deepEqual(route({ type: "isWalletUnlocked" }, capture.sendResponse), {
    handled: true,
    keepChannelOpen: true,
  });
  assert.equal(await capture.response, true);
  assert.equal(timeoutReads, 2);
  assert.equal(restoreCalls, 1);
});

test("password and auto-lock mutations retain serialized invalidation rules", async () => {
  const events: string[] = [];
  const passwordCapture = responseCapture();
  const autoLockCapture = responseCapture();
  const route = createBackgroundAuthMessageRouter({
    runSerializedAuthTransition: async (operation) => {
      events.push("transition");
      return operation();
    },
    handleChangePassword: async (current, next) => {
      events.push(`change:${current}:${next}`);
      return { success: true };
    },
    invalidateAuthCeremonies: () => {
      events.push("invalidate");
      return "epoch";
    },
    setAutoLockTimeout: async (timeout) => {
      events.push(`timeout:${timeout}`);
      return true;
    },
  });

  route(
    { type: "changePassword", currentPassword: "old", newPassword: "new" },
    passwordCapture.sendResponse,
  );
  assert.deepEqual(await passwordCapture.response, { success: true });

  route(
    { type: "setAutoLockTimeout", timeout: 300_000 },
    autoLockCapture.sendResponse,
  );
  assert.deepEqual(await autoLockCapture.response, { success: true });
  assert.deepEqual(events, [
    "transition",
    "change:old:new",
    "invalidate",
    "transition",
    "timeout:300000",
  ]);
});
