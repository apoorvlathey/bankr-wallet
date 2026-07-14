import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("network infrastructure has no legacy root implementations", async () => {
  const entries = await readdir(CHROME_ROOT, { withFileTypes: true });
  const legacyNames = new Set([
    "boundedHttpResponse.ts",
    "rpcHttpClient.ts",
    "safeRpcForwarding.ts",
    "networkStorage.ts",
    "proxyResolver.ts",
  ]);
  assert.deepEqual(
    entries
      .filter((entry) => entry.isFile() && legacyNames.has(entry.name))
      .map((entry) => entry.name),
    [],
  );

  const background = await source("background/composition/providerRoutes.ts");
  assert.match(background, /from "\.\.\/\.\.\/network\/networkMutations"/);
  assert.match(background, /from "\.\.\/\.\.\/network\/rpcClient"/);
  assert.match(background, /from "\.\.\/\.\.\/network\/safeRpcForwarding"/);
});

test("network implementations remain audit-sized with one-way dependencies", async () => {
  const budgets: Record<string, number> = {
    "network/boundedHttp.ts": 180,
    "network/rpcClient.ts": 380,
    "network/safeRpcForwarding.ts": 240,
    "network/proxyResolver.ts": 220,
    "network/customNetworkValidation.ts": 140,
    "network/networkRepository.ts": 70,
    "network/rpcHistoryRepository.ts": 110,
    "network/networkPolicy.ts": 80,
    "network/networkMutations.ts": 340,
  };
  for (const [path, maximum] of Object.entries(budgets)) {
    const moduleSource = await source(path);
    assert.ok(moduleSource.split("\n").length <= maximum, path);
    assert.doesNotMatch(
      moduleSource,
      /from ["']\.\.\/(?:boundedHttpResponse|rpcHttpClient|safeRpcForwarding|networkStorage|proxyResolver)["']/,
    );
  }

  assert.match(await source("network/rpcClient.ts"), /from "\.\/boundedHttp"/);
  assert.match(
    await source("network/safeRpcForwarding.ts"),
    /from "\.\/rpcClient"/,
  );
  assert.doesNotMatch(await source("network/networkPolicy.ts"), /chrome\.|fetch\(/);
  assert.doesNotMatch(
    await source("network/networkRepository.ts"),
    /fetch\(|rpcClient|customNetworkValidation/,
  );
  const mutations = await source("network/networkMutations.ts");
  assert.match(mutations, /from "\.\/customNetworkValidation"/);
  assert.match(mutations, /from "\.\/networkRepository"/);
  assert.match(mutations, /from "\.\/networkPolicy"/);
  assert.match(mutations, /from "\.\/rpcHistoryRepository"/);
  assert.match(mutations, /NETWORKS_INFO_LOCK_KEY/);
});

test("network source freezes egress and storage security constants", async () => {
  const bounded = await source("network/boundedHttp.ts");
  assert.match(bounded, /redirect: "error"/);
  assert.match(bounded, /credentials: "omit"/);
  assert.match(bounded, /referrerPolicy: "no-referrer"/);
  assert.match(bounded, /readResponseTextBounded/);
  assert.match(bounded, /HttpRequestTimeoutError/);

  const rpc = await source("network/rpcClient.ts");
  assert.match(rpc, /MAX_RPC_REQUEST_BYTES = 1_000_000/);
  assert.match(rpc, /MAX_RPC_RESPONSE_BYTES = 8_000_000/);
  assert.match(rpc, /MAX_CONCURRENT_RPC_REQUESTS = 24/);
  assert.match(rpc, /RPC transport target changed unexpectedly/);

  const forwarding = await source("network/safeRpcForwarding.ts");
  assert.match(forwarding, /MAX_CONCURRENT_RPC_REQUESTS = 16/);
  assert.match(forwarding, /AbortSignal\.timeout\(15_000\)/);
  assert.match(forwarding, /chrome\.storage\.sync\.get\("networksInfo"\)/);
  assert.doesNotMatch(forwarding, /eth_sendRawTransaction|personal_sign/);

  const repository = await source("network/networkRepository.ts");
  assert.match(repository, /"networksInfo"/);
  assert.match(repository, /"chainName"/);
  assert.match(repository, /NETWORKS_INFO_LOCK_KEY = "sync:networksInfo"/);

  const rpcHistory = await source("network/rpcHistoryRepository.ts");
  assert.match(rpcHistory, /chrome\.storage\.local/);
  assert.match(rpcHistory, /NETWORK_RPC_URLS_STORAGE_KEY/);

  const validation = await source("network/customNetworkValidation.ts");
  assert.match(validation, /trimmed\.length > 2_048/);
  assert.match(validation, /Number\.isSafeInteger\(chainId\)/);
  assert.match(validation, /Number\(nativeDecimals\) > 255/);
  assert.match(validation, /sanitizeCustomExplorerUrl/);
  assert.match(validation, /assertSecureRpcConfigurationUrl/);
  assert.match(validation, /assertRpcEndpointAllowedForOrigin/);
});
