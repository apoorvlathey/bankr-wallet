export const PRIVACY_SHIELD_LIFECYCLE_STATES = [
  "awaiting_wallet_confirmation",
  "submission_unknown",
  "submitted",
  "public_confirmed",
  "awaiting_event",
  "awaiting_asp",
  "asp_unavailable",
  "asp_poi_required",
  "asp_approved",
  "private_ready",
  "wallet_rejected",
  "submission_failed",
  "public_reverted",
  "asp_declined",
  "asp_removed",
  "ragequit_available",
  "ragequit_recovered",
  "failed_recoverable",
  "failed_needs_support",
] as const;

export type PrivacyShieldLifecycleState =
  (typeof PRIVACY_SHIELD_LIFECYCLE_STATES)[number];

export function isPrivacyShieldLifecycleState(
  value: unknown,
): value is PrivacyShieldLifecycleState {
  return typeof value === "string" &&
    (PRIVACY_SHIELD_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export const SHIELD_PROGRESS_STEPS = 4;
export const SHIELD_COMPLIANCE_ESTIMATE_MS = 60 * 60 * 1_000;
export const SHIELD_COMPLIANCE_PENDING_CAP_PERCENT = 90;

export interface ShieldOperationProgressState {
  readonly step: 1 | 2 | 3 | 4;
  readonly completedSteps: 0 | 1 | 2 | 3 | 4;
  readonly label: string;
  readonly description: string;
  readonly complete: boolean;
}

export interface PrivacyShieldActivityState {
  readonly context: string;
  readonly statusLabel: string;
  readonly tone: "info" | "warning" | "success" | "error";
  readonly pending: boolean;
}

export function isPrivacyShieldCompliancePending(
  state: PrivacyShieldLifecycleState,
): boolean {
  return state === "public_confirmed" ||
    state === "awaiting_event" ||
    state === "awaiting_asp" ||
    state === "asp_unavailable";
}

export function isPrivacyShieldPublicRecoveryAvailable(
  state: PrivacyShieldLifecycleState,
): boolean {
  return state === "awaiting_asp" ||
    state === "asp_unavailable" ||
    state === "asp_poi_required" ||
    state === "asp_declined" ||
    state === "asp_removed" ||
    state === "ragequit_available";
}

/**
 * Return the private balance credit only after the deposit passed compliance.
 * Earlier and recovery states must not imply that Shielded ETH was received.
 */
export function getShieldedReceiveAmountWei(
  state: PrivacyShieldLifecycleState,
  shieldedAmountWei: unknown,
): string | null {
  if (state !== "asp_approved" && state !== "private_ready") return null;
  if (
    typeof shieldedAmountWei !== "string" ||
    !/^(0|[1-9]\d*)$/.test(shieldedAmountWei)
  ) {
    return null;
  }
  try {
    return BigInt(shieldedAmountWei) > 0n ? shieldedAmountWei : null;
  } catch {
    return null;
  }
}

/**
 * Convert elapsed time since the public receipt into an intentionally bounded
 * compliance indicator. Pending checks never imply completion, even after the
 * one-hour estimate has elapsed.
 */
export function getShieldComplianceProgressPercent(
  state: PrivacyShieldLifecycleState,
  confirmedAt: number | null | undefined,
  now: number,
): number | null {
  if (state === "asp_approved" || state === "private_ready") return 100;
  if (!isPrivacyShieldCompliancePending(state)) return null;
  if (!Number.isFinite(confirmedAt) || !Number.isFinite(now)) return 0;
  const elapsed = Math.max(0, now - (confirmedAt as number));
  return Math.min(
    SHIELD_COMPLIANCE_PENDING_CAP_PERCENT,
    (elapsed / SHIELD_COMPLIANCE_ESTIMATE_MS) * 100,
  );
}

/** Compact, stable elapsed time for the pending compliance detail card. */
export function getShieldComplianceElapsedSeconds(
  confirmedAt: number | null | undefined,
  now: number,
): number | null {
  if (!Number.isFinite(confirmedAt) || !Number.isFinite(now)) return null;

  return Math.max(
    0,
    Math.floor((now - (confirmedAt as number)) / 1_000),
  );
}

/** Compact, stable elapsed time for the pending compliance detail card. */
export function formatShieldComplianceElapsedTime(
  confirmedAt: number | null | undefined,
  now: number,
): string | null {
  const elapsedSeconds = getShieldComplianceElapsedSeconds(confirmedAt, now);
  if (elapsedSeconds === null) return null;
  if (elapsedSeconds < 60) return `${elapsedSeconds}sec`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ${elapsedSeconds % 60}s`;
  }

  return `${Math.floor(elapsedMinutes / 60)}hr ${elapsedMinutes % 60}min`;
}

/** Map durable lifecycle states to honest stages without inventing a duration. */
export function getShieldOperationProgress(
  state: PrivacyShieldLifecycleState,
  networkName: string,
): ShieldOperationProgressState | null {
  if (state === "awaiting_wallet_confirmation") {
    return {
      step: 1,
      completedSteps: 0,
      label: "Wallet confirmation",
      description: "Approve the Shield transaction in WalletChan before anything is sent.",
      complete: false,
    };
  }
  if (
    state === "submission_unknown" ||
    state === "submitted"
  ) {
    return {
      step: 2,
      completedSteps: 1,
      label: `${networkName} confirmation`,
      description: `WalletChan is checking submission and waiting for confirmation on ${networkName}.`,
      complete: false,
    };
  }
  if (state === "public_confirmed" || state === "awaiting_event") {
    return {
      step: 3,
      completedSteps: 2,
      label: "Deposit indexing",
      description: "The transaction is confirmed. WalletChan is locating and verifying its deposit event.",
      complete: false,
    };
  }
  if (state === "awaiting_asp" || state === "asp_unavailable") {
    return {
      step: 4,
      completedSteps: 3,
      label: "Compliance check",
      description: "Your deposit is confirmed and being checked before it becomes available to Unshield or Send.",
      complete: false,
    };
  }
  if (state === "asp_approved" || state === "private_ready") {
    return {
      step: 4,
      completedSteps: 4,
      label: state === "private_ready" ? "Ready" : "Compliance check complete",
      description: state === "private_ready"
        ? "Your private balance is ready to Unshield or Send."
        : "Privacy Pools approved this deposit. Unlock WalletChan to use it.",
      complete: true,
    };
  }
  return null;
}

/** Compact copy for the main wallet Activity row. */
export function getPrivacyShieldActivityState(
  state: PrivacyShieldLifecycleState,
  networkName: string,
): PrivacyShieldActivityState {
  if (isPrivacyShieldCompliancePending(state)) {
    return {
      context: "Compliance check pending",
      statusLabel: "Compliance check pending",
      tone: "warning",
      pending: true,
    };
  }
  const progress = getShieldOperationProgress(state, networkName);
  if (progress) {
    if (progress.complete) {
      return {
        context: state === "private_ready"
          ? "Ready to Unshield or Send"
          : "Compliance check complete",
        statusLabel: "Confirmed",
        tone: "success",
        pending: false,
      };
    }
    const contexts: Record<1 | 2 | 3 | 4, string> = {
      1: "Waiting for wallet confirmation",
      2: `Confirming on ${networkName}`,
      3: "Indexing deposit",
      4: "Compliance check pending",
    };
    const statusLabels: Record<1 | 2 | 3 | 4, string> = {
      1: "Confirmation pending",
      2: "Confirming",
      3: "Indexing",
      4: "Compliance check pending",
    };
    return {
      context: contexts[progress.step],
      statusLabel: statusLabels[progress.step],
      tone: progress.step === 4 ? "warning" : "info",
      pending: true,
    };
  }

  const terminal: Record<
    Exclude<PrivacyShieldLifecycleState,
      | "awaiting_wallet_confirmation"
      | "submission_unknown"
      | "submitted"
      | "public_confirmed"
      | "awaiting_event"
      | "awaiting_asp"
      | "asp_unavailable"
      | "asp_approved"
      | "private_ready">,
    PrivacyShieldActivityState
  > = {
    wallet_rejected: {
      context: "Wallet confirmation rejected",
      statusLabel: "Rejected",
      tone: "error",
      pending: false,
    },
    submission_failed: {
      context: "Shield submission failed",
      statusLabel: "Failed",
      tone: "error",
      pending: false,
    },
    public_reverted: {
      context: "Transaction reverted",
      statusLabel: "Failed",
      tone: "error",
      pending: false,
    },
    asp_poi_required: {
      context: "Proof of Association required",
      statusLabel: "Action required",
      tone: "warning",
      pending: false,
    },
    asp_declined: {
      context: "Eligibility check declined",
      statusLabel: "Declined",
      tone: "error",
      pending: false,
    },
    asp_removed: {
      context: "Eligibility removed",
      statusLabel: "Recovery",
      tone: "warning",
      pending: false,
    },
    ragequit_available: {
      context: "Public recovery available",
      statusLabel: "Recovery",
      tone: "warning",
      pending: false,
    },
    ragequit_recovered: {
      context: "Withdrawn publicly",
      statusLabel: "Withdrawn",
      tone: "success",
      pending: false,
    },
    failed_recoverable: {
      context: "Recovery required",
      statusLabel: "Recovery",
      tone: "warning",
      pending: false,
    },
    failed_needs_support: {
      context: "Support required",
      statusLabel: "Attention",
      tone: "error",
      pending: false,
    },
  };
  return terminal[state as keyof typeof terminal];
}
