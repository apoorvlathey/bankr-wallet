# Cross-cutting security tests

- `architectureBoundaries.test.ts` freezes one-way dependencies and stable
  compatibility facades across critical domains.
- `moduleSizeBudget.test.ts` ratchets independently auditable source modules.
- `policy.test.ts` protects password bounds, legacy unlock compatibility, and
  auto-lock defaults.

Tests for a single secret, transport, or provider domain belong in that
domain's directory. This folder is reserved for invariants spanning them.
