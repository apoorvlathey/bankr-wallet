# Account audit domain

`../accountStorage.ts` remains the only stable public facade for account
metadata. This directory also owns the small compatibility, tab-scope, and
local-signing boundaries whose decisions are pinned to an account identity.

Review in dependency order:

1. `authorization.ts` — optional master-epoch assertion at commit boundaries.
2. `repository.ts` — the `accounts` record, address normalization, queries,
   ordering, and display names.
3. `selectionStorage.ts` — global/per-tab selection mirrors and stale-ID repair.
4. `bankrStorage.ts` — atomic Bankr account + prepared encrypted credential
   metadata commits.
5. `localStorage.ts` — private-key/view-only metadata add/remove/reset.
6. `seedStorage.ts`, `seedGroupStorage.ts` — derived-account/group metadata.
7. `legacyMigration.ts` — serialized pre-multi-account compatibility commit.
8. `tabResolver.ts` — connected/pending-dapp-only per-tab selection policy.
9. `localEffectBoundary.ts` — final ID/type/address revalidation immediately
   before an irreversible local signer effect.
10. `localKeyResolver.ts` — requested-account-only key cache lookup, native
    Never-session recovery, and legacy/current vault decryption orchestration.

The repository layer must not import mutation modules. Only
`localKeyResolver.ts` may request decrypted signing material, and it returns one
account-bound key rather than a bulk vault. Storage keys and record shapes are
defined in `_docs/STORAGE.md` and are unchanged by this folder organization.
