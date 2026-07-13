# Transaction history tests

These tests mirror `src/chrome/history/`:

- `architecture.test.ts` protects compatibility-facade identities, one-way
  dependencies, root clutter, and per-module audit budgets.
- `repository.test.ts` protects the released `txHistory` key and shape,
  newest-first 50-entry cap, serialized updates, notifications, stale-entry
  policy, and case-insensitive per-account cleanup.
- `assetExtraction.test.ts` protects fungible Transfer-log filtering, numeric
  coercion, the narrow ERC-5792 receipt projection, and backfill eligibility.

RPC retry timing and upstream token metadata are intentionally kept behind the
domain boundaries; tests here focus on deterministic policy and persistence.
