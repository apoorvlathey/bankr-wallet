# Clear-signing audit domain

This domain resolves public ERC-7730 descriptors and builds optional,
human-readable transaction-history metadata. It never owns credentials,
authorization, signing, or broadcast.

Review in dependency order:

1. `types.ts` — descriptor transport, normalized lookup, and snapshot input.
2. `descriptorCache.ts` — exact `cs:desc:*` key/schema, selector/format hint,
   v3 invalidation, 7-day hit / 1-day miss TTL, best-effort writes, and purge.
3. `settings.ts` — default-on `cs:enabled` preference and disable-time purge.
4. `descriptorClient.ts` — the only descriptor API egress: 10-second deadline,
   512 KiB body cap, redirect/credential-safe shared transport, and null errors.
5. `deploymentExtension.ts` — pure clone-and-append proxy deployment binding.
6. `descriptorResolver.ts` — direct remote lookup, configured-RPC proxy
   fallback, implementation refetch, and deployment extension.
7. `handlers.ts` — opt-out-first validation/cache/resolution coordinator.
8. `counterparty.ts` — best-effort eth.sh and reverse-name enrichment.
9. `assetSnapshotBuilders.ts` — approve, transfer, and native-send summaries.
10. `erc7730Snapshot.ts` — remote descriptor match followed by built-in fallback.
11. `snapshot.ts` — approve → transfer → native → ERC-7730 priority and
    null-on-error boundary.
12. `historyAttachment.ts` — fire-and-forget optional history patch.

`clearSigningHandlers.ts` and `clearSignedMetaSnapshot.ts` are export-only
compatibility facades. Existing callers retain their runtime function
identities.

## Compatibility invariants

- `cs:enabled` remains default-on. Explicit opt-out returns before descriptor
  cache/network work and purges every `cs:desc:*` entry after storing `false`.
- Cache keys remain
  `cs:desc:{chainId}:{lowerAddress}:{kind}:{selector|fmt:length:fnv1a|any}`;
  writes remain `{ schemaVersion: 3, updatedAt, descriptor }`.
- Calldata selectors are exactly four bytes; EIP-712 format inputs are capped
  at 8192 characters before hashing and forwarding.
- A direct descriptor wins. Proxy fallback uses only configured RPC policy,
  and implementation descriptors are cloned before the proxy deployment is
  appended to the matching context.
- Snapshot priority, built-in fallback, metadata fields, and counterparty
  resolution are unchanged. Builder errors return `null`; attachment never
  delays transaction execution and swallows history-write failures.
