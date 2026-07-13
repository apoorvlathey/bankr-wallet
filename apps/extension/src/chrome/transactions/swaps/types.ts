import type { TransactionParams } from "../../bankr/submission";
import type { BridgeMeta, SwapMeta } from "../../txHistoryStorage";

export interface SwapTxEntry {
  tx: TransactionParams;
  origin: string;
  favicon: string | null;
  functionName?: string;
  swapMeta?: SwapMeta;
  bridge?: BridgeMeta;
}

export interface SwapAccountLock {
  accountId?: string;
  fromAddress?: string;
}

export interface SwapExecutionResult {
  success: boolean;
  txIds?: string[];
  error?: string;
}

export interface SwapGasOverride {
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}
