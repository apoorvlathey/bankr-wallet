# Sponsored transfer audit domain

Sponsored Base-USDC transfers create one-time ERC-3009 authorizations whose
relayer outcome can be ambiguous. Review the implementation in this order:

1. `validation.ts`, `response.ts`, `types.ts`, `constants.ts` — pure bounded
   renderer intent and HTTP response contracts.
2. `intentStorage.ts` — the locked `sponsoredTransferIntents` repository,
   encrypted relay payload codec, semantic dedupe, and terminal ACK removal.
3. `vaultAccess.ts`, `authorization.ts` — Never-session recovery, exact account
   signing for private-key/seed/Bankr accounts, and encrypted one-time intent
   preparation.
4. `submission.ts` — final account recheck, prepared → submitting persistence,
   the sole relayer POST, submitted success, and ambiguous-response retention.
5. `reconciliation.ts`, `recovery.ts` — dual-RPC finalized authorization reads
   and unanimous consumed/expired classification.
6. `status.ts`, `premiumStatus.ts`, `handlers.ts` — trusted-UI status/ACK,
   bounded eligibility lookup, and top-level intake/recovery coordination.

The `sponsoredTransferIntents` key and V1 record schema are compatibility and
fund-safety boundaries. The exact signed nonce/signature remain only inside
`encryptedPayload`. An authorization is persisted before its sole relayer
request; an uncertain response is never re-POSTed; two fixed Base RPCs must
agree at their fetched finalized blocks before an ambiguous record is consumed
or removed. Account removal and wallet reset remain blocked while unresolved
records exist. Submitted/consumed records survive until the trusted UI sends
the account-bound ACK before clearing its intent and navigating away.
