export type ApprovalSystem = "erc20" | "permit2";
export type ApprovalVerification = "verified" | "unverified";
export type ApprovalChangeType = "increase" | "expiryExtension" | "unknown";

/**
 * A persistent token permission increase detected while simulating a request.
 *
 * Verified entries expose the real pre-state and simulated final state.
 * Unverified entries expose only the bounded calldata/event intent and must
 * never be described as the final onchain allowance.
 */
export interface ApprovalChange {
  system: ApprovalSystem;
  tokenAddress: string;
  owner: string;
  spender: string;
  requestedAmount: string;
  previousAmount: string | null;
  remainingAmount: string | null;
  /** Permit2 expiration in unix seconds. Null for ERC-20 and unknown fallback. */
  expiration: number | null;
  verification: ApprovalVerification;
  changeType: ApprovalChangeType;
  isUnlimited: boolean;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  spenderLabel?: string;
  spenderEns?: string;
}
