# Cross-dapp batch security map

`../crossDappBatchHandlers.ts` is the stable export-only background facade.
This directory owns the user-assembled `crossDappBatch` lifecycle:

- `storage.ts` preserves the released storage key and staged-call schema.
- `accountPolicy.ts` owns exact pinned account/from/chain eligibility and
  concrete-recipient checks.
- `intake.ts` moves pinned transaction or complete `wallet_sendCalls` groups
  into durable staging without resolving the source dapp.
- `approvalCleanup.ts` appends one or a bounded set of canonical
  wallet-generated revokes after validated staged sources while preserving
  every original source authority.
- `approvalCleanupEntries.ts` is the pure list/source/capacity projection and
  wallet-generated entry builder shared by single-to-batch intake and active
  batch edits.
- `staging.ts` edits, removes, or rejects staged sources and routes their
  terminal result by source kind.
- `lifecycle.ts` groups source authority, captures injected/WalletConnect
  epochs, removes unauthorized groups before terminal publication, and exposes
  the synchronous final commit.
- `confirmation.ts` owns non-expiring duplicate-confirm locking, ERC-7821 encoding,
  history initialization, and signer/result composition only.
- `feePayment.ts` owns cross-dapp fee-token quote consumption, account/source
  revalidation, sign-once UserOperation submission, and the broadcast boundary.
- `feePaymentCompletion.ts` verifies EntryPoint receipts, applies fee/history
  enrichment, and fans the real transaction hash to every source.
- `resultRoute.ts` projects and validates the bounded public-only
  transaction/bundle IDs required for restart-safe fan-out.
- `bankr.ts` owns Bankr credential recovery and the final remote submit gate.
- `local.ts` owns PK/seed recovery, delegate recheck, guarded EIP-7702
  authorization, sign-once local broadcast, and ambiguity classification.
- `completion.ts` routes `eth_sendTransaction` results separately from
  ERC-5792 bundle status and mirrors delayed receipts.
- `runtime.ts` owns the single in-worker confirmation exclusion flag; shared
  result shapes are in `types.ts`.

Effect order is fixed: acquire duplicate-confirm exclusion; load and validate
the stored account/from/chain lock; encode exactly the staged calls; recover
only the pinned signer; validate every distinct source and capture its epoch;
acquire the reset-aware effect lease; sign; re-resolve account and transport;
perform the synchronous epoch commit; begin the irreversible transport effect;
then route one shared outcome to every source.

Token-funded execution follows the same authority order and consumes a
`crossDappBatch` quote bound to the exact staged calls. It persists the
deterministic UserOperation hash and public result route before clearing the
active batch and broadcasting. A definite rejection terminalizes the consumed
sources; an ambiguous response is never retried. Source dapps receive only the
real outer transaction hash from a verified EntryPoint receipt, including after
an MV3 restart.

Staging persists the cross-dapp batch before removing the original pending
request. Cancellation and authorization failure do the reverse: remove durable
staging first, then publish terminal source results. `wallet_sendCalls` sibling
entries always move and terminalize as one group. An ambiguous local broadcast
retains its deterministic hash and is polled; it is never retried or re-signed.
Wallet-generated approval cleanup entries share their parent transaction or
bundle authority group, are removed with that source, and are deliberately
excluded from dapp result fan-out so the source promise receives exactly one
terminal outcome. Their durable identity uses WalletChan's bundled icon; the
renderer retains the same icon for already-staged legacy cleanup entries. Bulk
cleanup validates every source before one storage write, then appends the
complete generated cleanup set at the tail.
