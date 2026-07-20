import type { PendingTxRequest } from "../requests/pendingTxStorage";
import {
  authorizePrivacyShieldConfirmation,
  type PrivacyShieldConfirmationAuthorization,
} from "../privacy/operations/submission";
import {
  authorizePrivacyRagequitConfirmation,
  type PrivacyRagequitAuthorization,
} from "../privacy/ragequit/submission";
import { PRIVACY_POOLS_DEPLOYMENT } from "../privacy/deployment/manifest";

export type PrivacyConfirmationAuthorizationResult =
  | {
      ok: true;
      shield: PrivacyShieldConfirmationAuthorization | null;
      ragequit: PrivacyRagequitAuthorization | null;
    }
  | { ok: false; error: string };

export function privacyConfirmationGasError(
  pending: PendingTxRequest,
  forceInclusion: boolean | undefined,
  feePaymentToken: "native" | "token" | undefined,
): string | null {
  return (pending.privacyShieldMeta || pending.privacyRagequitMeta) &&
      (forceInclusion === true || feePaymentToken === "token")
    ? `Privacy Pools transactions require normal ${PRIVACY_POOLS_DEPLOYMENT.chainName} gas payment`
    : null;
}

export async function authorizePrivacyConfirmation(
  pending: PendingTxRequest,
): Promise<PrivacyConfirmationAuthorizationResult> {
  try {
    return {
      ok: true,
      shield: await authorizePrivacyShieldConfirmation(pending),
      ragequit: await authorizePrivacyRagequitConfirmation(pending),
    };
  } catch (error) {
    const authRequired = error instanceof Error &&
      (error.message === "auth-required" ||
        error.message === "privacy-master-authorization-required");
    return {
      ok: false,
      error: authRequired
        ? "Unlock with your main password or biometrics and try again"
        : "Privacy Pools confirmation is no longer available",
    };
  }
}
