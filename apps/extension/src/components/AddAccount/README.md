# Add Account

- `../AddAccount.tsx` is the public composition root and owns account setup effects.
- `AddAccountTypeSelectionScreen.tsx` renders the account-type chooser.
- `AddAccountActionBar.tsx` owns action availability and labels for each setup path.
- `PrivateKeyAccountSection.tsx` connects private-key entry to the externally
  placed backup acknowledgment without owning persistence.
- `SeedPhraseAccountSection.tsx` presents saved seed groups and delegates
  passkey-gated derive actions back to the composition root.
- `LegacyBiometricUpgradeNotice.tsx` is a presentation-only guard shown before
  private keys or seed phrases can be entered, generated, or derived with a
  signing-only legacy biometric session.
- `useLocalAccountBiometricGate.ts` projects passkey capability status and owns
  the shared inline WebAuthn step-up before mnemonic operations.
- `model/biometricGateModel.ts` contains the pure legacy-upgrade and live
  mnemonic-capability projections. V1 passkeys were never shipped; local
  pre-release records are deliberately upgrade-gated for all local setup.
- `model/mnemonicAccessCoordinator.ts` owns the testable assertion/recheck
  sequence and fails closed unless the background advertises the live mnemonic
  capability after the fresh passkey assertion.

The background remains authoritative for authentication and secret storage.
This feature only projects `getPasskeyUnlockStatus` into an early, secret-free
renderer guard and delegates navigation back to the App composition root.
