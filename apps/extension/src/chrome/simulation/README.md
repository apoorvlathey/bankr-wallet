# Transaction simulation audit domain

`txSimulation.ts` is now a policy-free stable public facade over focused
simulation modules:

- `types.ts` owns the shared normalized asset-change and raw simulator shapes.
- `constants.ts` owns shared simulation gas caps and canonical infrastructure
  addresses so retry and coordinator paths cannot drift.
- `stateOverrides.ts` discovers ERC-20 storage slots and constructs retry-only
  balance, approval, and nonce-preserving Permit2 overrides.
- `ethSimulateLogs.ts` is a pure parser for `eth_simulateV1` status and transfer
  logs. It deliberately excludes NFT-shaped logs from fungible-token deltas.
- `client.ts` owns the bounded RPC client cache used by simulation and retry.
- `nativeCurrency.ts` resolves built-in and user-added native metadata.
- `portfolioPrices.ts` mirrors reset-aware portfolio snapshots as canonical
  native/contract price keys.
- `assetChangeNormalization.ts` owns pure amount, native-change, and decoded NFT
  normalization.
- `nftEnrichment.ts` detects NFT standards and resolves captured post-state
  metadata.
- `tokenEnrichment.ts` applies token-list, preflight, onchain, NFT, and price
  metadata in the established order.
- `metadataRetry.ts` owns the stable token/NFT/native enrichment retry flow.
- `resultBuilder.ts` converts raw simulator output into the public result shape.
- `simulatorContract.ts` owns the canonical simulator bytecode and ABIs.
- `erc7715Preview.ts` decodes the narrow safe ERC-7715 redemption preview.
- `singleSimulation.ts` owns access-list discovery, retry overrides, and the
  single-call `eth_call` execution order.
- `batchSimulation.ts` owns atomic batch access-list fallback and bytecode
  execution.
- `ethSimulateBatch.ts` owns the bounded `eth_simulateV1` RPC path and support
  cache.
- `nonAtomicBatch.ts` starts both non-atomic paths together and applies their
  established result precedence.

Dependency direction is `types/constants/pure normalization -> metadata and
state-override helpers -> execution paths -> txSimulation facade`. These
modules do not own dapp authorization, credentials, signing, broadcast, Chrome
message routing, or persisted wallet state.
