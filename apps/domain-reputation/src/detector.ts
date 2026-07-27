import { PhishingDetector } from "@metamask/phishing-controller";
import {
  CUSTOM_DOMAIN_ALLOWLIST,
  findCustomAllowlistMatch,
  type CustomAllowlistEntry,
} from "./customAllowlist.js";
import type {
  DomainCheckResponse,
  LegacyPhishingConfig,
  StoredSnapshot,
} from "./types.js";

export const STALE_AFTER_MS = 60 * 60 * 1_000;

export class SnapshotDetector {
  readonly #detector: PhishingDetector;

  constructor(
    readonly snapshot: StoredSnapshot,
    private readonly now: () => number = Date.now,
    private readonly customAllowlist: readonly CustomAllowlistEntry[] =
      CUSTOM_DOMAIN_ALLOWLIST,
  ) {
    this.#detector = new PhishingDetector(snapshot.config);
  }

  check(hostname: string): DomainCheckResponse {
    const result = this.#detector.check(`https://${hostname}`);
    const stale =
      this.now() - Date.parse(this.snapshot.fetchedAt) > STALE_AFTER_MS;
    const common = {
      snapshot: {
        version: this.snapshot.config.version,
        fetchedAt: this.snapshot.fetchedAt,
        stale,
      },
    };
    if (result.result && result.type === "fuzzy") {
      return {
        outcome: "suspicious",
        matchType: "fuzzylist",
        ...(result.match ? { matchedHostname: result.match } : {}),
        ...common,
      };
    }
    if (
      result.result &&
      (result.type === "blacklist" || result.type === "blocklist")
    ) {
      return {
        outcome: "blocked",
        matchType: "blocklist",
        ...(result.match ? { matchedHostname: result.match } : {}),
        ...common,
      };
    }
    const trusted = findCustomAllowlistMatch(hostname, this.customAllowlist);
    if (trusted) {
      return {
        outcome: "trusted",
        matchType: "allowlist",
        matchedHostname: trusted.hostname,
        ...common,
      };
    }
    return { outcome: "no_match", matchType: "none", ...common };
  }
}

export function snapshotFromConfig(
  config: LegacyPhishingConfig,
  sourceUrl: string,
  fetchedAt: string,
  etag: string | null = null,
): StoredSnapshot {
  return {
    schemaVersion: 1,
    sourceUrl,
    etag,
    fetchedAt,
    config,
  };
}
