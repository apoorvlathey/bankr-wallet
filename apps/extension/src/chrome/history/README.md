# Transaction history audit domain

Transaction history is public display state, but its ordering, durable status,
and post-confirm enrichment feed recovery and user-visible transaction truth.
Review this domain in dependency order:

1. `types.ts` — the released additive `txHistory` record shape. Optional fields
   keep entries from older extension versions readable without migration.
2. `assetTransferParser.ts` — pure ERC-20 Transfer-log recognition and numeric
   coercion. It excludes NFT-shaped four-topic logs.
3. `repository.ts` — the sole `txHistory` read/add/update authority, the
   `local:txHistory` mutation lock, newest-first ordering, 50-entry cap, and
   `txHistoryUpdated` broadcasts.
4. `maintenance.ts` — stale-processing failure and full/per-address cleanup.
   Force-inclusion entries remain owned by receipt-based recovery.
5. `rpc.ts` — bounded receipt/balance/block reads, balance retry policy, and
   same-block sibling-cost correction.
6. `assetChangeExtraction.ts` — metadata enrichment and ERC-20/native delta
   assembly without storage writes.
7. `assetChangePersistence.ts` — best-effort recent-token seeding followed by
   additive source/destination history writes.
8. `receiptTransport.ts` — configured-chain receipt lookup and the narrow
   ERC-5792 `BundleReceipt` projection.
9. `receiptEnrichment.ts` — delayed receipt retry and old-entry backfill policy.

The root `txHistoryStorage.ts`, `assetChangesExtractor.ts`, and
`receiptEnrichment.ts` paths are policy-free compatibility facades. Their
function export identities remain stable for existing callers.

## Compatibility invariants

- The storage key is exactly `txHistory`; records stay newest-first and capped
  at 50 only when adding a new entry.
- Read-modify-write mutations share `local:txHistory`; update and cleanup must
  not clobber concurrent receipt/status changes.
- Existing serialized field names and optional enrichment fields do not
  change during file-only refactors.
- Asset extraction and backfill stay best-effort. RPC, metadata, recent-token,
  or history-write failures must never block confirmation or bridge progress.
- Backfill only queues a successful entry with a hash, sender, and no existing
  `assetChanges`; an existing snapshot is never overwritten just by opening UI.
- Receipt logs stored in `BundleReceipt` remain limited to address, topics, and
  data. Raw provider receipt fields must not leak into that released shape.
