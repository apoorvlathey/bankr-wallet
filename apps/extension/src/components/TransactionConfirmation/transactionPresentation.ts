export function formatTransactionAction(functionName: string): string {
  const words = functionName
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!words) return "Contract interaction";
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function getDecodedActionFallback({
  clearSigningStatus,
  decodedFunctionName,
  hasSpecializedSummary,
}: {
  clearSigningStatus: "loading" | "matched" | "absent";
  decodedFunctionName: string | undefined;
  hasSpecializedSummary: boolean;
}): string | null {
  if (
    clearSigningStatus !== "absent" ||
    hasSpecializedSummary ||
    !decodedFunctionName
  ) {
    return null;
  }

  return formatTransactionAction(decodedFunctionName);
}

export function shouldShowTransactionEstimatedChanges(
  hasDelegation: boolean,
  hasParsedApproval: boolean,
): boolean {
  return !hasDelegation && !hasParsedApproval;
}
