# Transaction simulation tests

- `ethSimulateLogs.test.ts` freezes pure status/transfer-log classification,
  including native transfers, net ERC-20 deltas, and NFT exclusion.
- `stateOverrides.test.ts` freezes ERC-20 slot discovery and Permit2's
  nonce-preserving packed allowance override.
- `architecture.test.ts` keeps extracted modules focused, dependency-safe, and
  wired through the stable `txSimulation.ts` coordinator.

These tests do not make live RPC or pricing requests.
