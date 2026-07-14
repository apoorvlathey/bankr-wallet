import { classifyPrivateNetworkHostname } from "@/lib/privateNetworkPolicy";
import type { SavedRpcEndpoint } from "@/lib/chains";

const COMMON_COMPOUND_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "me.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.cn",
  "com.hk",
  "com.sg",
  "co.jp",
  "co.kr",
  "co.in",
  "com.mx",
  "com.tr",
  "com.tw",
  "co.za",
]);

export function getRpcUrlLabel(rpcUrl: string): string {
  try {
    const parsed = new URL(rpcUrl);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return rpcUrl;
  }
}

export function getRpcHostname(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).hostname.toLowerCase().replace(/\.$/u, "");
  } catch {
    return "";
  }
}

/**
 * Resolve a public provider hostname to the registrable-looking domain used
 * for favicon lookup. Private/local RPC names are deliberately never sent to
 * the external favicon service.
 */
export function getRpcProviderDomain(rpcUrl: string): string | null {
  const hostname = getRpcHostname(rpcUrl);
  if (
    !hostname ||
    classifyPrivateNetworkHostname(hostname) !== null ||
    hostname.includes(":") ||
    /^\d+(?:\.\d+){3}$/u.test(hostname) ||
    /\.(?:test|invalid|onion)$/u.test(hostname)
  ) {
    return null;
  }

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const suffix = labels.slice(-2).join(".");
  return COMMON_COMPOUND_SUFFIXES.has(suffix) && labels.length >= 3
    ? labels.slice(-3).join(".")
    : suffix;
}

export function getRpcEndpointName(endpoint: SavedRpcEndpoint): string {
  return (
    endpoint.name ||
    getRpcProviderDomain(endpoint.url) ||
    getRpcHostname(endpoint.url) ||
    "RPC endpoint"
  );
}
