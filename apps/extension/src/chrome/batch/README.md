# Batch security map

`../batchTxHandlers.ts` is the stable compatibility facade and temporary
coordinator. Focused boundaries in this directory are:

- `batchTxEncoding.ts`: pure ERC-7821 encoding and self-recursion policy.
- `batchRequestIntake.ts`: validated `wallet_sendCalls` two-record commit.
- `batchRequestStatusHandlers.ts`: pending-call controls and origin-scoped status.
- `batchBankrExecution.ts`: pinned Bankr confirmation and terminalization.
- `batchLocalConfirmation.ts`: PK/seed key restoration and path selection.
- `batchSequentialExecution.ts`: non-atomic nonce/broadcast state machine.
- `batchAtomic7702Execution.ts`: atomic authorization and sign-once state machine.
- `batchFailure.ts`: shared durable failure publication.
- `batchExecutionRuntime.ts`: shared duplicate-processing and expiry state.
- `batchGasEnrichment.ts`: best-effort post-broadcast fee enrichment.

Dependency direction is encoding/storage policy → authorization/credential
resolution → execution. Intake and status modules cannot sign; encoding cannot
read wallet state; execution modules must revalidate immediately before their
irreversible transport effect.
