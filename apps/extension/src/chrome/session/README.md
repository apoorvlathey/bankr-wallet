# Session audit domain

`../sessionCache.ts` is an export-only stable facade and the only module most
callers should import. This folder contains the independently auditable layers.

| Module | Responsibility | Secret-bearing state |
| --- | --- | --- |
| `inMemoryCache.ts` | Decrypted capabilities, timestamps, and all-or-nothing expiry | Password, API key, general/mnemonic keys, private-key cache |
| `autoLockPolicy.ts` | Validate, normalize, cache, and store the timeout setting | None |
| `cacheAccess.ts` | Expiry-aware selectors, wallet predicates, and private-key lookup | Reads in-memory capabilities only |
| `teardown.ts` | All-or-nothing memory and persisted-session clearing | Clears every session capability |
| `timeoutTransitions.ts` | Default initialization, timed/Never persistence, and serialized storage changes | Password only while creating a Never envelope |
| `restoration.ts` | Authoritative Never re-read, unlock proof, type binding, timeout recheck, and failure teardown | Bounded decrypted session password during unlock |
| `storage.ts` | Cross-browser `chrome.storage.session` adapter and legacy fallback cleanup | Opaque session fields only |
| `persistence.ts` | Encrypt/decrypt the native Never-session envelope | Bounded plaintext password during immediate wrap/unwrap |

## Invariants

- Expiry of one capability clears the entire in-memory authorization state.
- Missing or invalid timeout settings resolve to a finite default; only an
  explicit valid `0` enables Never mode.
- Restorable password sessions are written only when native
  `chrome.storage.session` is available. A local-storage fallback never stores
  both an encrypted password and its recovery key.
- Factor removal revokes the local `sessionEncKey` recovery half before the
  factor commit. If that revocation fails, the factor remains intact; after a
  successful commit, in-memory authority is cleared synchronously and any
  remaining native-session ciphertext is non-restorable cleanup residue.
- Restore, manual lock, and factor/password mutations share the serialized
  auth-transition queue so an older restore cannot resurrect a newer lock.
- A persisted password type may confirm the wrapper that actually decrypted;
  it can never upgrade an agent restore to master.
- Restoration rechecks the authoritative timeout after unlock and rotates the
  auth epoch only after a complete successful restore.
- Lower session modules do not import the `sessionCache.ts` facade or auth
  handlers; callers inject the unlock function into `restoration.ts`.

Tests live in `tests/session/`.
