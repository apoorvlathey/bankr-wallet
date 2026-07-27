export type MetaMaskDomainOutcome =
  | "blocked"
  | "suspicious"
  | "trusted"
  | "no_match";
export type MetaMaskDomainMatchType =
  | "blocklist"
  | "fuzzylist"
  | "allowlist"
  | "none";

export interface MetaMaskDomainReputationResponse {
  outcome: MetaMaskDomainOutcome;
  matchType: MetaMaskDomainMatchType;
  matchedHostname?: string;
  snapshot: {
    version: number;
    fetchedAt: string;
    stale: boolean;
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeReputationHostname(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 253 ||
    value.trim() !== value ||
    /[\s:/?#@\\]/u.test(value)
  ) {
    return null;
  }
  try {
    const parsed = new URL(`https://${value}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
    return hostname && hostname.length <= 253 ? hostname : null;
  } catch {
    return null;
  }
}

export function parseMetaMaskDomainReputationResponse(
  value: unknown,
): MetaMaskDomainReputationResponse | null {
  const candidate = record(value);
  const snapshot = record(candidate?.snapshot);
  const validResult =
    (candidate?.outcome === "blocked" &&
      candidate.matchType === "blocklist") ||
    (candidate?.outcome === "suspicious" &&
      candidate.matchType === "fuzzylist") ||
    (candidate?.outcome === "trusted" &&
      candidate.matchType === "allowlist" &&
      normalizeReputationHostname(candidate.matchedHostname) !== null) ||
    (candidate?.outcome === "no_match" && candidate.matchType === "none");
  if (
    !candidate ||
    !validResult ||
    (candidate.matchedHostname !== undefined &&
      normalizeReputationHostname(candidate.matchedHostname) === null) ||
    !snapshot ||
    !Number.isSafeInteger(snapshot.version) ||
    typeof snapshot.fetchedAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.fetchedAt)) ||
    typeof snapshot.stale !== "boolean"
  ) {
    return null;
  }
  return {
    outcome: candidate.outcome as MetaMaskDomainOutcome,
    matchType: candidate.matchType as MetaMaskDomainMatchType,
    ...(typeof candidate.matchedHostname === "string"
      ? { matchedHostname: candidate.matchedHostname }
      : {}),
    snapshot: {
      version: Number(snapshot.version),
      fetchedAt: snapshot.fetchedAt,
      stale: snapshot.stale,
    },
  };
}

export function parseReputationServiceBaseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
