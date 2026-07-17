# Add Account

- `../AddAccount.tsx` is the public composition root and owns account setup effects.
- `AddAccountTypeSelectionScreen.tsx` renders the account-type chooser.
- `AddAccountActionBar.tsx` owns action availability and labels for each setup path.
- `PrivateKeyAccountSection.tsx` connects private-key entry to the externally
  placed backup acknowledgment without owning persistence.
- `LegacyBiometricUpgradeNotice.tsx` is a presentation-only guard shown before
  private keys or seed phrases can be entered, generated, or derived with a
  signing-only legacy biometric session.
- `useLocalAccountBiometricGate.ts` projects passkey capability status into the
  renderer without duplicating background authorization policy.
- `model/biometricGateModel.ts` contains the pure legacy-capability projection.

The background remains authoritative for authentication and secret storage.
This feature only projects `getPasskeyUnlockStatus` into an early, secret-free
renderer guard and delegates navigation back to the App composition root.
