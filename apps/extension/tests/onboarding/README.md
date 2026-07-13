# Onboarding initialization tests

- `initialization.test.ts` exercises begin/status/complete/rollback behavior,
  interrupted setup recovery, ownership, and credential commit atomicity.
- `architecture.test.ts` freezes the facade identities and one-way dependency
  boundaries between state, lifecycle, and credential initialization modules.

These tests cover fresh-wallet initialization only. Upgrade compatibility for
existing vault formats belongs with the owning vault, mnemonic, or auth suite.
