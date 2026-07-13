# Transaction domain

`txHandlers.ts` is the stable compatibility facade and temporary coordinator.
This directory owns the extracted, audit-sized transaction concerns:

- `requestIntake.ts` validates provider transaction/signature envelopes and
  persists exact account/origin/chain snapshots.
- `runtime.ts` owns result publication, pinned-account resolution, expiry
  constants, abort controllers, and duplicate-processing state.
- `localConfirmation.ts` owns PK/seed confirmation preflight, EIP-7702 master
  authorization capture, and master/agent/Never-session key recovery.
- `localExecution.ts` owns nonce/gas preparation, sign-once execution, the
  final pre-RPC account/transport/authority check, and receipt publication.
- `failure.ts`, `displayMetadata.ts`, and `notification.ts` isolate durable
  failure effects from best-effort enrichment and Chrome notifications.
- `internalTransfer.ts`, `securityReset.ts`, `rpcConfig.ts`, and
  `accountMutations.ts` contain the smaller operations historically exposed by
  the transaction facade.

Effect order for local signing is fixed: consume the pending prompt, revalidate
live request authority, acquire an effect lease, prepare and sign once,
revalidate immediately before RPC broadcast, then publish the durable result.
Pre-boundary failures release the lease; an uncertain post-boundary outcome
retains it fail-closed.

Shared pending storage, lifecycle claims, receipt polling, account storage,
local-signing primitives, and batch execution remain outside this directory.
