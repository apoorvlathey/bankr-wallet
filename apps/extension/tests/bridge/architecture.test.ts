import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("bridge root paths preserve implementation export identities", async () => {
  const [apiFacade, chainsFacade, pollerFacade] = await Promise.all([
    import("../../src/chrome/bridgeApi"),
    import("../../src/chrome/bridgeChainsResolver"),
    import("../../src/chrome/bridgeStatusPoller"),
  ]);
  const [client, cache, resolver, policy, polling] = await Promise.all([
    import("../../src/chrome/bridge/client"),
    import("../../src/chrome/bridge/catalogCache"),
    import("../../src/chrome/bridge/chainResolver"),
    import("../../src/chrome/bridge/chainPolicy"),
    import("../../src/chrome/bridge/statusPolling"),
  ]);

  for (const name of ["fetchBridgeQuote", "fetchBridgeStatus"] as const) {
    assert.equal(apiFacade[name], client[name], name);
  }
  for (const name of [
    "getCachedBungeeChains",
    "getCachedBungeeTokens",
    "isNativeToken",
  ] as const) {
    assert.equal(apiFacade[name], cache[name], name);
  }
  for (const name of [
    "getBridgeDestinationChains",
    "getBridgeSourceChains",
  ] as const) {
    assert.equal(chainsFacade[name], resolver[name], name);
  }
  assert.equal(chainsFacade.getRegistryEntry, policy.getRegistryEntry);
  for (const name of [
    "maybeStartBridgePolling",
    "resumePendingBridgePollers",
    "startBridgeStatusPolling",
  ] as const) {
    assert.equal(pollerFacade[name], polling[name], name);
  }
});

test("bridge modules retain one-way effect boundaries", async () => {
  const names = [
    "bridge/types.ts",
    "bridge/client.ts",
    "bridge/catalogPolicy.ts",
    "bridge/catalogCache.ts",
    "bridge/chainPolicy.ts",
    "bridge/chainResolver.ts",
    "bridge/statusNotification.ts",
    "bridge/statusApplication.ts",
    "bridge/statusPolling.ts",
  ];
  const sources = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readModule(name)] as const),
    ),
  );
  for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(
      source,
      /from ["']\.\.\/(?:bridgeApi|bridgeChainsResolver|bridgeStatusPoller)["']/,
      `${name} must not import a compatibility facade`,
    );
  }

  assert.match(sources["bridge/client.ts"], /from ["']\.\.\/network\/boundedHttp["']/);
  assert.doesNotMatch(sources["bridge/client.ts"], /chrome\.|pendingBridge|getTxById/);
  assert.doesNotMatch(sources["bridge/catalogPolicy.ts"], /chrome\.|fetch\(/);
  assert.match(sources["bridge/catalogCache.ts"], /from ["']\.\/client["']/);
  assert.doesNotMatch(sources["bridge/catalogCache.ts"], /pendingBridge|getTxById/);
  assert.doesNotMatch(sources["bridge/chainPolicy.ts"], /chrome\.|fetch\(|fetchBridge/);
  assert.match(sources["bridge/chainResolver.ts"], /from ["']\.\/chainPolicy["']/);
  assert.match(sources["bridge/chainResolver.ts"], /from ["']\.\/catalogCache["']/);
  assert.doesNotMatch(sources["bridge/chainResolver.ts"], /chrome\.|fetch\(/);
  assert.doesNotMatch(sources["bridge/statusNotification.ts"], /fetchBridgeStatus|removePendingBridge/);
  assert.match(sources["bridge/statusApplication.ts"], /from ["']\.\/client["']/);
  assert.match(sources["bridge/statusApplication.ts"], /from ["']\.\/statusNotification["']/);
  assert.doesNotMatch(sources["bridge/statusApplication.ts"], /setTimeout|startBridgeStatusPolling/);
  assert.match(sources["bridge/statusPolling.ts"], /from ["']\.\/statusApplication["']/);
  assert.doesNotMatch(sources["bridge/statusPolling.ts"], /fetchBridgeStatus|showNotification/);
});

test("bridge facades and implementations stay audit-sized", async () => {
  const budgets: Record<string, number> = {
    "bridgeApi.ts": 20,
    "bridgeChainsResolver.ts": 15,
    "bridgeStatusPoller.ts": 15,
    "bridge/types.ts": 20,
    "bridge/client.ts": 130,
    "bridge/catalogPolicy.ts": 50,
    "bridge/catalogCache.ts": 170,
    "bridge/chainPolicy.ts": 110,
    "bridge/chainResolver.ts": 40,
    "bridge/statusNotification.ts": 110,
    "bridge/statusApplication.ts": 140,
    "bridge/statusPolling.ts": 110,
  };
  for (const [name, maximum] of Object.entries(budgets)) {
    const source = await readModule(name);
    assert.ok(source.split("\n").length <= maximum, name);
  }
  for (const name of [
    "bridgeApi.ts",
    "bridgeChainsResolver.ts",
    "bridgeStatusPoller.ts",
  ]) {
    const source = await readModule(name);
    assert.match(source, /compatibility facade/i);
    assert.doesNotMatch(source, /\b(?:async )?function\b|chrome\.|fetch\(/);
  }

  const rootEntries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
  );
  assert.deepEqual(
    rootEntries.filter((name) => /^bridge(?:Api|ChainsResolver|StatusPoller)\.ts$/.test(name)).sort(),
    ["bridgeApi.ts", "bridgeChainsResolver.ts", "bridgeStatusPoller.ts"],
  );
  assert.match(await readModule("bridge/README.md"), /Review in\s+dependency order/);
});
