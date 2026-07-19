import type { NetworkEntry } from "@/types";
import { sanitizeExternalNavigationUrl } from "@/lib/externalNavigation";
import {
  assertRpcEndpointAllowedForOrigin,
  assertSecureRpcConfigurationUrl,
} from "./rpcClient";
import { cleanNetworkHttpUrl } from "./customNetworkUrlValidation";

export {
  cleanSavedRpcEndpoints,
  cleanSavedRpcUrls,
} from "./customNetworkRpcValidation";

export function cleanChainName(chainName: unknown): string {
  if (typeof chainName !== "string") {
    throw new Error("Chain name is required.");
  }
  const trimmed = chainName.trim();
  if (!trimmed) {
    throw new Error("Chain name is required.");
  }
  if (trimmed.length > 100) {
    throw new Error("Chain name is too long.");
  }
  return trimmed;
}

export function cleanNetworkEntry(entry: unknown, requestOrigin?: string): NetworkEntry {
  if (!entry || typeof entry !== "object") {
    throw new Error("Network details are required.");
  }

  const candidate = entry as Partial<NetworkEntry>;
  const chainId = Number(candidate.chainId);
  const rpcUrl = cleanNetworkHttpUrl(candidate.rpcUrl, "RPC", true)!;
  assertSecureRpcConfigurationUrl(rpcUrl);
  if (requestOrigin) {
    assertRpcEndpointAllowedForOrigin(rpcUrl, requestOrigin);
  }

  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("Valid chain ID is required.");
  }

  const nativeName = candidate.nativeCurrency?.name?.trim();
  const nativeSymbol = candidate.nativeCurrency?.symbol?.trim();
  const nativeDecimals = candidate.nativeCurrency?.decimals;
  if (
    (nativeName !== undefined && (!nativeName || nativeName.length > 100)) ||
    (nativeSymbol !== undefined &&
      (!nativeSymbol || nativeSymbol.length > 11)) ||
    (nativeDecimals !== undefined &&
      (!Number.isInteger(Number(nativeDecimals)) ||
        Number(nativeDecimals) < 0 ||
        Number(nativeDecimals) > 255))
  ) {
    throw new Error("Native currency metadata is invalid.");
  }

  const explorer = cleanNetworkHttpUrl(candidate.explorer, "Explorer", false);
  if (requestOrigin && explorer && !sanitizeExternalNavigationUrl(explorer)) {
    throw new Error("Dapp-proposed explorer URL must use public HTTPS.");
  }

  return {
    chainId,
    rpcUrl,
    isCustom: candidate.isCustom === true,
    hidden: candidate.hidden === true ? true : undefined,
    explorer,
    nativeCurrency: candidate.nativeCurrency
      ? {
          name: nativeName || nativeSymbol || "ETH",
          symbol: nativeSymbol || "ETH",
          decimals: nativeDecimals === undefined ? 18 : Number(nativeDecimals),
        }
      : undefined,
  };
}
