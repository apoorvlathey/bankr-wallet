# Authentication tests

- `architecture.test.ts` freezes facade identities, dependency direction, and
  module size budgets.
- `transition.test.ts` freezes ceremony invalidation and serialized ordering.
- Password rotation and legacy-unlock tests cover released storage shapes and
  all current wallet-key paths.

These tests are discovered recursively by `scripts/run-security-tests.mjs`.
