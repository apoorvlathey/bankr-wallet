# Account tests

- `storageArchitecture.test.ts` enforces the folder/facade boundary and exact
  re-export identities.
- `architecture.test.ts` enforces root cleanup, direct caller composition,
  dependency direction, migration/effect order, and Never-session recovery.
- `reordering.test.ts` covers exact-permutation persistence across wallet types.
- `legacyMigration.test.ts` protects older single-account installs and stale
  active-ID repair for all four legacy migration fixture types.
- `tabResolver.test.ts` covers connected/pending-only per-tab account pinning.
- `localKeyResolver.test.ts` covers cached, biometric/vault-key, and legacy
  password account-bound key resolution.
- `localEffectBoundary.test.ts` covers final ID/type/address revalidation before
  irreversible local signing effects.

Dapp disconnect-before-delete behavior lives in `../dapp/`.
