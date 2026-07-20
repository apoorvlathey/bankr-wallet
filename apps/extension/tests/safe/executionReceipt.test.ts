import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupReceiptAcrossRpcUrls,
  SafeExecutionReceiptRpcError,
} from "../../src/chrome/safe/executionReceipt";

test("Safe receipt lookup falls through unavailable and lagging RPCs", async () => {
  const attempts: string[] = [];
  const lookup = await lookupReceiptAcrossRpcUrls({
    rpcUrls: ["configured", "lagging", "fallback"],
    createClient: (rpcUrl) => rpcUrl,
    getReceipt: async (rpcUrl) => {
      attempts.push(rpcUrl);
      if (rpcUrl === "configured") throw new Error("provider unavailable");
      if (rpcUrl === "lagging") throw new Error("not found");
      return { status: "success" };
    },
    isNotFound: (error) => error instanceof Error && error.message === "not found",
  });

  assert.deepEqual(attempts, ["configured", "lagging", "fallback"]);
  assert.equal(lookup.rpcUrl, "fallback");
  assert.deepEqual(lookup.receipt, { status: "success" });
});

test("a responsive RPC with no receipt remains pending rather than unavailable", async () => {
  const lookup = await lookupReceiptAcrossRpcUrls({
    rpcUrls: ["lagging", "offline"],
    createClient: (rpcUrl) => rpcUrl,
    getReceipt: async (rpcUrl) => {
      if (rpcUrl === "lagging") throw new Error("not found");
      throw new Error("offline");
    },
    isNotFound: (error) => error instanceof Error && error.message === "not found",
  });

  assert.equal(lookup.rpcUrl, "lagging");
  assert.equal(lookup.receipt, null);
});

test("all failed Safe receipt RPCs produce the explicit retryable error", async () => {
  await assert.rejects(
    lookupReceiptAcrossRpcUrls({
      rpcUrls: ["one", "two"],
      createClient: (rpcUrl) => rpcUrl,
      getReceipt: async () => { throw new Error("offline"); },
      isNotFound: () => false,
    }),
    (error: unknown) =>
      error instanceof SafeExecutionReceiptRpcError &&
      error.message === "RPC unavailable. WalletChan will keep checking automatically.",
  );
});
