/** Trusted-UI transport for account creation, migration, seed groups, and removal. */

export const BACKGROUND_ACCOUNT_MANAGEMENT_MESSAGE_TYPES = [
  "migrateFromLegacy",
  "addBankrAccount",
  "addImpersonatorAccount",
  "previewSeedAddresses",
  "addSeedPhraseGroup",
  "deriveSeedAccount",
  "getSeedGroups",
  "renameSeedGroup",
  "addPrivateKeyAccount",
  "removeAccount",
] as const;

export type BackgroundAccountManagementRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

export type BackgroundAccountManagementDependencies = {
  isTrustedWalletUiSender: (sender: chrome.runtime.MessageSender) => boolean;
  migrateFromLegacyStorage: () => Promise<boolean>;
  resolvePasswordType: (unlock: any) => Promise<string | null>;
  handleUnlockWallet: (...args: any[]) => Promise<any>;
  prepareApiKeyUpdateWithCachedPassword: (apiKey: string) => Promise<any>;
  commitPreparedApiKeyUpdate: (prepared: any) => void;
  getAuthCeremonyEpoch: () => string;
  getCachedApiKey: () => string | null;
  verifyBankrCredentialAddress: (apiKey: string, address: string) => Promise<void>;
  withWalletSecretLock: <T>(work: () => Promise<T>) => Promise<T>;
  assertCurrentMasterAuthorization: (expectedEpoch: string) => void;
  addBankrAccountWithCredentialUpdate: (...args: any[]) => Promise<any>;
  addBankrAccount: (...args: any[]) => Promise<any>;
  setActiveAccountId: (accountId: string, expectedEpoch?: string) => Promise<void>;
  addImpersonatorAccount: (...args: any[]) => Promise<any>;
  previewSeedAddresses: (message: any) => Promise<any>;
  addSeedPhraseGroup: (message: any) => Promise<any>;
  deriveSeedAccounts: (message: any) => Promise<any>;
  getSeedGroups: () => Promise<any>;
  renameSeedGroup: (seedGroupId: string, name: string) => Promise<void>;
  getCachedPassword: () => string | null;
  getAutoLockTimeout: () => Promise<number>;
  tryRestoreSession: (unlock: any) => Promise<boolean>;
  getCachedVaultKey: () => CryptoKey | null;
  handleAddPrivateKeyAccount: (...args: any[]) => Promise<any>;
  withSponsoredTransferOperation: <T>(work: () => Promise<T>) => Promise<T>;
  removeAccountWithDappPrivacyBoundary: (options: any) => Promise<any>;
  getAccountById: (accountId: string) => Promise<any>;
  hasUnresolvedSponsoredTransferIntent: (address: string) => Promise<boolean>;
  getAccounts: () => Promise<any[]>;
  handleRevokeDappPermission: (origin: string) => Promise<any>;
  handleRemoveAccount: (accountId: string, expectedEpoch: string) => Promise<any>;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
};

const HANDLED_ASYNC: BackgroundAccountManagementRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function broadcastAccountsUpdated(
  dependencies: BackgroundAccountManagementDependencies,
): void {
  void dependencies
    .sendRuntimeMessage({ type: "accountsUpdated" })
    .catch(() => {});
}

async function addBankrAccount(
  message: any,
  dependencies: BackgroundAccountManagementDependencies,
): Promise<any> {
  try {
    const passwordType = await dependencies.resolvePasswordType(
      dependencies.handleUnlockWallet,
    );
    if (passwordType !== "master") {
      return {
        success: false,
        error: "Adding accounts requires master password",
      };
    }

    const preparedCredential = message.apiKey
      ? await dependencies.prepareApiKeyUpdateWithCachedPassword(message.apiKey)
      : null;
    if (preparedCredential && !preparedCredential.success) {
      return preparedCredential;
    }
    const operationAuthEpoch = preparedCredential?.success
      ? preparedCredential.expectedAuthEpoch
      : dependencies.getAuthCeremonyEpoch();
    const verificationApiKey = preparedCredential?.success
      ? preparedCredential.apiKey
      : dependencies.getCachedApiKey();
    if (!verificationApiKey) {
      return {
        success: false,
        error: "Bankr credential is unavailable. Unlock and try again.",
      };
    }
    await dependencies.verifyBankrCredentialAddress(
      verificationApiKey,
      message.address,
    );

    const account = await dependencies.withWalletSecretLock(async () => {
      dependencies.assertCurrentMasterAuthorization(operationAuthEpoch);
      if (!preparedCredential?.success) {
        return dependencies.addBankrAccount(
          message.address,
          message.displayName,
          operationAuthEpoch,
        );
      }

      const added = await dependencies.addBankrAccountWithCredentialUpdate(
        message.address,
        message.displayName,
        preparedCredential.storageUpdate,
        operationAuthEpoch,
      );
      dependencies.commitPreparedApiKeyUpdate(preparedCredential);
      await dependencies
        .setActiveAccountId(added.id, operationAuthEpoch)
        .catch((error) => {
          console.warn(
            "[background] Failed to select newly added Bankr account:",
            error,
          );
        });
      return added;
    });
    broadcastAccountsUpdated(dependencies);
    return { success: true, account };
  } catch (error) {
    return {
      success: false,
      error: errorMessage(error, "Failed to add account"),
    };
  }
}

