import type { PublicRecoveryOperation } from "./recovery";
import type { ShieldPendingOperation } from "./shieldOperation";
import type { UnshieldOperation } from "./unshield";
import { SHIELDED_ETH_NETWORK_NAME } from "./shieldedAsset";

export function recoveryStatusCopy(state: PublicRecoveryOperation["state"]): string {
  if (state === "awaiting_wallet_confirmation") return "Waiting for wallet confirmation";
  if (state === "submission_unknown" || state === "submitted") {
    return `Confirming on ${SHIELDED_ETH_NETWORK_NAME}`;
  }
  if (state === "public_confirmed") return "Updating Shield balance";
  if (state === "recovered") return "Returned to the original address";
  if (state === "wallet_rejected") return "Cancelled in wallet";
  if (state === "public_reverted") return "Transaction reverted";
  return "Needs attention";
}

export function recoveryBadgeCopy(state: PublicRecoveryOperation["state"]): string {
  if (state === "recovered") return "Done";
  if (
    state === "wallet_rejected" ||
    state === "submission_failed" ||
    state === "public_reverted"
  ) return "Failed";
  if (state === "failed_recoverable" || state === "failed_needs_support") {
    return "Attention";
  }
  return "Pending";
}

export function recoveryBadgeVariant(
  state: PublicRecoveryOperation["state"],
): "success" | "error" | "warning" {
  if (state === "recovered") return "success";
  if (
    state === "wallet_rejected" ||
    state === "submission_failed" ||
    state === "public_reverted"
  ) return "error";
  return "warning";
}

export function unshieldStatusCopy(
  state: UnshieldOperation["state"],
  method: UnshieldOperation["method"] = "relay",
  errorCode: UnshieldOperation["errorCode"] = null,
): string {
  if (state === "quote_ready") return "Ready to confirm";
  if (state === "awaiting_wallet_confirmation") return "Waiting for wallet confirmation";
  if (state === "proof_preparing" || state === "proof_verified") return "Preparing withdrawal";
  if (state === "submitting_to_relayer") return "Checking submission";
  if (state === "submission_unknown") {
    return method === "direct" ? "Processing" : "Checking submission";
  }
  if (state === "submitted" || state === "public_confirmed") {
    return `Confirming on ${SHIELDED_ETH_NETWORK_NAME}`;
  }
  if (state === "private_balance_updated") return "Confirmed";
  if (state === "quote_expired") return "Quote expired";
  if (state === "relayer_rejected") return "Relay rejected";
  if (state === "public_reverted") return "Transaction reverted";
  if (
    method === "direct" && state === "failed_recoverable" &&
    (errorCode === "submission-failed" ||
      errorCode === "interrupted-before-confirmation" ||
      errorCode === "interrupted-before-submission")
  ) return "Transaction was not submitted";
  return "Needs attention";
}

export function unshieldBadgeVariant(
  state: UnshieldOperation["state"],
  method: UnshieldOperation["method"] = "relay",
  errorCode: UnshieldOperation["errorCode"] = null,
): "success" | "error" | "warning" {
  if (state === "private_balance_updated") return "success";
  if (
    state === "relayer_rejected" ||
    state === "public_reverted" ||
    state === "proof_failed" ||
    (method === "direct" && state === "failed_recoverable" &&
      (errorCode === "submission-failed" ||
        errorCode === "interrupted-before-confirmation" ||
        errorCode === "interrupted-before-submission"))
  ) return "error";
  return "warning";
}

export function shieldOperationStatusCopy(
  state: ShieldPendingOperation["state"],
): string {
  if (state === "awaiting_wallet_confirmation") return "Waiting for wallet confirmation";
  if (state === "submission_unknown") return "Checking whether it was submitted";
  if (state === "submitted" || state === "public_confirmed") {
    return `Confirming on ${SHIELDED_ETH_NETWORK_NAME}`;
  }
  if (state === "awaiting_event") return "Finding the confirmed deposit";
  if (state === "awaiting_asp" || state === "asp_unavailable") {
    return "Compliance check pending";
  }
  if (state === "asp_poi_required") return "Proof of Association required";
  if (state === "asp_approved") return "Compliance check complete";
  if (state === "private_ready") return "Available to unshield";
  if (state === "wallet_rejected") return "Cancelled in wallet";
  if (state === "public_reverted") return "Transaction reverted";
  if (state === "submission_failed") return "Transaction was not submitted";
  if (state === "asp_declined") return "Not eligible for private withdrawal";
  if (state === "asp_removed") return "Eligibility was removed";
  if (state === "ragequit_available") return "Public recovery is available";
  if (state === "ragequit_recovered") return "Withdrawn to the original address";
  return "Needs attention";
}

export function shieldOperationBadgeCopy(
  state: ShieldPendingOperation["state"],
): string {
  if (state === "asp_approved" || state === "private_ready") return "Ready";
  if (state === "ragequit_recovered") return "Done";
  if (
    state === "wallet_rejected" ||
    state === "submission_failed" ||
    state === "public_reverted"
  ) return "Failed";
  if (
    state === "asp_declined" ||
    state === "asp_removed" ||
    state === "asp_poi_required" ||
    state === "ragequit_available" ||
    state === "failed_recoverable" ||
    state === "failed_needs_support"
  ) return "Attention";
  return "Pending";
}

export function shieldOperationBadgeVariant(
  state: ShieldPendingOperation["state"],
): "success" | "error" | "warning" {
  if (
    state === "asp_approved" ||
    state === "private_ready" ||
    state === "ragequit_recovered"
  ) {
    return "success";
  }
  if (
    state === "wallet_rejected" ||
    state === "submission_failed" ||
    state === "public_reverted"
  ) return "error";
  return "warning";
}
