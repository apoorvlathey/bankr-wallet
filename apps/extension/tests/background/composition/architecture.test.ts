import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const CHROME_ROOT = new URL("../../../src/chrome/", import.meta.url);
const BACKGROUND_ROOT = new URL("background/", CHROME_ROOT);
const COMPOSITION_ROOT = new URL("composition/", BACKGROUND_ROOT);

const ROUTER_MESSAGE_MANIFESTS = {
  "accountManagementRouter.ts":
    "BACKGROUND_ACCOUNT_MANAGEMENT_MESSAGE_TYPES",
  "accountStateRouter.ts": "BACKGROUND_ACCOUNT_STATE_MESSAGE_TYPES",
  "authRouter.ts": "BACKGROUND_AUTH_MESSAGE_TYPES",
  "bankrCredentialRouter.ts": "BACKGROUND_BANKR_CREDENTIAL_MESSAGE_TYPES",
  "batchRequestRouter.ts": "BACKGROUND_BATCH_REQUEST_MESSAGE_TYPES",
  "chainPromptRouter.ts": "BACKGROUND_CHAIN_PROMPT_MESSAGE_TYPES",
  "chatRouter.ts": "BACKGROUND_CHAT_MESSAGE_TYPES",
  "clearSigningRouter.ts": "BACKGROUND_CLEAR_SIGNING_MESSAGE_TYPES",
  "crossDappBatchRouter.ts": "BACKGROUND_CROSS_DAPP_BATCH_MESSAGE_TYPES",
  "dappPermissionRouter.ts": "BACKGROUND_DAPP_PERMISSION_MESSAGE_TYPES",
  "delegationRouter.ts": "BACKGROUND_DELEGATION_MESSAGE_TYPES",
  "erc7715PermissionRouter.ts":
    "BACKGROUND_ERC7715_PERMISSION_MESSAGE_TYPES",
  "gasSimulationRouter.ts": "BACKGROUND_GAS_SIMULATION_MESSAGE_TYPES",
  "onboardingRouter.ts": "BACKGROUND_ONBOARDING_MESSAGE_TYPES",
  "providerRpcRouter.ts": "BACKGROUND_PROVIDER_RPC_MESSAGE_TYPES",
  "resetRouter.ts": "BACKGROUND_RESET_MESSAGE_TYPES",
  "secretManagementRouter.ts": "BACKGROUND_SECRET_MANAGEMENT_MESSAGE_TYPES",
  "settingsRouter.ts": "BACKGROUND_SETTINGS_MESSAGE_TYPES",
  "signingRequestRouter.ts": "BACKGROUND_SIGNING_REQUEST_MESSAGE_TYPES",
  "sponsoredTransferRouter.ts":
    "BACKGROUND_SPONSORED_TRANSFER_MESSAGE_TYPES",
  "swapBridgeDataRouter.ts": "BACKGROUND_SWAP_BRIDGE_DATA_MESSAGE_TYPES",
  "swapExecutionRouter.ts": "BACKGROUND_SWAP_EXECUTION_MESSAGE_TYPES",
  "tokenDataRouter.ts": "BACKGROUND_TOKEN_DATA_MESSAGE_TYPES",
  "transactionExecutionRouter.ts":
    "BACKGROUND_TRANSACTION_EXECUTION_MESSAGE_TYPES",
  "transactionStatusRouter.ts": "BACKGROUND_TRANSACTION_STATUS_MESSAGE_TYPES",
  "walletConnectSessionRouter.ts":
    "BACKGROUND_WALLETCONNECT_SESSION_MESSAGE_TYPES",
  "watchAssetRouter.ts": "BACKGROUND_WATCH_ASSET_MESSAGE_TYPES",
} as const;

async function source(url: URL): Promise<string> {
  return readFile(url, "utf8");
}

test("MV3 entrypoint invokes only the focused bootstrap", async () => {
  const entrypoint = await source(new URL("background.ts", CHROME_ROOT));
  assert.ok(entrypoint.split("\n").length <= 30);
  assert.match(
    entrypoint,
    /import \{ bootstrapBackground \} from "\.\/background\/bootstrap";/,
  );
  assert.match(entrypoint, /bootstrapBackground\(\);/);
  assert.doesNotMatch(entrypoint, /\bchrome\.|createBackground|addListener|storage|session|walletConnect/i);
  assert.equal([...entrypoint.matchAll(/^import /gm)].length, 1);
});

test("bootstrap contains composition only and preserves construction order", async () => {
  const bootstrap = await source(new URL("bootstrap.ts", BACKGROUND_ROOT));
  assert.ok(bootstrap.split("\n").length <= 30);
  assert.doesNotMatch(bootstrap, /\bchrome\.|addListener|storage|session|walletConnect/i);
  const ordered = [
    "composeBackgroundRoutes()",
    "createBackgroundMessagePipeline(routes)",
    "registerBackgroundLifecycle(onMessage)",
  ].map((needle) => bootstrap.indexOf(needle));
  assert.ok(ordered.every((index) => index >= 0));
  assert.deepEqual(ordered, [...ordered].sort((a, b) => a - b));
  assert.equal([...bootstrap.matchAll(/^import /gm)].length, 3);
});

