# Privacy Shield operation audit domain

This domain owns the durable boundary between a reviewed active-chain Shield amount
and a future wallet confirmation. It deliberately cannot sign or submit a
transaction.

## Files

- `types.ts`: exact public summary, encrypted-detail, metadata, and resource
  limits.
- `crypto.ts`: fresh-IV AES-GCM for calldata, precommitment, and deposit index;
  AAD binds the complete public summary and privacy key ID.
- `intent.ts`: distinct, independently decoded operation intent fixed to
  `submittable: false`.
- `database.ts`: shared IndexedDB connection, schema, validated record reads,
  transaction completion, and reset deletion.
- `repository.ts`: atomic operation/index commit, idempotent lookup, and bounded
  activity reads.
- `rejectionRepository.ts`: exact rejected-record deletion without derivation
  metadata access.
- `rejectionLifecycle.ts`: post-pending deletion and interrupted-rejection
  startup reconciliation.
- `prepare.ts`: master-authorized deployment/account/quote revalidation,
  derivation, encryption, and commit orchestration.
- `submission.ts`: converts only an exact encrypted operation into the trusted,
  account-pinned normal WalletChan confirmation; it does not sign or broadcast.
- `lifecycle.ts`: receipt, exact pool-event, ASP, rejection, revert, and restart
  state transitions. A rejection is marked before its pending request is
  removed, then its encrypted operation is deleted without rewinding the
  derivation cursor. Other terminal records remain available to activity
  history but do not participate in account/amount dedupe.
- `historyProjection.ts`: exact operation/transaction/account/chain/value
  binding before the public lifecycle subset is mirrored onto `txHistory`.

## Invariants

The final protocol uint32 derivation index is reserved for ephemeral review
material. Persisted operations reserve indices from zero through
`0xfffffffe`. The next index and its operation record commit in one IndexedDB
transaction, so worker restarts and concurrent WalletChan views cannot reuse an
index. A stable request UUID and pending account/amount dedupe key make retries
idempotent.

Only the sanitized summary may cross the background message boundary. The
deposit index, precommitment, and calldata are encrypted with the dedicated
privacy key and never enter React. Records are capped at 100 and activity reads
at the newest 20. Manual reset and disposable fresh-onboarding cleanup delete
the complete database.

Operation preparation supports Bankr, private-key, and seed-phrase custody
accounts after exact storage pinning. Impersonators and agent sessions fail
closed. A fresh biometric master session may prepare an operation directly from
its matching purpose-separated privacy capability; explicit recovery-phrase
reveal remains main-password-only. No module in this directory imports a
signer or raw-RPC submission primitive. `submission.ts` may queue the existing
transaction coordinator only after the encrypted operation has been
revalidated; signing authority remains outside this domain.
