import { sanitizeExternalNavigationUrl } from "@/lib/externalNavigation";
import { classifyPrivateNetworkHostname } from "@/lib/privateNetworkPolicy";
import { sanitizeUntrustedImageUrl } from "@/lib/remoteImagePolicy";
import { validateProviderChainBoundary } from "./chainBoundary";
import { MAX_PROVIDER_URL_CHARS } from "./limits";
import {
  isBoundedHttpUrl,
  isEvmAddress,
  isProviderRequestId,
} from "./primitives";
import {
  failProviderValidation,
  type ProviderValidationResult,
} from "./validation";

export function isValidOptionalProviderImageUrl(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "string" &&
      value.length <= MAX_PROVIDER_URL_CHARS &&
      sanitizeUntrustedImageUrl(value) === value)
  );
}

function isSecureRpcConfigurationUrl(value: unknown): value is string {
  if (!isBoundedHttpUrl(value)) return false;
  const parsed = new URL(value);
  return !(
    parsed.protocol === "http:" &&
    classifyPrivateNetworkHostname(parsed.hostname) === null
  );
}

export function validateAddChainProviderRequest(
  candidate: Record<string, unknown>,
): ProviderValidationResult {
  if (!isProviderRequestId(candidate.requestId)) {
    return failProviderValidation("Invalid provider request id");
  }
  if (!Number.isSafeInteger(candidate.chainId) || Number(candidate.chainId) <= 0) {
    return failProviderValidation("Invalid chain id");
  }
  if (
    candidate.chainName !== undefined &&
    (typeof candidate.chainName !== "string" ||
      candidate.chainName.trim().length === 0 ||
      candidate.chainName.length > 100)
  ) {
    return failProviderValidation("Invalid chain name");
  }

  const rpcUrls = candidate.rpcUrls;
  if (
    !Array.isArray(rpcUrls) ||
    rpcUrls.length === 0 ||
    rpcUrls.length > 10 ||
    !rpcUrls.every(isSecureRpcConfigurationUrl)
  ) {
    return failProviderValidation("Invalid chain RPC URLs");
  }
  if (
    candidate.blockExplorerUrls !== undefined &&
    (!Array.isArray(candidate.blockExplorerUrls) ||
      candidate.blockExplorerUrls.length > 10 ||
      !candidate.blockExplorerUrls.every(
        (value: unknown) => sanitizeExternalNavigationUrl(value) !== null,
      ))
  ) {
    return failProviderValidation("Invalid block explorer URLs");
  }

  const native = candidate.nativeCurrency;
  if (!native || typeof native !== "object" || Array.isArray(native)) {
    return failProviderValidation("Invalid native currency");
  }
  const currency = native as Record<string, unknown>;
  if (
    typeof currency.name !== "string" ||
    currency.name.trim().length === 0 ||
    currency.name.length > 100 ||
    typeof currency.symbol !== "string" ||
    currency.symbol.trim().length === 0 ||
    currency.symbol.length > 11 ||
    !Number.isInteger(currency.decimals) ||
    Number(currency.decimals) < 0 ||
    Number(currency.decimals) > 255
  ) {
    return failProviderValidation("Invalid native currency");
  }
  return { valid: true };
}

export function validateWatchAssetProviderRequest(
  candidate: Record<string, unknown>,
): ProviderValidationResult {
  if (!isProviderRequestId(candidate.watchAssetId)) {
    return failProviderValidation("Invalid asset request id");
  }
  const asset = candidate.asset;
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    return failProviderValidation("Invalid asset metadata");
  }
  const metadata = asset as Record<string, unknown>;
  if (
    !isEvmAddress(metadata.address) ||
    typeof metadata.symbol !== "string" ||
    metadata.symbol.trim().length === 0 ||
    metadata.symbol.length > 11 ||
    !Number.isInteger(metadata.decimals) ||
    Number(metadata.decimals) < 0 ||
    Number(metadata.decimals) > 255 ||
    (metadata.image !== undefined &&
      sanitizeUntrustedImageUrl(metadata.image) !== metadata.image)
  ) {
    return failProviderValidation("Invalid asset metadata");
  }

  const chainBoundary = validateProviderChainBoundary(
    candidate.chainId,
    candidate.providerChainId,
  );
  return chainBoundary.valid
    ? { valid: true }
    : failProviderValidation(chainBoundary.error);
}
