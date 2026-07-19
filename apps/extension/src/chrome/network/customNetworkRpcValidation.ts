import {
  MAX_RPC_ENDPOINT_NAME_LENGTH,
  MAX_SAVED_RPC_URLS,
  normalizeSavedRpcEndpoints,
  type SavedRpcEndpoint,
} from "@/lib/chains";
import {
  assertRpcEndpointAllowedForOrigin,
  assertSecureRpcConfigurationUrl,
} from "./rpcClient";
import { cleanNetworkHttpUrl } from "./customNetworkUrlValidation";

function authorizeSavedRpcUrl(rpcUrl: string, requestOrigin?: string): void {
  assertSecureRpcConfigurationUrl(rpcUrl);
  if (requestOrigin) assertRpcEndpointAllowedForOrigin(rpcUrl, requestOrigin);
}

export function cleanSavedRpcUrls(
  value: unknown,
  activeRpcUrl: string,
  requestOrigin?: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Saved RPC URLs must be a list.");
  const cleaned = value.map((rpcUrl) => cleanNetworkHttpUrl(rpcUrl, "RPC", true)!);
  const normalized = Array.from(new Set([activeRpcUrl, ...cleaned]));
  if (normalized.length > MAX_SAVED_RPC_URLS) {
    throw new Error(`Save at most ${MAX_SAVED_RPC_URLS} RPC URLs per network.`);
  }
  normalized.forEach((rpcUrl) => authorizeSavedRpcUrl(rpcUrl, requestOrigin));
  return normalized;
}

export function cleanSavedRpcEndpoints(
  value: unknown,
  activeRpcUrl: string,
  requestOrigin?: string,
): SavedRpcEndpoint[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Saved RPC endpoints must be a list.");
  const cleaned = value.map((candidate) => {
    const endpoint = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as { url?: unknown; name?: unknown }
      : { url: candidate, name: undefined };
    const rawName = typeof endpoint.name === "string" ? endpoint.name.trim() : "";
    if (rawName.length > MAX_RPC_ENDPOINT_NAME_LENGTH) {
      throw new Error(
        `RPC endpoint names must be ${MAX_RPC_ENDPOINT_NAME_LENGTH} characters or fewer.`,
      );
    }
    return {
      url: cleanNetworkHttpUrl(endpoint.url, "RPC", true)!,
      ...(rawName ? { name: rawName } : {}),
    };
  });
  if (new Set([activeRpcUrl, ...cleaned.map(({ url }) => url)]).size > MAX_SAVED_RPC_URLS) {
    throw new Error(`Save at most ${MAX_SAVED_RPC_URLS} RPC URLs per network.`);
  }
  const normalized = normalizeSavedRpcEndpoints(activeRpcUrl, cleaned);
  normalized.forEach(({ url }) => authorizeSavedRpcUrl(url, requestOrigin));
  return normalized;
}
