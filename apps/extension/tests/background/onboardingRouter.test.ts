// Background onboarding transport contract.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_ONBOARDING_MESSAGE_TYPES,
  createBackgroundOnboardingMessageRouter,
} from "../../src/chrome/background/onboardingRouter";

const TEST_ENVIRONMENT = {
  resetWalletConnectForWalletReset: async () => {},
  invalidateAvatarImageCacheForWalletReset: () => {},
  sendRuntimeMessage: async () => {},
};

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

test("onboarding transport stays focused and declares every route", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/onboardingRouter.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.split(/\r?\n/).length <= 400);
  const switchTypes = [...source.matchAll(/^ {6}case ["']([^"']+)["']/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...new Set(switchTypes)].sort(),
    [...BACKGROUND_ONBOARDING_MESSAGE_TYPES].sort(),
  );
});

test("onboarding completion notification preserves synchronous delivery", async () => {
  const broadcasts: unknown[] = [];
  const responses: unknown[] = [];
  const route = createBackgroundOnboardingMessageRouter({
    ...TEST_ENVIRONMENT,
    sendRuntimeMessage: async (message) => {
      broadcasts.push(message);
    },
  });

  assert.deepEqual(route({ type: "unrelated" }, () => {}), { handled: false });
  assert.deepEqual(
    route({ type: "onboardingComplete" }, (value) => responses.push(value)),
    { handled: true, keepChannelOpen: false },
  );
  await Promise.resolve();
  assert.deepEqual(responses, [{ success: true }]);
  assert.deepEqual(broadcasts, [{ type: "onboardingComplete" }]);
});

test("status inspection remains serialized and rejects oversized ids", async () => {
  const events: string[] = [];
  const capture = responseCapture(events);
  const route = createBackgroundOnboardingMessageRouter(TEST_ENVIRONMENT, {
    runSerializedAuthTransition: async (operation) => {
      events.push("transition:start");
      const result = await operation();
      events.push("transition:end");
      return result;
    },
    getOnboardingInitializationStatus: async (id) => {
      events.push(`status:${id}`);
      return { configured: false };
    },
  });

  assert.deepEqual(
    route(
      { type: "getOnboardingInitializationStatus", initializationId: "x".repeat(129) },
      capture.sendResponse,
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.deepEqual(await capture.response, { configured: false });
  assert.deepEqual(events, [
    "transition:start",
    "status:",
    "transition:end",
    "response",
  ]);
});

test("credential initialization normalizes fields inside the auth transition", async () => {
  const calls: unknown[][] = [];
  const capture = responseCapture();
  const route = createBackgroundOnboardingMessageRouter(TEST_ENVIRONMENT, {
    runSerializedAuthTransition: async (operation) => operation(),
    initializeOnboardingCredential: async (...args) => {
      calls.push(args);
      return { success: true, passwordType: "master" };
    },
  });

  route(
    {
      type: "initializeOnboardingCredential",
      initializationId: 7,
      credential: { unsafe: true },
      password: "master-password",
    },
    capture.sendResponse,
  );
  assert.deepEqual(await capture.response, {
    success: true,
    passwordType: "master",
  });
  assert.deepEqual(calls, [["", "", "master-password"]]);
});

test("begin wires wallet identity retirement and cache invalidation", async () => {
  const events: string[] = [];
  const capture = responseCapture();
  const route = createBackgroundOnboardingMessageRouter({
    resetWalletConnectForWalletReset: async () => {
      events.push("wallet-connect-reset");
    },
    invalidateAvatarImageCacheForWalletReset: () => {
      events.push("avatar-invalidated");
    },
    sendRuntimeMessage: TEST_ENVIRONMENT.sendRuntimeMessage,
  }, {
    beginOnboardingInitialization: async (id, retire, invalidate) => {
      events.push(`begin:${id}`);
      invalidate?.();
      await retire?.();
      return { success: true, initializationId: id };
    },
  });

  route(
    { type: "beginOnboardingInitialization", initializationId: "owner" },
    capture.sendResponse,
  );
  assert.deepEqual(await capture.response, {
    success: true,
    initializationId: "owner",
  });
  assert.deepEqual(events, [
    "begin:owner",
    "avatar-invalidated",
    "wallet-connect-reset",
  ]);
});

test("completion and rollback retain their distinct failure responses", async () => {
  const complete = responseCapture();
  const rollback = responseCapture();
  const route = createBackgroundOnboardingMessageRouter(TEST_ENVIRONMENT, {
    completeOnboardingInitialization: async () => {
      throw new Error("commit failed");
    },
    runSerializedAuthTransition: async (operation) => operation(),
    rollbackOnboardingInitialization: async () => {
      throw new Error("rollback failed");
    },
  });

  route(
    { type: "completeOnboardingInitialization", initializationId: "owner" },
    complete.sendResponse,
  );
  route(
    { type: "rollbackOnboardingInitialization", initializationId: "owner" },
    rollback.sendResponse,
  );
  assert.deepEqual(await complete.response, {
    success: false,
    error: "commit failed",
  });
  assert.deepEqual(await rollback.response, { success: false });
});
