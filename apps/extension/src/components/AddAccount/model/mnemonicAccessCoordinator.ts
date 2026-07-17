import {
  getMnemonicAccessRequirement,
  type PasskeyUnlockStatus,
} from "./biometricGateModel";

export type EnsureMnemonicAccessResult =
  | { ready: true }
  | { ready: false; reason: "legacy-upgrade-required" }
  | {
      ready: false;
      reason: "authentication-failed";
      failure: "verification" | "capability";
      error: string;
    };

interface PasskeyUnlockAttempt {
  success: boolean;
  error?: string;
}

/**
 * Completes the one fresh assertion needed to restore the live-only mnemonic
 * capability after a cold passkey Never-session restore.
 */
export async function ensureMnemonicAccessFromStatus(
  status: PasskeyUnlockStatus,
  refreshStatus: () => Promise<PasskeyUnlockStatus>,
  requestUnlock: (
    status: PasskeyUnlockStatus,
  ) => Promise<PasskeyUnlockAttempt>,
): Promise<EnsureMnemonicAccessResult> {
  const requirement = getMnemonicAccessRequirement(status);
  if (requirement === "ready") return { ready: true };
  if (requirement === "legacy-upgrade-required") {
    return { ready: false, reason: "legacy-upgrade-required" };
  }

  const unlock = await requestUnlock(status);
  if (!unlock.success) {
    return {
      ready: false,
      reason: "authentication-failed",
      failure: "verification",
      error: unlock.error || "Biometric unlock failed",
    };
  }

  const refreshedRequirement = getMnemonicAccessRequirement(
    await refreshStatus(),
  );
  if (refreshedRequirement === "ready") return { ready: true };
  if (refreshedRequirement === "legacy-upgrade-required") {
    return { ready: false, reason: "legacy-upgrade-required" };
  }
  return {
    ready: false,
    reason: "authentication-failed",
    failure: "capability",
    error:
      "Biometric verification succeeded, but seed phrase protection could not be unlocked.",
  };
}
