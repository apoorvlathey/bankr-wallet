import type { NetworkEntry } from "@/types";
import {
  MAX_RPC_ENDPOINT_NAME_LENGTH,
  MAX_SAVED_RPC_URLS,
  normalizeSavedRpcEndpoints,
  type SavedRpcEndpoint,
} from "@/lib/chains";
import {
  sanitizeCustomExplorerUrl,
  sanitizeExternalNavigationUrl,
} from "@/lib/externalNavigation";
import {
  assertRpcEndpointAllowedForOrigin,
  assertSecureRpcConfigurationUrl,
} from "./rpcClient";

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

function cleanHttpUrl(
  value: unknown,
  field: "RPC" | "Explorer",
  required: boolean,
): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    if (required) throw new Error(`${field} URL is required.`);
    return undefined;
  }
  if (trimmed.length > 2_048) {
    throw new Error(`${field} URL is too long.`);
  }
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error();
    }
    if (field === "Explorer" && !sanitizeCustomExplorerUrl(trimmed)) {
      throw new Error();
    }
  } catch {
    if (field === "Explorer") {
      throw new Error(
        "Explorer URL must use public HTTPS (or HTTP(S) localhost) without embedded credentials.",
      );
    }
    throw new Error(
      `${field} URL must use HTTP or HTTPS without embedded credentials.`,
    );
  }
  return trimmed.replace(/\/+$/, "");
}

export function cleanSavedRpcUrls(
  value: unknown,
  activeRpcUrl: string,
  requestOrigin?: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Saved RPC URLs must be a list.");

  const cleaned = value.map((rpcUrl) => cleanHttpUrl(rpcUrl, "RPC", true)!);
  const normalized = Array.from(new Set([activeRpcUrl, ...cleaned]));
  if (normalized.length > MAX_SAVED_RPC_URLS) {
    throw new Error(`Save at most ${MAX_SAVED_RPC_URLS} RPC URLs per network.`);
  }
  for (const rpcUrl of normalized) {
    assertSecureRpcConfigurationUrl(rpcUrl);
    if (requestOrigin) assertRpcEndpointAllowedForOrigin(rpcUrl, requestOrigin);
  }
  return normalized;
}

export function cleanSavedRpcEndpoints(
  value: unknown,
  activeRpcUrl: string,
  requestOrigin?: string,
): SavedRpcEndpoint[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("Saved RPC endpoints must be a list.");
  }

  const cleaned = value.map((candidate) => {
    const endpoint =
      candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? (candidate as { url?: unknown; name?: unknown })
        : { url: candidate, name: undefined };
    const rawName = typeof endpoint.name === "string" ? endpoint.name.trim() : "";
    if (rawName.length > MAX_RPC_ENDPOINT_NAME_LENGTH) {
      throw new Error(
        `RPC endpoint names must be ${MAX_RPC_ENDPOINT_NAME_LENGTH} characters or fewer.`,
      );
    }
    return {
      url: cleanHttpUrl(endpoint.url, "RPC", true)!,
      ...(rawName ? { name: rawName } : {}),
    };
  });

  const uniqueUrls = new Set([activeRpcUrl, ...cleaned.map(({ url }) => url)]);
  if (uniqueUrls.size > MAX_SAVED_RPC_URLS) {
    throw new Error(`Save at most ${MAX_SAVED_RPC_URLS} RPC URLs per network.`);
  }

  const normalized = normalizeSavedRpcEndpoints(activeRpcUrl, cleaned);
  for (const { url } of normalized) {
    assertSecureRpcConfigurationUrl(url);
    if (requestOrigin) assertRpcEndpointAllowedForOrigin(url, requestOrigin);
  }
  return normalized;
}

export function cleanNetworkEntry(entry: unknown, requestOrigin?: string): NetworkEntry {
  if (!entry || typeof entry !== "object") {
    throw new Error("Network details are required.");
  }

  const candidate = entry as Partial<NetworkEntry>;
  const chainId = Number(candidate.chainId);
  const rpcUrl = cleanHttpUrl(candidate.rpcUrl, "RPC", true)!;
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

  const explorer = cleanHttpUrl(candidate.explorer, "Explorer", false);
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
