import {
  MAX_PROVIDER_REQUEST_CHARS,
  serializedJsonLength,
  validateSignatureRequestPayload,
  validateTransactionPayload,
  validateWalletSendCallsPayload,
  type ProviderRequestLimitResult,
} from "../providerRequestLimits";

const SIGNATURE_METHODS = new Set([
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
]);

function fail(error: string): ProviderRequestLimitResult {
  return { valid: false, error };
}

/**
 * Bounds WalletConnect relay input before schema parsing, persistence, or
 * opening a confirmation surface. WalletConnect does not pass through the
 * content-script validator, so it must enforce the same resource ceilings.
 */
export function validateWalletConnectRequestPayload(
  method: unknown,
  params: unknown,
): ProviderRequestLimitResult {
  if (typeof method !== "string" || !Array.isArray(params)) {
    return fail("Invalid WalletConnect request params");
  }

  const requestLength = serializedJsonLength({ method, params });
  if (
    requestLength === null ||
    requestLength > MAX_PROVIDER_REQUEST_CHARS
  ) {
    return fail("WalletConnect request is too large");
  }

  if (method === "eth_sendTransaction") {
    const transaction = params[0];
    const transactionResult = validateTransactionPayload(transaction);
    if (!transactionResult.valid) return transactionResult;
  }

  if (SIGNATURE_METHODS.has(method)) {
    const signatureResult = validateSignatureRequestPayload(method, params, {
      // The request handler emits the wallet's explicit deprecation error for
      // these two methods before any prompt is created.
      allowDeprecated: true,
    });
    if (!signatureResult.valid) return signatureResult;
  }

  if (method === "wallet_sendCalls") {
    return validateWalletSendCallsPayload(params[0] ?? params);
  }

  return { valid: true };
}
