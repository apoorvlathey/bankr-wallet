# Batch security map

`../batchTxHandlers.ts` is an implementation-free compatibility facade.
Focused boundaries in this directory are:

- `batchTxEncoding.ts`: pure ERC-7821 encoding and self-recursion policy.
- `batchRequestIntake.ts`: validated `wallet_sendCalls` two-record commit.
- `batchRequestStatusHandlers.ts`: pending-call controls and origin-scoped status.
- `bundleStatusStorage.ts`: locked released `bundleStatuses` repository,
  retention, and bounded history.
- `batchBankrExecution.ts`: pinned Bankr confirmation and terminalization.
- `batchLocalConfirmation.ts`: PK/seed key restoration and path selection.
- `batchSequentialExecution.ts`: non-atomic nonce/broadcast state machine.
- `batchAtomic7702Execution.ts`: atomic authorization and sign-once state machine.
- `batchCapabilities.ts`: exact connected-account capability advertisement and
  delegate probes.
- `batchLocalAuthorization.ts`: final pinned-account and transport check at
  the local RPC effect boundary.
- `batchLocalCoordinator.ts`: stable local entry points and explicit executor
  wiring only.
- `batchSingleExecution.ts`: one-call PK/seed shortcut and bundle publication.
- `batchCompletionTracking.ts`: atomic and sequential receipt-to-bundle
  terminal status mirroring.
- `batchFailure.ts`: shared durable failure publication.
- `batchExecutionRuntime.ts`: shared duplicate-processing and expiry state.
- `batchGasEnrichment.ts`: best-effort post-broadcast fee enrichment.

Dependency direction is encoding/storage policy → authorization/credential
resolution → execution. Intake and status modules cannot sign; encoding cannot
read wallet state; execution modules must revalidate immediately before their
irreversible transport effect.

Local effect order is fixed: resolve and consume the account-pinned request,
restore only that account's key, choose single/atomic/sequential execution,
acquire the request effect lease, prepare/sign, re-resolve the exact account,
revalidate origin or WalletConnect authority as the final await, then begin the
RPC effect. Atomic EIP-7702 authorization is created only after delegate and
nonce policy, and the exact reviewed calls remain pinned through publication.

Sequential execution assigns nonces and history first, then broadcasts one leg
at a time. A definite or ambiguous outcome stops the unsent tail. Completion
tracking owns only the later aggregate bundle status and notification; it never
re-enters credential or signing paths.
