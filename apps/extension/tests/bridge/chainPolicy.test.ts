import assert from "node:assert/strict";
import test from "node:test";
import {
  isEvmBridgeChain,
  resolveBridgeDestinationChains,
  resolveBridgeSourceChains,
} from "../../src/chrome/bridge/chainPolicy";

const CUSTOM_CHAIN_ID = 123_456;
const networksInfo = {
  Custom: {
    chainId: CUSTOM_CHAIN_ID,
    rpcUrl: "https://rpc.custom.example",
    isCustom: true,
  },
};

test("bridge chain policy excludes non-EVM and disabled destinations", () => {
  assert.equal(isEvmBridgeChain({ chainId: 89999, name: "Solana" }), false);
  assert.equal(isEvmBridgeChain({ chainId: 123, name: "Aptos Mainnet" }), false);
  assert.equal(isEvmBridgeChain({ chainId: 250, name: "Fantom" }), true);
  assert.equal(isEvmBridgeChain({ chainId: Number.NaN, name: "Bad" }), false);

  const destinations = resolveBridgeDestinationChains([
    { chainId: 8453, name: "Base" },
    { chainId: 89999, name: "Solana" },
    { chainId: 999_999, name: "Unknown EVM", receivingEnabled: true },
    { chainId: 888_888, name: "Disabled", receivingEnabled: false },
  ]);
  assert.deepEqual(
    destinations.map((chain) => chain.chainId),
    [8453, 999_999],
  );
  assert.ok(destinations[0].registry);
  assert.equal(destinations[1].registry, undefined);
});

test("bridge sources retain configured fallback and Socket sending policy", () => {
  const fallback = resolveBridgeSourceChains([], networksInfo as any);
  assert.ok(fallback.some((chain) => chain.chainId === CUSTOM_CHAIN_ID));

  const enabled = resolveBridgeSourceChains(
    [{ chainId: CUSTOM_CHAIN_ID, name: "Socket Custom", sendingEnabled: true }],
    networksInfo as any,
  );
  assert.equal(
    enabled.find((chain) => chain.chainId === CUSTOM_CHAIN_ID)?.name,
    "Socket Custom",
  );

  const disabled = resolveBridgeSourceChains(
    [{ chainId: CUSTOM_CHAIN_ID, name: "Socket Custom", sendingEnabled: false }],
    networksInfo as any,
  );
  assert.equal(disabled.some((chain) => chain.chainId === CUSTOM_CHAIN_ID), false);

  const bankr = resolveBridgeSourceChains([], networksInfo as any, "bankr");
  assert.equal(bankr.some((chain) => chain.chainId === CUSTOM_CHAIN_ID), false);
});
