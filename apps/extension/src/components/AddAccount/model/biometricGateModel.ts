export interface PasskeyUnlockStatus {
  configured?: boolean;
  mnemonicCapable?: boolean;
  mnemonicSessionReady?: boolean;
  authCeremonyEpoch?: string;
  credentialId?: string;
  prfSalt?: string;
}

export type MnemonicAccessRequirement =
  | "ready"
  | "legacy-upgrade-required"
  | "passkey-step-up-required";

export function needsLocalAccountBiometricUpgrade(
  status: PasskeyUnlockStatus | null | undefined,
): boolean {
  // Passkey V1 existed only in unreleased/local development builds. Keeping
  // those records readable avoids stranding local profiles, but WalletChan
  // intentionally requires a V2 reconfiguration before any new local-account
  // setup instead of maintaining a second mutation policy for that state.
  return !!status?.configured && !status.mnemonicCapable;
}

export function getMnemonicAccessRequirement(
  status: PasskeyUnlockStatus | null | undefined,
): MnemonicAccessRequirement {
  if (needsLocalAccountBiometricUpgrade(status)) {
    return "legacy-upgrade-required";
  }
  if (status?.mnemonicCapable && !status.mnemonicSessionReady) {
    return "passkey-step-up-required";
  }
  return "ready";
}
