import { readPrivacyRecoveryBackup } from "./recovery/backup";
import { readPrivacyVault } from "./repository";

export interface PrivacyResetRisk {
  hasShieldData: boolean;
  backupVerified: boolean;
}

/** Public reset preflight: presence/backup flags only, never balances or secrets. */
export async function readPrivacyResetRisk(): Promise<PrivacyResetRisk> {
  const vault = await readPrivacyVault();
  if (vault.status === "missing") {
    return { hasShieldData: false, backupVerified: false };
  }
  if (vault.status !== "valid") {
    return { hasShieldData: true, backupVerified: false };
  }
  const hasShieldData = vault.record.recovery !== null;
  const backup = hasShieldData
    ? await readPrivacyRecoveryBackup(vault.record.keyId)
    : null;
  return {
    hasShieldData,
    backupVerified: backup !== null,
  };
}
