/** Submission-time clear-signing snapshot persisted with transaction history. */
export interface ClearSignedMeta {
  kind: "approve" | "transfer" | "nativeSend" | "erc7730";
  /** Formatted decimal amount; omitted for descriptor-only ERC-7730 calls. */
  amount?: string;
  /** Token/native symbol and precision captured by the confirmation surface. */
  tokenSymbol?: string;
  tokenDecimals?: number;
  tokenLogo?: string | null;
  /** ERC-20 contract for approve/transfer records. */
  tokenAddress?: string;
  /** Approve amount at or above 2^128, or a zero-value allowance revoke. */
  isInfinite?: boolean;
  isRevoke?: boolean;
  /** Spender, recipient, or called contract. */
  counterparty?: string;
  counterpartyLabel?: string;
  counterpartyEns?: string;
  /** ERC-7730 descriptor intent and contract label. */
  intent?: string;
  contractName?: string;
}
