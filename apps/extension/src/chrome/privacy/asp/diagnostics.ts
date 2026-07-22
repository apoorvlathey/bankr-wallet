import type { PrivacyAspReviewStatus } from "./types";

export type PrivacyAspDiagnosticSurface =
  | "shield-operations"
  | "private-commitments";

type PrivacyAspDiagnosticPhase =
  | "status-fetch"
  | "status-processing"
  | "membership-verification"
  | "private-lineage-verification";

/** Log counts and controlled reason codes only—never labels, hashes, or accounts. */
export function logPrivacyAspStatusResponse(input: {
  surface: PrivacyAspDiagnosticSurface;
  requestedCount: number;
  returnedCount: number;
  missingCount: number;
  reviewCounts: Readonly<Record<PrivacyAspReviewStatus, number>>;
}): void {
  const details = {
    surface: input.surface,
    requestedCount: input.requestedCount,
    returnedCount: input.returnedCount,
    missingCount: input.missingCount,
    reviewCounts: input.reviewCounts,
  };
  if (input.missingCount > 0) {
    console.info("[privacy-shield] ASP deposits not indexed yet", details);
  } else {
    console.debug("[privacy-shield] ASP status response", details);
  }
}

export function warnPrivacyAspRefreshDeferred(input: {
  surface: PrivacyAspDiagnosticSurface;
  phase: PrivacyAspDiagnosticPhase;
  candidateCount: number;
}): void {
  console.warn("[privacy-shield] ASP refresh deferred", input);
}

export function logPrivacyAspScheduledRefresh(input: {
  phase: "started" | "completed" | "deferred";
  pendingCount: number;
  privacyKey: "available" | "restored" | "locked";
}): void {
  console.info("[privacy-shield] scheduled ASP refresh", input);
}
