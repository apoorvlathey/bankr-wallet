import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_SPONSORED_TRANSFER_MESSAGE_TYPES,
  createBackgroundSponsoredTransferMessageRouter,
  type BackgroundSponsoredTransferDependencies,
} from "../../src/chrome/background/sponsoredTransferRouter";

function dependencies(
  overrides: Partial<BackgroundSponsoredTransferDependencies> = {},
): BackgroundSponsoredTransferDependencies {
  return {
    runInternalIrreversibleOperation: async (resolve) => resolve(),
    handleSponsoredTransfer: async () => ({ success: true, intentId: "i-1" }),
    handleCheckSponsoredTransferStatus: async () => ({ hasUnresolved: false }),
    handleAcknowledgeSponsoredTransfer: async () => ({ success: true }),
    handleCheckPremiumStatus: async () => ({ isPremium: true }),
    ...overrides,
  };
}

function dispatch(
  deps: BackgroundSponsoredTransferDependencies,
  message: Record<string, unknown>,
): Promise<{ response: any; route: any }> {
  return new Promise((resolve) => {
    const router = createBackgroundSponsoredTransferMessageRouter(deps);
    let route: any;
    route = router(message, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("sponsored transfer transport declares one unique recovery route set", () => {
  assert.equal(
    new Set(BACKGROUND_SPONSORED_TRANSFER_MESSAGE_TYPES).size,
    BACKGROUND_SPONSORED_TRANSFER_MESSAGE_TYPES.length,
  );
});

test("submission enters the reset barrier before forwarding the exact request", async () => {
  const events: unknown[] = [];
  const message = {
    type: "sponsoredTransfer",
    fromAddress: "0xabc",
    recipient: "0xdef",
    amount: "1",
  };
  const result = await dispatch(
    dependencies({
      runInternalIrreversibleOperation: async (resolve) => {
        events.push("barrier");
        return resolve();
      },
      handleSponsoredTransfer: async (input) => {
        events.push(input);
        return { success: true, intentId: "intent-1" };
      },
    }),
    message,
  );
  assert.deepEqual(events, ["barrier", message]);
  assert.deepEqual(result.response, { success: true, intentId: "intent-1" });
  assert.deepEqual(result.route, { handled: true, keepChannelOpen: true });
});

test("a reset-barrier conflict cannot reach sponsored submission", async () => {
  let submitted = false;
  const result = await dispatch(
    dependencies({
      runInternalIrreversibleOperation: async () => ({
        success: false,
        error: "reset",
      }),
      handleSponsoredTransfer: async () => {
        submitted = true;
        return { success: true };
      },
    }),
    { type: "sponsoredTransfer" },
  );
  assert.equal(submitted, false);
  assert.deepEqual(result.response, { success: false, error: "reset" });
});

test("status failure remains unresolved while ACK failure stays retryable", async () => {
  const calls: unknown[][] = [];
  const deps = dependencies({
    handleCheckSponsoredTransferStatus: async (fromAddress) => {
      calls.push(["status", fromAddress]);
      throw new Error("RPC unavailable");
    },
    handleAcknowledgeSponsoredTransfer: async (intentId, fromAddress) => {
      calls.push(["ack", intentId, fromAddress]);
      throw new Error("storage unavailable");
    },
  });

  assert.deepEqual(
    (
      await dispatch(deps, {
        type: "checkSponsoredTransferStatus",
        fromAddress: "0xabc",
      })
    ).response,
    { success: false, hasUnresolved: true, error: "RPC unavailable" },
  );
  assert.deepEqual(
    (
      await dispatch(deps, {
        type: "acknowledgeSponsoredTransfer",
        intentId: "intent-1",
        fromAddress: "0xabc",
      })
    ).response,
    { success: false },
  );
  assert.deepEqual(calls, [
    ["status", "0xabc"],
    ["ack", "intent-1", "0xabc"],
  ]);
});

test("premium status forwards the account address and keeps the async channel", async () => {
  let address: unknown;
  const result = await dispatch(
    dependencies({
      handleCheckPremiumStatus: async (input) => {
        address = input;
        return { isPremium: false };
      },
    }),
    { type: "checkPremiumStatus", address: "0xabc" },
  );
  assert.equal(address, "0xabc");
  assert.deepEqual(result.response, { isPremium: false });
  assert.deepEqual(result.route, { handled: true, keepChannelOpen: true });
});
