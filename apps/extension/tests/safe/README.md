# Safe test map

- `deploymentMetadata.test.ts`, `protocol.test.ts`, `multiSend.test.ts`,
  `signatureValidation.test.ts`:
  exact generated-to-official deployment metadata parity,
  deterministic hashes, canonical batches, the canonical rejection self-call,
  signed-rejection policy, and EOA confirmation recovery.
- `onchainState.test.ts`: canonical proxy/singleton verification, exact-block authority, contract-owner blocking, and EIP-7702 EOAs.
- `accountRepository.test.ts`, `accountRefresh.test.ts`,
  `proposalRepository.test.ts`, `proposalNonce.test.ts`: strict storage decoding,
  atomic import/removal, chain-scoped direct-RPC refresh, sequential concurrent
  nonce reservation, unsigned custom rebasing, queue activation, idempotency,
  local-cancellation identity reuse, restart-safe effect recovery, route-result
  replay, and first-action claims.
- `serviceMerge.test.ts`, `executionPolicy.test.ts`, `executionReceipt.test.ts`,
  `executionReconciliation.test.ts`, `executorHistory.test.ts`: stale Transaction Service reads cannot
  erase local approvals or in-flight outer execution evidence, every durable
  claim/hash/signed-byte signal blocks duplicate submission, receipt lookup
  distinguishes provider failure from an unmined transaction and falls through
  trusted endpoints, polling resumes through a dedicated MV3 alarm, and the
  gas-paying private-key/seed executor gets one normal restart-safe Activity
  row while Bankr, impersonator, and Safe records cannot enter the local
  execution path.
- `capabilities.test.ts`, `accountBoundary.test.ts`: linked-owner projection and Safe-to-EOA fallthrough prevention.
- `ownerAuthorizationPolicy.test.ts`: Bankr/private-key/seed routing, shared
  session-restoration boundaries, plus impersonator/Safe and agent-policy
  negatives.
- `discovery.test.ts`, `serviceClient.test.ts`: chain-prefixed/manual probing,
  visible custom-chain resolution, hidden-chain exclusion, Base Sepolia owner
  discovery, activity-prioritized progressive batching, checksum-safe direct
  service reads, and direct proposal coordination writes.
- `serviceRegistry.test.ts`: all-EVM Safe config parsing, pinned service-host
  validation, non-EVM exclusion, and unsafe RPC fallback rejection.
- `accountRouter.test.ts`: selected-account binding, bounded batch validation,
  and no-disclosure behavior for missing owner account IDs.
- `proposalRejection.test.ts`: provider and ERC-5792 terminal outcomes after a
  same-nonce transaction wins; `proposalRepository.test.ts` also proves that
  signed proposals cannot enter the local-cancel path.

Browser QA complements these deterministic tests for real Safe service records,
extension restart behavior, and the three owner credential ceremonies.
`tests/ui/safeHomeActions.test.ts` additionally pins the shared transaction
confirmation composition, password-free decision surface, owner-first executor
default, account eligibility, and execution-account dropdown.
