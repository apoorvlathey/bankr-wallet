# Session audit domain

`../sessionCache.ts` is the stable public facade and the only module most
callers should import. This folder contains the lower layers it coordinates.

| Module | Responsibility | Secret-bearing state |
| --- | --- | --- |
| `inMemoryCache.ts` | Decrypted capabilities, timestamps, and all-or-nothing expiry | Password, API key, general/mnemonic keys, private-key cache |
| `autoLockPolicy.ts` | Validate, normalize, cache, and store the timeout setting | None |
| `storage.ts` | Cross-browser `chrome.storage.session` adapter and legacy fallback cleanup | Opaque session fields only |
| `persistence.ts` | Encrypt/decrypt the native Never-session envelope | Bounded plaintext password during immediate wrap/unwrap |

## Invariants

- Expiry of one capability clears the entire in-memory authorization state.
- Missing or invalid timeout settings resolve to a finite default; only an
  explicit valid `0` enables Never mode.
- Restorable password sessions are written only when native
  `chrome.storage.session` is available. A local-storage fallback never stores
  both an encrypted password and its recovery key.
- Restore, manual lock, and factor/password mutations share the serialized
  auth-transition queue so an older restore cannot resurrect a newer lock.
- Lower session modules do not import the `sessionCache.ts` facade or auth
  handlers; the facade alone composes them.

Tests live in `tests/session/`.
