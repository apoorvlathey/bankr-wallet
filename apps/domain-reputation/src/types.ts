export interface LegacyPhishingConfig {
  version: number;
  tolerance: number;
  fuzzylist: string[];
  whitelist: string[];
  blacklist: string[];
}

export interface StoredSnapshot {
  schemaVersion: 1;
  sourceUrl: string;
  etag: string | null;
  fetchedAt: string;
  config: LegacyPhishingConfig;
}

export type DomainCheckOutcome = "blocked" | "suspicious" | "no_match";
export type DomainMatchType = "blocklist" | "fuzzylist" | "none";

export interface DomainCheckResponse {
  outcome: DomainCheckOutcome;
  matchType: DomainMatchType;
  matchedHostname?: string;
  snapshot: {
    version: number;
    fetchedAt: string;
    stale: boolean;
  };
}
