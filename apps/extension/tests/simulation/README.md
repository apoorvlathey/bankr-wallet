# Transaction simulation tests

- `ethSimulateLogs.test.ts` freezes pure status/transfer-log classification,
  including native transfers, net ERC-20 deltas, and NFT exclusion.
- `stateOverrides.test.ts` freezes ERC-20 slot discovery and Permit2's
  nonce-preserving packed allowance override.
- `normalization.test.ts` freezes amount formatting, native-change direction,
  and decoded NFT result normalization.
- `portfolioPrices.test.ts` freezes positive-price filtering and canonical
  native/contract cache keys without making a portfolio request.
- `facade.test.ts` freezes every legacy `txSimulation.ts` runtime export.
- `nonAtomicBatch.test.ts` freezes dual-path failure and merge precedence.
- `architecture.test.ts` keeps extracted modules focused, dependency-safe, and
  wired through the stable `txSimulation.ts` facade.

These tests do not make live RPC or pricing requests.
