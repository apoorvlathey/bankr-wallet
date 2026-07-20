/** Exact storage manifest owned by the current wallet identity. */

export const WALLET_LOCAL_STORAGE_KEYS = [
  "encryptedApiKey",
  "encryptedApiKeyVault",
  "encryptedVaultKeyMaster",
  "encryptedVaultKeyAgent",
  "agentPasswordEnabled",
  "passkeyUnlock",
  "pkVault",
  "mnemonicVault",
  "privacyVault",
  "privacyRecoveryBackup",
  "accounts",
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
  "walletHomeModeV1",
] as const;

export const WALLET_SYNC_STORAGE_KEYS = [
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
] as const;

export const WALLET_RESULT_STORAGE_PREFIXES = [
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
] as const;

export const WALLET_ARTIFACT_STORAGE_PREFIXES = [
  "notification-",
  "fiProgress:",
] as const;

export const WALLET_LOCAL_STORAGE_PREFIXES = [
  ...WALLET_RESULT_STORAGE_PREFIXES,
  ...WALLET_ARTIFACT_STORAGE_PREFIXES,
] as const;

export function getStorageKeysWithPrefixes(
  items: Record<string, unknown>,
  prefixes: readonly string[],
): string[] {
  return Object.keys(items).filter((key) =>
    prefixes.some((prefix) => key.startsWith(prefix)),
  );
}

export function getWalletLocalStorageKeysToRemove(
  items: Record<string, unknown>,
): string[] {
  return [
    ...WALLET_LOCAL_STORAGE_KEYS,
    ...getStorageKeysWithPrefixes(items, WALLET_LOCAL_STORAGE_PREFIXES),
  ];
}
