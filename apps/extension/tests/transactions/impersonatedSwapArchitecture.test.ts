import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readTransactionSource = (file: string) =>
  readFile(
    new URL(`../../src/chrome/transactions/${file}`, import.meta.url),
    "utf8",
  );

test("direct swap routing keeps all wallet types explicit", async () => {
  const direct = await readTransactionSource("swaps/direct.ts");

  assert.match(direct, /account\.type === "impersonator"[\s\S]*?executeImpersonatedSwap/u);
  assert.match(direct, /account\.type === "bankr"/u);
  assert.match(direct, /account\.type !== "privateKey" && account\.type !== "seedPhrase"/u);
  assert.match(direct, /Unsupported account type/u, "Ledger remains blocked");
});

test("impersonated swaps recheck endpoint and account at the RPC boundary", async () => {
  const source = await readTransactionSource("swaps/impersonated.ts");

  assert.match(source, /withStorageLock\([\s\S]*?NETWORKS_INFO_LOCK_KEY/u);
  assert.match(
    source,
    /allowsImpersonatedTransactions\([\s\S]*?chain\.rpcUrl/u,
  );
  assert.match(source, /assertLocalAccountEffectBinding\(account\)/u);
  assert.match(source, /"eth_sendTransaction"/u);
  assert.match(source, /reviewedImpersonatedRpcTransaction/u);
  assert.doesNotMatch(source, /eth_sendRawTransaction/u);
});
