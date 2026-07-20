import type { SafeProposalRecord } from "@/chrome/safe/types";

export function sortSafeProposalsByNonceDescending(
  proposals: SafeProposalRecord[],
): SafeProposalRecord[] {
  return [...proposals].sort((a, b) =>
    b.transaction.nonce - a.transaction.nonce ||
    b.createdAt - a.createdAt ||
    b.updatedAt - a.updatedAt ||
    a.chainId - b.chainId ||
    a.id.localeCompare(b.id));
}
