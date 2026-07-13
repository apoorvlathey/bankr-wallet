import type { ERC5792Call } from "@/chrome/erc5792Types";
import { encodeBatchCalls } from "@/chrome/batchTxHandlers";
import { BANKR_SUPPORTED_CHAIN_IDS } from "@/constants/chainRegistry";
import type { PreparedSwapTxEntry } from "./SwapConfirmation";
import type { PreparedDelegation, SwapAccountType } from "./swapViewTypes";
import { resolveSwapDelegate } from "./swapViewUtils";

export async function buildSwapBatchPlan({
  transactions,
  accountType,
  accountId,
  chainId,
  fromAddress,
}: {
  transactions: PreparedSwapTxEntry[];
  accountType: SwapAccountType;
  accountId?: string;
  chainId: number;
  fromAddress: string;
}): Promise<{
  batchTx: { to: string; data: string; value: string } | null;
  delegation: PreparedDelegation | null;
}> {
  if (transactions.length <= 1) {
    return { batchTx: null, delegation: null };
  }

  const calls: ERC5792Call[] = transactions.map((entry) => ({
    to: entry.tx.to as `0x${string}`,
    data: (entry.tx.data || "0x") as `0x${string}`,
    value: (entry.tx.value || "0x0") as `0x${string}`,
  }));

  if (accountType === "bankr" && BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
    return {
      batchTx: encodeBatchCalls(calls, fromAddress),
      delegation: null,
    };
  }

  if (
    (accountType === "privateKey" || accountType === "seedPhrase") &&
    accountId
  ) {
    const delegation = await resolveSwapDelegate(accountId, chainId);
    if (delegation) {
      return {
        batchTx: encodeBatchCalls(calls, fromAddress),
        delegation,
      };
    }
  }

  return { batchTx: null, delegation: null };
}
