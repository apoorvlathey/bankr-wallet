import { sanitizeUntrustedImageUrl } from "@/lib/remoteImagePolicy";
import { fetchJsonBounded } from "../network/boundedHttp";

const DEFILLAMA_SEARCH_URL =
  "https://search-core.defillama.com/multi-search";
const MAX_DIRECTORY_RESULTS = 8;
const MAX_QUERY_CHARS = 120;
const MAX_NAME_CHARS = 120;
const MAX_ROUTE_CHARS = 2_048;
const SEARCH_TIMEOUT_MS = 5_000;
const SEARCH_RESPONSE_BYTES = 64 * 1_024;

const configuredSearchKey =
  (import.meta as ImportMeta & {
    env?: { VITE_DEFILLAMA_SEARCH_KEY?: string };
  }).env?.VITE_DEFILLAMA_SEARCH_KEY?.trim() || "";

export interface BrowserDappDirectoryResult {
  name: string;
  url: string;
  hostname: string;
  logo?: string;
}

function normalizedHttpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > MAX_ROUTE_CHARS) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function normalizeDappDirectoryResponse(
  payload: unknown,
): BrowserDappDirectoryResult[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const groups = (payload as Record<string, unknown>).results;
  if (!Array.isArray(groups) || !groups[0] || typeof groups[0] !== "object") {
    return [];
  }
  const hits = (groups[0] as Record<string, unknown>).hits;
  if (!Array.isArray(hits)) return [];

  const seen = new Set<string>();
  const results: BrowserDappDirectoryResult[] = [];
  for (const hit of hits) {
    if (!hit || typeof hit !== "object" || Array.isArray(hit)) continue;
    const record = hit as Record<string, unknown>;
    const url = normalizedHttpsUrl(record.route);
    const name =
      typeof record.name === "string"
        ? record.name.trim().slice(0, MAX_NAME_CHARS)
        : "";
    if (!url || !name || seen.has(url.href)) continue;
    seen.add(url.href);
    const logo = sanitizeUntrustedImageUrl(record.logo) ?? undefined;
    results.push({
      name,
      url: url.href,
      hostname: url.hostname.toLowerCase(),
      ...(logo ? { logo } : {}),
    });
    if (results.length === MAX_DIRECTORY_RESULTS) break;
  }
  return results;
}

export function normalizeDappDirectoryQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_CHARS);
  if (!trimmed) return "";
  const url = normalizedHttpsUrl(trimmed);
  if (!url) return trimmed;
  return url.hostname.replace(/^www\./, "").split(".")[0] || trimmed;
}

export async function searchDappDirectory(
  rawQuery: unknown,
  apiKey = configuredSearchKey,
): Promise<BrowserDappDirectoryResult[]> {
  const query = normalizeDappDirectoryQuery(rawQuery);
  if (!apiKey || query.length < 2) return [];

  const { response, data } = await fetchJsonBounded(
    DEFILLAMA_SEARCH_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        queries: [
          {
            indexUid: "directory",
            q: query,
            limit: MAX_DIRECTORY_RESULTS,
            attributesToRetrieve: ["name", "logo", "route"],
          },
        ],
      }),
    },
    {
      timeoutMs: SEARCH_TIMEOUT_MS,
      maxBytes: SEARCH_RESPONSE_BYTES,
      invalidMessage: "Dapp directory returned invalid JSON",
    },
  );
  if (!response.ok) throw new Error("Dapp directory search failed");
  return normalizeDappDirectoryResponse(data);
}
