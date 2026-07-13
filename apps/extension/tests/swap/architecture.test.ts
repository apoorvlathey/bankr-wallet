import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as constants from "../../src/chrome/swap/constants";
import * as erc20 from "../../src/chrome/swap/erc20";
import * as permit2 from "../../src/chrome/swap/permit2";
import * as quotes from "../../src/chrome/swap/quotes";
import * as tokenInfo from "../../src/chrome/swap/tokenInfo";
import * as tokenList from "../../src/chrome/swap/tokenList";
import * as tokenLogo from "../../src/chrome/swap/tokenLogo";
import * as tokenPrice from "../../src/chrome/swap/tokenPrice";
import * as facade from "../../src/chrome/swapApi";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("swap compatibility facade preserves every public runtime identity", () => {
  assert.equal(facade.NATIVE_TOKEN_ADDRESS, constants.NATIVE_TOKEN_ADDRESS);
  assert.equal(facade.DEFAULT_SLIPPAGE_BPS, constants.DEFAULT_SLIPPAGE_BPS);
  assert.equal(facade.SLIPPAGE_PRESETS, constants.SLIPPAGE_PRESETS);
  assert.equal(facade.fetchSwapPrice, quotes.fetchSwapPrice);
  assert.equal(facade.fetchSwapQuote, quotes.fetchSwapQuote);
  assert.equal(facade.fetchTokenInfo, tokenInfo.fetchTokenInfo);
  assert.equal(facade.getCachedTokenList, tokenList.getCachedTokenList);
  assert.equal(facade.getCachedTokenLogo, tokenLogo.getCachedTokenLogo);
  assert.equal(facade.fetchTokenPrice, tokenPrice.fetchTokenPrice);
  assert.equal(facade.getTokenBalanceWei, erc20.getTokenBalanceWei);
  assert.equal(facade.checkTokenAllowance, erc20.checkTokenAllowance);
  assert.equal(facade.buildApprovalTx, erc20.buildApprovalTx);
  assert.equal(facade.checkPermit2Allowance, permit2.checkPermit2Allowance);
  assert.equal(facade.buildPermit2ApproveTx, permit2.buildPermit2ApproveTx);
});

test("swap facade contains no effects or business policy", async () => {
  const text = await source("swapApi.ts");
  assert.ok(text.split("\n").length <= 25);
  assert.doesNotMatch(
    text,
    /\b(?:function|fetch|chrome\.|createPublicClient|encodeFunctionData|Map)\b/,
  );
});

test("swap dependency direction isolates transport, cache policy, and RPC", async () => {
  const transport = await source("swap/transport.ts");
  assert.match(transport, /from ["']\.\.\/network\/boundedHttp["']/);

  const quotesSource = await source("swap/quotes.ts");
  assert.match(quotesSource, /from ["']\.\/transport["']/);
  assert.doesNotMatch(quotesSource, /chrome\.|createPublicClient|txHandlers/);

  const listPolicy = await source("swap/tokenListPolicy.ts");
  assert.doesNotMatch(
    listPolicy,
    /\b(?:chrome\.|fetch|createPublicClient|readContract|txHandlers)\b/,
  );

  const rpcClient = await source("swap/rpcClient.ts");
  assert.match(rpcClient, /from ["']\.\.\/network\/rpcClient["']/);
  assert.match(rpcClient, /from ["']\.\.\/txHandlers["']/);
  for (const leaf of ["swap/erc20.ts", "swap/permit2.ts", "swap/tokenInfo.ts"]) {
    const text = await source(leaf);
    assert.match(text, /from ["']\.\/rpcClient["']/, leaf);
    assert.doesNotMatch(text, /from ["']\.\.\/txHandlers["']/, leaf);
  }
});

test("swap modules remain independently auditable", async () => {
  const budgets: Record<string, number> = {
    "swap/types.ts": 100,
    "swap/constants.ts": 25,
    "swap/transport.ts": 45,
    "swap/quotes.ts": 70,
    "swap/rpcClient.ts": 25,
    "swap/erc20.ts": 65,
    "swap/permit2.ts": 85,
    "swap/tokenInfo.ts": 120,
    "swap/tokenListPolicy.ts": 45,
    "swap/tokenList.ts": 65,
    "swap/tokenLogo.ts": 70,
    "swap/tokenPrice.ts": 40,
  };
  for (const [path, maximum] of Object.entries(budgets)) {
    const lines = (await source(path)).split("\n").length;
    assert.ok(lines <= maximum, `${path}: ${lines} > ${maximum}`);
  }
});
