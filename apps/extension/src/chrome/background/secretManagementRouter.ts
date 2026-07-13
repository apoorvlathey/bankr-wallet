/** Trusted-UI transport for plaintext release and signing-capability decisions. */

export const BACKGROUND_SECRET_MANAGEMENT_MESSAGE_TYPES = [
  "generateMnemonic",
  "revealSeedPhrase",
  "revealPrivateKey",
  "confirmSignatureRequest",
  "confirmErc7715PermissionRequest",
  "rejectErc7715PermissionRequest",
] as const;

export type BackgroundSecretManagementRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

export type BackgroundSecretManagementDependencies = {
  isTrustedWalletUiSender: (sender: chrome.runtime.MessageSender) => boolean;
  generateNewMnemonic: () => string;
  handleRevealSeedPhrase: (
    seedGroupId: string,
    password: string,
    sendResponse: (response?: any) => void,
  ) => Promise<void> | void;
  handleRevealPrivateKey: (
    accountId: string,
    password: string,
    sendResponse: (response?: any) => void,
  ) => Promise<void> | void;
  runPendingRequestResolution: <T>(options: any) => Promise<T>;
  pendingResolutionConflict: (action: any) => any;
  getPendingSignatureRequestById: (sigId: string) => Promise<any>;
  getAccountById: (accountId: string) => Promise<any>;
  handleConfirmSignatureRequestBankr: (...args: any[]) => Promise<any>;
  handleConfirmSignatureRequest: (...args: any[]) => Promise<any>;
  readLocalStorage: (key: string) => Promise<Record<string, unknown>>;
  writeResultToStorage: (key: string, result: any) => Promise<void>;
  handleConfirmErc7715PermissionRequest: (...args: any[]) => Promise<any>;
  handleRejectErc7715PermissionRequest: (requestId: string) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundSecretManagementRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function confirmSignatureRequest(
  message: any,
  sender: chrome.runtime.MessageSender,
  dependencies: BackgroundSecretManagementDependencies,
): Promise<any> {
  const tabId = message.tabId || sender.tab?.id;
  const sigId = typeof message.sigId === "string" ? message.sigId : "";
  return dependencies.runPendingRequestResolution({
    family: "signature",
    requestId: sigId,
    action: "confirm",
    conflictResult: dependencies.pendingResolutionConflict,
    resolve: async () => {
      const pending = await dependencies.getPendingSignatureRequestById(sigId);
      if (!pending) {
        return { success: false, error: "Signature request not found" };
      }

      let pinnedType = pending.accountType;
      if (!pinnedType && pending.accountId) {
        const pinnedAccount = await dependencies.getAccountById(
          pending.accountId,
        );
        pinnedType = pinnedAccount?.type;
      }

      let result: any;
      if (pinnedType === "bankr") {
        result = await dependencies.handleConfirmSignatureRequestBankr(
          sigId,
          message.password,
          message.allowUnsafeSiwe === true,
        );
      } else if (
        pinnedType === "privateKey" ||
        pinnedType === "seedPhrase"
      ) {
        result = await dependencies.handleConfirmSignatureRequest(
          sigId,
          message.password,
          tabId,
          message.allowUnsafeSiwe === true,
        );
      } else {
        result = {
          success: false,
          error: "Pending request is no longer valid",
        };
      }

      // A safe pre-sign failure remains pending and must not resolve the dapp.
      if (!(await dependencies.getPendingSignatureRequestById(sigId))) {
        const resultKey = `sigResult:${sigId}`;
        const existing = await dependencies.readLocalStorage(resultKey);
        if (!existing[resultKey]) {
          await dependencies.writeResultToStorage(resultKey, result);
        }
      }
      return result;
    },
  });
}

export function createBackgroundSecretManagementMessageRouter(
  dependencies: BackgroundSecretManagementDependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundSecretManagementRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "generateMnemonic":
        if (!dependencies.isTrustedWalletUiSender(sender)) {
          sendResponse({ success: false, error: "Unauthorized" });
          return { handled: true, keepChannelOpen: false };
        }
        sendResponse({
          success: true,
          mnemonic: dependencies.generateNewMnemonic(),
        });
        return { handled: true, keepChannelOpen: false };
      case "revealSeedPhrase":
        if (!dependencies.isTrustedWalletUiSender(sender)) {
          sendResponse({ success: false, error: "Unauthorized" });
          return HANDLED_ASYNC;
        }
        void dependencies.handleRevealSeedPhrase(
          typeof message.seedGroupId === "string" ? message.seedGroupId : "",
          typeof message.password === "string" ? message.password : "",
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "revealPrivateKey":
        if (!dependencies.isTrustedWalletUiSender(sender)) {
          sendResponse({ success: false, error: "Unauthorized" });
          return HANDLED_ASYNC;
        }
        void dependencies.handleRevealPrivateKey(
          typeof message.accountId === "string" ? message.accountId : "",
          typeof message.password === "string" ? message.password : "",
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "confirmSignatureRequest":
        void confirmSignatureRequest(message, sender, dependencies)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(
                error,
                "Failed to confirm signature request",
              ),
            }),
          );
        return HANDLED_ASYNC;
      case "confirmErc7715PermissionRequest":
        dependencies
          .handleConfirmErc7715PermissionRequest(
            message.requestId,
            message.password || "",
            message.editedRequest,
          )
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "rejectErc7715PermissionRequest":
        dependencies
          .handleRejectErc7715PermissionRequest(message.requestId)
          .then(sendResponse);
        return HANDLED_ASYNC;
      default:
        return { handled: false };
    }
  };
}
