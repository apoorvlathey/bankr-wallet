# Dapp authorization tests

- `architecture.test.ts` enforces the single source folder, 400-line ceiling,
  top-level/exact-origin policy, account-scope sources, revoke-before-delete
  ordering, direct composition, and the bounded read-only RPC allowlist.
- `requestPolicy.test.ts` exercises exact Chrome sender/tab authorization and
  rejects subframes, navigation races, unapproved origins, and page claims.
- `accountRemovalPrivacy.test.ts` covers pending cancellation, exact-origin
  revocation, shared connection/removal locking, and fail-closed deletion.

Injected-provider integration remains in `../provider/`; storage concurrency
and schemas remain in `../requests/`.