test("message pipeline freezes every gate and route in released order", async () => {
  const pipelineSource = await source(
    new URL("messagePipeline.ts", BACKGROUND_ROOT),
  );
  const pipeline = pipelineSource.slice(
    pipelineSource.indexOf("return (message, sender, sendResponse)"),
  );
  const ordered = [
    "handleEnsBrowsingMessage",
    "classifyBackgroundMessage",
    "validateExternalProviderMessage",
    "rejectExternalProviderRequestDuringErc7715Lock",
    "routeBackgroundAuthMessage",
    "routeBackgroundBankrCredentialMessage",
    "routeBackgroundOnboardingMessage",
    "routeBackgroundAccountStateMessage",
    "routeBackgroundSettingsMessage",
    "routeBackgroundDappPermissionMessage",
    "routeBackgroundProviderRpcMessage",
    "routeBackgroundWalletConnectSessionMessage",
    "routeBackgroundWatchAssetMessage",
    "routeBackgroundChainPromptMessage",
    "routeBackgroundSigningRequestMessage",
    "routeBackgroundTransactionExecutionMessage",
    "routeBackgroundSwapExecutionMessage",
    "routeBackgroundSponsoredTransferMessage",
    "routeBackgroundTransactionStatusMessage",
    "routeBackgroundAccountManagementMessage",
    "routeBackgroundSecretManagementMessage",
    "routeBackgroundBatchRequestMessage",
    "routeBackgroundDelegationMessage",
    "routeBackgroundCrossDappBatchMessage",
    "routeBackgroundErc7715PermissionMessage",
    "routeBackgroundGasSimulationMessage",
    "routeBackgroundSwapBridgeDataMessage",
    "routeBackgroundTokenDataMessage",
    "routeBackgroundChatMessage",
    "routeBackgroundClearSigningMessage",
    "routeBackgroundResetMessage",
    "Unknown message type",
  ].map((needle) => pipeline.indexOf(needle));
  assert.ok(ordered.every((index) => index >= 0));
  assert.deepEqual(ordered, [...ordered].sort((a, b) => a - b));
  assert.match(pipeline, /audience !== "provider"[\s\S]*"Unauthorized"/);
  assert.match(pipeline, /validation\.error \|\| "Invalid provider request"[\s\S]*-32602/);
  assert.doesNotMatch(
    pipelineSource.replaceAll("chrome.runtime.MessageSender", ""),
    /\bchrome\.|from ["'][^"']*(?:session|vault|storageLock|transactions\/)/,
  );
});

test("every background router dispatch exactly matches its reviewed message manifest", async () => {
  const entries = await readdir(BACKGROUND_ROOT, { withFileTypes: true });
  const routerNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith("Router.ts"))
    .map((entry) => entry.name)
    .sort();
  const reviewedRouterNames = Object.keys(ROUTER_MESSAGE_MANIFESTS).sort();
  assert.deepEqual(
    routerNames,
    reviewedRouterNames,
    "adding or removing a router requires an explicit manifest review",
  );

  for (const routerName of reviewedRouterNames) {
    const routerSource = await source(new URL(routerName, BACKGROUND_ROOT));
    const manifestName =
      ROUTER_MESSAGE_MANIFESTS[
        routerName as keyof typeof ROUTER_MESSAGE_MANIFESTS
      ];
    const manifestDeclarations = [
      ...routerSource.matchAll(
        /export const (BACKGROUND_[A-Z0-9_]+_MESSAGE_TYPES)\s*=/g,
      ),
    ].map((match) => match[1]);
    assert.deepEqual(
      manifestDeclarations,
      [manifestName],
      `${routerName} must export exactly its reviewed message manifest`,
    );

    const escapedManifestName = manifestName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const manifestMatch = routerSource.match(
      new RegExp(
        `export const ${escapedManifestName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`,
      ),
    );
    assert.ok(manifestMatch, `${routerName} must define ${manifestName}`);
    const manifestTypes = [
      ...manifestMatch[1].matchAll(/["']([^"']+)["']/g),
    ].map((match) => match[1]);
    assert.equal(
      new Set(manifestTypes).size,
      manifestTypes.length,
      `${manifestName} must not contain duplicate message types`,
    );

    const caseTypes = [
      ...routerSource.matchAll(/case\s+["']([^"']+)["']\s*:/g),
    ].map((match) => match[1]);
    const singleRouteGuardTypes = [
      ...routerSource.matchAll(
        /if\s*\(\s*message\??\.type\s*(?:!==|===)\s*["']([^"']+)["']/g,
      ),
    ].map((match) => match[1]);
    const dispatchedTypes = [
      ...new Set([...caseTypes, ...singleRouteGuardTypes]),
    ];
    assert.ok(
      dispatchedTypes.length > 0,
      `${routerName} must expose a literal case or single-route type guard`,
    );
    assert.deepEqual(
      dispatchedTypes.sort(),
      [...manifestTypes].sort(),
      `${routerName} dispatch and ${manifestName} must remain exact`,
    );
  }
});

test("route-family composition is complete, audit-sized, and acyclic", async () => {
  const entries = await readdir(COMPOSITION_ROOT, { withFileTypes: true });
  const moduleNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(moduleNames, [
    "accountRoutes.ts",
    "advancedRoutes.ts",
    "dataRoutes.ts",
    "executionRoutes.ts",
    "identityRoutes.ts",
    "lifecycle.ts",
    "pendingResolution.ts",
    "providerContext.ts",
    "providerRoutes.ts",
    "routes.ts",
  ]);

  const sources = new Map<string, string>();
  for (const name of moduleNames) {
    const moduleSource = await source(new URL(name, COMPOSITION_ROOT));
    sources.set(name, moduleSource);
    assert.ok(moduleSource.split("\n").length <= 400, name);
    assert.doesNotMatch(moduleSource, /from ["']\.\.\/\.\.\/background["']/, name);
  }

  const edges = new Map<string, string[]>();
  for (const [name, moduleSource] of sources) {
    const imports = [...moduleSource.matchAll(/from ["']\.\/(.+?)["']/g)]
      .map((match) => `${match[1]}.ts`)
      .filter((target) => sources.has(target));
    edges.set(name, imports);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (name: string): void => {
    assert.ok(!visiting.has(name), `composition import cycle at ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const target of edges.get(name) ?? []) visit(target);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of moduleNames) visit(name);

  const aggregate = sources.get("routes.ts") ?? "";
  for (const constructor of [
    "composeIdentityRoutes",
    "composeAccountRoutes",
    "composeProviderRoutes",
    "composeExecutionRoutes",
    "composeAdvancedRoutes",
    "composeDataRoutes",
  ]) {
    assert.equal([...aggregate.matchAll(new RegExp(`${constructor}\\(`, "g"))].length, 1);
  }
});

test("background layers cannot import upward into bootstrap or composition", async () => {
  const chromeFiles: Array<{ name: string; url: URL }> = [];
  const visitDirectory = async (directory: URL, prefix = ""): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const name = `${prefix}${entry.name}`;
      const url = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        await visitDirectory(new URL(`${entry.name}/`, directory), `${name}/`);
      } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        chromeFiles.push({ name, url });
      }
    }
  };
  await visitDirectory(CHROME_ROOT);

  const compositionPath = COMPOSITION_ROOT.pathname;
  const bootstrapPath = new URL("bootstrap", BACKGROUND_ROOT).pathname;
  const pipelinePath = new URL("messagePipeline", BACKGROUND_ROOT).pathname;
  const routesPath = new URL("composition/routes", BACKGROUND_ROOT).pathname;
  const normalizeTarget = (specifier: string, importer: URL): string | null => {
    if (specifier.startsWith(".")) {
      return new URL(specifier, importer).pathname.replace(
        /\.(?:ts|tsx|js)$/,
        "",
      );
    }
    if (specifier.startsWith("@/chrome/")) {
      return new URL(
        specifier.slice("@/chrome/".length),
        CHROME_ROOT,
      ).pathname.replace(/\.(?:ts|tsx|js)$/, "");
    }
    return null;
  };

  for (const file of chromeFiles) {
    const moduleSource = await source(file.url);
    const specifiers = [
      ...moduleSource.matchAll(
        /\b(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/g,
      ),
      ...moduleSource.matchAll(/\bimport\(\s*["']([^"']+)["']/g),
      ...moduleSource.matchAll(/\brequire\(\s*["']([^"']+)["']/g),
    ].map((match) => match[1]);

    for (const specifier of specifiers) {
      const target = normalizeTarget(specifier, file.url);
      if (!target) continue;
      const targetsComposition =
        target === compositionPath.slice(0, -1) ||
        target.startsWith(compositionPath);
      const targetsBootstrap = target === bootstrapPath;
      const targetsPipeline = target === pipelinePath;
      if (!targetsComposition && !targetsBootstrap && !targetsPipeline) continue;

      const isEntrypoint = file.name === "background.ts";
      const isBootstrap = file.name === "background/bootstrap.ts";
      const isPipeline = file.name === "background/messagePipeline.ts";
      const isComposition = file.name.startsWith("background/composition/");
      const allowed =
        (isEntrypoint && targetsBootstrap) ||
        (isBootstrap && (targetsComposition || targetsPipeline)) ||
        (isPipeline && target === routesPath) ||
        (isComposition && targetsComposition);
      assert.ok(
        allowed,
        `${file.name} must not import upward from ${specifier}`,
      );
    }
  }

  const pipelineSource = await source(
    new URL("messagePipeline.ts", BACKGROUND_ROOT),
  );
  assert.deepEqual(
    pipelineSource
      .split(/\r?\n/)
      .filter((line) => /from ["']\.\/composition(?:\/|["'])/.test(line)),
    [
      'import type { BackgroundRouteComposition } from "./composition/routes";',
    ],
    "the pipeline's sole composition edge must remain type-only",
  );
});
