import { readFileSync } from "node:fs";
import { normalizeLookupHostname } from "./validation.js";

export interface CustomAllowlistEntry {
  hostname: string;
  allowAllSubdomains: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseCustomAllowlist(value: unknown): CustomAllowlistEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("custom allowlist must be an array");
  }
  const seen = new Set<string>();
  return value.map((value, index) => {
    const candidate = record(value);
    const hostname = normalizeLookupHostname(candidate?.hostname);
    const allowAllSubdomains = candidate?.allowAllSubdomains ?? false;
    if (
      !candidate ||
      !hostname ||
      candidate.hostname !== hostname ||
      typeof allowAllSubdomains !== "boolean" ||
      Object.keys(candidate).some(
        (key) => key !== "hostname" && key !== "allowAllSubdomains",
      )
    ) {
      throw new Error(`custom allowlist entry ${index} is invalid`);
    }
    if (seen.has(hostname)) {
      throw new Error(`custom allowlist contains duplicate hostname ${hostname}`);
    }
    seen.add(hostname);
    return { hostname, allowAllSubdomains };
  });
}

export function findCustomAllowlistMatch(
  hostname: string,
  entries: readonly CustomAllowlistEntry[],
): CustomAllowlistEntry | null {
  const exact = entries.find((entry) => entry.hostname === hostname);
  if (exact) return exact;
  return entries
    .filter(
      (entry) =>
        entry.allowAllSubdomains &&
        hostname.endsWith(`.${entry.hostname}`),
    )
    .sort((left, right) => right.hostname.length - left.hostname.length)[0] ??
    null;
}

function loadCustomAllowlist(): CustomAllowlistEntry[] {
  const path = new URL("../custom-allowlist.json", import.meta.url);
  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `failed to read custom allowlist: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  return parseCustomAllowlist(payload);
}

export const CUSTOM_DOMAIN_ALLOWLIST = loadCustomAllowlist();
