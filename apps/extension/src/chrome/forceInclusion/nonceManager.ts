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

import { getRpcUrl } from "../transactions/rpcConfig";
import { fetchRpcEnvelope } from "../network/rpcClient";

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
  try {
    const json = await fetchRpcEnvelope(rpcUrl, "eth_getTransactionCount", [
      address,
      blockTag,
    ], {
      timeoutMs: 10_000,
      allowPrivateWithoutOrigin: true,
    });
    if (json.error) {
      const rpcError = json.error as Record<string, unknown>;
      const msg =
        typeof rpcError.message === "string"
          ? rpcError.message.slice(0, 1_000)
          : `RPC error code ${String(rpcError.code ?? "unknown")}`;
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
    if (err?.name === "HttpRequestTimeoutError") return { error: "RPC request timed out" };
    return { error: err?.message || "Network error" };
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
