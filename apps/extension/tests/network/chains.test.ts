import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAIN_REGISTRY,
  DEFAULT_NETWORKS,
  ZEROX_SUPPORTED_CHAIN_IDS,
} from "../../src/constants/chainRegistry";
import { getVisibleChains, normalizeNetworksInfo } from "../../src/lib/chains";

const DEFAULT_HIDDEN_CHAIN_NAMES = [
  "Blast",
  "Mantle",
  "Mode",
  "Scroll",
  "Sonic",
] as const;

test("low-usage chains are hidden when they have no stored entry", () => {
  const normalized = normalizeNetworksInfo(undefined);
  const visibleNames = new Set(getVisibleChains(undefined).map((chain) => chain.name));

  for (const name of DEFAULT_HIDDEN_CHAIN_NAMES) {
    assert.equal(normalized[name]?.hidden, true, `${name} should default hidden`);
    assert.equal(DEFAULT_NETWORKS[name]?.hidden, true, `${name} default should be persisted`);
    assert.equal(visibleNames.has(name), false, `${name} should not be queried as visible`);
  }
});

test("a stored visible choice overrides the registry default", () => {
  const storedBlast = {
    Blast: {
      chainId: DEFAULT_NETWORKS.Blast.chainId,
      rpcUrl: DEFAULT_NETWORKS.Blast.rpcUrl,
      hidden: undefined,
    },
  };

  const normalized = normalizeNetworksInfo(storedBlast);
  const visibleNames = new Set(getVisibleChains(storedBlast).map((chain) => chain.name));

  assert.equal(normalized.Blast.hidden, undefined);
  assert.equal(visibleNames.has("Blast"), true);
  assert.equal(normalized.Mantle.hidden, true, "missing default-hidden chains stay hidden");
});

test("swap support matches the official 0x Swap API table", () => {
  const expected = [
    1, 10, 56, 130, 137, 143, 146, 480, 999, 2741, 4217, 4663, 5000,
    8453, 9745, 42161, 43114, 57073, 59144, 80094, 534352,
  ];
  const registrySwapIds = CHAIN_REGISTRY.filter((chain) => chain.isSwapSupported)
    .map((chain) => chain.chainId)
    .sort((a, b) => a - b);

  assert.deepEqual(registrySwapIds, [...expected].sort((a, b) => a - b));
  assert.deepEqual(
    [...ZEROX_SUPPORTED_CHAIN_IDS].sort((a, b) => a - b),
    registrySwapIds,
  );
  assert.equal(
    ZEROX_SUPPORTED_CHAIN_IDS.has(81457),
    false,
    "Blast is not in the Swap API table",
  );
  assert.equal(
    ZEROX_SUPPORTED_CHAIN_IDS.has(34443),
    false,
    "Mode is cross-chain-only in 0x docs",
  );
});
