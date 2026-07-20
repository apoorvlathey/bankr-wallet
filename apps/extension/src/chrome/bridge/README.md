# Cross-chain bridge audit domain

Bridge code handles public quote/catalog data and durable settlement tracking;
it never owns credentials, signing, or raw transaction broadcast. Review in
dependency order:

1. `types.ts` — additive bridge-chain display shape.
2. `client.ts` — the only WalletChan bridge API egress. Every GET uses the
   shared redirect-safe bounded HTTP primitive, a 15-second deadline, and the
   released 2 MiB quote/status and catalog ceiling.
3. `catalogCache.ts` — `bungeeChains` and `bungeeTokens:{chainId}` repositories,
   24-hour TTLs, per-resource single-flight fetches, stale fallback, and the
   read-time Base WCHAN pin. Token rows pass a strict 2,000-entry codec before
   cache or caller release.
4. `chainPolicy.ts` — pure EVM filtering and source/destination eligibility.
   Source fallback preserves configured signable chains when Socket is down.
5. `chainResolver.ts` — storage/cache composition only.
6. `statusNotification.ts` — pure terminal copy/target mapping followed by
   explorer-click storage and the shared Chrome notification effect.
7. `statusApplication.ts` — one status read and ordered durable transition:
   history update, optional destination enrichment, pending checkpoint,
   terminal notification, then pending-record removal.
8. `statusPolling.ts` — case-insensitive in-memory deduplication, 5s → 30s
   1.5× backoff, 15-minute run cap, restart resume, and confirmed-history to
   `PendingBridge` registration.

`bridgeApi.ts`, `bridgeChainsResolver.ts`, and `bridgeStatusPoller.ts` are
policy-free compatibility facades. Existing callers retain their runtime
function identities.

## Compatibility invariants

- Endpoint paths, query field names, error strings, error truncation, response
  byte ceilings, redirect/credential/referrer policy, and request timeout do
  not change during file-only refactors.
- Cache keys and shapes remain exactly `bungeeChains` and
  `bungeeTokens:{chainId}` with `{ ..., fetchedAt }`; WCHAN is merged on read
  and is not written as a cache migration.
- `pendingBridges` remains owned by `requests/pendingBridgeStorage.ts`; this
  domain does not rewrite its schema or lock semantics.
- Network failures and missing status rows are retryable. A terminal record is
  removed only after history, checkpoint, and notification effects complete.
- Destination asset extraction stays fire-and-forget and cannot delay bridge
  status progression or terminal cleanup.
- Source lists still honor visible/custom/account-restricted chains and 0x
  same-chain support; destination lists remain Socket EVM-only.
