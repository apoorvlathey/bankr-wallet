/**
 * Security audience for every message handled by the background composition root.
 *
 * Keep this list exhaustive. A newly added route is unreachable from an
 * untrusted sender until it is deliberately classified as a provider message.
 * Wallet UI messages are accepted only from the exact extension documents
 * recognized by `trustedWalletUiSender.ts`.
 *
 * ENS browsing messages are intentionally not listed here. They are handled
 * before the main router and enforce their own page-specific sender policy.
 */

export const PROVIDER_MESSAGE_TYPES = [
  "openProviderRequestSidePanel",
  "getActiveAccount",
  "getDappAccounts",
  "requestDappConnection",
  "dappChainSwitchNotification",
  "addEthereumChain",
  "sendTransaction",
  "signatureRequest",
  "watchAsset",
  "rpcRequest",
  "walletGetCapabilities",
  "walletSendCalls",
  "walletGetCallsStatus",
  "walletShowCallsStatus",
  "walletExecutionPermissions",
] as const;

export const WALLET_UI_MESSAGE_TYPES = [
  // Onboarding lifecycle
  "getOnboardingInitializationStatus",
  "beginOnboardingInitialization",
  "initializeOnboardingCredential",
  "completeOnboardingInitialization",
  "rollbackOnboardingInitialization",
  "onboardingComplete",

  // Transaction/signature confirmations and rejection
  "confirmTransaction",
  "confirmTransactionAsync",
  "confirmTransactionAsyncPK",
  "confirmTransactionAsyncLedger",
  "confirmImpersonatedTransaction",
  "getTransactionNonce",
  "prepareTransactionReplacement",
  "getFeePaymentOptions",
  "prepareFeePaymentQuote",
  "confirmBatchTransactionAsync",
  "confirmBatchTransactionAsyncPK",
  "confirmSignatureRequest",
  "confirmErc7715PermissionRequest",
  "confirmAddChain",
  "confirmWatchAsset",
  "rejectTransaction",
  "rejectBatchTransaction",
  "splitBatchIntoIndividualTxs",
  "removeCallFromPendingBatch",
  "updatePendingTxRequestData",
  "updateCallInPendingBatch",
  "rejectSignatureRequest",
  "rejectErc7715PermissionRequest",
  "rejectAddChain",
  "rejectWatchAsset",
  "cancelTransaction",

  // Cross-dapp batch assembly
  "addToCrossDappBatch",
  "addCallsToCrossDappBatch",
  "removeFromCrossDappBatch",
  "updateCallInCrossDappBatch",
  "rejectCrossDappBatch",
  "confirmCrossDappBatch",

  // Account and seed phrase management
  "addBankrAccount",
  "addImpersonatorAccount",
  "addSeedPhraseGroup",
  "previewSeedAddresses",
  "deriveSeedAccount",
  "addPrivateKeyAccount",
  "ledgerConnect",
  "ledgerScan",
  "ledgerCancel",
  "addLedgerAccounts",
  "getLedgerDevices",
  "removeAccount",
  "getAccounts",
  "reorderAccounts",
  "getTabAccount",
  "setTabAccount",
  "getSeedGroups",
  "setActiveAccount",
  "renameSeedGroup",
  "updateAccountDisplayName",
  "getAddressContacts",
  "createAddressContact",
  "updateAddressContactLabel",
  "removeAddressContact",
  "reorderAddressContacts",
  "saveBankrApiKeyAndAddress",
  "probeSafeAddress", "findSafesByOwner",
  "importSafeAccount", "getSafeAccounts",
  "refreshSafeAccount", "removeSafeAccount",
  "getSafeProposals", "getSafeProposal",
  "syncSafeRequests", "createSafeProposal",
  "changeSafeProposalNonce", "approveSafeProposal",
  "publishSafeProposal", "retrySafePublication",
  "cancelSafeProposal", "startSafeProposalRejection",
  "hideSafeProposal", "detachSafeProposalRoute",
  "reconcileSafeProposal", "estimateSafeExecution",
  "executeSafeProposal", "reconcileSafeExecution",

  // Credential, passkey, and session management
  "unlockWallet",
  "lockWallet",
  "isApiKeyCached",
  "isWalletUnlocked",
  "validateSession",
  "tryRestoreSession",
  "clearApiKeyCache",
  "saveApiKeyWithCachedPassword",
  "getCachedPassword",
  "getCachedApiKey",
  "verifyMasterPassword",
  "changePassword",
  "setAgentPassword",
  "removeAgentPassword",
  "isAgentPasswordEnabled",
  "getPasswordType",
  "getPasskeyUnlockStatus",
  "canSetupPasskeyUnlock",
  "verifyPasskeySetupPassword",
  "setupPasskeyUnlock",
  "setupPasskeyUnlockWithPassword",
  "unlockWithPasskey",
  "removePasskeyUnlock",

  // Pending request and history reads
  "getPendingTxRequests",
  "getPendingBatchTxRequests",
  "getPendingTransaction",
  "getPendingSignatureRequests",
  "getPendingErc7715PermissionRequests",
  "getErc7715PermissionGrantsForAccount",
  "initiateErc7715PermissionRevoke",
  "getPendingWatchAssetRequests",
  "getPendingAddChainRequests",
  "getTxHistory",
  "getTxHistoryPage",
  "getTxHistoryItem",
  "getTransactionCalldata",
  "resolveHistoryNftMetadata",
  "getProcessingTxs",
  "getFailedTxResult",
  "checkPendingTxReceipt",

  // Secret operations and migration
  "migrateFromLegacy",
  "generateMnemonic",
  "revealSeedPhrase",
  "revealPrivateKey",
  "resetExtension",
  "clearTxHistory",
  "clearTxHistoryForAddresses",
  "clearNonceCache",
  "clearFailedTxResult",

  // UI mode and security settings
  "setSidePanelMode",
  "switchSidePanelToPopup",
  "setAutoLockTimeout",
  "getAutoLockTimeout",
  "setArcBrowser",
  "isSidePanelSupported",
  "getSidePanelMode",
  "getProviderRequestSurfaceHint",
  "openPopupWindow",
  "getClearSigningEnabled",
  "setClearSigningEnabled",
  "INVALIDATE_CLEAR_SIGNING_CACHE",
  "GET_CLEAR_SIGNING_DESCRIPTOR",

  // Network settings
  "ensureNetworksInfo",
  "addNetwork",
  "updateNetwork",
  "setNetworkHidden",
  "deleteNetwork",

  // Token metadata, pricing, allowance, swap, and bridge helpers
  "resolveTokenMetadata",
  "lookupCustomToken",
  "addCustomToken",
  "updateCustomToken",
  "removeCustomToken",
  "backfillAssetChanges",
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
  "getWchanStakingState",
  "getWchanVaultApy",

  // EIP-7702 and delegated authority management
  "getDelegationStatus",
  "probeDelegateContract",
  "initiateSetDelegation",
  "initiateRevokeDelegation",

  // WalletConnect session management
  "walletConnectGetSessions",
  "walletConnectPair",
  "walletConnectDisconnectSession",
  "walletConnectSwitchChain",

  // Injected-dapp permission management
  "getDappPermissions",
  "getDappConnectionContext",
  "getPendingDappConnectionRequests",
  "confirmDappConnection",
  "rejectDappConnection",
  "revokeDappPermission",
  "getEnsContenthashLastUpdated",

  // Direct execution and sponsored transfers
  "executeSwapDirect",
  "executeSwapBatch",
  "executeSwapAtomicPK",
  "executeStakingDirect",
  "executeStakingBatch",
  "executeStakingAtomicPK",
  "initiateTransfer",
  "cancelProcessingTx",
  "sponsoredTransfer",
  "checkPremiumStatus",
  "checkSponsoredTransferStatus",
  "acknowledgeSponsoredTransfer",

  // Transaction review helpers
  "estimateGas",
  "estimateForceInclusionGas",
  "getArbitrumForceInclusionStatus",
  "submitArbitrumForceInclusion",
  "estimateBatchGasSequential",
  "simulateAssetChanges",
  "simulateBatchAssetChanges",
  "simulateBatchAssetChangesNonAtomic",
  "simulateSafeAssetChanges",
  "retryTokenMetadata",

  // Chat
  "submitChatPrompt",
  "getChatConversations",
  "getChatConversation",
  "createChatConversation",
  "deleteChatConversation",
  "addChatMessage",
  "updateChatMessage",
] as const;

export type ProviderMessageType = (typeof PROVIDER_MESSAGE_TYPES)[number];
export type WalletUiMessageType = (typeof WALLET_UI_MESSAGE_TYPES)[number];
export type BackgroundMessageAudience = "provider" | "wallet-ui";

const providerMessageTypes: ReadonlySet<string> = new Set(
  PROVIDER_MESSAGE_TYPES,
);
const walletUiMessageTypes: ReadonlySet<string> = new Set(
  WALLET_UI_MESSAGE_TYPES,
);

/** Returns null for unknown messages, which are never provider-reachable. */
export function classifyBackgroundMessage(
  messageType: unknown,
): BackgroundMessageAudience | null {
  if (typeof messageType !== "string") return null;
  if (providerMessageTypes.has(messageType)) return "provider";
  if (walletUiMessageTypes.has(messageType)) return "wallet-ui";
  return null;
}
