# Passkey unlock audit domain

This folder owns the optional WebAuthn-PRF wrappers around WalletChan's general
and mnemonic keys. `../passkeyUnlock.ts` and `../passkeyUnlockCrypto.ts` are
stable compatibility facades and contain no policy, storage, or cryptography.

## Dependency order

```text
record.ts
  -> keyWrapping.ts
  -> repository.ts
  -> sessionBinding.ts
  -> status.ts
  -> setup.ts / hydration.ts / removal.ts
  -> passkeyUnlock.ts (parent facade)
```

`keyWrapping.ts` and `repository.ts` both depend on the record codec, but never
on one another. The repository validates persisted input and does not make an
authorization decision.

## Review map

| Module | Single responsibility | Persistent effects |
| --- | --- | --- |
| `record.ts` | Bounded V1/V2 record and ceremony-payload validation | None |
| `keyWrapping.ts` | Purpose-separated PRF/HKDF wrap and unwrap | None |
| `repository.ts` | Validated `passkeyUnlock` record reads/writes | `passkeyUnlock` only |
| `sessionBinding.ts` | Stable SHA-256 fingerprint excluding mutable usage metadata | None |
| `status.ts` | Status plus cached/explicit master setup preflight | None |
| `setup.ts` | Atomic V1/V2 setup and mnemonic-vault conversion | `mnemonicVault` and `passkeyUnlock` together |
| `hydration.ts` | Unwrap, verify, and hydrate a master session | Session cache only |
| `removal.ts` | Prove master recovery before factor removal | Removes `passkeyUnlock` |

## Compatibility and security invariants

- Frozen released V1 raw-PRF records and V2 HKDF records remain readable.
- PRF output is never persisted or cached after the ceremony.
- Explicit Never persistence receives only the unwrapped general key and a
  stable record fingerprint. It never receives/persists PRF output, password,
  API/private keys, seed phrase, or mnemonic key.
- General and mnemonic wrappers use different derivation purposes.
- Setup/removal are master-only, ceremony-epoch-bound operations.
- V2 setup commits mnemonic protection and the passkey record atomically; a
  partial record must never be published.
- Removing the passkey first proves that every durable secret remains
  recoverable through the master password.

Tests and frozen compatibility coverage live in `tests/passkey/` and
`tests/fixtures/passkeyUpgradeRecords.ts`.
