export function formatPendingUnlockRequestLabel(
  pendingRequestCount: number,
  pendingSafeCount: number,
): string | undefined {
  if (pendingRequestCount === 0) return undefined;
  const safeQualifier = pendingSafeCount === pendingRequestCount ? "Safe " : "";
  const requestNoun = pendingRequestCount === 1 ? "Request" : "Requests";
  return `${pendingRequestCount} Pending ${safeQualifier}${requestNoun}`;
}
