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
import {
  authorizePrivacyDirectUnshieldConfirmation,
  type PrivacyDirectUnshieldAuthorization,
} from "../privacy/withdrawals/directConfirmation";

export type PrivacyConfirmationAuthorizationResult =
  | {
      ok: true;
      shield: PrivacyShieldConfirmationAuthorization | null;
      ragequit: PrivacyRagequitAuthorization | null;
      directUnshield: PrivacyDirectUnshieldAuthorization | null;
    }
  | { ok: false; error: string };

export function privacyConfirmationGasError(
  pending: PendingTxRequest,
  forceInclusion: boolean | undefined,
  feePaymentToken: "native" | "token" | undefined,
): string | null {
  return (pending.privacyShieldMeta || pending.privacyRagequitMeta || pending.privacyUnshieldMeta) &&
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
      directUnshield: await authorizePrivacyDirectUnshieldConfirmation(pending),
    };
  } catch (error) {
    const confirmationKind = pending.privacyUnshieldMeta
      ? "direct-unshield"
      : pending.privacyRagequitMeta
        ? "ragequit"
        : pending.privacyShieldMeta
          ? "shield"
          : "none";
    const reason = error instanceof Error && [
      "auth-required",
      "privacy-master-authorization-required",
      "operation-unavailable",
    ].includes(error.message)
      ? error.message
      : "revalidation-failed";
    console.warn("[privacy-confirmation] authorization rejected", {
      confirmationKind,
      reason,
    });
    const authRequired = error instanceof Error &&
      (error.message === "auth-required" ||
        error.message === "privacy-master-authorization-required");
    return {
      ok: false,
      error: authRequired
        ? "Unlock with your main password or biometrics and try again"
        : pending.privacyUnshieldMeta
          ? "This Unshield review could not be revalidated. Try Confirm again, or reject it and prepare a fresh review"
          : "Privacy Pools confirmation is no longer available",
    };
  }
}
