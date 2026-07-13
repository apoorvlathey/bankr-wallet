import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_DELEGATION_MESSAGE_TYPES,
  createBackgroundDelegationMessageRouter,
  type BackgroundDelegationDependencies,
} from "../../src/chrome/background/delegationRouter";

test("delegation transport declares unique routes and preserves EIP-7702 arguments", async () => {
  assert.equal(
    new Set(BACKGROUND_DELEGATION_MESSAGE_TYPES).size,
    BACKGROUND_DELEGATION_MESSAGE_TYPES.length,
  );
  const calls: unknown[][] = [];
  const dependencies: BackgroundDelegationDependencies = {
    handleGetDelegationStatus: async (...args) => {
      calls.push(["status", ...args]);
      return { ok: true };
    },
    handleProbeDelegateContract: async (...args) => {
      calls.push(["probe", ...args]);
      return { ok: true };
    },
    handleInitiateRevokeDelegation: async (...args) => {
      calls.push(["revoke", ...args]);
      return { ok: true };
    },
    handleInitiateSetDelegation: async (...args) => {
      calls.push(["set", ...args]);
      return { ok: true };
    },
  };
  const router = createBackgroundDelegationMessageRouter(dependencies);
  const dispatch = (message: Record<string, unknown>) =>
    new Promise((resolve) => {
      const route = router(message, resolve);
      assert.deepEqual(route, { handled: true, keepChannelOpen: true });
    });

  await dispatch({ type: "getDelegationStatus", accountId: "a", chainId: 1 });
  await dispatch({ type: "probeDelegateContract", chainId: 2, address: "0xd" });
  await dispatch({ type: "initiateRevokeDelegation", accountId: "b", chainId: 3 });
  await dispatch({
    type: "initiateSetDelegation",
    accountId: "c",
    chainId: 4,
    targetDelegate: "0xtarget",
  });
  assert.deepEqual(calls, [
    ["status", "a", 1],
    ["probe", 2, "0xd"],
    ["revoke", "b", 3],
    ["set", "c", 4, "0xtarget"],
  ]);
});
