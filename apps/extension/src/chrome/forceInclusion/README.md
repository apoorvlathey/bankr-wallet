# Force inclusion and receipt recovery audit domain

Stable caller entrypoints are deliberately tiny:

- `single.ts` re-exports single-deposit construction, submission, and recovery.
- `batch.ts` re-exports ERC-5792 Bankr/local execution and aggregate tracking.
- `receiptPoller.ts` re-exports receipt application, polling, and resumption.

Single-deposit ownership:

- `types.ts` contains progress/account contracts.
- `l1Client.ts` owns Ethereum/Sepolia RPC selection and progress persistence.
- `deposit.ts` owns OptimismPortal calldata, L2 gas selection, and L1 estimates.
- `singleHistory.ts` initializes durable intent/history state.
- `singleOutcome.ts` applies confirmed, ambiguous, and failed outcomes.
- `singleBankr.ts` and `singleLocal.ts` own their respective submission paths.
- `recovery.ts` reconciles L1 deposits and restarts aggregate bundle trackers.

Batch ownership:

- `batchBankr.ts` owns the atomic Bankr deposit path.
- `batchLocalPreparation.ts` estimates L2/L1 gas, assigns pending L1 nonces,
  and persists per-call intent before broadcast.
- `batchLocalBroadcast.ts` signs once and broadcasts sequentially. It performs
  the final account/request authorization immediately before each send,
  persists the deterministic hash before settling the effect lease, and never
  submits a higher-nonce tail after a failed or ambiguous send.
- `batchLocalReceipts.ts` retains receipt timeouts as recoverable pending state.
- `batchCompletion.ts` derives the aggregate ERC-5792 bundle status.

Receipt ownership:

- `receiptPolling.ts` owns active-poller deduplication, Flashblocks fast polling,
  exponential backoff, on-demand checks, and restart resumption.
- `receiptFinalizer.ts` classifies confirmed, pending, ambiguous, and dropped
  broadcasts. An ambiguous deterministic hash is never declared dropped, and
  a derived force-inclusion L2 hash is never treated as a mempool transaction.
- `broadcastPolicy.ts` distinguishes ordinary/L1 broadcasts from derived L2
  deposits. Derived L2 hashes remain pending while absent and receive a
  fifteen-minute receipt-polling window around the expected one-to-ten-minute
  OP Stack derivation delay.
- `receiptHistory.ts` applies terminal status and gas data.
- `l1GasData.ts` projects the fee-bearing L1 deposit receipt and prevents the
  zero-cost derived L2 receipt from overwriting that paid fee. The history
  repository enforces the tagged L1 record against every later enrichment
  writer. Startup recovery backfills older completed rows.
- `receiptSideEffects.ts` mirrors Shield, Public Exit, receiver-paid Unshield,
  EIP-7702, and ERC-7715 state from the same canonical receipt, then advances
  split or bridge flows only after receipt application.
- `receiptRpc.ts` and `receiptNotification.ts` isolate RPC normalization and UI
  notifications from state transitions.

`nonceManager.ts`, `splitBatchSequencer.ts`, and `broadcastPolicy.ts` remain
small independent units. Historical root modules are intentionally absent.
