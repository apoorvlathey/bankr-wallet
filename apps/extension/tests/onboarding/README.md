# Onboarding initialization tests

- `initialization.test.ts` exercises begin/status/complete/rollback behavior,
  interrupted setup recovery, ownership, and credential commit atomicity.
- `architecture.test.ts` freezes the facade identities and one-way dependency
  boundaries between `state.ts`, `lifecycle.ts`, and `credential.ts`, and keeps
  the Chrome root limited to the stable facade.

These tests cover fresh-wallet initialization only. Upgrade compatibility for
existing vault formats belongs with the owning vault, mnemonic, or auth suite.
