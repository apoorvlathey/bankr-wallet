/**
 * Clear-signing (ERC-7730) background handler.
 *
 * Owns the chrome.storage.local cache and the network fetch from the website
 * proxy. Pure read-side — no credentials, no session restoration needed.
 *
 * Cache strategy:
 *   - Hits cached for 7 days, misses for 1 day.
 *   - Keyed by (chainId, lowercased address, kind, selector/format).
 *   - User opt-out short-circuits before any storage or network access.
 */

import { WALLETCHAN_CLEAR_SIGNING_API } from "@/constants/externalUrls";
import type {
  DescriptorKind,
  Erc7730Descriptor,
} from "@/lib/clearSigning/types";
import { resolveProxyImplementation } from "@/chrome/proxyResolver";

const ENABLED_KEY = "cs:enabled";
const CACHE_PREFIX = "cs:desc:";

const HIT_TTL_MS = 7 * 24 * 3600 * 1000;
const MISS_TTL_MS = 1 * 24 * 3600 * 1000;

/**
 * Cache schema version. Bump whenever the descriptor pipeline changes in a way
 * that makes pre-existing cache entries wrong (added proxy fallback,
 * added a new built-in, etc.). Entries without a matching version are treated
 * as misses and re-resolved, so users see new features immediately rather than
 * waiting up to 7 days for a stale hit to expire.
 *
 *   v1: initial (descriptor only)
 *   v2: proxy fallback added (Safe / EIP-1967 / beacon) — pre-v2 misses for
 *       proxy addresses would otherwise mask the new resolution path.
 *   v3: selector / EIP-712 format-aware descriptor lookups — pre-v3 hits may
 *       hold the wrong descriptor when one address has multiple registry files.
 */
const CACHE_SCHEMA_VERSION = 3;

interface CacheEntry {
  schemaVersion?: number;
  updatedAt: number;
  descriptor: Erc7730Descriptor | null;
}

function cacheKey(
  chainId: number,
  address: string,
  kind: DescriptorKind,
  selector: string | undefined,
  formatKey: string | undefined,
): string {
  return `${CACHE_PREFIX}${chainId}:${address.toLowerCase()}:${kind}:${cacheHint(
    kind,
    selector,
    formatKey,
  )}`;
}

function cacheHint(
  kind: DescriptorKind,
  selector: string | undefined,
  formatKey: string | undefined,
): string {
  if (kind === "calldata" && selector && /^0x[0-9a-fA-F]{8}$/.test(selector)) {
    return selector.toLowerCase();
  }
  if (kind === "eip712" && formatKey) {
    return `fmt:${formatKey.length}:${hashString(formatKey)}`;
  }
  return "any";
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function getEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get([ENABLED_KEY]);
  // Default ON — only OFF if user explicitly set false.
  return result[ENABLED_KEY] !== false;
}

async function readCache(
  chainId: number,
  address: string,
  kind: DescriptorKind,
  selector: string | undefined,
  formatKey: string | undefined,
): Promise<CacheEntry | null> {
  const key = cacheKey(chainId, address, kind, selector, formatKey);
  const result = await chrome.storage.local.get([key]);
  const entry = result[key] as CacheEntry | undefined;
  if (!entry) return null;
  // Schema-bump invalidation: pre-proxy-fallback misses (which never even
  // tried proxy resolution) shouldn't suppress the new pipeline.
  if ((entry.schemaVersion || 1) < CACHE_SCHEMA_VERSION) return null;
  const age = Date.now() - entry.updatedAt;
  const ttl = entry.descriptor ? HIT_TTL_MS : MISS_TTL_MS;
  if (age > ttl) return null;
  return entry;
}

async function writeCache(
  chainId: number,
  address: string,
  kind: DescriptorKind,
  selector: string | undefined,
  formatKey: string | undefined,
  descriptor: Erc7730Descriptor | null,
): Promise<void> {
  const key = cacheKey(chainId, address, kind, selector, formatKey);
  const entry: CacheEntry = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    updatedAt: Date.now(),
    descriptor,
  };
  await chrome.storage.local.set({ [key]: entry });
}

async function fetchDescriptor(
  chainId: number,
  address: string,
  kind: DescriptorKind,
  selector?: string,
  formatKey?: string,
): Promise<Erc7730Descriptor | null> {
  const url = new URL(WALLETCHAN_CLEAR_SIGNING_API);
  url.searchParams.set("chainId", String(chainId));
  url.searchParams.set("address", address);
  url.searchParams.set("kind", kind);
  if (selector && /^0x[0-9a-fA-F]{8}$/.test(selector)) {
    url.searchParams.set("selector", selector.toLowerCase());
  }
  if (formatKey) {
    url.searchParams.set("formatKey", formatKey);
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), { method: "GET" });
  } catch (err) {
    console.warn("[clear-signing] network error:", err);
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    console.warn(`[clear-signing] fetch ${url.toString()} -> ${res.status}`);
    return null;
  }
  try {
    const data = await res.json();
    if (data && typeof data === "object" && "descriptor" in data) {
      return data.descriptor as Erc7730Descriptor;
    }
    return null;
  } catch (err) {
    console.warn("[clear-signing] invalid JSON:", err);
    return null;
  }
}

