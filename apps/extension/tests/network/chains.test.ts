import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_NETWORKS } from "../../src/constants/chainRegistry";
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
