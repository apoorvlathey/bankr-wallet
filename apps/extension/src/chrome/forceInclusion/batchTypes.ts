import type { TransactionParams } from "../bankr/client";

export interface PreparedForceInclusionDeposit {
  txId: string;
  nonce: number;
  l1TxParams: TransactionParams;
  functionName: string;
}

export interface ForceInclusionBroadcastResult {
  txId: string;
  success: boolean;
  l1TxHash?: string;
  error?: string;
  broadcastUncertain?: boolean;
}
