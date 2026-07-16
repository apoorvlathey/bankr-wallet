# Address Contact Book audit domain

This domain owns the wallet-local, non-secret address-label repository. Review
`repository.ts` for the complete persistence boundary: schema validation,
checksum normalization, corruption filtering, entry limits, serialized
mutations, alphabetical insertion, and exact-permutation reordering.

The trusted wallet-UI transport lives in
`background/contactBookRouter.ts`. Renderer code must use that message boundary;
background identity resolution may read this repository directly to avoid a
public-label request when a local contact exists.

## Frozen security invariants

- Contacts are stored only in `chrome.storage.local` under `addressContacts`;
  they are never synced or exposed to page/provider messages.
- Addresses must be valid EVM addresses and are persisted in checksum form.
- Labels are trimmed, limited to 64 characters, and reject control characters.
- The repository retains at most 500 valid entries and silently excludes
  malformed persisted records from reads.
- All mutations are serialized, reject duplicate addresses, and return the
  sanitized committed list used by the renderer update broadcast.
- Reordering accepts only an exact permutation of the current addresses, so a
  stale renderer cannot add, remove, or overwrite contacts.
- Wallet reset removes the storage key with the rest of the wallet identity.
