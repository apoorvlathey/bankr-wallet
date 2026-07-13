# Account metadata audit domain

`../accountStorage.ts` is the stable public facade. This directory owns only
account and selection metadata; private keys, mnemonics, and Bankr plaintext
credentials are deliberately outside it.

Review in dependency order:

1. `authorization.ts` — optional master-epoch assertion at commit boundaries.
2. `repository.ts` — the `accounts` record, address normalization, queries,
   ordering, and display names.
3. `selectionStorage.ts` — global/per-tab selection mirrors and stale-ID repair.
4. `bankrStorage.ts` — atomic Bankr account + prepared encrypted credential
   metadata commits.
5. `localStorage.ts` — private-key/view-only metadata add/remove/reset.
6. `seedStorage.ts`, `seedGroupStorage.ts` — derived-account/group metadata.

The repository layer must not import mutation modules. No module here may read,
decrypt, cache, or return signing material. Storage keys and record shapes are
defined in `_docs/STORAGE.md` and are unchanged by this folder organization.
