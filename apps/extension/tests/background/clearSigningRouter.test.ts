import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_CLEAR_SIGNING_MESSAGE_TYPES,
  createBackgroundClearSigningMessageRouter,
  type BackgroundClearSigningDependencies,
} from "../../src/chrome/background/clearSigningRouter";

function dispatch(
  dependencies: BackgroundClearSigningDependencies,
  message: Record<string, unknown>,
): Promise<any> {
  return new Promise((resolve) => {
    const route = createBackgroundClearSigningMessageRouter(dependencies)(
      message,
      resolve,
    );
    assert.deepEqual(route, { handled: true, keepChannelOpen: true });
  });
}

test("clear-signing transport preserves payloads, defaults, and boolean coercion", async () => {
  assert.equal(
    new Set(BACKGROUND_CLEAR_SIGNING_MESSAGE_TYPES).size,
    BACKGROUND_CLEAR_SIGNING_MESSAGE_TYPES.length,
  );
  let descriptorMessage: unknown;
  let enabledValue: unknown;
  const dependencies: BackgroundClearSigningDependencies = {
    getDescriptor: async (message) => {
      descriptorMessage = message;
      return { descriptor: { method: "transfer" }, enabled: true };
    },
    invalidateCache: async () => ({ cleared: 2 }),
    getEnabled: async () => false,
    setEnabled: async (enabled) => {
      enabledValue = enabled;
    },
  };
  const descriptorRequest = {
    type: "GET_CLEAR_SIGNING_DESCRIPTOR",
    chainId: 8453,
  };
  assert.deepEqual(await dispatch(dependencies, descriptorRequest), {
    descriptor: { method: "transfer" },
    enabled: true,
  });
  assert.equal(descriptorMessage, descriptorRequest);
  assert.deepEqual(
    await dispatch(dependencies, { type: "INVALIDATE_CLEAR_SIGNING_CACHE" }),
    { success: true, cleared: 2 },
  );
  assert.deepEqual(
    await dispatch(dependencies, { type: "getClearSigningEnabled" }),
    { enabled: false },
  );
  assert.deepEqual(
    await dispatch(dependencies, {
      type: "setClearSigningEnabled",
      value: "truthy",
    }),
    { success: true },
  );
  assert.equal(enabledValue, true);
});

test("clear-signing failures retain safe descriptor and enabled defaults", async () => {
  const failure = new Error("storage unavailable");
  const dependencies: BackgroundClearSigningDependencies = {
    getDescriptor: async () => {
      throw failure;
    },
    invalidateCache: async () => {
      throw failure;
    },
    getEnabled: async () => {
      throw failure;
    },
    setEnabled: async () => {
      throw failure;
    },
  };
  assert.deepEqual(
    await dispatch(dependencies, { type: "GET_CLEAR_SIGNING_DESCRIPTOR" }),
    { descriptor: null, enabled: true, error: "storage unavailable" },
  );
  assert.deepEqual(
    await dispatch(dependencies, { type: "INVALIDATE_CLEAR_SIGNING_CACHE" }),
    { success: false, error: "storage unavailable" },
  );
  assert.deepEqual(
    await dispatch(dependencies, { type: "getClearSigningEnabled" }),
    { enabled: true, error: "storage unavailable" },
  );
  assert.deepEqual(
    await dispatch(dependencies, { type: "setClearSigningEnabled", value: false }),
    { success: false, error: "storage unavailable" },
  );
});
