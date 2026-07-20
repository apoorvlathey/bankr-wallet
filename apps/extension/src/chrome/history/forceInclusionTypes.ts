/** Metadata for OP Stack deposits and Arbitrum delayed-inbox transactions. */
export interface ForceInclusionMeta {
  l1TxHash: string;
  l1ChainId: number;
  l2ChainId: number;
  l2Confirmed?: boolean;
  /** Missing on records released before protocol tagging; those are OP Stack. */
  protocol?: "op-stack" | "arbitrum";
  l2TxHash?: string;
  inbox?: `0x${string}`;
  bridge?: `0x${string}`;
  sequencerInbox?: `0x${string}`;
  messageIndex?: string;
  messageBlockNumber?: string;
  messageBlockHash?: `0x${string}`;
  messageTimestamp?: string;
  kind?: number;
  sender?: `0x${string}`;
  baseFeeL1?: string;
  messageDataHash?: `0x${string}`;
  forceDeadlineBlock?: string;
  forceTransactionHash?: `0x${string}`;
}
