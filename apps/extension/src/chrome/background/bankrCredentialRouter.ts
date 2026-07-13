/** Trusted-UI transport for the wallet-wide Bankr credential binding. */

export const BACKGROUND_BANKR_CREDENTIAL_MESSAGE_TYPES = [
  "saveBankrApiKeyAndAddress",
  "saveApiKeyWithCachedPassword",
  "getCachedApiKey",
] as const;

export type BackgroundBankrCredentialRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

export type BackgroundBankrCredentialDependencies = {
  isTrustedWalletUiSender: (sender: chrome.runtime.MessageSender) => boolean;
  validateBankrAccountAddressUpdate: (
    accountId: string,
    address: string,
  ) => Promise<void>;
  prepareApiKeyUpdateWithCachedPassword: (apiKey: string) => Promise<any>;
  verifyBankrCredentialAddress: (
    apiKey: string,
    address: string,
  ) => Promise<void>;
  withWalletSecretLock: <T>(work: () => Promise<T>) => Promise<T>;
  assertCurrentMasterAuthorization: (expectedEpoch: string) => void;
  updateBankrAccountAddressWithCredentialUpdate: (
    accountId: string,
    address: string,
    storageUpdate: any,
    expectedEpoch: string,
  ) => Promise<any>;
  commitPreparedApiKeyUpdate: (prepared: any) => void;
  getActiveAccount: () => Promise<any>;
  setSyncStorage: (values: Record<string, unknown>) => Promise<void>;
  getTabAccounts: () => Promise<Record<string, string>>;
  sendAccountToTab: (tabId: number, account: any) => Promise<void>;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
  getCachedApiKey: () => string | null;
  getAutoLockTimeout: () => Promise<number>;
  tryRestoreSession: (unlock: any) => Promise<boolean>;
  handleUnlockWallet: (...args: any[]) => Promise<any>;
  getPasswordType: () => string | null;
  warn: (message: string, error: unknown) => void;
};

const HANDLED_ASYNC: BackgroundBankrCredentialRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_SYNC: BackgroundBankrCredentialRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function saveBankrApiKeyAndAddress(
  message: any,
  dependencies: BackgroundBankrCredentialDependencies,
): Promise<any> {
  const accountId =
    typeof message.accountId === "string" ? message.accountId : "";
  const apiKey =
    typeof message.apiKey === "string" ? message.apiKey.trim() : "";
  const address =
    typeof message.address === "string" ? message.address.trim() : "";

  if (!accountId || !apiKey || !address) {
    return {
      success: false,
      error: "Missing account, API key, or address",
    };
  }

  try {
    await dependencies.validateBankrAccountAddressUpdate(accountId, address);
    const prepared =
      await dependencies.prepareApiKeyUpdateWithCachedPassword(apiKey);
    if (!prepared.success) return prepared;

    // Prove the replacement global credential controls the replacement
    // account address before publishing either value.
    await dependencies.verifyBankrCredentialAddress(prepared.apiKey, address);

    const updated = await dependencies.withWalletSecretLock(async () => {
      dependencies.assertCurrentMasterAuthorization(prepared.expectedAuthEpoch);
      const committed =
        await dependencies.updateBankrAccountAddressWithCredentialUpdate(
          accountId,
          address,
          prepared.storageUpdate,
          prepared.expectedAuthEpoch,
        );
      dependencies.commitPreparedApiKeyUpdate(prepared);
      return committed;
    });

    // Security-critical local state is committed. Mirrors and open-tab
    // notifications are best effort and cannot turn success into a failure.
    try {
      const activeAccount = await dependencies.getActiveAccount();
      if (activeAccount?.id === updated.id) {
        await dependencies.setSyncStorage({
          address: updated.address,
          displayAddress: updated.displayName || updated.address,
        });
      }
    } catch (error) {
      dependencies.warn(
        "[background] Failed to update active Bankr mirror:",
        error,
      );
    }

    try {
      const tabAccounts = await dependencies.getTabAccounts();
      for (const [tabId, mappedAccountId] of Object.entries(tabAccounts)) {
        if (mappedAccountId === updated.id) {
          await dependencies.sendAccountToTab(Number(tabId), updated);
        }
      }
    } catch (error) {
      dependencies.warn("[background] Failed to notify Bankr tabs:", error);
    }

    void dependencies
      .sendRuntimeMessage({ type: "accountsUpdated" })
      .catch(() => {});
    return { success: true, account: updated };
  } catch (error) {
    return {
      success: false,
      error: errorMessage(error, "Failed to save configuration"),
    };
  }
}

async function readCachedApiKey(
  dependencies: BackgroundBankrCredentialDependencies,
): Promise<{ apiKey: string | null }> {
  let apiKey = dependencies.getCachedApiKey();
  if (!apiKey && (await dependencies.getAutoLockTimeout()) === 0) {
    const restored = await dependencies.tryRestoreSession(
      dependencies.handleUnlockWallet,
    );
    if (restored) apiKey = dependencies.getCachedApiKey();
  }
  // Agent sessions may use the Bankr capability but never read its secret.
  if (dependencies.getPasswordType() !== "master") return { apiKey: null };
  return { apiKey: apiKey || null };
}

export function createBackgroundBankrCredentialMessageRouter(
  dependencies: BackgroundBankrCredentialDependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundBankrCredentialRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "saveBankrApiKeyAndAddress":
        void saveBankrApiKeyAndAddress(message, dependencies).then(sendResponse);
        return HANDLED_ASYNC;

      case "saveApiKeyWithCachedPassword":
        // Credential-only replacement can rebind existing approvals to the
        // wrong remote signer. Keep a terminal response for stale UI builds.
        sendResponse({
          success: false,
          error: "Update the Bankr credential from that account's settings.",
        });
        return HANDLED_SYNC;

      case "getCachedApiKey":
        if (!dependencies.isTrustedWalletUiSender(sender)) {
          sendResponse({ apiKey: null });
          return HANDLED_ASYNC;
        }
        void readCachedApiKey(dependencies).then(sendResponse);
        return HANDLED_ASYNC;

      default:
        return { handled: false };
    }
  };
}
