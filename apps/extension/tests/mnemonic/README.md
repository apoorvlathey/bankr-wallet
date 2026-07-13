# Mnemonic security tests

This directory mirrors `src/chrome/mnemonic/` and keeps seed-secret audits in
one place:

- `architecture.test.ts` enforces the facade and one-way module boundaries.
- `passkeyV2.test.ts` and `biometricSeedRouter.test.ts` cover biometric access.
- `masterAccess.test.ts` covers master-only mnemonic capabilities.
- `accountHandlers.test.ts`, `addressPreview.test.ts`, and
  `accountRemovalDeriveRace.test.ts` cover import, derivation, preview, and
  races.

Frozen released storage records remain in `../fixtures/` so upgrade tests share
one immutable compatibility corpus.
