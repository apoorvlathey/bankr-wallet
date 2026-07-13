# Transaction simulation audit domain

`txSimulation.ts` remains the stable public coordinator while simulation logic
is moved into focused modules:

- `types.ts` owns the shared normalized asset-change and raw simulator shapes.
- `constants.ts` owns shared simulation gas caps and canonical infrastructure
  addresses so retry and coordinator paths cannot drift.
- `stateOverrides.ts` discovers ERC-20 storage slots and constructs retry-only
  balance, approval, and nonce-preserving Permit2 overrides.
- `ethSimulateLogs.ts` is a pure parser for `eth_simulateV1` status and transfer
  logs. It deliberately excludes NFT-shaped logs from fungible-token deltas.

Dependency direction is `types/pure parsing -> state-override construction ->
txSimulation coordinator`. These modules do not own dapp authorization,
credentials, signing, broadcast, Chrome message routing, or persisted storage.
