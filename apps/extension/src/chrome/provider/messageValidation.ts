import { validateWalletSendCallsPayload } from "./batchValidation";
import { validateProviderChainBoundary } from "./chainBoundary";
import {
  MAX_PROVIDER_REQUEST_CHARS,
  MAX_RPC_PARAMS_CHARS,
  serializedJsonLength,
} from "./limits";
import {
  isValidOptionalProviderImageUrl,
  validateAddChainProviderRequest,
  validateWatchAssetProviderRequest,
} from "./metadataValidation";
import { isEvmAddress, isProviderRequestId } from "./primitives";
import { validateSignatureRequestPayload } from "./signatureValidation";
import { validateTransactionPayload } from "./transactionValidation";
import {
  failProviderValidation,
  type ProviderValidationResult,
} from "./validation";

export type ExternalProviderValidationResult = ProviderValidationResult;

function validateChainPinnedRequest(
  requestedChainId: unknown,
  providerChainId: unknown,
): ProviderValidationResult {
  const result = validateProviderChainBoundary(requestedChainId, providerChainId);
  return result.valid ? { valid: true } : failProviderValidation(result.error);
}

/**
 * Bounds data crossing the webpage/content-script boundary before persistence,
 * cryptographic parsing, or extension-owned RPC access.
 */
export function validateExternalProviderMessage(
  message: unknown,
): ExternalProviderValidationResult {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return failProviderValidation("Invalid provider request");
  }
  const candidate = message as Record<string, unknown>;
  if (typeof candidate.type !== "string") {
    return failProviderValidation("Invalid provider request");
  }

  const totalLength = serializedJsonLength(candidate);
  if (totalLength === null || totalLength > MAX_PROVIDER_REQUEST_CHARS) {
    return failProviderValidation("Provider request is too large");
  }
  if (!isValidOptionalProviderImageUrl(candidate.favicon)) {
    return failProviderValidation("Invalid favicon URL");
  }

  switch (candidate.type) {
    case "openProviderRequestSidePanel":
      return candidate.requestType === "i_sendTransaction" ||
        candidate.requestType === "i_signatureRequest" ||
        candidate.requestType === "i_walletSendCalls" ||
        (candidate.requestType === "i_walletExecutionPermissions" &&
          candidate.permissionMethod ===
            "wallet_requestExecutionPermissions")
        ? { valid: true }
        : failProviderValidation("Invalid provider side-panel request");

    case "requestDappConnection":
      return isProviderRequestId(candidate.requestId)
        ? { valid: true }
        : failProviderValidation("Invalid connection request id");

    case "sendTransaction": {
      if (
        !isProviderRequestId(candidate.txId) ||
        !candidate.tx ||
        typeof candidate.tx !== "object" ||
        Array.isArray(candidate.tx)
      ) {
        return failProviderValidation("Invalid transaction request");
      }
      const transactionResult = validateTransactionPayload(candidate.tx);
      if (!transactionResult.valid) return transactionResult;
      const transaction = candidate.tx as Record<string, unknown>;
      if (typeof transaction.from !== "string" || transaction.from.length === 0) {
        return failProviderValidation("Transaction 'from' must be a valid address");
      }
      if (typeof transaction.chainId !== "number") {
        return failProviderValidation("Transaction must include a valid chainId");
      }
      return validateChainPinnedRequest(
        transaction.chainId,
        candidate.providerChainId,
      );
    }

    case "signatureRequest": {
      if (
        !isProviderRequestId(candidate.sigId) ||
        !candidate.signature ||
        typeof candidate.signature !== "object" ||
        Array.isArray(candidate.signature)
      ) {
        return failProviderValidation("Invalid signature request");
      }
      const signature = candidate.signature as Record<string, unknown>;
      const chainResult = validateChainPinnedRequest(
        signature.chainId,
        candidate.providerChainId,
      );
      if (!chainResult.valid) return chainResult;
      return validateSignatureRequestPayload(signature.method, signature.params);
    }

    case "walletSendCalls": {
      if (!isProviderRequestId(candidate.bundleId) || !candidate.params) {
        return failProviderValidation("Invalid batch request");
      }
      const params = candidate.params as Record<string, unknown>;
      const chainResult = validateChainPinnedRequest(
        params.chainId,
        candidate.providerChainId,
      );
      if (!chainResult.valid) return chainResult;
      return validateWalletSendCallsPayload(candidate.params);
    }

    case "rpcRequest": {
      if (!isProviderRequestId(candidate.rpcId) || !Array.isArray(candidate.params)) {
        return failProviderValidation("Invalid RPC request");
      }
      const paramsLength = serializedJsonLength(candidate.params);
      return paramsLength !== null && paramsLength <= MAX_RPC_PARAMS_CHARS
        ? { valid: true }
        : failProviderValidation("RPC request is too large");
    }

    case "walletGetCapabilities":
      if (!isProviderRequestId(candidate.requestId) || !isEvmAddress(candidate.address)) {
        return failProviderValidation("Invalid capabilities request");
      }
      if (
        candidate.chainIds !== undefined &&
        (!Array.isArray(candidate.chainIds) ||
          candidate.chainIds.length > 100 ||
          candidate.chainIds.some(
            (chainId: unknown) =>
              typeof chainId !== "string" ||
              !/^0x[1-9a-fA-F][0-9a-fA-F]*$/.test(chainId) ||
              chainId.length > 66,
          ))
      ) {
        return failProviderValidation("Invalid capabilities chain ids");
      }
      return { valid: true };

    case "walletGetCallsStatus":
      return isProviderRequestId(candidate.requestId) &&
        isProviderRequestId(candidate.bundleId)
        ? { valid: true }
        : failProviderValidation("Invalid provider request id");

    case "addEthereumChain":
      return validateAddChainProviderRequest(candidate);

    case "watchAsset":
      return validateWatchAssetProviderRequest(candidate);

    case "walletShowCallsStatus":
      return isProviderRequestId(candidate.bundleId)
        ? { valid: true }
        : failProviderValidation("Invalid bundle id");

    case "dappChainSwitchNotification":
      return Number.isSafeInteger(candidate.chainId) && Number(candidate.chainId) > 0
        ? { valid: true }
        : failProviderValidation("Invalid chain switch notification");

    case "getActiveAccount":
    case "getDappAccounts":
      return isProviderRequestId(candidate.requestId) ||
        candidate.requestId === undefined
        ? { valid: true }
        : failProviderValidation("Invalid provider request id");

    case "walletExecutionPermissions": {
      const supportedMethod =
        candidate.method === "wallet_getSupportedExecutionPermissions" ||
        candidate.method === "wallet_getGrantedExecutionPermissions" ||
        candidate.method === "wallet_requestExecutionPermissions";
      if (
        !supportedMethod ||
        !Array.isArray(candidate.params) ||
        (candidate.method === "wallet_requestExecutionPermissions" &&
          !isProviderRequestId(candidate.requestId)) ||
        (candidate.requestId !== undefined &&
          !isProviderRequestId(candidate.requestId))
      ) {
        return failProviderValidation("Invalid execution permission request");
      }
      return validateChainPinnedRequest(
        candidate.chainId,
        candidate.providerChainId,
      );
    }

    default:
      return failProviderValidation("Unsupported provider request");
  }
}
