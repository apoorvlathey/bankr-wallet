import assert from "node:assert/strict";
import test from "node:test";

import {
  getChainEntriesForTab,
  getChainVisibilityCounts,
} from "../../src/components/Settings/chainsModel";

const networksInfo = {
  Ethereum: { chainId: 1, rpcUrl: "https://eth.drpc.org" },
  "Base Sepolia": {
    chainId: 84532,
    rpcUrl: "https://base-sepolia.drpc.org",
    hidden: true,
  },
  Local: {
    chainId: 31337,
    rpcUrl: "http://localhost:8545",
    isCustom: true,
  },
};

test("chain list tabs separate visible and hidden networks", () => {
  assert.deepEqual(getChainVisibilityCounts(networksInfo), { active: 2, hidden: 1 });
  assert.deepEqual(
    getChainEntriesForTab({
      networksInfo,
      activeChainName: "Ethereum",
      visibilityTab: "active",
      search: "",
    }).map(([name]) => name),
    ["Ethereum", "Local"],
  );
  assert.deepEqual(
    getChainEntriesForTab({
      networksInfo,
      activeChainName: "Ethereum",
      visibilityTab: "hidden",
      search: "",
    }).map(([name]) => name),
    ["Base Sepolia"],
  );
});

test("chain search stays scoped to the selected visibility tab", () => {
  assert.deepEqual(
    getChainEntriesForTab({
      networksInfo,
      activeChainName: null,
      visibilityTab: "hidden",
      search: "84532",
    }).map(([name]) => name),
    ["Base Sepolia"],
  );
  assert.deepEqual(
    getChainEntriesForTab({
      networksInfo,
      activeChainName: null,
      visibilityTab: "active",
      search: "base-sepolia.drpc.org",
    }),
    [],
  );
});
