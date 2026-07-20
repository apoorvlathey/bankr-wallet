import { getAuthCeremonyEpoch } from "../authTransition";
import { handleUnlockWallet } from "../authHandlers";
import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import {
  getPasswordType,
  isWalletUnlocked,
  tryRestoreSession,
} from "../sessionCache";

/** Capture a live master/biometric-master capability for a privacy mutation. */
export async function capturePrivacyMasterAuthorization(): Promise<string> {
  if (!isWalletUnlocked()) {
    await tryRestoreSession(handleUnlockWallet).catch(() => false);
  }
  if (!isWalletUnlocked() || getPasswordType() !== "master") {
    throw new Error("privacy-master-authorization-required");
  }
  return getAuthCeremonyEpoch();
}

export function assertPrivacyMasterAuthorization(expectedEpoch: string): void {
  assertCurrentMasterAuthorization(expectedEpoch);
}
