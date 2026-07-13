import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const removedRootFiles = new Set([
  "accountRemovalDappPrivacy.ts",
  "dappAccountScope.ts",
  "dappConnectionHandlers.ts",
  "dappRequestPolicy.ts",
  "dappRpcForwarding.ts",
]);

const readDappModule = (name: string) =>
  readFile(new URL(`../../src/chrome/dapp/${name}`, import.meta.url), "utf8");

test("dapp authorization implementations have one audit folder and no root family", async () => {
  const rootEntries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  assert.deepEqual(
    rootEntries
      .filter((entry) => entry.isFile() && removedRootFiles.has(entry.name))
      .map((entry) => entry.name),
    [],
  );

  const domainEntries = await readdir(
    new URL("../../src/chrome/dapp/", import.meta.url),
    { withFileTypes: true },
  );
  for (const entry of domainEntries.filter(
    (candidate) => candidate.isFile() && candidate.name.endsWith(".ts"),
  )) {
    const source = await readDappModule(entry.name);
    assert.ok(
      source.split(/\r?\n/).length <= 400,
      `${entry.name} exceeds the dapp audit ceiling`,
    );
  }
});

test("dapp account authorization uses only top-level exact Chrome origins", async () => {
  const [policy, scope] = await Promise.all([
    readDappModule("requestPolicy.ts"),
    readDappModule("accountScope.ts"),
  ]);
  assert.match(policy, /sender\.frameId !== undefined && sender\.frameId !== 0/);
  assert.match(policy, /typeof sender\.tab\?\.id !== "number"/);
  assert.match(policy, /normalizeDappOrigin\(sender\.origin \|\| sender\.url\)/);
  assert.match(policy, /normalizeDappOrigin\(sender\.tab\.url\)/);
  assert.match(policy, /tabOrigin && tabOrigin !== origin/);
  assert.match(policy, /getDappPermission\(trusted\.origin\)/);
  assert.doesNotMatch(policy, /message\.(?:origin|url)/);

  assert.match(scope, /getDappPermission\(origin\)/);
  assert.match(scope, /getPendingDappConnectionRequests\(\)/);
  assert.match(scope, /request\.tabId === tabId/);
});

test("account removal revokes visibility before deleting account metadata", async () => {
  const [privacy, handlers] = await Promise.all([
    readDappModule("accountRemovalPrivacy.ts"),
    readDappModule("connectionHandlers.ts"),
  ]);
  const boundary = privacy.slice(
    privacy.indexOf("export async function removeAccountWithDappPrivacyBoundary"),
  );
  const validate = boundary.indexOf("validateRemoval");
  const disconnect = boundary.indexOf("disconnectDappsMappedToRemovedAccount");
  const remove = boundary.indexOf("options.removeAccount()");
  assert.ok(validate >= 0 && validate < disconnect && disconnect < remove);
  assert.match(privacy, /removePendingDappConnectionRequests\(/);
  assert.match(privacy, /dappConnectionResult:/);
  assert.match(privacy, /for \(const origin of connectedOrigins\)[\s\S]*await revokeOrigin\(origin\)/);

  const revoke = handlers.slice(
    handlers.indexOf("export async function handleRevokeDappPermission"),
    handlers.indexOf("export async function handleGetDappConnectionContext"),
  );
  const begin = revoke.indexOf("beginDappOriginRevocation");
  const permission = revoke.indexOf("revokeDappPermission");
  const pending = revoke.indexOf("cancelPendingRequestsForDappOrigin");
  const finish = revoke.indexOf("finishDappOriginRevocation");
  assert.ok(begin >= 0 && begin < permission && permission < pending);
  assert.ok(pending < finish);
  assert.match(revoke, /clearTabAccount\(tab\.id\)/);
});

test("page-discovered RPC forwarding stays bounded and read-only", async () => {
  const forwarding = await readDappModule("rpcForwarding.ts");
  assert.match(forwarding, /DAPP_RPC_FORWARD_TIMEOUT_MS = 3000/);
  assert.match(forwarding, /DAPP_RPC_PROBE_TIMEOUT_MS = 2000/);
  assert.match(forwarding, /MAX_TRACKED_DAPP_RPC_URLS = 8/);
  for (const method of [
    "eth_sendTransaction",
    "eth_sendRawTransaction",
    "eth_sign",
    "personal_sign",
    "wallet_switchEthereumChain",
    "eth_getTransactionCount",
    "eth_getCode",
    "eth_estimateGas",
    "eth_newFilter",
  ]) {
    assert.doesNotMatch(
      forwarding.slice(
        forwarding.indexOf("DAPP_RPC_FORWARDABLE_METHODS"),
        forwarding.indexOf("const discoveredDappRpcUrls"),
      ),
      new RegExp(`"${method}"`),
    );
  }
  assert.match(forwarding, /if \(!isForwardableDappRpcMethod\(method\)\)[\s\S]*forwarded: false/);
  assert.match(forwarding, /catch \{[\s\S]*return \{ forwarded: false \}/);
});

test("background, requests, account resolver, and provider compose direct dapp paths", async () => {
  const [accountComposition, providerComposition, lifecycle, resolver, provider] = await Promise.all([
    readFile(
      new URL("../../src/chrome/background/composition/accountRoutes.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/chrome/background/composition/providerRoutes.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/requests/pendingRequestLifecycle.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../src/chrome/accounts/tabResolver.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/chrome/provider/inpage/provider.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(accountComposition, /from ["']\.\.\/\.\.\/dapp\/connectionHandlers["']/);
  assert.match(providerComposition, /from ["']\.\.\/\.\.\/dapp\/requestPolicy["']/);
  assert.match(accountComposition, /from ["']\.\.\/\.\.\/dapp\/accountRemovalPrivacy["']/);
  assert.match(lifecycle, /from ["']\.\.\/dapp\/requestPolicy["']/);
  assert.match(resolver, /from ["']\.\.\/dapp\/accountScope["']/);
  assert.match(provider, /from ["']\.\.\/\.\.\/dapp\/rpcForwarding["']/);
});
