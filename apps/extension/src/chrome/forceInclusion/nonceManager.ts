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

import {
  MAX_TRANSACTION_NONCE,
  normalizeTransactionNonce,
} from "@/lib/transactionNonce";
import { fetchNonceFromRpc } from "./nonceRpc";

export { MAX_TRANSACTION_NONCE, normalizeTransactionNonce };

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
  const nextNonce = await peekNextNonce(address, chainId);
  return reserveNonce(address, chainId, nextNonce);
}

/**
 * Read the nonce that getNextNonce would currently choose without consuming
 * it. Transaction review uses this so opening or closing the UI cannot create
 * a temporary gap in the local nonce cache.
 */
export async function peekNextNonce(
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
      return cached.value;
    }
    throw new Error(`Failed to fetch nonce: ${result.error}`);
  }

  const onChainNonce = result.nonce;

  // Only use cached value if it's fresh (within TTL window)
  let nextNonce = onChainNonce;
  if (cached && Date.now() - cached.timestamp < NONCE_TTL_MS) {
    nextNonce = Math.max(cached.value, onChainNonce);
  }
  return nextNonce;
}

/**
 * Reserve an exact reviewed nonce for one broadcast. A lower custom nonce is
 * allowed for replacement transactions, but it must never move the rapid-send
 * cache backwards.
 */
export function reserveNonce(
  address: string,
  chainId: number,
  nonce: number,
): number {
  const normalized = normalizeTransactionNonce(nonce);
  if (normalized === undefined) {
    throw new Error("Transaction nonce is required");
  }
  const key = cacheKey(address, chainId);
  const cached = nonceCache.get(key);
  const cachedNext =
    cached && Date.now() - cached.timestamp < NONCE_TTL_MS
      ? cached.value
      : 0;
  nonceCache.set(key, {
    value: Math.max(cachedNext, normalized + 1),
    timestamp: Date.now(),
  });
  return normalized;
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
