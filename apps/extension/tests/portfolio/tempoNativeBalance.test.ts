import assert from "node:assert/strict";
import test from "node:test";
import type { PortfolioToken } from "../../src/chrome/portfolio/api";
import { finalizePortfolioTokens } from "../../src/chrome/portfolio/catalogTransforms";
import { fetchOnchainBalances } from "../../src/chrome/portfolio/onchainBalances";

const TEMPO_SENTINEL = BigInt(
  "0x9612084f0316e0ebd5182f398e5195a51b5ca47667d4c9b26c9b26c9b26c9b2",
).toString();

const tempoNative: PortfolioToken = {
  symbol: "USD",
  name: "USD",
  contractAddress: "native",
  chainId: 4217,
  decimals: 6,
  balance: TEMPO_SENTINEL,
  balanceFormatted: TEMPO_SENTINEL,
  priceUsd: 1,
  valueUsd: Number(TEMPO_SENTINEL),
};

test("Tempo's eth_getBalance sentinel is removed from finalized catalogs", () => {
  const finalized = finalizePortfolioTokens([tempoNative], new Set(), {});
  assert.deepEqual(finalized.visibleTokens, []);
  assert.deepEqual([...finalized.allTokenKeys], []);
});

test("Tempo's eth_getBalance sentinel is never queried or verified", async () => {
  const result = await fetchOnchainBalances(
    "0x0000000000000000000000000000000000000001",
    [tempoNative],
    { preserveZeroBalanceTokens: true },
  );

  assert.deepEqual(result.tokens, []);
  assert.equal(result.totalValueUsd, 0);
  assert.deepEqual([...result.verifiedTokenKeys], []);
  assert.deepEqual(result.rpcIssueChainIds, []);
});

test("real Tempo TIP-20 balances remain eligible portfolio assets", () => {
  const tip20 = {
    ...tempoNative,
    symbol: "USDT",
    name: "USDT",
    contractAddress: "0x20c00000000000000000000014f22ca97301eb73",
    balance: "42.5",
    balanceFormatted: "42.5",
    valueUsd: 42.5,
  };
  const finalized = finalizePortfolioTokens([tip20], new Set(), {});
  assert.deepEqual(finalized.visibleTokens, [tip20]);
});
