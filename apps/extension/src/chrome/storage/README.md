# Shared storage audit domain

This folder owns only cross-domain storage primitives. Account, vault,
mnemonic, request, session, WalletConnect, and portfolio repositories remain
inside their own audit domains.

Review in dependency order:

1. `lock.ts` — in-process per-key promise serialization. The lower-level
   wallet-secret repository lock and outer operation lock intentionally use
   different keys to prevent re-entrant deadlocks.
2. `resetManifest.ts` — exact wallet-owned local/sync key lists and transient
   result/artifact prefixes. It is pure and does not perform reset effects.
3. `cachePolicy.ts` — pure TTL/schema/LRU pruning plan for non-critical caches.
4. `cachePruner.ts` — one local-storage snapshot followed by ordered remove
   then set effects; portfolio pruning remains delegated to its owning domain.
5. `resultWaiter.ts` — durable provider-result listener and retrying expiry
   handshake. It never reports a local timeout while confirmation may own the
   request's first-action claim.

`storageLock.ts`, `walletResetStorage.ts`, `storageCachePruner.ts`, and
`storageResultWaiter.ts` are policy-free compatibility facades. Existing
callers retain their runtime function and constant identities.

## Compatibility invariants

- Lock keys, same-key serialization, rejection recovery, and cross-key
  independence are unchanged. Operation and repository locks never collapse.
- Reset key order, exact strings, prefix matching, and the retained
  `walletConnectStorageNamespace` tombstone remain released behavior.
- Cache TTLs, future-timestamp rejection, clear-signing schema policy, avatar
  LRU limits, storage keys, summary counts, and remove-before-set ordering are
  frozen. Cache failures still reject here and are caught by the startup caller.
- Result listeners accept only `chrome.storage.local` values with a truthy
  `result`, remove the durable key after settling, retain the exact
  `Request timed out` error, and retry ambiguous expiry ownership.
