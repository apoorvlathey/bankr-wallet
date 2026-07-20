// Background audience and route-completeness contract.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  PROVIDER_MESSAGE_TYPES,
  WALLET_UI_MESSAGE_TYPES,
  classifyBackgroundMessage,
} from "../../src/chrome/background/messageAccessPolicy";
import { BACKGROUND_AUTH_MESSAGE_TYPES } from "../../src/chrome/background/authRouter";
import { BACKGROUND_BANKR_CREDENTIAL_MESSAGE_TYPES } from "../../src/chrome/background/bankrCredentialRouter";
import { BACKGROUND_ONBOARDING_MESSAGE_TYPES } from "../../src/chrome/background/onboardingRouter";
import { BACKGROUND_PRIVACY_MESSAGE_TYPES } from "../../src/chrome/background/privacyRouter";
import { BACKGROUND_PRIVACY_RECOVERY_MESSAGE_TYPES } from "../../src/chrome/background/privacyRecoveryRouter";
import { BACKGROUND_ACCOUNT_STATE_MESSAGE_TYPES } from "../../src/chrome/background/accountStateRouter";
import { BACKGROUND_CONTACT_BOOK_MESSAGE_TYPES } from "../../src/chrome/background/contactBookRouter";
import { BACKGROUND_SETTINGS_MESSAGE_TYPES } from "../../src/chrome/background/settingsRouter";
import { BACKGROUND_DAPP_PERMISSION_MESSAGE_TYPES } from "../../src/chrome/background/dappPermissionRouter";
import { BACKGROUND_PROVIDER_RPC_MESSAGE_TYPES } from "../../src/chrome/background/providerRpcRouter";
import { BACKGROUND_WALLETCONNECT_SESSION_MESSAGE_TYPES } from "../../src/chrome/background/walletConnectSessionRouter";
import { BACKGROUND_WATCH_ASSET_MESSAGE_TYPES } from "../../src/chrome/background/watchAssetRouter";
import { BACKGROUND_CHAIN_PROMPT_MESSAGE_TYPES } from "../../src/chrome/background/chainPromptRouter";
import { BACKGROUND_SIGNING_REQUEST_MESSAGE_TYPES } from "../../src/chrome/background/signingRequestRouter";
import { BACKGROUND_TRANSACTION_EXECUTION_MESSAGE_TYPES } from "../../src/chrome/background/transactionExecutionRouter";
import { BACKGROUND_SWAP_EXECUTION_MESSAGE_TYPES } from "../../src/chrome/background/swapExecutionRouter";
import { BACKGROUND_SPONSORED_TRANSFER_MESSAGE_TYPES } from "../../src/chrome/background/sponsoredTransferRouter";
import { BACKGROUND_TRANSACTION_STATUS_MESSAGE_TYPES } from "../../src/chrome/background/transactionStatusRouter";
import { BACKGROUND_ACCOUNT_MANAGEMENT_MESSAGE_TYPES } from "../../src/chrome/background/accountManagementRouter";
import { BACKGROUND_SECRET_MANAGEMENT_MESSAGE_TYPES } from "../../src/chrome/background/secretManagementRouter";
import { BACKGROUND_BATCH_REQUEST_MESSAGE_TYPES } from "../../src/chrome/background/batchRequestRouter";
import { BACKGROUND_DELEGATION_MESSAGE_TYPES } from "../../src/chrome/background/delegationRouter";
import { BACKGROUND_CROSS_DAPP_BATCH_MESSAGE_TYPES } from "../../src/chrome/background/crossDappBatchRouter";
import { BACKGROUND_ERC7715_PERMISSION_MESSAGE_TYPES } from "../../src/chrome/background/erc7715PermissionRouter";
import { BACKGROUND_GAS_SIMULATION_MESSAGE_TYPES } from "../../src/chrome/background/gasSimulationRouter";
import { BACKGROUND_SWAP_BRIDGE_DATA_MESSAGE_TYPES } from "../../src/chrome/background/swapBridgeDataRouter";
import { BACKGROUND_TOKEN_DATA_MESSAGE_TYPES } from "../../src/chrome/background/tokenDataRouter";
import { BACKGROUND_CHAT_MESSAGE_TYPES } from "../../src/chrome/background/chatRouter";
import { BACKGROUND_CLEAR_SIGNING_MESSAGE_TYPES } from "../../src/chrome/background/clearSigningRouter";
import { BACKGROUND_RESET_MESSAGE_TYPES } from "../../src/chrome/background/resetRouter";
import {
  deliverProviderRequestRejection,
  mapProviderRequestRejection,
  type ProviderRequestRejectionDelivery,
} from "../../src/chrome/background/providerRequestRejection";