export interface GetDescriptorMessage {
  type: "GET_CLEAR_SIGNING_DESCRIPTOR";
  chainId: number;
  address: string;
  kind: DescriptorKind;
  selector?: string;
  formatKey?: string;
}

export interface GetDescriptorResponse {
  descriptor: Erc7730Descriptor | null;
  enabled: boolean;
}

export async function handleGetClearSigningDescriptor(
  message: GetDescriptorMessage,
): Promise<GetDescriptorResponse> {
  const enabled = await getEnabled();
  if (!enabled) return { descriptor: null, enabled: false };

  const chainId = Number(message.chainId);
  const address = String(message.address || "").toLowerCase();
  const kind = message.kind;
  const selector =
    typeof message.selector === "string" && /^0x[0-9a-fA-F]{8}$/.test(message.selector)
      ? message.selector.toLowerCase()
      : undefined;
  const formatKey =
    typeof message.formatKey === "string" && message.formatKey.length <= 8192
      ? message.formatKey
      : undefined;
  if (!chainId || !/^0x[0-9a-f]{40}$/.test(address)) {
    return { descriptor: null, enabled };
  }
  if (kind !== "calldata" && kind !== "eip712") {
    return { descriptor: null, enabled };
  }

  const tag = `[clear-signing/bg] ${kind} ${chainId}:${address}`;

  const cached = await readCache(chainId, address, kind, selector, formatKey);
  if (cached) {
    console.log(
      `${tag} cache ${cached.descriptor ? "HIT" : "MISS"} (age=${Math.round(
        (Date.now() - cached.updatedAt) / 1000,
      )}s)`,
    );
    return { descriptor: cached.descriptor, enabled };
  }
  console.log(`${tag} cache empty → fetching from proxy`);

  let fetched = await fetchDescriptor(chainId, address, kind, selector, formatKey);
  console.log(`${tag} direct fetch: ${fetched ? "matched" : "404"}`);

  // Proxy fallback: when the queried address has no descriptor of its own,
  // try resolving it as a Safe / EIP-1967 / beacon proxy and look up the
  // implementation's descriptor instead. The deployment list gets extended
  // to include the proxy so client-side context verification still passes; we
  // cache the *extended* descriptor under the proxy address so future
  // confirmations skip the RPC entirely.
  if (!fetched) {
    try {
      console.log(`${tag} attempting proxy resolution…`);
      const proxy = await resolveProxyImplementation(chainId, address);
      if (proxy) {
        console.log(`${tag} ✓ ${proxy.kind} proxy → impl ${proxy.implementation}`);
        const implDesc = await fetchDescriptor(
          chainId,
          proxy.implementation,
          kind,
          selector,
          formatKey,
        );
        if (implDesc) {
          console.log(`${tag} ✓ impl descriptor fetched — extending deployments`);
          fetched = extendDeployments(implDesc, kind, chainId, address);
        } else {
          console.log(`${tag} ✗ impl ${proxy.implementation} has no descriptor either`);
        }
      } else {
        console.log(`${tag} ✗ not a recognized proxy`);
      }
    } catch (err) {
      console.warn(`${tag} proxy fallback failed:`, err);
    }
  }

  await writeCache(chainId, address, kind, selector, formatKey, fetched);
  console.log(`${tag} cached ${fetched ? "hit" : "miss"} (schema v${CACHE_SCHEMA_VERSION})`);
  return { descriptor: fetched, enabled };
}

/**
 * Clone the descriptor and append `(chainId, proxyAddress)` to the matching
 * deployment list (`context.contract.deployments` for calldata,
 * `context.eip712.deployments` for eip712). Lets the client's
 * deployment/context check pass against the proxy address even though the
 * registry only knows about the implementation.
 */
function extendDeployments(
  descriptor: Erc7730Descriptor,
  kind: DescriptorKind,
  chainId: number,
  proxyAddress: string,
): Erc7730Descriptor {
  const cloned = JSON.parse(JSON.stringify(descriptor)) as Erc7730Descriptor;
  cloned.context = cloned.context || {};
  if (kind === "calldata") {
    const ctx = (cloned.context.contract = cloned.context.contract || {});
    const deployments = (ctx.deployments = ctx.deployments || []);
    if (
      !deployments.some(
        (d) =>
          d.chainId === chainId &&
          d.address?.toLowerCase() === proxyAddress.toLowerCase(),
      )
    ) {
      deployments.push({ chainId, address: proxyAddress });
    }
  } else {
    const ctx = (cloned.context.eip712 = cloned.context.eip712 || {});
    const deployments = (ctx.deployments = ctx.deployments || []);
    if (
      !deployments.some(
        (d) =>
          d.chainId === chainId &&
          d.address?.toLowerCase() === proxyAddress.toLowerCase(),
      )
    ) {
      deployments.push({ chainId, address: proxyAddress });
    }
  }
  return cloned;
}

export async function handleInvalidateClearSigningCache(): Promise<{ cleared: number }> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX));
  if (keys.length > 0) await chrome.storage.local.remove(keys);
  return { cleared: keys.length };
}

export async function getClearSigningEnabled(): Promise<boolean> {
  return getEnabled();
}

export async function setClearSigningEnabled(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [ENABLED_KEY]: !!value });
  if (!value) {
    // Drop the cache when user turns it off — feels like a stronger opt-out.
    await handleInvalidateClearSigningCache();
  }
}
