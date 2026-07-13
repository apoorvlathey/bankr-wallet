import type { GasEstimate } from "@/chrome/gasEstimation";
import type { useThemedToast } from "@/hooks/useThemedToast";
import type { PreparedSwapTxEntry } from "./SwapConfirmation";
import type {
  PreparedAccountLock,
  PreparedDelegation,
} from "./swapViewTypes";

interface ExecutePreparedSwapOptions {
  transactions: PreparedSwapTxEntry[];
  batchTx: { to: string; data: string; value: string } | null;
  delegation: PreparedDelegation | null;
  accountLock: PreparedAccountLock | null;
  gasEstimates: GasEstimate[] | null;
  chainId: number;
  chainName: string;
  toast: ReturnType<typeof useThemedToast>;
}

export async function executePreparedSwap({
  transactions,
  batchTx,
  delegation,
  accountLock,
  gasEstimates,
  chainId,
  chainName,
  toast,
}: ExecutePreparedSwapOptions): Promise<boolean> {
  try {
    let result: { success: boolean; txIds?: string[]; error?: string };
    if (batchTx && delegation) {
      const gasOverrides =
        gasEstimates && gasEstimates.length > 0
          ? {
              gasLimit: String(
                gasEstimates.reduce(
                  (total, estimate) =>
                    total + (Number(estimate?.gasLimit) || 0),
                  0,
                ),
              ),
              maxFeePerGas: gasEstimates[0].maxFeePerGas,
              maxPriorityFeePerGas:
                gasEstimates[0].maxPriorityFeePerGas,
            }
          : undefined;
      result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "executeSwapAtomicPK",
            originalTransactions: transactions,
            chainId,
            chainName,
            accountId: accountLock?.accountId,
            fromAddress: accountLock?.fromAddress,
            gasOverrides,
          },
          resolve,
        );
      });
    } else if (batchTx) {
      result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "executeSwapBatch",
            batchTx,
            originalTransactions: transactions,
            chainId,
            chainName,
            accountId: accountLock?.accountId,
            fromAddress: accountLock?.fromAddress,
          },
          resolve,
        );
      });
    } else {
      result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "executeSwapDirect",
            transactions,
            chainName,
            accountId: accountLock?.accountId,
            fromAddress: accountLock?.fromAddress,
            gasEstimates: gasEstimates
              ? gasEstimates.map((estimate) => ({
                  gasLimit: estimate.gasLimit,
                  maxFeePerGas: estimate.maxFeePerGas,
                  maxPriorityFeePerGas:
                    estimate.maxPriorityFeePerGas,
                }))
              : undefined,
          },
          resolve,
        );
      });
    }

    if (result.success) return true;
    toast({
      title: "Swap failed",
      description: result.error || "Could not execute swap",
      status: "error",
      duration: 3000,
    });
    return false;
  } catch (error) {
    toast({
      title: "Error",
      description: error instanceof Error ? error.message : "Swap failed",
      status: "error",
      duration: 3000,
    });
    return false;
  }
}
