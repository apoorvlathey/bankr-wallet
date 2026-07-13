# Account tests

- `storageArchitecture.test.ts` enforces the folder/facade boundary and exact
  re-export identities.
- `reordering.test.ts` covers exact-permutation persistence across wallet types.
- `removalDappPrivacy.test.ts` covers disconnect-before-delete behavior.
- `legacyMigration.test.ts` protects older single-account installs.
- `tabResolver.test.ts` covers per-tab account pinning.