const ERROR = "Rejected for test";
const CODE = -32602;

test("background root clutter is limited to the composition root", async () => {
  const entries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  assert.deepEqual(
    entries
      .filter((entry) => entry.isFile() && entry.name.startsWith("background"))
      .map((entry) => entry.name)
      .sort(),
    ["background.ts"],
  );
  const auditMap = await readFile(
    new URL("../../src/chrome/background/README.md", import.meta.url),
    "utf8",
  );
  assert.match(auditMap, /Review order/);
});

test("every main background route has exactly one explicit audience", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/messagePipeline.ts", import.meta.url),
    "utf8",
  );
  const mainRouterTypes = [
    ...source.matchAll(/^ {4}case ["']([^"']+)["']/gm),
  ].map((match) => match[1]);
  const delegatedRouteGroups = [
    BACKGROUND_AUTH_MESSAGE_TYPES,
    BACKGROUND_BANKR_CREDENTIAL_MESSAGE_TYPES,
    BACKGROUND_ONBOARDING_MESSAGE_TYPES,
    BACKGROUND_PRIVACY_MESSAGE_TYPES,
    BACKGROUND_PRIVACY_RECOVERY_MESSAGE_TYPES,
    BACKGROUND_ACCOUNT_STATE_MESSAGE_TYPES,
    BACKGROUND_CONTACT_BOOK_MESSAGE_TYPES,
    BACKGROUND_SETTINGS_MESSAGE_TYPES,
    BACKGROUND_DAPP_PERMISSION_MESSAGE_TYPES,
    BACKGROUND_PROVIDER_RPC_MESSAGE_TYPES,
    BACKGROUND_WALLETCONNECT_SESSION_MESSAGE_TYPES,
    BACKGROUND_WATCH_ASSET_MESSAGE_TYPES,
    BACKGROUND_CHAIN_PROMPT_MESSAGE_TYPES,
    BACKGROUND_SIGNING_REQUEST_MESSAGE_TYPES,
    BACKGROUND_TRANSACTION_EXECUTION_MESSAGE_TYPES,
    BACKGROUND_SWAP_EXECUTION_MESSAGE_TYPES,
    BACKGROUND_SPONSORED_TRANSFER_MESSAGE_TYPES,
    BACKGROUND_TRANSACTION_STATUS_MESSAGE_TYPES,
    BACKGROUND_ACCOUNT_MANAGEMENT_MESSAGE_TYPES,
    BACKGROUND_SECRET_MANAGEMENT_MESSAGE_TYPES,
    BACKGROUND_BATCH_REQUEST_MESSAGE_TYPES,
    BACKGROUND_DELEGATION_MESSAGE_TYPES,
    BACKGROUND_CROSS_DAPP_BATCH_MESSAGE_TYPES,
    BACKGROUND_ERC7715_PERMISSION_MESSAGE_TYPES,
    BACKGROUND_GAS_SIMULATION_MESSAGE_TYPES,
    BACKGROUND_SWAP_BRIDGE_DATA_MESSAGE_TYPES,
    BACKGROUND_TOKEN_DATA_MESSAGE_TYPES,
    BACKGROUND_CHAT_MESSAGE_TYPES,
    BACKGROUND_CLEAR_SIGNING_MESSAGE_TYPES,
    BACKGROUND_RESET_MESSAGE_TYPES,
  ] as const;
  const delegatedTypes = delegatedRouteGroups.flatMap((types) => [...types]);
  const routedTypes = [...mainRouterTypes, ...delegatedTypes];
  const classifiedTypes = [
    ...PROVIDER_MESSAGE_TYPES,
    ...WALLET_UI_MESSAGE_TYPES,
  ];

  assert.equal(new Set(routedTypes).size, routedTypes.length);
  assert.equal(new Set(mainRouterTypes).size, mainRouterTypes.length);
  assert.equal(new Set(delegatedTypes).size, delegatedTypes.length);
  for (const delegatedTypesForDomain of delegatedRouteGroups) {
    assert.deepEqual(
      mainRouterTypes.filter((type) =>
        (delegatedTypesForDomain as readonly string[]).includes(type),
      ),
      [],
      "delegated routes must not remain in the main switch",
    );
  }
  assert.equal(new Set(PROVIDER_MESSAGE_TYPES).size, PROVIDER_MESSAGE_TYPES.length);
  assert.equal(new Set(WALLET_UI_MESSAGE_TYPES).size, WALLET_UI_MESSAGE_TYPES.length);
  assert.deepEqual(
    PROVIDER_MESSAGE_TYPES.filter((type) =>
      (WALLET_UI_MESSAGE_TYPES as readonly string[]).includes(type),
    ),
    [],
    "a route must never be both provider- and wallet-UI-reachable",
  );
  assert.deepEqual(
    [...classifiedTypes].sort(),
    [...routedTypes].sort(),
    "adding or removing a router case requires an explicit audience decision",
  );

  for (const type of PROVIDER_MESSAGE_TYPES) {
    assert.equal(classifyBackgroundMessage(type), "provider", type);
  }
  for (const type of WALLET_UI_MESSAGE_TYPES) {
    assert.equal(classifyBackgroundMessage(type), "wallet-ui", type);
  }
  assert.equal(classifyBackgroundMessage("unknownMessage"), null);
  assert.equal(classifyBackgroundMessage(null), null);
});

