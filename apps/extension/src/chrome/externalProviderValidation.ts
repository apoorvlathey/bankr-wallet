import {
  MAX_PROVIDER_REQUEST_CHARS,
  MAX_PROVIDER_URL_CHARS,
  MAX_RPC_PARAMS_CHARS,
  serializedJsonLength,
  validateSignatureRequestPayload,
  validateTransactionPayload,
  validateWalletSendCallsPayload,
} from "./providerRequestLimits";
import { validateProviderChainBoundary } from "./providerChainBoundary";
import { sanitizeUntrustedImageUrl } from "@/lib/remoteImagePolicy";
import { sanitizeExternalNavigationUrl } from "@/lib/externalNavigation";
import { assertSecureRpcConfigurationUrl } from "./rpcHttpClient";

export interface ExternalProviderValidationResult {
  valid: boolean;
  error?: string;
}

function validInternalId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function validOptionalUrl(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "string" &&
      value.length <= MAX_PROVIDER_URL_CHARS &&
      sanitizeUntrustedImageUrl(value) === value)
  );
}

function fail(error: string): ExternalProviderValidationResult {
  return { valid: false, error };
}

function validEvmAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function validBoundedHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_PROVIDER_URL_CHARS) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function validRpcConfigurationUrl(value: unknown): value is string {
  if (!validBoundedHttpUrl(value)) return false;
  try {
    assertSecureRpcConfigurationUrl(value);
    return true;
  } catch {
    return false;
  }
}

function validateAddChainRequest(
  candidate: Record<string, any>,
): ExternalProviderValidationResult {
  if (!validInternalId(candidate.requestId)) {
    return fail("Invalid provider request id");
  }
  if (!Number.isSafeInteger(candidate.chainId) || candidate.chainId <= 0) {
    return fail("Invalid chain id");
  }
  if (
    candidate.chainName !== undefined &&
    (typeof candidate.chainName !== "string" ||
      candidate.chainName.trim().length === 0 ||
      candidate.chainName.length > 100)
  ) {
    return fail("Invalid chain name");
  }
  const rpcUrls = candidate.rpcUrls;
  if (
    !Array.isArray(rpcUrls) ||
    rpcUrls.length === 0 ||
    rpcUrls.length > 10 ||
    !rpcUrls.every(validRpcConfigurationUrl)
  ) {
    return fail("Invalid chain RPC URLs");
  }
  if (
    candidate.blockExplorerUrls !== undefined &&
    (!Array.isArray(candidate.blockExplorerUrls) ||
      candidate.blockExplorerUrls.length > 10 ||
      !candidate.blockExplorerUrls.every(
        (value: unknown) => sanitizeExternalNavigationUrl(value) !== null,
      ))
  ) {
    return fail("Invalid block explorer URLs");
  }
  const native = candidate.nativeCurrency;
  if (
    !native ||
    typeof native !== "object" ||
    typeof native.name !== "string" ||
    native.name.trim().length === 0 ||
    native.name.length > 100 ||
    typeof native.symbol !== "string" ||
    native.symbol.trim().length === 0 ||
    native.symbol.length > 11 ||
    !Number.isInteger(native.decimals) ||
    native.decimals < 0 ||
    native.decimals > 255
  ) {
    return fail("Invalid native currency");
  }
  return { valid: true };
}

function validateWatchAssetRequest(
  candidate: Record<string, any>,
): ExternalProviderValidationResult {
  if (!validInternalId(candidate.watchAssetId)) {
    return fail("Invalid asset request id");
  }
  const asset = candidate.asset;
  if (
    !asset ||
    typeof asset !== "object" ||
    !validEvmAddress(asset.address) ||
    typeof asset.symbol !== "string" ||
    asset.symbol.trim().length === 0 ||
    asset.symbol.length > 11 ||
    !Number.isInteger(asset.decimals) ||
    asset.decimals < 0 ||
    asset.decimals > 255 ||
    (asset.image !== undefined &&
      sanitizeUntrustedImageUrl(asset.image) !== asset.image)
  ) {
    return fail("Invalid asset metadata");
  }
  const chainBoundary = validateProviderChainBoundary(
    candidate.chainId,
    candidate.providerChainId,
  );
  return chainBoundary.valid ? { valid: true } : fail(chainBoundary.error);
}

/**
 * Bounds messages that crossed the webpage/content-script boundary before
 * they reach persistence, cryptographic parsing, or an extension-owned RPC.
 * The limits are deliberately above valid EVM initcode/calldata sizes while
 * preventing unbounded pending queues and multi-megabyte structured clones.
 */
