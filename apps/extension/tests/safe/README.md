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
  nonce reservation, unsigned custom rebasing, fully signed queue activation
  when the nonce becomes current, stale queue replacement, idempotency,
  local-cancellation identity reuse, restart-safe effect recovery, route-result
  replay, live-worker claim protection across stale/nonce recovery, and
  first-action claims.
- `serviceMerge.test.ts`, `executionPolicy.test.ts`, `executionReceipt.test.ts`,
  `executionReconciliation.test.ts`, `executorHistory.test.ts`: stale Transaction Service reads cannot
  erase local approvals or in-flight outer execution evidence, publication
  cannot overwrite a confirmation received during its request, every durable
  claim/hash/signed-byte signal blocks duplicate submission, receipt lookup
  distinguishes provider failure from an unmined transaction and falls through
  trusted endpoints, polling resumes through a dedicated MV3 alarm, and the
  gas-paying private-key/seed/Ledger executor gets one normal restart-safe
  Activity row while Bankr, impersonator, and Safe records cannot enter the
  local execution path; Ledger remains excluded from token-funded execution.
- `capabilities.test.ts`, `accountBoundary.test.ts`: linked-owner projection and Safe-to-EOA fallthrough prevention.
- `accountTypePolicy.test.ts`: the exhaustive Safe account-type capability
  matrix, owner/executor/signing-path/fee-token routing, and central-policy
  imports across every background and renderer eligibility consumer.
- `ownerAuthorizationPolicy.test.ts`: private-key/seed/Ledger/Bankr routing,
  shared session-restoration boundaries, preservation of approvals received
  during a hardware wait, plus impersonator/Safe and agent-policy negatives.
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
extension restart behavior, the three software/remote owner credential
ceremonies, and Ledger hardware approval/execution.
`tests/ui/safeHomeActions.test.ts` additionally pins the shared transaction
confirmation composition, password-free decision surface, owner-first executor
default, account eligibility, and execution-account dropdown.
