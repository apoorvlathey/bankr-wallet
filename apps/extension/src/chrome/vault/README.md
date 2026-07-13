# Private-key vault audit domain

- `entryCrypto.ts` owns pure released password/vault-key AES-GCM transforms.
- `accountIntegrity.ts` proves decrypted keys match private-key or seed accounts.
- `generalIntegrity.ts` proves the master-wrapped general key recovers every
  Bankr credential and local signing key before factor removal or rotation.
- `recordCodec.ts` bounds and validates the released V1 storage envelope. It
  keeps structurally valid duplicate IDs readable for recovery compatibility,
  while refusing them at every mutation or migration boundary.
- `repository.ts` owns only the released `pkVault` storage key and V1 record IO.
- `operations.ts` owns serialized add/remove, account-bound hydration, password
  rotation preparation, and vault-key migration preparation.
- Root `vaultCrypto.ts` is a policy-free compatibility facade.

Dependencies flow from entry crypto/account integrity and repository into
operations or general integrity. Repository and pure transforms do not import
session, authorization, or orchestration layers. The released schema, key name,
legacy password records, current vault-key records, and AES-GCM parameter shape
must remain compatible with silently updated wallets.
