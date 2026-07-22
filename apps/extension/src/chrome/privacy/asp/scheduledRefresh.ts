import { handleUnlockWallet } from "../../authHandlers";
import {
  getCachedPrivacyKey,
  tryRestoreSession,
} from "../../sessionCache";
import { materializeIndexedPrivacyShieldCommitments } from "./eligibility";
import { refreshPrivacyAspEligibility } from "./eligibility";
import { refreshPrivacyCommitmentEligibility } from "./commitmentEligibility";
import {
  clearPrivacyAspRefresh,
  schedulePrivacyAspRefresh,
} from "./alarmSchedule";
import { listAllPrivacyShieldOperations } from "../operations/repository";
import type {
  PrivacyShieldTrackingState,
  StoredPrivacyShieldOperationV1,
} from "../operations/types";
import { logPrivacyAspScheduledRefresh } from "./diagnostics";

const SCHEDULED_ASP_STATES = new Set<PrivacyShieldTrackingState>([
  "awaiting_asp",
  "asp_unavailable",
  "asp_poi_required",
]);

export function hasScheduledPrivacyAspWork(
  operations: readonly StoredPrivacyShieldOperationV1[],
): boolean {
  return operations.some((operation) =>
    SCHEDULED_ASP_STATES.has(
      operation.tracking?.state ?? operation.summary.state,
    )
  );
}

export type PrivacyAspScheduledRefreshDependencies = {
  listOperations: typeof listAllPrivacyShieldOperations;
  getPrivacyKey: typeof getCachedPrivacyKey;
  tryRestoreSession: () => Promise<boolean>;
  materializeCommitments: typeof materializeIndexedPrivacyShieldCommitments;
  refreshOperations: typeof refreshPrivacyAspEligibility;
  refreshCommitments: typeof refreshPrivacyCommitmentEligibility;
  scheduleNext: typeof schedulePrivacyAspRefresh;
  clearScheduled: typeof clearPrivacyAspRefresh;
  diagnose?: typeof logPrivacyAspScheduledRefresh;
};

const productionDependencies: PrivacyAspScheduledRefreshDependencies = {
  listOperations: listAllPrivacyShieldOperations,
  getPrivacyKey: getCachedPrivacyKey,
  tryRestoreSession: () => tryRestoreSession(handleUnlockWallet),
  materializeCommitments: materializeIndexedPrivacyShieldCommitments,
  refreshOperations: refreshPrivacyAspEligibility,
  refreshCommitments: refreshPrivacyCommitmentEligibility,
  scheduleNext: schedulePrivacyAspRefresh,
  clearScheduled: clearPrivacyAspRefresh,
  diagnose: logPrivacyAspScheduledRefresh,
};

/**
 * Wake only for pending compliance work. A cold passkey-only privacy session
 * remains locked; approval is never inferred from an unverified ASP response.
 */
export async function runPrivacyAspScheduledRefresh(
  dependencies: PrivacyAspScheduledRefreshDependencies = productionDependencies,
): Promise<"idle" | "observed" | "refreshed"> {
  let before: StoredPrivacyShieldOperationV1[];
  try {
    before = await dependencies.listOperations();
  } catch (error) {
    dependencies.scheduleNext();
    throw error;
  }
  if (!hasScheduledPrivacyAspWork(before)) {
    dependencies.clearScheduled();
    return "idle";
  }

  const pendingBefore = before.filter((operation) =>
    SCHEDULED_ASP_STATES.has(
      operation.tracking?.state ?? operation.summary.state,
    )
  ).length;
  let privacyKey: "available" | "restored" | "locked" =
    dependencies.getPrivacyKey() ? "available" : "locked";
  dependencies.diagnose?.({
    phase: "started",
    pendingCount: pendingBefore,
    privacyKey,
  });
  if (privacyKey === "locked") {
    await dependencies.tryRestoreSession().catch(() => false);
    if (dependencies.getPrivacyKey()) privacyKey = "restored";
  }

  try {
    if (privacyKey !== "locked") {
      await dependencies.materializeCommitments();
    }
    await dependencies.refreshOperations();
    if (privacyKey !== "locked") {
      await dependencies.refreshCommitments();
    }
  } finally {
    const after = await dependencies.listOperations().catch(() => before);
    const pendingAfter = after.filter((operation) =>
      SCHEDULED_ASP_STATES.has(
        operation.tracking?.state ?? operation.summary.state,
      )
    ).length;
    if (pendingAfter > 0) {
      dependencies.scheduleNext();
    } else {
      dependencies.clearScheduled();
    }
    dependencies.diagnose?.({
      phase: "completed",
      pendingCount: pendingAfter,
      privacyKey,
    });
  }
  return privacyKey === "locked" ? "observed" : "refreshed";
}
