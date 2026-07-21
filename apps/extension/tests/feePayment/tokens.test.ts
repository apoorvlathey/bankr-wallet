import assert from "node:assert/strict";
import test from "node:test";
import { isAddress } from "viem";

import {
  getFeePaymentTokens,
  getPimlicoFeeToken,
  getPimlicoUsdcAddress,
  PIMLICO_FEE_TOKENS_BY_CHAIN_ID,
} from "../../src/chrome/feePayment/tokens";
import { PIMLICO_FEE_TOKENS_BY_CHAIN_ID as PROXY_FEE_TOKENS_BY_CHAIN_ID } from "../../../website/app/api/gas/pimlico/[chainId]/tokens";

function normalizedCatalog(
  catalog: Readonly<Record<number, readonly string[]>>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(catalog).map(([chainId, addresses]) => [
      chainId,
      [...addresses].map((address) => address.toLowerCase()).sort(),
    ]),
  );
}

test("catalog addresses, decimals, limits, and per-chain membership are exact", () => {
  for (const [chainId, tokens] of Object.entries(PIMLICO_FEE_TOKENS_BY_CHAIN_ID)) {
    assert.ok(Number.isSafeInteger(Number(chainId)));
    assert.ok(tokens.length > 0);
    const addresses = new Set<string>();
    for (const token of tokens) {
      assert.equal(isAddress(token.address, { strict: true }), true);
      assert.ok(Number.isInteger(token.decimals) && token.decimals >= 0 && token.decimals <= 36);
      assert.ok(token.maximumGasCost > 0n);
      assert.equal(addresses.has(token.address.toLowerCase()), false);
      addresses.add(token.address.toLowerCase());
    }
  }
});

test("extension and proxy fee-token address catalogs stay synchronized", () => {
  const extensionCatalog = Object.fromEntries(
    Object.entries(PIMLICO_FEE_TOKENS_BY_CHAIN_ID).map(([chainId, tokens]) => [
      chainId,
      tokens.map((token) => token.address),
    ]),
  );
  assert.deepEqual(
    normalizedCatalog(extensionCatalog),
    normalizedCatalog(PROXY_FEE_TOKENS_BY_CHAIN_ID),
  );
});

test("offers the exact Base fee-token catalog", () => {
  assert.deepEqual(
    getFeePaymentTokens(8453).map((token) => [token.kind, token.symbol]),
    [
      ["native", "ETH"],
      ["erc20", "USDC"],
      ["erc20", "USDT"],
    ],
  );
  assert.equal(
    getPimlicoUsdcAddress(8453),
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  );
});

test("adds requested tokens only on their exact chains", () => {
  assert.deepEqual(
    getFeePaymentTokens(4326).map((token) => token.symbol),
    ["ETH", "USDm", "USDT0"],
  );
  assert.deepEqual(
    getFeePaymentTokens(143).map((token) => token.symbol),
    ["MON", "USDC", "WMON"],
  );
  assert.deepEqual(
    getFeePaymentTokens(10).map((token) => token.symbol),
    ["ETH", "USDC", "USDC.e", "USDT", "stETH", "wstETH"],
  );
});

test("includes every live-quoted USDC testnet and rejects cross-chain addresses", () => {
  for (const chainId of [80002, 84532, 11155111, 11155420, 421614]) {
    assert.equal(getFeePaymentTokens(chainId)[1]?.symbol, "USDC");
  }
  assert.equal(
    getPimlicoUsdcAddress(84532),
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  );
  assert.equal(
    getPimlicoFeeToken(8453, "0xdAC17F958D2ee523a2206206994597C13D831ec7"),
    null,
  );
});

test("keeps chains without a Pimlico catalog on native payment only", () => {
  assert.deepEqual(getFeePaymentTokens(130).map((token) => token.symbol), ["ETH"]);
  assert.equal(getPimlicoUsdcAddress(130), null);
});

test("returns no options for an unknown chain", () => {
  assert.deepEqual(getFeePaymentTokens(999_999_999), []);
});
