/** Provider signature-method and EIP-712 validation before durable intake. */

export type BackgroundSignatureValidationDependencies = {
  validateEIP712TypedData: (method: string, payload: unknown) => any;
  rawErc7710DelegationSignatureError: string;
  writeResultToStorage: (key: string, result: any) => Promise<void>;
  handleSignatureRequest: (...args: any[]) => void;
  warn: (...args: any[]) => void;
};

export function createEnqueueAuthorizedSignatureRequest(
  dependencies: BackgroundSignatureValidationDependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  trustedOrigin: string,
) => void {
  const reject = (sigId: unknown, error: string): void => {
    void dependencies.writeResultToStorage(`sigResult:${sigId}`, {
      success: false,
      error,
    });
  };

  return (message, sender, trustedOrigin) => {
    const { signature } = message;
    if (
      !signature ||
      typeof signature !== "object" ||
      typeof signature.method !== "string" ||
      !Array.isArray(signature.params)
    ) {
      reject(message.sigId, "Invalid signature request");
      return;
    }

    if (signature.method === "eth_sign") {
      reject(
        message.sigId,
        "eth_sign is deprecated and unsafe; use personal_sign or eth_signTypedData_v4",
      );
      return;
    }
    if (signature.method === "eth_signTypedData") {
      reject(
        message.sigId,
        "eth_signTypedData (v1) is deprecated; please use eth_signTypedData_v4",
      );
      return;
    }

    if (
      signature.method === "eth_signTypedData_v3" ||
      signature.method === "eth_signTypedData_v4"
    ) {
      const validation = dependencies.validateEIP712TypedData(
        signature.method,
        signature.params[1],
      );
      if (!validation.valid) {
        dependencies.warn(
          `[WalletChan] EIP-712 validation failed for ${trustedOrigin}:`,
          validation.error,
        );
        reject(
          message.sigId,
          validation.error ===
            dependencies.rawErc7710DelegationSignatureError
            ? dependencies.rawErc7710DelegationSignatureError
            : "Data must conform to EIP-712 schema",
        );
        return;
      }
      if (validation.sanitized) signature.params[1] = validation.sanitized;
    }

    dependencies.handleSignatureRequest(
      message,
      message.sigId,
      sender.tab?.windowId,
      trustedOrigin,
      sender.tab?.id,
      sender.frameId,
    );
  };
}
