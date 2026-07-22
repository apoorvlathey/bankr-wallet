# Session audit domain

`../sessionCache.ts` is an export-only stable facade and the only module most
callers should import. This folder contains the independently auditable layers.

| Module | Responsibility | Secret-bearing state |
| --- | --- | --- |
| `inMemoryCache.ts` | Decrypted capabilities, surface-aware inactivity timestamps, and all-or-nothing expiry | Password, API key, general/mnemonic/privacy keys, private-key cache |
| `autoLockPolicy.ts` | Validate, normalize, cache, and store the timeout setting | None |
| `timeoutValues.ts` | Pure finite/Never timeout allowlist shared by policy and persisted-record validation | None |
| `cacheAccess.ts` | Expiry-aware selectors, wallet predicates, and private-key lookup | Reads in-memory capabilities only |
| `teardown.ts` | All-or-nothing memory and persisted-session clearing | Clears every session capability |
| `timeoutTransitions.ts` | Default initialization plus timeout-change revocation and serialized storage changes | None |
| `uiSurfaceLease.ts` | Bounded trusted renderer IDs, active heartbeat transitions, and last-close inactivity start | No plaintext secrets; re-seals existing ciphertext |
| `capabilityPersistence.ts` | Exact unified key-capability codec, factor binding, split AES-GCM persistence, and lease rewrites | Exact 32-byte general key plus optional exact 32-byte master privacy key during immediate wrap/unwrap |
| `restoration.ts`, `unifiedRestoration.ts`, `legacyRestoration.ts` | Serialized dispatch, authoritative factor/lease checks, and released-envelope migration | Bounded decrypted key capability or released password during unlock |
| `storage.ts` | Cross-browser `chrome.storage.session` adapter and legacy fallback cleanup | Opaque session fields only |
| `persistence.ts` | Shared recovery half plus released native password envelope compatibility | Bounded legacy plaintext password during immediate migration unwrap |
| `passkeyCredentialRecord.ts` | Exact versioned passkey-session record codec | None |
| `passkeyPersistence.ts` | Released passkey V1/V2 envelope compatibility | Exact 32-byte general vault capability during immediate migration unwrap |

## Invariants

- Expiry of one capability clears the entire in-memory authorization state.
- Missing or invalid timeout settings resolve to a finite default; only an
  explicit valid `0` enables Never mode.
- Unified restorable password/passkey sessions are written only when native
  `chrome.storage.session` is available. A local-storage fallback never stores
  a secret ciphertext or its recovery key.
- Native session ciphertext is readable by the service worker and privileged
  extension-origin pages, but hidden from content scripts by default. All
  privileged extension pages are part of the secret-bearing trust boundary.
- Unified restoration persists no password, PRF output, API key, private key,
  seed phrase, mnemonic key, or recovery phrase. Its exact-size general and
  optional master-only privacy capabilities are bound to session/factor/type,
  timeout, bounded surface IDs, lease/activity/idle timing, and privacy key ID.
- Any open trusted `index.html` surface pauses finite inactivity. Last close
  starts the timer. A same-ID reconnect can prove continuous presence after a
  worker restart; a new ID is evaluated from the last authenticated heartbeat
  and cannot revive expiry. Onboarding has worker keepalive only, never a lease.
- A coherent live `{ general vault key, password type }` generation makes
  restoration an idempotent success after the authoritative timeout check. It
  does not invoke unlock, rotate the auth epoch, or replace a fresh V2 passkey
  session's live-only mnemonic key. Missing plaintext password is expected in
  a passkey session and is not a cold-worker signal.
- Exactly one current unified credential may exist. Unknown, ambiguous,
  tampered, stale, or type-inconsistent state clears both halves and returns
  locked; released records are consumed only by explicit migration logic.
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
- Cold restoration rechecks the authoritative timeout and lease after unlock
  and rotates the auth epoch only after complete successful rehydration.
- Lower session modules do not import the `sessionCache.ts` facade or auth
  handlers; callers inject the unlock function into `restoration.ts`.

Tests live in `tests/session/`.
