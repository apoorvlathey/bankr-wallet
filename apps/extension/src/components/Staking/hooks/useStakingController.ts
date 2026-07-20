import { useCallback, useEffect, useState } from "react";
import { encodeBatchCalls } from "@/chrome/batchTxHandlers";
import type { GasEstimate } from "@/chrome/gasEstimation";
import { useThemedToast } from "@/hooks/useThemedToast";
import { buildStakingTransactions, shouldBatchStakingTransactions } from "../model/stakingModel";
import { STAKING_CHAIN_ID, STAKING_CHAIN_NAME } from "../constants";
import type { PreparedStakingPlan, StakingAccountType, StakingState } from "../types";

export function useStakingController(input: {
  owner: string;
  accountId?: string;
  accountType: StakingAccountType;
  state: StakingState | null;
  onTransactionInitiated: () => void;
}) {
  const toast = useThemedToast();
  const [plan, setPlan] = useState<PreparedStakingPlan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [delegate, setDelegate] = useState<PreparedStakingPlan["delegation"]>(null);

  useEffect(() => {
    if (!input.accountId || (input.accountType !== "privateKey" && input.accountType !== "seedPhrase")) {
      setDelegate(null);
      return;
    }
    chrome.runtime.sendMessage(
      { type: "getDelegationStatus", accountId: input.accountId, chainId: STAKING_CHAIN_ID },
      (response: any) => {
        if (!response?.success || !response.delegate) return setDelegate(null);
        setDelegate({
          delegate: response.delegate,
          needsAuth: Boolean(response.needsAuthorization),
          onchainDelegate: response.onchainDelegate ?? null,
        });
      },
    );
  }, [input.accountId, input.accountType]);

  const prepare = useCallback((action: PreparedStakingPlan["action"], amount: bigint) => {
    if (!input.state || input.accountType === "impersonator") return;
    const transactions = buildStakingTransactions({
      action,
      amount,
      owner: input.owner,
      allowance: input.state.allowance,
    });
    const canBatch = shouldBatchStakingTransactions({
      accountType: input.accountType,
      transactionCount: transactions.length,
      hasDelegate: Boolean(delegate),
    });
    setPlan({
      action,
      amount,
      transactions,
      batchTx: canBatch
        ? encodeBatchCalls(transactions.map(({ tx }) => ({
            to: tx.to as `0x${string}`,
            data: (tx.data || "0x") as `0x${string}`,
            value: (tx.value || "0x0") as `0x${string}`,
          })), input.owner)
        : null,
      delegation: canBatch && input.accountType !== "bankr" ? delegate : null,
      gasEstimates: null,
    });
  }, [delegate, input.accountType, input.owner, input.state]);

  const setGasEstimates = useCallback((gasEstimates: GasEstimate[]) => {
    setPlan((current) => current ? { ...current, gasEstimates } : current);
  }, []);

  const confirm = useCallback(async () => {
    if (!plan || input.accountType === "impersonator") return;
    setSubmitting(true);
    const common = {
      originalTransactions: plan.transactions,
      chainId: STAKING_CHAIN_ID,
      chainName: STAKING_CHAIN_NAME,
      accountId: input.accountId,
      fromAddress: input.owner,
    };
    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      if (plan.batchTx && plan.delegation) {
        chrome.runtime.sendMessage({
          type: "executeStakingAtomicPK",
          ...common,
          gasOverrides: plan.gasEstimates?.[0],
        }, resolve);
      } else if (plan.batchTx) {
        chrome.runtime.sendMessage({ type: "executeStakingBatch", ...common, batchTx: plan.batchTx }, resolve);
      } else {
        chrome.runtime.sendMessage({
          type: "executeStakingDirect",
          transactions: plan.transactions,
          chainName: STAKING_CHAIN_NAME,
          accountId: input.accountId,
          fromAddress: input.owner,
          gasEstimates: plan.gasEstimates,
        }, resolve);
      }
    });
    setSubmitting(false);
    if (result?.success) {
      input.onTransactionInitiated();
      return;
    }
    toast({
      title: "Staking transaction failed",
      description: result?.error || "Could not submit the transaction",
      status: "error",
      duration: 4000,
    });
  }, [input, plan, toast]);

  return {
    plan,
    delegate,
    submitting,
    prepare,
    confirm,
    cancel: () => setPlan(null),
    setGasEstimates,
  };
}
