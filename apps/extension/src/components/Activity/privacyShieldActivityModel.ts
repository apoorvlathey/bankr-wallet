import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import {
  isPrivacyShieldLifecycleState,
  type PrivacyShieldLifecycleState,
} from "@/lib/privacyShieldLifecycle";

export const SHIELD_ACTIVITY_ACTIVE_SYNC_MS = 10_000;
export const SHIELD_ACTIVITY_ASP_SYNC_MS = 120_000;

const SHIELD_ACTIVITY_ACTIVE_STATES = new Set<PrivacyShieldLifecycleState>([
  "awaiting_wallet_confirmation",
  "submission_unknown",
  "submitted",
  "public_confirmed",
  "awaiting_event",
]);

export interface PrivacyShieldActivitySyncPlan {
  key: string;
  delay: number | null;
  shouldSync: boolean;
}

export function getPrivacyShieldActivitySyncPlan(
  history: readonly CompletedTransaction[],
): PrivacyShieldActivitySyncPlan {
  const shieldRows = history.filter(
    (tx) => tx.origin === "WalletChan Shield" && tx.chainId === 11_155_111,
  );
  if (shieldRows.length === 0) {
    return { key: "none", delay: null, shouldSync: false };
  }

  const states = shieldRows.map(
    (tx) => tx.privacyShieldMeta?.state ?? "missing",
  );
  const hasActive = states.some(
    (state) =>
      state !== "missing" &&
      isPrivacyShieldLifecycleState(state) &&
      SHIELD_ACTIVITY_ACTIVE_STATES.has(state),
  );
  const hasAsp = states.includes("awaiting_asp");
  const hasMissing = states.includes("missing");

  return {
    key: shieldRows
      .map(
        (tx) =>
          `${tx.id}:${tx.privacyShieldMeta?.state ?? "missing"}:${tx.privacyShieldMeta?.updatedAt ?? 0}`,
      )
      .join("|"),
    delay: hasActive
      ? SHIELD_ACTIVITY_ACTIVE_SYNC_MS
      : hasAsp
        ? SHIELD_ACTIVITY_ASP_SYNC_MS
        : null,
    shouldSync: hasActive || hasAsp || hasMissing,
  };
}