async function addImpersonatorAccount(
  message: any,
  dependencies: BackgroundAccountManagementDependencies,
): Promise<any> {
  try {
    const passwordType = await dependencies.resolvePasswordType(
      dependencies.handleUnlockWallet,
    );
    if (passwordType !== "master") {
      return {
        success: false,
        error: "Adding accounts requires master password",
      };
    }
    const operationAuthEpoch = dependencies.getAuthCeremonyEpoch();
    const account = await dependencies.withWalletSecretLock(async () => {
      dependencies.assertCurrentMasterAuthorization(operationAuthEpoch);
      return dependencies.addImpersonatorAccount(
        message.address,
        message.displayName,
        operationAuthEpoch,
      );
    });
    broadcastAccountsUpdated(dependencies);
    return { success: true, account };
  } catch (error) {
    return {
      success: false,
      error: errorMessage(error, "Failed to add account"),
    };
  }
}

async function addPrivateKeyAccount(
  message: any,
  dependencies: BackgroundAccountManagementDependencies,
): Promise<any> {
  const passwordType = await dependencies.resolvePasswordType(
    dependencies.handleUnlockWallet,
  );
  if (passwordType !== "master") {
    return {
      success: false,
      error: "Adding accounts requires master password",
    };
  }
  let password = message.password || dependencies.getCachedPassword();
  let vaultKey = dependencies.getCachedVaultKey();
  if (
    !password &&
    !vaultKey &&
    (await dependencies.getAutoLockTimeout()) === 0
  ) {
    const restored = await dependencies.tryRestoreSession(
      dependencies.handleUnlockWallet,
    );
    if (restored) {
      password = dependencies.getCachedPassword();
      vaultKey = dependencies.getCachedVaultKey();
    }
  }
  if (!password && !vaultKey) {
    return { success: false, error: "Wallet is locked" };
  }
  const operationAuthEpoch = dependencies.getAuthCeremonyEpoch();
  return dependencies.handleAddPrivateKeyAccount(
    message.privateKey,
    password,
    message.displayName,
    operationAuthEpoch,
  );
}

async function removeAccount(
  message: any,
  dependencies: BackgroundAccountManagementDependencies,
): Promise<any> {
  const passwordType = await dependencies.resolvePasswordType(
    dependencies.handleUnlockWallet,
  );
  if (passwordType !== "master") {
    return {
      success: false,
      error: "Account removal requires master password",
    };
  }
  const operationAuthEpoch = dependencies.getAuthCeremonyEpoch();
  try {
    return await dependencies.withSponsoredTransferOperation(() =>
      dependencies.removeAccountWithDappPrivacyBoundary({
        accountId: message.accountId,
        validateRemoval: async () => {
          const account = await dependencies.getAccountById(message.accountId);
          if (!account) throw new Error("Account not found");
          if (
            await dependencies.hasUnresolvedSponsoredTransferIntent(
              account.address,
            )
          ) {
            throw new Error(
              "Check the pending sponsored transfer before removing this account",
            );
          }
          if ((await dependencies.getAccounts()).length <= 1) {
            throw new Error("Cannot remove the last account");
          }
        },
        revokeOrigin: (origin: string) =>
          dependencies.handleRevokeDappPermission(origin),
        removeAccount: () =>
          dependencies.handleRemoveAccount(
            message.accountId,
            operationAuthEpoch,
          ),
      }),
    );
  } catch (error) {
    return {
      success: false,
      error: errorMessage(
        error,
        "Failed to disconnect sites before account removal",
      ),
    };
  }
}

export function createBackgroundAccountManagementMessageRouter(
  dependencies: BackgroundAccountManagementDependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundAccountManagementRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "migrateFromLegacy":
        if (!dependencies.isTrustedWalletUiSender(sender)) {
          sendResponse({ migrated: false });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies
          .migrateFromLegacyStorage()
          .then((migrated) => sendResponse({ migrated }));
        return HANDLED_ASYNC;
      case "addBankrAccount":
        void addBankrAccount(message, dependencies).then(sendResponse);
        return HANDLED_ASYNC;
      case "addImpersonatorAccount":
        void addImpersonatorAccount(message, dependencies).then(sendResponse);
        return HANDLED_ASYNC;
      case "previewSeedAddresses":
        void dependencies.previewSeedAddresses(message).then(sendResponse);
        return HANDLED_ASYNC;
      case "addSeedPhraseGroup":
        void dependencies.addSeedPhraseGroup(message).then(sendResponse);
        return HANDLED_ASYNC;
      case "deriveSeedAccount":
        void dependencies.deriveSeedAccounts(message).then(sendResponse);
        return HANDLED_ASYNC;
      case "getSeedGroups":
        dependencies.getSeedGroups().then(sendResponse);
        return HANDLED_ASYNC;
      case "renameSeedGroup": {
        const name = (typeof message.name === "string" ? message.name : "")
          .trim()
          .slice(0, 100);
        if (!message.seedGroupId || !name) {
          sendResponse({ success: false, error: "Missing seedGroupId or name" });
          return HANDLED_ASYNC;
        }
        dependencies
          .renameSeedGroup(message.seedGroupId, name)
          .then(() => {
            broadcastAccountsUpdated(dependencies);
            sendResponse({ success: true });
          })
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to rename"),
            }),
          );
        return HANDLED_ASYNC;
      }
      case "addPrivateKeyAccount":
        void addPrivateKeyAccount(message, dependencies).then(sendResponse);
        return HANDLED_ASYNC;
      case "removeAccount":
        void removeAccount(message, dependencies).then(sendResponse);
        return HANDLED_ASYNC;
      default:
        return { handled: false };
    }
  };
}
