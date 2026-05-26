/**
 * Nonce Manager for PK/Seed Phrase accounts
 * Tracks pending nonces in memory to prevent conflicts when sending
 * multiple transactions quickly before previous ones are confirmed.
 *
 * NOT used for Bankr API accounts (the API manages nonces server-side).
 *
 * Safeguards against going out of sync:
 * - Always fetches onchain nonce and takes max(cached, onChain)
 * - Cached values expire after 30s (only useful for rapid-fire txs)
 * - Cache resets on tx failure, account removal, and extension reset
 * - In-memory Map clears naturally on service worker restart
 */

import { getRpcUrl } from "./txHandlers";

/** How long a cached nonce stays valid (ms) */
const NONCE_TTL_MS = 30_000;

interface CachedNonce {
  value: number;
  timestamp: number;
}

/** Cache of next nonce per address+chainId */
const nonceCache = new Map<string, CachedNonce>();

function cacheKey(address: string, chainId: number): string {
  return `${address.toLowerCase()}:${chainId}`;
}

/**
 * Get the next nonce for a given address and chain.
 * Fetches from RPC, compares with local cache (if still fresh), uses the higher value.
 */
export async function getNextNonce(
  address: string,
  chainId: number,
): Promise<number> {
  const key = cacheKey(address, chainId);
  const cached = nonceCache.get(key);

  // Fetch onchain nonce (pending count)
  const result = await fetchNonceFromRpc(address, chainId);

  if ("error" in result) {
    // RPC failed — use cached if available and fresh, else surface the
    // underlying error so the user can act on it (wrong RPC URL, method
    // not supported, CORS, etc.) instead of seeing a generic "no cached
    // value available" message.
    console.warn(
      `[nonceManager] eth_getTransactionCount failed for ${address} on chain ${chainId}: ${result.error}`,
    );
    if (cached && Date.now() - cached.timestamp < NONCE_TTL_MS) {
      const nonce = cached.value;
      nonceCache.set(key, { value: nonce + 1, timestamp: Date.now() });
      return nonce;
    }
    throw new Error(`Failed to fetch nonce: ${result.error}`);
  }

  const onChainNonce = result.nonce;

  // Only use cached value if it's fresh (within TTL window)
  let nextNonce = onChainNonce;
  if (cached && Date.now() - cached.timestamp < NONCE_TTL_MS) {
    nextNonce = Math.max(cached.value, onChainNonce);
  }

  // Store incremented value for next rapid call
  nonceCache.set(key, { value: nextNonce + 1, timestamp: Date.now() });

  return nextNonce;
}

/**
 * Reset cached nonce for an address+chain (e.g. after a tx fails).
 * Next call will re-fetch purely from RPC.
 */
export function resetNonce(address: string, chainId: number): void {
  nonceCache.delete(cacheKey(address, chainId));
}

/**
 * Clear all cached nonces for a specific address (all chains).
 * Called when an account is removed.
 */
export function clearNoncesForAddress(address: string): void {
  const prefix = `${address.toLowerCase()}:`;
  for (const key of nonceCache.keys()) {
    if (key.startsWith(prefix)) {
      nonceCache.delete(key);
    }
  }
}

/**
 * Clear entire nonce cache.
 * Called on extension reset / security wipe.
 */
export function clearAllNonces(): void {
  nonceCache.clear();
}

type NonceFetchResult = { nonce: number } | { error: string };

async function callGetTransactionCount(
  rpcUrl: string,
  address: string,
  blockTag: "pending" | "latest",
): Promise<NonceFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionCount",
        params: [address, blockTag],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status} ${response.statusText}` };
    }

    const json = await response.json();
    if (json.error) {
      const msg = json.error.message || `RPC error code ${json.error.code}`;
      return { error: msg };
    }
    if (typeof json.result === "string") {
      try {
        return { nonce: Number(BigInt(json.result)) };
      } catch {
        return { error: `Invalid nonce response: ${json.result}` };
      }
    }
    return { error: "RPC returned no result" };
  } catch (err: any) {
    if (err?.name === "AbortError") return { error: "RPC request timed out" };
    return { error: err?.message || "Network error" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNonceFromRpc(
  address: string,
  chainId: number,
): Promise<NonceFetchResult> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return { error: "No RPC URL configured for this chain" };

  // Try "pending" first (so back-to-back txs see in-mempool entries). Some
  // chains (notably newer L2s without a public mempool) reject the pending
  // block tag — fall back to "latest" in that case so the call still works.
  const pendingResult = await callGetTransactionCount(rpcUrl, address, "pending");
  if ("nonce" in pendingResult) return pendingResult;

  const looksLikeUnsupportedTag = /pending|block tag|not supported|unknown block|invalid/i.test(
    pendingResult.error,
  );
  if (!looksLikeUnsupportedTag) return pendingResult;

  console.warn(
    `[nonceManager] "pending" block tag rejected on chain ${chainId} ("${pendingResult.error}") — retrying with "latest"`,
  );
  return callGetTransactionCount(rpcUrl, address, "latest");
}