test("delegated routers run after the audience gate and before unknown handling", async () => {
  const [source, ...compositionSources] = await Promise.all([
    readFile(
      new URL("../../src/chrome/background/messagePipeline.ts", import.meta.url),
      "utf8",
    ),
    ...[
      "identityRoutes.ts",
      "accountRoutes.ts",
      "providerRoutes.ts",
      "executionRoutes.ts",
      "advancedRoutes.ts",
      "dataRoutes.ts",
    ].map((file) =>
      readFile(
        new URL(`../../src/chrome/background/composition/${file}`, import.meta.url),
        "utf8",
      ),
    ),
  ]);
  const composition = compositionSources.join("\n");
  const audienceGate = source.indexOf(
    "const audience = classifyBackgroundMessage(message?.type)",
  );
  const routeOrder = [
    "routeBackgroundAuthMessage",
    "routeBackgroundBankrCredentialMessage",
    "routeBackgroundOnboardingMessage",
    "routeBackgroundPrivacyMessage",
    "routeBackgroundPrivacyRecoveryMessage",
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
  ].map((name) => source.indexOf(`routes.${name}`));
  assert.ok(routeOrder.every((index) => index > audienceGate));
  assert.deepEqual(routeOrder, [...routeOrder].sort((a, b) => a - b));
  const resetRoute = routeOrder.at(-1) ?? -1;
  const unknownHandling = source.indexOf("Unknown message type", resetRoute);
  assert.ok(audienceGate >= 0 && resetRoute < unknownHandling);
  assert.match(
    composition,
    /createBackgroundAccountManagementMessageRouter\(\{/,
  );
  for (const constructorName of [
    "createBackgroundBankrCredentialMessageRouter",
    "createBackgroundProviderRpcMessageRouter",
    "createBackgroundSwapBridgeDataMessageRouter",
    "createBackgroundTokenDataMessageRouter",
    "createBackgroundSecretManagementMessageRouter",
    "createBackgroundBatchRequestMessageRouter",
    "createBackgroundDelegationMessageRouter",
    "createBackgroundCrossDappBatchMessageRouter",
    "createBackgroundErc7715PermissionMessageRouter",
    "createBackgroundGasSimulationMessageRouter",
    "createBackgroundChatMessageRouter",
    "createBackgroundClearSigningMessageRouter",
    "createBackgroundTransactionExecutionMessageRouter",
    "createBackgroundSwapExecutionMessageRouter",
    "createBackgroundSponsoredTransferMessageRouter",
    "createBackgroundResetMessageRouter",
  ]) {
    assert.match(composition, new RegExp(`${constructorName}\\(\\{`));
  }
});

test("previously implicit data and credential routes are explicitly wallet-UI-only", () => {
  for (const type of [
    "getCachedApiKey",
    "fetchSwapPrice",
    "fetchSwapQuote",
    "fetchBridgeQuote",
    "fetchBridgeStatus",
    "fetchBridgeChains",
    "fetchBridgeChainsRaw",
    "fetchBridgeTokens",
    "fetchTokenInfo",
    "fetchTokenPrice",
    "fetchNativePrice",
    "cacheAvatarImage",
    "resolveCoinGeckoNativeAssets",
    "resolveCoinGeckoErc20Prices",
    "fetchSwapTokenList",
    "fetchTokenLogo",
    "checkTokenAllowance",
    "getTokenBalanceWei",
    "checkPermit2Allowance",
  ]) {
    assert.equal(classifyBackgroundMessage(type), "wallet-ui", type);
  }

  assert.equal(classifyBackgroundMessage("getActiveAccount"), "provider");
  assert.equal(classifyBackgroundMessage("revealPrivateKey"), "wallet-ui");
  assert.equal(
    classifyBackgroundMessage("checkSponsoredTransferStatus"),
    "wallet-ui",
  );
  assert.equal(
    classifyBackgroundMessage("acknowledgeSponsoredTransfer"),
    "wallet-ui",
  );
});

test("network registry and display-mode settings remain wallet-UI-only", () => {
  for (const type of BACKGROUND_SETTINGS_MESSAGE_TYPES) {
    assert.equal(classifyBackgroundMessage(type), "wallet-ui", type);
  }
  assert.equal(classifyBackgroundMessage("addEthereumChain"), "provider");
  assert.equal(
    classifyBackgroundMessage("dappChainSwitchNotification"),
    "provider",
  );
});

test("delegated dapp and WalletConnect routes retain their exact audiences", () => {
  for (const type of [
    "getDappAccounts",
    "requestDappConnection",
  ]) {
    assert.equal(classifyBackgroundMessage(type), "provider", type);
  }
  for (const type of [
    "getDappPermissions",
    "getDappConnectionContext",
    "getPendingDappConnectionRequests",
    "confirmDappConnection",
    "rejectDappConnection",
    "revokeDappPermission",
    ...BACKGROUND_WALLETCONNECT_SESSION_MESSAGE_TYPES,
  ]) {
    assert.equal(classifyBackgroundMessage(type), "wallet-ui", type);
  }
});

test("metadata prompt routes retain provider intake and trusted-UI decisions", () => {
  for (const type of [
    "watchAsset",
    "addEthereumChain",
    "dappChainSwitchNotification",
  ]) {
    assert.equal(classifyBackgroundMessage(type), "provider", type);
  }
  for (const type of [
    "getPendingWatchAssetRequests",
    "confirmWatchAsset",
    "rejectWatchAsset",
    "getPendingAddChainRequests",
    "confirmAddChain",
    "rejectAddChain",
  ]) {
    assert.equal(classifyBackgroundMessage(type), "wallet-ui", type);
  }
});

test("provider rejection mapping preserves every result key and payload", () => {
  const failure = { success: false, error: ERROR, code: CODE };
  const cases: Array<[Record<string, unknown>, ProviderRequestRejectionDelivery]> = [
    [
      { type: "sendTransaction", txId: "tx-1" },
      { kind: "storage", key: "txResult:tx-1", result: failure },
    ],
    [
      { type: "signatureRequest", sigId: "sig-1" },
      { kind: "storage", key: "sigResult:sig-1", result: failure },
    ],
    [
      { type: "walletSendCalls", bundleId: "bundle-1" },
      { kind: "storage", key: "batchTxAck:bundle-1", result: failure },
    ],
    [
      { type: "walletGetCapabilities", requestId: "cap-1" },
      {
        kind: "storage",
        key: "capabilitiesResult:cap-1",
        result: failure,
      },
    ],
    [
      { type: "walletGetCallsStatus", requestId: "status-1" },
      {
        kind: "storage",
        key: "callsStatusResult:status-1",
        result: failure,
      },
    ],
    [
      { type: "watchAsset", watchAssetId: "asset-1" },
      {
        kind: "storage",
        key: "watchAssetResult:asset-1",
        result: failure,
      },
    ],
    [
      { type: "addEthereumChain", requestId: "chain-1" },
      { kind: "storage", key: "addChainResult:chain-1", result: failure },
    ],
    [
      { type: "rpcRequest", rpcId: "rpc-1" },
      {
        kind: "storage",
        key: "rpcResult:rpc-1",
        result: { error: ERROR, code: CODE },
      },
    ],
    [
      { type: "requestDappConnection", requestId: "connection-1" },
      {
        kind: "storage",
        key: "dappConnectionResult:connection-1",
        result: failure,
      },
    ],
    [
      { type: "walletExecutionPermissions" },
      { kind: "direct-response", response: failure },
    ],
    [{ type: "walletShowCallsStatus" }, { kind: "handled-no-response" }],
    [
      { type: "dappChainSwitchNotification" },
      { kind: "handled-no-response" },
    ],
  ];

  for (const [message, expected] of cases) {
    assert.deepEqual(
      mapProviderRequestRejection(message, ERROR, CODE),
      expected,
      String(message.type),
    );
  }

  assert.deepEqual(
    mapProviderRequestRejection({ type: "sendTransaction" }, ERROR, CODE),
    { kind: "handled-no-response" },
    "known result-storage routes remain handled when validation rejected a missing id",
  );
  assert.deepEqual(
    mapProviderRequestRejection({ type: "getActiveAccount" }, ERROR, CODE),
    { kind: "unhandled" },
  );
});

test("provider rejection delivery preserves listener handling semantics", async () => {
  const writes: Array<{ key: string; result: Record<string, unknown> }> = [];
  const responses: unknown[] = [];
  const ports = {
    async writeResult(key: string, result: Record<string, unknown>) {
      writes.push({ key, result });
    },
    sendResponse(response?: unknown) {
      responses.push(response);
    },
  };

  assert.equal(
    deliverProviderRequestRejection(
      mapProviderRequestRejection(
        { type: "sendTransaction", txId: "tx-1" },
        ERROR,
        CODE,
      ),
      ports,
    ),
    true,
  );
  await Promise.resolve();
  assert.deepEqual(writes, [
    {
      key: "txResult:tx-1",
      result: { success: false, error: ERROR, code: CODE },
    },
  ]);
  assert.deepEqual(responses, []);

  assert.equal(
    deliverProviderRequestRejection(
      mapProviderRequestRejection(
        { type: "walletExecutionPermissions" },
        ERROR,
        CODE,
      ),
      ports,
    ),
    true,
  );
  assert.deepEqual(responses, [
    { success: false, error: ERROR, code: CODE },
  ]);

  const callbackCount = writes.length + responses.length;
  assert.equal(
    deliverProviderRequestRejection(
      mapProviderRequestRejection(
        { type: "walletShowCallsStatus" },
        ERROR,
        CODE,
      ),
      ports,
    ),
    true,
  );
  assert.equal(writes.length + responses.length, callbackCount);

  assert.equal(
    deliverProviderRequestRejection(
      { kind: "unhandled" },
      ports,
    ),
    false,
  );
});

test("the production listener keeps ENS first and fails untrusted unknown routes closed", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/messagePipeline.ts", import.meta.url),
    "utf8",
  );
  const router = source;

  assert.ok(
    router.indexOf("handleEnsBrowsingMessage") <
      router.indexOf("classifyBackgroundMessage"),
    "ENS must retain its page-specific policy before the wallet message gate",
  );
  assert.match(router, /if \(!trustedWalletUi && audience !== "provider"\)/);
  assert.match(
    router,
    /sendResponse\(\{ success: false, error: "Unauthorized" \}\);\s*return false;/,
  );
  assert.match(
    router,
    /if \(!trustedWalletUi\) \{\s*const validation = validateExternalProviderMessage\(message\)/,
  );
  assert.match(
    router,
    /rejectExternalProviderRequest\([\s\S]*?-32602,[\s\S]*?\);\s*return false;/,
  );
  assert.match(
    router,
    /rejectExternalProviderRequestDuringErc7715Lock\([\s\S]*?message,[\s\S]*?sendResponse,[\s\S]*?\)[\s\S]*?return false;/,
  );
});
