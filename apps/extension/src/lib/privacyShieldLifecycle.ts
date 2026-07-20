export const PRIVACY_SHIELD_LIFECYCLE_STATES = [
  "awaiting_wallet_confirmation",
  "submission_unknown",
  "submitted",
  "public_confirmed",
  "awaiting_event",
  "awaiting_asp",
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

/** Map durable lifecycle states to honest stages without inventing a duration. */
export function getShieldOperationProgress(
  state: PrivacyShieldLifecycleState,
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
    state === "submitted" ||
    state === "public_confirmed"
  ) {
    return {
      step: 2,
      completedSteps: 1,
      label: "Sepolia confirmation",
      description: "WalletChan is checking submission and waiting for confirmation on Sepolia.",
      complete: false,
    };
  }
  if (state === "awaiting_event") {
    return {
      step: 3,
      completedSteps: 2,
      label: "Deposit indexing",
      description: "The transaction is confirmed. WalletChan is locating and verifying its deposit event.",
      complete: false,
    };
  }
  if (state === "awaiting_asp") {
    return {
      step: 4,
      completedSteps: 3,
      label: "Eligibility review",
      description: "Your deposit is confirmed and being checked before it becomes available to Unshield.",
      complete: false,
    };
  }
  if (state === "private_ready") {
    return {
      step: 4,
      completedSteps: 4,
      label: "Ready",
      description: "Your private balance is ready to Unshield.",
      complete: true,
    };
  }
  return null;
}

/** Compact copy for the main wallet Activity row. */
export function getPrivacyShieldActivityState(
  state: PrivacyShieldLifecycleState,
): PrivacyShieldActivityState {
  const progress = getShieldOperationProgress(state);
  if (progress) {
    if (progress.complete) {
      return {
        context: "Ready to Unshield",
        statusLabel: "Ready",
        tone: "success",
        pending: false,
      };
    }
    const contexts: Record<1 | 2 | 3 | 4, string> = {
      1: "Waiting for wallet confirmation",
      2: "Confirming on Sepolia",
      3: "Indexing deposit",
      4: "Waiting for eligibility",
    };
    return {
      context: contexts[progress.step],
      statusLabel: `Step ${progress.step} of ${SHIELD_PROGRESS_STEPS}`,
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
