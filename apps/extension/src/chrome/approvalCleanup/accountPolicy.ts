export type ApprovalCleanupEoaAccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "ledger"
  | "impersonator";

export function supportsAtomicEoaApprovalCleanup(
  accountType: unknown,
): accountType is "privateKey" | "seedPhrase" {
  return accountType === "privateKey" || accountType === "seedPhrase";
}
