import type { BrowserDappDirectoryResult } from "../ensBrowsing/dappDirectorySearch";

export type DappConnectionReputation =
  | {
      status: "danger";
      source: "metamask";
      matchedHostname?: string;
    }
  | {
      status: "suspicious";
      source: "metamask";
      matchedHostname?: string;
    }
  | {
      status: "recognized";
      source: "defillama";
      name: string;
    }
  | {
      status: "unverified";
      reason: "not-listed" | "check-unavailable";
    };

export interface MetaMaskReputationResult {
  outcome: "blocked" | "suspicious" | "no_match";
  matchType: "blocklist" | "fuzzylist" | "none";
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

function normalizedHostname(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 253) {
    return null;
  }
  try {
    const url = new URL(`https://${value}`);
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
    return hostname || null;
  } catch {
    return null;
  }
}

function directoryComparisonHostname(value: string): string | null {
  const hostname = normalizedHostname(value);
  return hostname?.replace(/^www\./u, "") ?? null;
}

export function parseMetaMaskReputationResult(
  value: unknown,
): MetaMaskReputationResult | null {
  const candidate = record(value);
  const snapshot = record(candidate?.snapshot);
  const matchedHostname = candidate?.matchedHostname;
  if (
    !candidate ||
    !["blocked", "suspicious", "no_match"].includes(
      String(candidate.outcome),
    ) ||
    !["blocklist", "fuzzylist", "none"].includes(
      String(candidate.matchType),
    ) ||
    (matchedHostname !== undefined &&
      normalizedHostname(matchedHostname) === null) ||
    !snapshot ||
    !Number.isSafeInteger(snapshot.version) ||
    typeof snapshot.fetchedAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.fetchedAt)) ||
    typeof snapshot.stale !== "boolean"
  ) {
    return null;
  }
  return {
    outcome: candidate.outcome as MetaMaskReputationResult["outcome"],
    matchType: candidate.matchType as MetaMaskReputationResult["matchType"],
    ...(typeof matchedHostname === "string" ? { matchedHostname } : {}),
    snapshot: {
      version: Number(snapshot.version),
      fetchedAt: snapshot.fetchedAt,
      stale: snapshot.stale,
    },
  };
}

export function exactDirectoryMatch(
  hostname: string,
  results: readonly BrowserDappDirectoryResult[],
): BrowserDappDirectoryResult | null {
  const expected = directoryComparisonHostname(hostname);
  if (!expected) return null;
  return results.find(
    (result) => directoryComparisonHostname(result.hostname) === expected,
  ) ?? null;
}

export function combineDappReputation(
  hostname: string,
  metaMask: MetaMaskReputationResult | null,
  directoryResults: readonly BrowserDappDirectoryResult[] | null,
): DappConnectionReputation {
  if (metaMask?.outcome === "blocked") {
    return {
      status: "danger",
      source: "metamask",
      ...(metaMask.matchedHostname
        ? { matchedHostname: metaMask.matchedHostname }
        : {}),
    };
  }
  if (metaMask?.outcome === "suspicious") {
    return {
      status: "suspicious",
      source: "metamask",
      ...(metaMask.matchedHostname
        ? { matchedHostname: metaMask.matchedHostname }
        : {}),
    };
  }
  const directoryMatch = directoryResults
    ? exactDirectoryMatch(hostname, directoryResults)
    : null;
  if (directoryMatch) {
    return {
      status: "recognized",
      source: "defillama",
      name: directoryMatch.name,
    };
  }
  if (!metaMask || metaMask.snapshot.stale) {
    return { status: "unverified", reason: "check-unavailable" };
  }
  return { status: "unverified", reason: "not-listed" };
}
