# Authentication audit domain

This folder contains the service-worker operations that prove a wallet factor
and turn it into an in-memory capability. `../authHandlers.ts` is the stable
compatibility facade; new callers should use that facade unless they are a
composition root or a focused unit test.

## Review map

| Module | Single responsibility | Persistent effects |
| --- | --- | --- |
| `walletUnlock.ts` | Select current-vault, agent, and legacy unlock paths | Delegates migration and hydration |
| `sessionHydration.ts` | Validate recovered secrets and commit one complete cache state | May finish a legacy private-key migration |
| `legacyVaultKeyMigration.ts` | Convert password-encrypted general/private-key records to vault-key records | `encryptedVaultKeyMaster`, API-key wrapper, `pkVault` |
| `masterPasswordVerification.ts` | Side-effect-free current/legacy master-password proof | None |
| `agentFactorHandlers.ts` | Create/remove the agent wrapper under a live master authorization | `encryptedVaultKeyAgent` |
| `bankrCredentialUpdate.ts` | Prepare and atomically commit a Bankr credential replacement | API-key wrapper and Bankr account metadata |
| `masterPasswordRotation.ts` | Prepare and atomically rotate every master wrapper | General, private-key, mnemonic, and passkey records |
| `sessionTermination.ts` | Serialize manual lock with secret mutations | Clears restorable and in-memory session state |

## Invariants

- Storage keys, ciphertext formats, KDF parameters, and migration order are
  compatibility contracts and must not change during structural refactors.
- A recovered wrapper is not enough: hydration validates account/key bindings
  before publishing any cache capability.
- Master-only writes capture and re-check the authentication ceremony epoch at
  the storage commit boundary.
- General-vault mutations accept the live vault capability of a passwordless
  passkey session and never trigger restoration solely because plaintext
  password is absent. Any required cold restoration completes before the
  mutation captures its auth epoch.
- Creating an agent factor requires both a live master session and the current
  master password supplied in that request. The handler proves the general and
  V2 mnemonic master-recovery paths before publishing the agent wrapper; a
  cached password is never used as implicit confirmation.
- Agent authentication may sign routine requests but cannot rotate factors,
  reveal secrets, or change durable credentials.
- `authTransition.ts`, `masterAuthorization.ts`, and `sessionCache.ts` remain in
  the parent folder because they are shared capability primitives with callers
  across onboarding, seed, transaction, and permission domains.

Tests live in `tests/auth/`; session-envelope/cache tests live in
`tests/session/`.
