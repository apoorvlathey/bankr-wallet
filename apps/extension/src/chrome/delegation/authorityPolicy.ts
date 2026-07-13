import { handleUnlockWallet } from "../authHandlers";
import { getAuthCeremonyEpoch } from "../authTransition";
import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import { resolvePasswordType } from "../sessionCache";
import { DEFAULT_DELEGATE_ADDRESS } from "./constants";
import type { Delegation7702Meta } from "./types";

export const DELEGATED_AUTHORITY_MASTER_REQUIRED_ERROR =
  "Unlock with the master password or biometric to grant delegated authority";
export const CUSTOM_DELEGATE_REAUTHORIZATION_ERROR =
  "The custom delegate changed onchain. Re-enable it explicitly from Account Settings with the master password.";

/** Only explicit custom/non-default Set operations require master authority. */
export function requiresMasterForEip7702Delegation(
  meta: Delegation7702Meta,
): boolean {
  return (
    meta?.kind === "setDelegate" &&
    meta.targetDelegate.toLowerCase() !==
      DEFAULT_DELEGATE_ADDRESS.toLowerCase()
  );
}

/** Automatic repair may install only WalletChan's canonical default. */
export function assertAutomaticEip7702AuthorizationAllowed(
  targetDelegate: string,
): void {
  if (
    targetDelegate.toLowerCase() !==
    DEFAULT_DELEGATE_ADDRESS.toLowerCase()
  ) {
    throw new Error(CUSTOM_DELEGATE_REAUTHORIZATION_ERROR);
  }
}

export async function captureDelegatedAuthorityMasterAuthorization(): Promise<string> {
  const passwordType = await resolvePasswordType(handleUnlockWallet);
  if (passwordType !== "master") {
    throw new Error(DELEGATED_AUTHORITY_MASTER_REQUIRED_ERROR);
  }

  const authEpoch = getAuthCeremonyEpoch();
  assertCurrentMasterAuthorization(authEpoch);
  return authEpoch;
}

export async function captureEip7702DelegationAuthorization(
  meta: Delegation7702Meta,
): Promise<string | undefined> {
  if (!requiresMasterForEip7702Delegation(meta)) return undefined;
  return captureDelegatedAuthorityMasterAuthorization();
}

export function assertDelegatedAuthorityMasterAuthorization(
  expectedAuthEpoch: string,
): void {
  assertCurrentMasterAuthorization(expectedAuthEpoch);
}