export function validateExternalProviderMessage(
  message: unknown,
): ExternalProviderValidationResult {
  if (!message || typeof message !== "object") return fail("Invalid provider request");
  const candidate = message as Record<string, any>;
  if (typeof candidate.type !== "string") return fail("Invalid provider request");

  const totalLength = serializedJsonLength(candidate);
  if (totalLength === null || totalLength > MAX_PROVIDER_REQUEST_CHARS) {
    return fail("Provider request is too large");
  }

  if (!validOptionalUrl(candidate.favicon)) return fail("Invalid favicon URL");

  switch (candidate.type) {
    case "requestDappConnection":
      return validInternalId(candidate.requestId)
        ? { valid: true }
        : fail("Invalid connection request id");

    case "expireProviderRequest":
      return validInternalId(candidate.requestId) &&
        (candidate.requestKind === "transaction" ||
          candidate.requestKind === "signature" ||
          candidate.requestKind === "dappConnection" ||
          candidate.requestKind === "erc7715Permission" ||
          candidate.requestKind === "addChain" ||
          candidate.requestKind === "watchAsset" ||
          candidate.requestKind === "batchTransaction")
        ? { valid: true }
        : fail("Invalid expiring provider request");

    case "sendTransaction": {
      if (!validInternalId(candidate.txId) || !candidate.tx || typeof candidate.tx !== "object") {
        return fail("Invalid transaction request");
      }
      const transactionResult = validateTransactionPayload(candidate.tx);
      if (!transactionResult.valid) return transactionResult;
      if (typeof candidate.tx.from !== "string" || candidate.tx.from.length === 0) {
        return fail("Transaction 'from' must be a valid address");
      }
      if (typeof candidate.tx.chainId !== "number") {
        return fail("Transaction must include a valid chainId");
      }
      const chainBoundary = validateProviderChainBoundary(
        candidate.tx.chainId,
        candidate.providerChainId,
      );
      if (!chainBoundary.valid) return fail(chainBoundary.error);
      return { valid: true };
    }

    case "signatureRequest": {
      if (!validInternalId(candidate.sigId) || !candidate.signature) {
        return fail("Invalid signature request");
      }
      const chainBoundary = validateProviderChainBoundary(
        candidate.signature.chainId,
        candidate.providerChainId,
      );
      if (!chainBoundary.valid) return fail(chainBoundary.error);
      return validateSignatureRequestPayload(
        candidate.signature.method,
        candidate.signature.params,
      );
    }

    case "walletSendCalls": {
      if (!validInternalId(candidate.bundleId) || !candidate.params) {
        return fail("Invalid batch request");
      }
      const chainBoundary = validateProviderChainBoundary(
        candidate.params.chainId,
        candidate.providerChainId,
      );
      if (!chainBoundary.valid) return fail(chainBoundary.error);
      return validateWalletSendCallsPayload(candidate.params);
    }

    case "rpcRequest": {
      if (!validInternalId(candidate.rpcId) || !Array.isArray(candidate.params)) {
        return fail("Invalid RPC request");
      }
      const paramsLength = serializedJsonLength(candidate.params);
      return paramsLength !== null && paramsLength <= MAX_RPC_PARAMS_CHARS
        ? { valid: true }
        : fail("RPC request is too large");
    }

    case "walletGetCapabilities":
      if (!validInternalId(candidate.requestId) || !validEvmAddress(candidate.address)) {
        return fail("Invalid capabilities request");
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
        return fail("Invalid capabilities chain ids");
      }
      return { valid: true };

    case "walletGetCallsStatus":
      return validInternalId(candidate.requestId) &&
        validInternalId(candidate.bundleId)
        ? { valid: true }
        : fail("Invalid provider request id");

    case "addEthereumChain":
      return validateAddChainRequest(candidate);

    case "watchAsset":
      return validateWatchAssetRequest(candidate);

    case "walletShowCallsStatus":
      return validInternalId(candidate.bundleId)
        ? { valid: true }
        : fail("Invalid bundle id");

    case "dappChainSwitchNotification":
      return Number.isSafeInteger(candidate.chainId) && candidate.chainId > 0
        ? { valid: true }
        : fail("Invalid chain switch notification");

    case "getActiveAccount":
    case "getDappAccounts":
      return validInternalId(candidate.requestId)
        || candidate.requestId === undefined
        ? { valid: true }
        : fail("Invalid provider request id");

    case "walletExecutionPermissions": {
      const supportedMethod =
        candidate.method === "wallet_getSupportedExecutionPermissions" ||
        candidate.method === "wallet_getGrantedExecutionPermissions" ||
        candidate.method === "wallet_requestExecutionPermissions";
      if (
        !supportedMethod ||
        !Array.isArray(candidate.params) ||
        (candidate.method === "wallet_requestExecutionPermissions" &&
          !validInternalId(candidate.requestId)) ||
        (candidate.requestId !== undefined &&
          !validInternalId(candidate.requestId))
      ) {
        return fail("Invalid execution permission request");
      }
      const chainBoundary = validateProviderChainBoundary(
        candidate.chainId,
        candidate.providerChainId,
      );
      return chainBoundary.valid ? { valid: true } : fail(chainBoundary.error);
    }

    default:
      return fail("Unsupported provider request");
  }
}
