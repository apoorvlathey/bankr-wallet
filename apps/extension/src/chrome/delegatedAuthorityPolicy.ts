import { EIP_7702_DEFAULT_DELEGATE } from "@/constants/chainRegistry";
import { handleUnlockWallet } from "./authHandlers";
import { getAuthCeremonyEpoch } from "./authTransition";
import { assertCurrentMasterAuthorization } from "./masterAuthorization";
import type { PendingTxRequest } from "./pendingTxStorage";
import { resolvePasswordType } from "./sessionCache";

export const DELEGATED_AUTHORITY_MASTER_REQUIRED_ERROR =
  "Unlock with the master password or biometric to grant delegated authority";
export const CUSTOM_DELEGATE_REAUTHORIZATION_ERROR =
  "The custom delegate changed onchain. Re-enable it explicitly from Account Settings with the master password.";

type Delegation7702Meta = PendingTxRequest["delegation7702Meta"];

/**
 * Routine WalletChan batches may install/reuse the canonical audited default
 * delegate with either a master or agent signing session. Installing any
 * other delegate is different: it gives arbitrary contract code persistent
 * authority over the EOA, so it is a master-only account-authority change.
 */
export function requiresMasterForEip7702Delegation(
  meta: Delegation7702Meta,
): boolean {
  return (
    meta?.kind === "setDelegate" &&
    meta.targetDelegate.toLowerCase() !==
      EIP_7702_DEFAULT_DELEGATE.toLowerCase()
  );
}

/**
 * Automatic batch repair may install WalletChan's canonical audited default,
 * but must never resurrect a custom/non-default delegate after it was revoked
 * or changed. Custom authority is installed only through the explicit,
 * master-authorized Account Settings flow.
 */
export function assertAutomaticEip7702AuthorizationAllowed(
  targetDelegate: string,
): void {
  if (
    targetDelegate.toLowerCase() !==
    EIP_7702_DEFAULT_DELEGATE.toLowerCase()
  ) {
    throw new Error(CUSTOM_DELEGATE_REAUTHORIZATION_ERROR);
  }
}

/**
 * Resolve MV3 "Never" sessions before deciding. A cached `null` must not be
 * treated as non-agent because the service worker may simply have restarted.
 * V2 biometric unlocks intentionally hydrate `passwordType: "master"` and
 * therefore satisfy this policy without exposing or caching the password.
 */
export async function captureDelegatedAuthorityMasterAuthorization(): Promise<string> {
  const passwordType = await resolvePasswordType(handleUnlockWallet);
  if (passwordType !== "master") {
    throw new Error(DELEGATED_AUTHORITY_MASTER_REQUIRED_ERROR);
  }

  const authEpoch = getAuthCeremonyEpoch();
  assertCurrentMasterAuthorization(authEpoch);
  return authEpoch;
}

/**
 * Capture a live master authorization only for custom EIP-7702 Set requests.
 * Canonical-default authorization and every revoke deliberately remain part
 * of the routine agent-capable signing policy.
 */
export async function captureEip7702DelegationAuthorization(
  meta: Delegation7702Meta,
): Promise<string | undefined> {
  if (!requiresMasterForEip7702Delegation(meta)) return undefined;
  return captureDelegatedAuthorityMasterAuthorization();
}

/** Re-check at the durable grant/raw-send linearization point. */
export function assertDelegatedAuthorityMasterAuthorization(
  expectedAuthEpoch: string,
): void {
  assertCurrentMasterAuthorization(expectedAuthEpoch);
}
