# Transaction history audit domain

Transaction history is public display state, but its ordering, durable status,
and post-confirm enrichment feed recovery and user-visible transaction truth.
Review this domain in dependency order:

1. `types.ts`, `clearSignedTypes.ts`, `privacyTypes.ts`,
   `forceInclusionTypes.ts`, and `queryTypes.ts` — the public history,
   clear-signing, privacy lifecycle, force-inclusion recovery, and paging
   shapes. `types.ts` re-exports the focused metadata shapes so existing
   consumers retain the same import surface.
2. `gasDataPolicy.ts` — pure update policy that protects a tagged,
   fee-bearing force-inclusion L1 receipt from later L2 enrichment writes.
3. `assetTransferParser.ts` — pure ERC-20, ERC-721, and ERC-1155 Transfer-log
   recognition and numeric coercion.
4. `recordCodec.ts` and `database.ts` — durable compaction, IndexedDB stores,
   legacy import, indexed cursor paging, and retention.
5. `repository.ts` — the sole history read/add/update authority and compact
   `txHistoryUpdated` broadcasts.
6. `maintenance.ts` — stale-processing failure and full/per-address cleanup.
   Force-inclusion entries remain owned by receipt-based recovery.
7. `rpc.ts` — bounded receipt/balance/block reads, balance retry policy, and
   same-block sibling-cost correction.
8. `nativeDelta.ts` — pure fee and sibling-cost removal from block-level native
   balance deltas.
9. `assetChangeExtraction.ts` — ERC-20/NFT identities and native delta assembly.
10. `detailResolution.ts`, `nftTransferMetadata.ts`, and `nftMetadataCache.ts` —
   trusted on-demand calldata and bounded NFT display-metadata resolution.
11. `assetChangePersistence.ts` — best-effort recent-token seeding followed by
   additive source/destination history writes.
12. `receiptGasData.ts` — pure canonical-receipt projection into durable gas
   display data.
13. `receiptSettlement.ts` — Flashblocks sealing and canonical block-hash gate.
14. `receiptReconciliation.ts` — existing-record repair from one settled receipt.
15. `receiptTransport.ts` — configured-chain receipt lookup and the narrow
   ERC-5792 `BundleReceipt` projection.
16. `receiptEnrichment.ts` — delayed receipt retry and reconciliation facade.

The root `txHistoryStorage.ts`, `assetChangesExtractor.ts`, and
`receiptEnrichment.ts` paths are policy-free compatibility facades. Their
function export identities remain stable for existing callers.

## Compatibility invariants

- IndexedDB database `walletchan-history` is authoritative. On first access,
  the legacy local `txHistory` array is compactly imported and removed only
  after every valid row commits.
- Transactions and transfer identities use separate stores. Settled calldata,
  NFT token URIs, NFT images, and NFT display metadata are never durable history.
- Retention is 1,000 settled rows per account/network plus a 50 MiB database
  budget. Processing/pending recovery rows are never evicted by those limits.
- Activity reads 30-row indexed cursor pages; history broadcasts contain only
  row identity/filter fields and changed top-level keys.
- Existing serialized field names and optional enrichment fields do not
  change during file-only refactors.
- Asset extraction and backfill stay best-effort. RPC, metadata, recent-token,
  or history-write failures must never block confirmation or bridge progress.
- Backfill only queues a successful entry with a hash and sender. Legacy
  ERC-20-only snapshots are lazily upgraded to parser version 2; current snapshots
  remain immutable on ordinary chains, while Flashblocks chains are
  revalidated once per mounted details view because preconfirmed receipt fee
  fields may differ from the sealed canonical receipt.
- A `gasData.feeSource: "forceInclusionL1"` record is authoritative for a
  force-inclusion entry. Later L2 receipt and asset reconciliation may update
  other fields but cannot replace that paid L1 fee.
- Flashblocks receipt-derived gas and native movement are never persisted until
  a following block exists and the refreshed receipt hash matches the canonical
  block. Gas data and asset changes must use that same settled receipt.
- Receipt logs stored in `BundleReceipt` remain limited to address, topics, and
  data. Raw provider receipt fields must not leak into that released shape.
