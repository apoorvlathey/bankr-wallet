/**
 * Storage keys owned by the current wallet identity.
 *
 * Keep this list in sync with `_docs/STORAGE.md` whenever a new wallet-scoped
 * key or transient result prefix is introduced.
 */

export const WALLET_LOCAL_STORAGE_KEYS = [
  "encryptedApiKey",
  "encryptedApiKeyVault",
  "encryptedVaultKeyMaster",
  "encryptedVaultKeyAgent",
  "agentPasswordEnabled",
  "pkVault",
  "mnemonicVault",
  "accounts",
  "seedGroups",
  "txHistory",
  "pendingTxRequests",
  "pendingSignatureRequests",
  "pendingBatchTxRequests",
  "pendingErc7715PermissionRequests",
  "erc7715PermissionGrants",
  "pendingWatchAssetRequests",
  "pendingAddChainRequests",
  "walletConnectPendingRequests",
  "walletConnectChainId",
  "crossDappBatch",
  "bundleStatuses",
  "pendingBridges",
  "chatHistory",
  "portfolioSnapshots",
  "portfolioHoldingsCache",
  "hiddenPortfolioTokens",
  "customTokens",
  "customDelegates",
  "recentlyReceivedTokens",
  "ensIdentityCache",
  "ensAvatarImageCache",
  "sessionEncKey",
] as const;

export const WALLET_SYNC_STORAGE_KEYS = [
  "address",
  "displayAddress",
  "networksInfo",
  "chainName",
  "autoLockTimeout",
  "isArcBrowser",
  "hidePortfolioValue",
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
