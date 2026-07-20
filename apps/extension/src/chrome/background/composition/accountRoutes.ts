/** Dapp/session permission and master-gated account/secret route wiring. */

import {
  addBankrAccount,
  addBankrAccountWithCredentialUpdate,
  addImpersonatorAccount,
  getAccountById,
  getAccounts,
  getSeedGroups,
  renameSeedGroup,
  setActiveAccountId,
} from "../../accountStorage";
import {
  commitPreparedApiKeyUpdate,
  handleUnlockWallet,
  prepareApiKeyUpdateWithCachedPassword,
} from "../../authHandlers";
import { getAuthCeremonyEpoch } from "../../authTransition";
import { verifyBankrCredentialAddress } from "../../bankr/client";
import {
  getDappPermissions,
  getPendingDappConnectionRequests,
  handleConfirmDappConnection,
  handleGetDappAccounts,
  handleGetDappConnectionContext,
  handleRejectDappConnection,
  handleRequestDappConnection,
  handleRevokeDappPermission,
} from "../../dapp/connectionHandlers";
import { removeAccountWithDappPrivacyBoundary } from "../../dapp/accountRemovalPrivacy";
import {
  handleConfirmErc7715PermissionRequest,
  handleRejectErc7715PermissionRequest,
} from "../../erc7715PermissionHandlers";
import { assertCurrentMasterAuthorization } from "../../masterAuthorization";
import { migrateFromLegacyStorage } from "../../accounts/legacyMigration";
import { addSeedPhraseGroup, deriveSeedAccounts } from "../../mnemonic/accountHandlers";
import { previewSeedAddresses } from "../../mnemonic/addressPreview";
import { generateNewMnemonic } from "../../mnemonic/derivation";
import { getPendingSignatureRequestById } from "../../requests/pendingSignatureStorage";
import {
  getAutoLockTimeout,
  getCachedApiKey,
  getCachedPassword,
  getCachedVaultKey,
  resolvePasswordType,
  tryRestoreSession,
} from "../../sessionCache";
import {
  handleRevealPrivateKey,
  handleRevealSeedPhrase,
} from "../../secretRevealHandlers";
import {
  hasUnresolvedSponsoredTransferIntent,
  withSponsoredTransferOperation,
} from "../../sponsoredTransfers/intentStorage";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import { isTrustedWalletUiSender } from "../../trustedWalletUiSender";
import {
  handleAddPrivateKeyAccount,
  handleConfirmSignatureRequest,
  handleConfirmSignatureRequestBankr,
  handleRemoveAccount,
  writeResultToStorage,
} from "../../txHandlers";
import {
  handleWalletConnectDisconnectSession,
  handleWalletConnectGetSessions,
  handleWalletConnectPair,
  handleWalletConnectSwitchChain,
} from "../../walletConnect/sessionCommands";
import { createBackgroundAccountManagementMessageRouter } from "../accountManagementRouter";
import { createBackgroundDappPermissionMessageRouter } from "../dappPermissionRouter";
import { createBackgroundSecretManagementMessageRouter } from "../secretManagementRouter";
import { createBackgroundWalletConnectSessionMessageRouter } from "../walletConnectSessionRouter";
import type { PendingResolutionComposition } from "./pendingResolution";
import { getEnsContenthashLastUpdated } from "../../ensBrowsing/contenthashHistory";
import {
  handleAddLedgerAccounts,
  handleGetLedgerDevices,
  handleLedgerCancel,
  handleLedgerConnect,
  handleLedgerScan,
} from "../../ledger/accountHandlers";
import { createBackgroundLedgerMessageRouter } from "../ledgerRouter";
import { handleConfirmLedgerSignatureRequest } from "../../ledger/signatureConfirmation";
import { clearTxHistoryForAddresses } from "../../txHistoryStorage";

export function composeAccountRoutes(
  pending: PendingResolutionComposition,
) {
  const routeBackgroundDappPermissionMessage =
    createBackgroundDappPermissionMessageRouter({
      handleGetDappAccounts,
      handleRequestDappConnection,
      getDappPermissions,
      handleGetDappConnectionContext,
      getPendingDappConnectionRequests,
      handleConfirmDappConnection,
      handleRejectDappConnection,
      handleRevokeDappPermission,
      getEnsContenthashLastUpdated,
      runPendingRequestResolution: pending.runPendingRequestResolution,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      writeResultToStorage,
    });

  const routeBackgroundWalletConnectSessionMessage =
    createBackgroundWalletConnectSessionMessageRouter({
      handleWalletConnectGetSessions,
      handleWalletConnectPair,
      handleWalletConnectDisconnectSession,
      handleWalletConnectSwitchChain,
    });

  const routeBackgroundAccountManagementMessage =
    createBackgroundAccountManagementMessageRouter({
      isTrustedWalletUiSender,
      migrateFromLegacyStorage,
      resolvePasswordType,
      handleUnlockWallet,
      prepareApiKeyUpdateWithCachedPassword,
      commitPreparedApiKeyUpdate,
      getAuthCeremonyEpoch,
      getCachedApiKey,
      verifyBankrCredentialAddress,
      withWalletSecretLock: (work) =>
        withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, work),
      assertCurrentMasterAuthorization,
      addBankrAccountWithCredentialUpdate,
      addBankrAccount,
      setActiveAccountId,
      addImpersonatorAccount,
      previewSeedAddresses,
      addSeedPhraseGroup,
      deriveSeedAccounts,
      getSeedGroups,
      renameSeedGroup,
      getCachedPassword,
      getAutoLockTimeout,
      tryRestoreSession,
      getCachedVaultKey,
      handleAddPrivateKeyAccount,
      withSponsoredTransferOperation,
      removeAccountWithDappPrivacyBoundary,
      getAccountById,
      hasUnresolvedSponsoredTransferIntent,
      getAccounts,
      handleRevokeDappPermission,
      handleRemoveAccount,
      clearTxHistoryForAddresses,
      sendRuntimeMessage: (runtimeMessage) =>
        chrome.runtime.sendMessage(runtimeMessage),
    });

  const routeBackgroundLedgerMessage = createBackgroundLedgerMessageRouter({
    handleLedgerConnect,
    handleLedgerScan,
    handleLedgerCancel,
    handleAddLedgerAccounts,
    handleGetLedgerDevices,
  });

  const routeBackgroundSecretManagementMessage =
    createBackgroundSecretManagementMessageRouter({
      isTrustedWalletUiSender,
      generateNewMnemonic,
      handleRevealSeedPhrase,
      handleRevealPrivateKey,
      runPendingRequestResolution: pending.runPendingRequestResolution,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      getPendingSignatureRequestById,
      getAccountById,
      handleConfirmSignatureRequestBankr,
      handleConfirmSignatureRequest,
      handleConfirmLedgerSignatureRequest,
      readLocalStorage: (key) => chrome.storage.local.get(key),
      writeResultToStorage,
      handleConfirmErc7715PermissionRequest,
      handleRejectErc7715PermissionRequest,
    });

  return {
    routeBackgroundDappPermissionMessage,
    routeBackgroundWalletConnectSessionMessage,
    routeBackgroundAccountManagementMessage,
    routeBackgroundLedgerMessage,
    routeBackgroundSecretManagementMessage,
  };
}
