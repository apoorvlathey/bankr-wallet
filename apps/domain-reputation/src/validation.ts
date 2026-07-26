import type {
  DomainCheckResponse,
  LegacyPhishingConfig,
  StoredSnapshot,
} from "./types.js";

const MAX_HOSTNAME_CHARS = 253;
const MAX_BLOCKLIST_ENTRY_CHARS = 2_048;
const MAX_LIST_ENTRIES = 300_000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hostnameEntry(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_HOSTNAME_CHARS &&
    !/[\s/?#@\\]/u.test(value);
}

function hostnameList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_ENTRIES) return null;
  return value.every(hostnameEntry) ? value : null;
}

function blocklistEntry(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_BLOCKLIST_ENTRY_CHARS ||
    value.trim() !== value ||
    /[\s:?#@\\]/u.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(`https://${value}`);
    return !!parsed.hostname &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      !parsed.search &&
      !parsed.hash;
  } catch {
    return false;
  }
}

function blocklist(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_ENTRIES) return null;
  return value.every(blocklistEntry) ? value : null;
}

export function parsePhishingConfig(value: unknown): LegacyPhishingConfig | null {
  const candidate = record(value);
  if (!candidate) return null;
  const fuzzylist = hostnameList(candidate.fuzzylist);
  const whitelist = hostnameList(candidate.whitelist);
  const blacklist = blocklist(candidate.blacklist);
  if (
    candidate.version !== 2 ||
    !Number.isSafeInteger(candidate.tolerance) ||
    Number(candidate.tolerance) < 0 ||
    Number(candidate.tolerance) > 3 ||
    !fuzzylist ||
    !whitelist ||
    !blacklist
  ) {
    return null;
  }
  return {
    version: 2,
    tolerance: Number(candidate.tolerance),
    fuzzylist,
    whitelist,
    blacklist,
  };
}

export function parseStoredSnapshot(value: unknown): StoredSnapshot | null {
  const candidate = record(value);
  const config = parsePhishingConfig(candidate?.config);
  if (
    !candidate ||
    candidate.schemaVersion !== 1 ||
    typeof candidate.sourceUrl !== "string" ||
    (candidate.etag !== null && typeof candidate.etag !== "string") ||
    typeof candidate.fetchedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.fetchedAt)) ||
    !config
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    sourceUrl: candidate.sourceUrl,
    etag: candidate.etag,
    fetchedAt: candidate.fetchedAt,
    config,
  };
}

export function normalizeLookupHostname(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_HOSTNAME_CHARS ||
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
    return hostname && hostname.length <= MAX_HOSTNAME_CHARS ? hostname : null;
  } catch {
    return null;
  }
}

export function isDomainCheckResponse(value: unknown): value is DomainCheckResponse {
  const candidate = record(value);
  const snapshot = record(candidate?.snapshot);
  return !!candidate &&
    ["blocked", "suspicious", "no_match"].includes(String(candidate.outcome)) &&
    ["blocklist", "fuzzylist", "none"].includes(String(candidate.matchType)) &&
    (candidate.matchedHostname === undefined ||
      normalizeLookupHostname(candidate.matchedHostname) !== null) &&
    !!snapshot &&
    Number.isSafeInteger(snapshot.version) &&
    typeof snapshot.fetchedAt === "string" &&
    Number.isFinite(Date.parse(snapshot.fetchedAt)) &&
    typeof snapshot.stale === "boolean";
}
