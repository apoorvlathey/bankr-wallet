# Transaction simulation tests

- `ethSimulateLogs.test.ts` freezes pure status/transfer-log classification,
  including native transfers, net ERC-20 deltas, and NFT exclusion.
- `approvalIntents.test.ts` freezes bounded direct, Permit2, canonical
  Multicall3, and Safe MultiSend discovery plus opaque/delegatecall fallback.
- `approvalLogs.test.ts` freezes successful-call ERC-20/Permit2 event
  extraction, owner/emitter binding, and malformed-status handling.
- `approvalProjection.test.ts` freezes the persistent-risk rule: same-batch
  consumption/revocation is hidden, final increases and Permit2 expiry
  extensions remain, and missing readback produces unverified fallback.
- `approvalAttachment.test.ts` freezes result merging, authoritative-revert
  suppression, and retention of unverified fallback when only asset preview
  is unavailable.
- `residualApprovalCandidates.test.ts` freezes successful outgoing-transfer
  candidate discovery, exact/fallback spender selection, incoming/failed/zero
  exclusion, unchanged unlimited retention, and zero-final suppression.
- `approvalIncidentRegression.test.ts` replays the real alphaUSDCDeltaV2
  self-multicall approval that preceded the July 2026 drain and freezes both
  RPC-unavailable fallback and verified unlimited-risk projection.
- `stateOverrides.test.ts` freezes ERC-20 slot discovery and Permit2's
  nonce-preserving packed allowance override.
- `simulatorOverride.test.ts` freezes full storage replacement for injected
  EOA, Safe, and other contract-account simulations so slot zero cannot inherit
  unrelated live account state.
- `normalization.test.ts` freezes amount formatting, native-change direction,
  and decoded NFT result normalization.
- `portfolioPrices.test.ts` freezes positive-price filtering and canonical
  native/contract cache keys without making a portfolio request.
- `facade.test.ts` freezes every legacy `txSimulation.ts` runtime export.
- `nonAtomicBatch.test.ts` freezes dual-path failure/merge precedence and
  retention of successful approval changes when a different call fails.
- `batchCandidates.test.ts` freezes Safe direct-call discovery, including
  calldata fallback when access-list tracing is unavailable.
- `safeSimulation.test.ts` freezes exact-envelope verdict precedence while
  retaining Safe-owned asset deltas from the underlying-call pass.
- `architecture.test.ts` keeps extracted modules focused, dependency-safe, and
  wired through the stable `txSimulation.ts` facade.

These tests do not make live RPC or pricing requests.
