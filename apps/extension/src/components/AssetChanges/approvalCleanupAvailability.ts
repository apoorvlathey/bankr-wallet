import type { BatchStrategy } from "@/hooks/useBatchPlan";

export type ApprovalCleanupAccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "ledger"
  | "impersonator";

export function getApprovalCleanupDisabledReason(input: {
  accountType?: ApprovalCleanupAccountType;
  batchStrategy: BatchStrategy;
  requestBlockedReason?: string | null;
}): string | null {
  if (input.requestBlockedReason) return input.requestBlockedReason;
  if (!input.accountType || input.batchStrategy === "loading") {
    return "Checking atomic batch support…";
  }
  if (input.accountType === "bankr") {
    return "Bankr requests cannot add an approval cleanup yet.";
  }
  if (input.accountType === "ledger") {
    return "Ledger requests cannot add an atomic cleanup call yet.";
  }
  if (input.accountType === "impersonator") {
    return "View-only accounts cannot add calls.";
  }
  return input.batchStrategy === "atomic-7702"
    ? null
    : "This network does not support atomic cleanup for this account.";
}

export function getSafeApprovalCleanupDisabledReason(input: {
  editable: boolean;
  busy: boolean;
}): string | null {
  if (!input.editable) {
    return "This Safe request can only be changed before anyone signs it.";
  }
  return input.busy ? "Wait for the current Safe action to finish." : null;
}
