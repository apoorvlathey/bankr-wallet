# Cross-cutting security tests

- `architectureBoundaries.test.ts` freezes one-way dependencies and stable
  compatibility facades across critical domains.
- `chromeDomainLayout.test.ts` rejects new flat Chrome implementations,
  requires mirrored source/test audit maps, and keeps the test root empty.
- `moduleSizeBudget.test.ts` ratchets independently auditable source modules.
- `policy.test.ts` protects password bounds, legacy unlock compatibility, and
  auto-lock defaults.

Tests for a single secret, transport, or provider domain belong in that
domain's directory. This folder is reserved for invariants spanning them.
