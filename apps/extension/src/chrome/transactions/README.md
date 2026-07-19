# Transaction domain

`txHandlers.ts` is an implementation-free compatibility facade.
This directory owns the extracted, audit-sized transaction concerns:

- `requestIntake.ts` validates provider transaction/signature envelopes and
  persists exact account/origin/chain snapshots.
- `runtime.ts` owns result publication, pinned-account resolution, abort
  controllers, and duplicate-processing state. Signing prompts remain pending
  until explicitly resolved.
- `localConfirmation.ts` owns non-expiring PK/seed confirmation preflight, EIP-7702 master
  authorization capture, and master/agent/Never-session key recovery.
- `localExecution.ts` owns nonce/gas preparation, sign-once execution, the
  final pre-RPC account/transport/authority check, and receipt publication.
- `impersonatedExecution.ts` owns the explicit per-RPC developer exception for
  view-only accounts: pinned confirmation policy, standard unsigned
  `eth_sendTransaction` projection, final endpoint/account/authority checks,
  and ambiguity-aware result publication. It never calls provider admin or
  signing methods.
- `failure.ts`, `displayMetadata.ts`, and `notification.ts` isolate durable
  failure effects from best-effort enrichment and Chrome notifications.
- `bankrPolicy.ts`, `bankrSession.ts`, `bankrConfirmation.ts`, and
  `bankrProcessing.ts` separate pinned-request policy, credential recovery,
  prompt consumption/effect leasing, and remote result publication.
- `requestActions.ts` owns rejection and cancellation terminalization.
- `swaps/accountPolicy.ts` binds every prepared swap to an existing account,
  address, wallet type, and chain before credentials are resolved.
- `swaps/direct.ts` owns ordered multi-leg orchestration;
  `swaps/bankrLeg.ts` owns one ambiguity-aware remote leg and
  `swaps/localBroadcast.ts` owns one final-account-checked local broadcast.
- `swaps/batch.ts` owns Bankr ERC-7821 submission while `swaps/atomic.ts` owns
  PK/seed EIP-7702 + ERC-7821 submission. Shared public shapes are in
  `swaps/types.ts`.
- `internalTransfer.ts`, `securityReset.ts`, `rpcConfig.ts`, and
  `accountMutations.ts` contain the smaller operations historically exposed by
  the transaction facade.

Effect order for local signing is fixed: consume the pending prompt, revalidate
live request authority, acquire an effect lease, prepare and sign once,
revalidate immediately before RPC broadcast, then publish the durable result.
Pre-boundary failures release the lease; an uncertain post-boundary outcome
retains it fail-closed.

Effect order for Bankr confirmation is fixed: validate the persisted pinned
account/from/chain, resolve the current credential generation, consume the
prompt, revalidate live request authority, acquire an effect lease, perform
the final account/origin/credential check at the HTTP boundary, then publish.

Effect order for direct swaps is fixed: validate every prepared leg against
one locked account and chain, recover only that account's credential, prepare
history/nonces in order, then await each irreversible leg. A definite or
ambiguous outcome stops and terminalizes the unsent tail. Atomic and Bankr
batch paths acquire an internal-operation effect lease before handing their
fire-and-forget submission to the owning executor.

Shared pending storage, lifecycle claims, receipt polling, account storage,
local-signing primitives, and batch execution remain outside this directory.
