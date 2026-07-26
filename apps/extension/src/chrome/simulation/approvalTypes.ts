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

/**
 * A pre-existing or newly-created ERC-20 allowance that remains after a
 * simulated outgoing transfer. These rows are emitted only after block-pinned
 * pre/final allowance reads prove the final amount is non-zero.
 */
export interface ResidualApproval {
  system: "erc20";
  tokenAddress: string;
  owner: string;
  spender: string;
  previousAmount: string;
  remainingAmount: string;
  /** Top-level reviewed call whose successful logs implicated this spender. */
  sourceCallIndex: number;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}
