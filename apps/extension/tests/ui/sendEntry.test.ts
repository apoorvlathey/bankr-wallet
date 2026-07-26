import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { PortfolioToken } from "../../src/chrome/portfolio/api";
import {
  HOME_SEND_CHAIN_ID,
  resolveSendEntryToken,
} from "../../src/components/Transfer/model/sendEntry";

test("homepage Send defaults to Ethereum ETH", () => {
  const token = resolveSendEntryToken(null);

  assert.equal(HOME_SEND_CHAIN_ID, 1);
  assert.equal(token.chainId, 1);
  assert.equal(token.contractAddress, "native");
  assert.equal(token.symbol, "ETH");
  assert.equal(token.decimals, 18);
});

test("asset-row Send preserves the clicked chain and token", () => {
  const clickedToken: PortfolioToken = {
    chainId: 42161,
    contractAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    balance: "12.5",
    balanceFormatted: "12.5",
    priceUsd: 1,
    valueUsd: 12.5,
  };

  assert.equal(resolveSendEntryToken(clickedToken), clickedToken);
});

test("homepage and asset-row actions use their distinct Send entries", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");

  assert.match(
    app,
    /activeAccount\?\.type !== "safe"[\s\S]{0,500}?onSend=\{\(\) => \{\s*setTransferToken\(resolveSendEntryToken\(null, networksInfo\)\)/u,
  );
  assert.match(
    app,
    /<SafeHomeQuickActions[\s\S]{0,300}?onSend=\{\(\) => \{\s*setTransferToken\(null\)/u,
  );
  assert.match(
    app,
    /onTokenClick=\{\(token\) => \{[\s\S]*?setTransferToken\(resolveSendEntryToken\(token, networksInfo\)\)/u,
  );
});
