import type { PrivacyAspDeposit, PrivacyAspReviewStatus } from "./types";

export interface PrivacyAspStatusResponsePartition {
  depositsByLabel: ReadonlyMap<string, PrivacyAspDeposit>;
  missingLabels: readonly string[];
  reviewCounts: Readonly<Record<PrivacyAspReviewStatus, number>>;
}

const EMPTY_REVIEW_COUNTS: Record<PrivacyAspReviewStatus, number> = {
  pending: 0,
  approved: 0,
  declined: 0,
  exited: 0,
  spent: 0,
  poi_required: 0,
};

/**
 * Partition a successful ASP response without treating a newly absent label as
 * a transport failure. Labels and deposits remain background-only.
 */
export function partitionPrivacyAspStatusResponse(
  requestedLabels: readonly string[],
  deposits: readonly PrivacyAspDeposit[],
): PrivacyAspStatusResponsePartition {
  const requested = new Set(requestedLabels.map((label) => BigInt(label).toString()));
  if (requested.size !== requestedLabels.length) {
    throw new Error("Duplicate requested ASP labels");
  }

  const depositsByLabel = new Map<string, PrivacyAspDeposit>();
  const reviewCounts = { ...EMPTY_REVIEW_COUNTS };
  for (const deposit of deposits) {
    const label = BigInt(deposit.label).toString();
    if (!requested.has(label)) throw new Error("ASP returned an unknown label");
    if (depositsByLabel.has(label)) throw new Error("ASP returned a duplicate label");
    depositsByLabel.set(label, deposit);
    reviewCounts[deposit.reviewStatus] += 1;
  }

  return {
    depositsByLabel,
    missingLabels: [...requested].filter((label) => !depositsByLabel.has(label)),
    reviewCounts,
  };
}
