import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_SWAP_BRIDGE_DATA_MESSAGE_TYPES,
  createBackgroundSwapBridgeDataMessageRouter,
} from "../../src/chrome/background/swapBridgeDataRouter";

test("swap/bridge data transport declares unique routes and exact arguments", async () => {
  assert.equal(
    new Set(BACKGROUND_SWAP_BRIDGE_DATA_MESSAGE_TYPES).size,
    BACKGROUND_SWAP_BRIDGE_DATA_MESSAGE_TYPES.length,
  );
  const calls: unknown[][] = [];
  const call = (name: string) => async (...args: unknown[]) => {
    calls.push([name, ...args]);
    return name;
  };
  const router = createBackgroundSwapBridgeDataMessageRouter({
    fetchSwapPrice: call("price"),
    fetchSwapQuote: call("quote"),
    fetchBridgeQuote: call("bridgeQuote"),
    fetchBridgeStatus: call("bridgeStatus"),
    getBridgeSourceChains: call("sourceChains"),
    getBridgeDestinationChains: call("destinationChains"),
    getCachedBungeeChains: call("rawChains"),
    getCachedBungeeTokens: call("bridgeTokens"),
    getCachedTokenList: call("swapTokens"),
  });
  const dispatch = (message: Record<string, unknown>) =>
    new Promise((resolve) => {
      const route = router(message, resolve);
      assert.deepEqual(route, { handled: true, keepChannelOpen: true });
    });

  const swapMessage = {
    chainId: 8453,
    sellToken: "0xsell",
    buyToken: "0xbuy",
    sellAmount: "100",
    taker: "0xtaker",
    slippageBps: 50,
  };
  await dispatch({ type: "fetchSwapPrice", ...swapMessage });
  await dispatch({ type: "fetchSwapQuote", ...swapMessage });
  await dispatch({
    type: "fetchBridgeQuote",
    userAddress: "0xuser",
    receiverAddress: "0xreceiver",
    originChainId: 8453,
    destinationChainId: 1,
    inputToken: "0xinput",
    outputToken: "0xoutput",
    inputAmount: "200",
    slippage: 1,
  });
  await dispatch({
    type: "fetchBridgeStatus",
    requestHash: "0xrequest",
    txHash: "0xtx",
  });
  await dispatch({
    type: "fetchBridgeChains",
    side: "source",
    accountType: "privateKey",
  });
  await dispatch({
    type: "fetchBridgeChains",
    side: "destination",
    accountType: "must-not-forward",
  });
  await dispatch({ type: "fetchBridgeChainsRaw" });
  await dispatch({ type: "fetchBridgeTokens", chainId: 130 });
  await dispatch({ type: "fetchSwapTokenList", chainId: 137 });

  assert.deepEqual(calls, [
    ["price", swapMessage],
    ["quote", swapMessage],
    [
      "bridgeQuote",
      {
        userAddress: "0xuser",
        receiverAddress: "0xreceiver",
        originChainId: 8453,
        destinationChainId: 1,
        inputToken: "0xinput",
        outputToken: "0xoutput",
        inputAmount: "200",
        slippage: 1,
      },
    ],
    ["bridgeStatus", { requestHash: "0xrequest", txHash: "0xtx" }],
    ["sourceChains", "privateKey"],
    ["destinationChains"],
    ["rawChains"],
    ["bridgeTokens", 130],
    ["swapTokens", 137],
  ]);
  assert.deepEqual(router({ type: "unknown" }, () => {}), { handled: false });
});

test("swap/bridge helper failures retain the direct error response", async () => {
  const fail = async () => {
    throw new Error("quote failed");
  };
  const router = createBackgroundSwapBridgeDataMessageRouter({
    fetchSwapPrice: fail,
    fetchSwapQuote: fail,
    fetchBridgeQuote: fail,
    fetchBridgeStatus: fail,
    getBridgeSourceChains: fail,
    getBridgeDestinationChains: fail,
    getCachedBungeeChains: fail,
    getCachedBungeeTokens: fail,
    getCachedTokenList: fail,
  });
  const response = await new Promise((resolve) => {
    const route = router({ type: "fetchSwapQuote" }, resolve);
    assert.equal(route.keepChannelOpen, true);
  });
  assert.deepEqual(response, { success: false, error: "quote failed" });
});
