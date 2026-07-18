# Session audit domain

`../sessionCache.ts` is an export-only stable facade and the only module most
callers should import. This folder contains the independently auditable layers.

| Module | Responsibility | Secret-bearing state |
| --- | --- | --- |
| `inMemoryCache.ts` | Decrypted capabilities, sliding timestamps, authenticated passkey hard deadline, and all-or-nothing expiry | Password, API key, general/mnemonic keys, private-key cache |
| `autoLockPolicy.ts` | Validate, normalize, cache, and store the timeout setting | None |
| `timeoutValues.ts` | Pure finite/Never timeout allowlist shared by policy and persisted-record validation | None |
| `cacheAccess.ts` | Expiry-aware selectors, wallet predicates, and private-key lookup | Reads in-memory capabilities only |
| `teardown.ts` | All-or-nothing memory and persisted-session clearing | Clears every session capability |
| `timeoutTransitions.ts` | Default initialization, timed/Never persistence, and serialized storage changes | Password only while creating a Never envelope |
| `restoration.ts` | Authoritative password-Never/passkey finite-or-Never re-read, branded unlock proof, type binding, timeout/deadline rechecks, and failure teardown | Bounded decrypted password or passkey vault capability during unlock |
| `storage.ts` | Cross-browser `chrome.storage.session` adapter and legacy fallback cleanup | Opaque session fields only |
| `persistence.ts` | Shared recovery half plus native password envelope | Bounded plaintext password during immediate wrap/unwrap |
| `passkeyCredentialRecord.ts` | Exact versioned passkey-session record codec | None |
| `passkeyPersistence.ts` | Encrypt/decrypt the native factor-bound general-vault envelope | Exact 32-byte general vault capability during immediate wrap/unwrap |

## Invariants

- Expiry of one capability clears the entire in-memory authorization state.
- Missing or invalid timeout settings resolve to a finite default; only an
  explicit valid `0` enables Never mode.
- Restorable password/passkey sessions are written only when native
  `chrome.storage.session` is available. A local-storage fallback never stores
  a secret ciphertext or its recovery key.
- Native session ciphertext is readable by the service worker and privileged
  extension-origin pages, but hidden from content scripts by default. All
  privileged extension pages are part of the secret-bearing trust boundary.
- Passkey restoration persists no password, PRF output, API key, private key,
  seed phrase, or mnemonic key. Its exact-size general capability is bound to
  the session ID, master authority, current validated passkey record, selected
  timeout, start time, and absolute expiry. Finite restoration preserves that
  original hard deadline; it cannot mint another full timeout.
- A coherent live `{ general vault key, password type }` generation makes
  restoration an idempotent success after the authoritative timeout check. It
  does not invoke unlock, rotate the auth epoch, or replace a fresh V2 passkey
  session's live-only mnemonic key. Missing plaintext password is expected in
  a passkey session and is not a cold-worker signal.
- Exactly one credential kind may exist. Unknown, ambiguous, tampered, stale,
  or type-inconsistent state clears both halves and returns locked.
- Factor removal revokes the local `sessionEncKey` recovery half before the
  factor commit. If that revocation fails, the factor remains intact; after a
  successful commit, in-memory authority is cleared synchronously and any
  remaining native-session ciphertext is non-restorable cleanup residue.
- Restore, manual lock, and factor/password mutations share the serialized
  auth-transition queue so an older restore cannot resurrect a newer lock.
  Manual lock revokes the durable local recovery key first, then independently
  removes the browser-session half. Either confirmed deletion makes restoration
  impossible. If neither deletion succeeds, the worker broadcasts failure to
  every open trusted UI, those surfaces purge renderer secrets and remain in a
  blocking retry state, and a worker-local barrier rejects routine restoration
  until a fresh explicit password or passkey authentication succeeds.
- A persisted password type may confirm the wrapper that actually decrypted;
  it can never upgrade an agent restore to master.
- Cold restoration rechecks the authoritative timeout and finite deadline after
  unlock and rotates the auth epoch only after complete successful rehydration.
- Lower session modules do not import the `sessionCache.ts` facade or auth
  handlers; callers inject the unlock function into `restoration.ts`.

Tests live in `tests/session/`.
