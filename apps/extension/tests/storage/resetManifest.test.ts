import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_ARTIFACT_STORAGE_PREFIXES,
  WALLET_LOCAL_STORAGE_KEYS,
  WALLET_LOCAL_STORAGE_PREFIXES,
  WALLET_RESULT_STORAGE_PREFIXES,
  WALLET_SYNC_STORAGE_KEYS,
  getStorageKeysWithPrefixes,
  getWalletLocalStorageKeysToRemove,
} from "../../src/chrome/walletResetStorage";

test("wallet reset local and sync manifests retain their exact released keys", () => {
  assert.deepEqual(WALLET_LOCAL_STORAGE_KEYS, [
    "encryptedApiKey",
    "encryptedApiKeyVault",
    "encryptedVaultKeyMaster",
    "encryptedVaultKeyAgent",
    "agentPasswordEnabled",
    "passkeyUnlock",
    "pkVault",
    "mnemonicVault",
    "accounts",
    "ledgerDevices",
    "addressContacts",
    "seedGroups",
    "txHistory",
    "pendingTxRequests",
    "pendingSignatureRequests",
    "pendingBatchTxRequests",
    "pendingUserOperations",
    "pendingErc7715PermissionRequests",
    "erc7715PermissionGrants",
    "pendingWatchAssetRequests",
    "pendingAddChainRequests",
    "dappPermissions",
    "pendingDappConnectionRequests",
    "walletConnectPendingRequests",
    "walletConnectChainId",
    "crossDappBatch",
    "bundleStatuses",
    "pendingBridges",
    "chatHistory",
    "portfolioSnapshots",
    "portfolioSnapshotsV2",
    "portfolioHoldingsCache",
    "hiddenPortfolioTokens",
    "customTokens",
    "customDelegates",
    "networkRpcUrls",
    "recentlyReceivedTokens",
    "ensIdentityCache",
    "ensAvatarImageCache",
    "sessionEncKey",
    "onboardingInitialization",
    "sponsoredTransferIntents",
  ]);
  assert.deepEqual(WALLET_SYNC_STORAGE_KEYS, [
    "address",
    "displayAddress",
    "networksInfo",
    "chainName",
    "autoLockTimeout",
    "isArcBrowser",
    "hidePortfolioValue",
    "unifyPortfolioBalances",
    "sidePanelVerified",
    "sidePanelMode",
    "activeAccountId",
    "tabAccounts",
  ]);
});

test("wallet reset result and artifact prefixes remain exact and ordered", () => {
  assert.deepEqual(WALLET_RESULT_STORAGE_PREFIXES, [
    "txResult:",
    "sigResult:",
    "rpcResult:",
    "addChainResult:",
    "watchAssetResult:",
    "batchTxResult:",
    "batchTxAck:",
    "capabilitiesResult:",
    "callsStatusResult:",
    "erc7715PermissionResult:",
    "dappConnectionResult:",
  ]);
  assert.deepEqual(WALLET_ARTIFACT_STORAGE_PREFIXES, [
    "notification-",
    "fiProgress:",
  ]);
  assert.deepEqual(WALLET_LOCAL_STORAGE_PREFIXES, [
    ...WALLET_RESULT_STORAGE_PREFIXES,
    ...WALLET_ARTIFACT_STORAGE_PREFIXES,
  ]);
});

test("prefix cleanup matches own keys only and preserves the WC namespace", () => {
  const items = {
    "txResult:one": {},
    "notification-two": {},
    "fiProgress:three": {},
    "prefix-txResult:four": {},
    walletConnectStorageNamespace: "wallet-reset-id",
    unrelated: {},
  };
  assert.deepEqual(
    getStorageKeysWithPrefixes(items, WALLET_LOCAL_STORAGE_PREFIXES),
    ["txResult:one", "notification-two", "fiProgress:three"],
  );

  const removal = getWalletLocalStorageKeysToRemove(items);
  assert.deepEqual(
    removal.slice(0, WALLET_LOCAL_STORAGE_KEYS.length),
    WALLET_LOCAL_STORAGE_KEYS,
  );
  assert.deepEqual(removal.slice(WALLET_LOCAL_STORAGE_KEYS.length), [
    "txResult:one",
    "notification-two",
    "fiProgress:three",
  ]);
  assert.equal(removal.includes("walletConnectStorageNamespace"), false);
  assert.equal(removal.includes("unrelated"), false);
});
