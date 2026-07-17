export interface PasskeyUnlockStatus {
  configured?: boolean;
  mnemonicCapable?: boolean;
}

export function needsLocalAccountBiometricUpgrade(
  status: PasskeyUnlockStatus | null | undefined,
): boolean {
  return !!status?.configured && !status.mnemonicCapable;
}
