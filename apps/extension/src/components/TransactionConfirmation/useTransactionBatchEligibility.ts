import { useMemo } from "react";
import type { CrossDappBatch } from "@/chrome/crossDappBatch/storage";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { useBatchPlan } from "@/hooks/useBatchPlan";
import type { TransactionAccountType } from "./types";

export function useTransactionBatchEligibility(
  txRequest: PendingTxRequest,
  accountType: TransactionAccountType | undefined,
  crossDappBatch: CrossDappBatch | null | undefined,
  isValueMalformed: boolean,
) {
  const { tx } = txRequest;
  const isContractDeployment = !tx.to;
  const batchPlan = useBatchPlan({
    accountId: txRequest.accountId ?? null,
    accountType: isContractDeployment ? null : accountType ?? null,
    chainId: tx.chainId,
  });
  const canBatchAccount = useMemo(() => {
    if (isContractDeployment) return false;
    if (accountType === "bankr") return true;
    if (accountType === "privateKey" || accountType === "seedPhrase") {
      return batchPlan.strategy === "atomic-7702";
    }
    return false;
  }, [accountType, batchPlan.strategy, isContractDeployment]);

  const addToBatchDisabledReason = useMemo<string | null>(() => {
    if (isValueMalformed) return "Transaction value is malformed.";
    if (!crossDappBatch) return null;
    if (
      crossDappBatch.fromAddress.toLowerCase() !== tx.from.toLowerCase()
    ) {
      return "Pending batch on another account — clear it first.";
    }
    if (crossDappBatch.chainId !== tx.chainId) {
      return `Pending batch on ${crossDappBatch.chainName} — clear it first.`;
    }
    return null;
  }, [crossDappBatch, isValueMalformed, tx.chainId, tx.from]);

  return {
    addToBatchDisabledReason,
    batchedCount: crossDappBatch?.entries.length ?? 0,
    canBatchAccount,
  };
}
