# Vault and secret tests

This suite protects persisted and in-memory signing material:

- `architecture.test.ts` — stable facade identities, exact `pkVault` key/AES
  compatibility, one-way dependencies, root clutter, and size ceilings.
- `criticalKeyIntegrity.test.ts` — account/key, general-vault, and mnemonic
  integrity checks fail closed without mutating storage.
- `legacySecretUpgradeFixtures.test.ts` — frozen legacy private-key and V1
  mnemonic records remain readable without migration writes.
- `recordCodec.test.ts` — released V1 bytes, current/legacy AES field shapes,
  duplicate read compatibility, bounded rejection, and zero-write
  add/remove/save/migration behavior.
- `localSecretGeneration.test.ts` — generated keys, phrases, and derivation
  indices satisfy their cryptographic input contracts.
- `masterAuthorizationExpiry.test.ts` — secret mutations cannot commit after
  their master authorization expires.
- `secretRevealRace.test.ts` — reveal operations remain master-only across
  lock, passkey, and storage races.
- `secretStateHardening.test.ts` — lock and credential changes keep cached and
  persisted secret state synchronized.
- `vaultKeyValidation.test.ts` — imported vault keys reject malformed material.

Frozen historical payloads live in `../fixtures/`; shared Chrome storage test
infrastructure lives in `../helpers/`.

Account-bound key resolution tests live in `../accounts/` beside the account
identity and final-effect boundary tests.
