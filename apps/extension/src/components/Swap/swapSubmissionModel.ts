import type { SwapAccountType } from "./swapViewTypes";

export type SwapSubmissionKind =
  | "walletExecution"
  | "safeProposal"
  | "unsupported";

/**
 * Safe swaps become reviewed Safe proposals. Cross-chain Safe bridges stay
 * guarded until the receiver Safe is verified on the destination network.
 */
export function getSwapSubmissionKind(
  accountType: SwapAccountType,
  isBridge: boolean,
): SwapSubmissionKind {
  if (accountType === "impersonator") return "unsupported";
  if (accountType === "safe") {
    return isBridge ? "unsupported" : "safeProposal";
  }
  return "walletExecution";
}
