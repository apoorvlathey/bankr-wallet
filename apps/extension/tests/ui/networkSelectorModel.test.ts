import assert from "node:assert/strict";
import test from "node:test";
import { sortNetworkSelectorOptions } from "../../src/components/shared/NetworkSelector/model";

test("shared network selector orders funded chains by value before the unfunded group", () => {
  const sorted = sortNetworkSelectorOptions([
    { chainId: 1, name: "Ethereum", balanceUsd: 0 },
    { chainId: 42161, name: "Arbitrum", balanceUsd: 12 },
    { chainId: 8453, name: "Base", balanceUsd: 32 },
    { chainId: 137, name: "Polygon", balanceUsd: 4 },
  ]);

  assert.deepEqual(
    sorted.map((network) => network.name),
    ["Base", "Arbitrum", "Polygon", "Ethereum"],
  );
});

test("shared network selector keeps unknown-price funded chains ahead of Ethereum", () => {
  const sorted = sortNetworkSelectorOptions([
    { chainId: 10, name: "Optimism" },
    { chainId: 1, name: "Ethereum" },
    { chainId: 8453, name: "Base", isFunded: true },
    { chainId: 42161, name: "Arbitrum" },
  ]);

  assert.deepEqual(
    sorted.map((network) => network.name),
    ["Base", "Ethereum", "Arbitrum", "Optimism"],
  );
});
