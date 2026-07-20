import { useRef, useState } from "react";
import type { GasEstimate } from "@/chrome/gasEstimation";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { SwapQuoteResponse, TokenInfo } from "@/chrome/swapApi";
import { useThemedToast } from "@/hooks/useThemedToast";
import type { PreparedSwapTxEntry } from "./SwapConfirmation";
import { executePreparedSwap } from "./executePreparedSwap";
import { prepareBridgeSwap } from "./prepareBridgeSwap";
import { prepareSameChainSwap } from "./prepareSameChainSwap";
import { createSafeSwapProposal } from "./safeSwapProposal";
import { getSwapSubmissionKind } from "./swapSubmissionModel";
import type {
  PreparedAccountLock,
  PreparedDelegation,
  SwapAccountType,
} from "./swapViewTypes";

interface UsePreparedSwapOptions {
  sellToken: PortfolioToken | null;
  buyTokenInfo: TokenInfo | null;
  buyTokenAddress: string;
  buyTokenLogoURI?: string;
  sellTokenAmount: string;
  quote: SwapQuoteResponse | null;
  isBridge: boolean;
  fromAddress: string;
  accountId?: string;
  accountType: SwapAccountType;
  sellChainId: number;
  buyChainId: number;
  chainName: string;
  resolvedBuyChainName: string;
  slippageBps: number;
  onSwapInitiated: () => void;
  onSafeProposalCreated?: (proposalId: string) => void;
}

export function usePreparedSwap(options: UsePreparedSwapOptions) {
  const toast = useThemedToast();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [preparedTransactions, setPreparedTransactions] = useState<
    PreparedSwapTxEntry[] | null
  >(null);
  const [preparedBatchTx, setPreparedBatchTx] = useState<{
    to: string;
    data: string;
    value: string;
  } | null>(null);
  const [preparedAccountLock, setPreparedAccountLock] =
    useState<PreparedAccountLock | null>(null);
  const [prepared7702, setPrepared7702] =
    useState<PreparedDelegation | null>(null);
  const [preparedQuote, setPreparedQuote] =
    useState<SwapQuoteResponse | null>(null);
  const [swapGasEstimates, setSwapGasEstimates] =
    useState<GasEstimate[] | null>(null);
  const [swapGasValid, setSwapGasValid] = useState(true);

  const stagePlan = async () => {
    if (submittingRef.current) return;
    const { sellToken, buyTokenInfo } = options;
    if (!sellToken || !buyTokenInfo) return;
    const submissionKind = getSwapSubmissionKind(
      options.accountType,
      options.isBridge,
    );
    if (submissionKind === "unsupported") {
      toast({
        title:
          options.accountType === "safe"
            ? "Safe bridge unavailable"
            : options.accountType === "ledger"
              ? "Ledger swap not available"
            : "View-only account",
        description:
          options.accountType === "safe"
            ? "Safe swaps currently stay on one network."
            : options.accountType === "ledger"
              ? "Use a swap dapp; WalletChan will show the normal Ledger confirmation."
            : "Impersonator accounts cannot send transactions",
        status: options.accountType === "ledger" ? "info" : "error",
        duration: options.accountType === "ledger" ? 4000 : 3000,
      });
      return;
    }
    if (!options.isBridge && !options.quote) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const common = {
        sellToken,
        buyTokenInfo,
        buyTokenAddress: options.buyTokenAddress,
        buyTokenLogoURI: options.buyTokenLogoURI,
        sellTokenAmount: options.sellTokenAmount,
        fromAddress: options.fromAddress,
        accountId: options.accountId,
        accountType: options.accountType,
        slippageBps: options.slippageBps,
        toast,
      };
      const plan = options.isBridge
        ? await prepareBridgeSwap({
            ...common,
            sellChainId: options.sellChainId,
            buyChainId: options.buyChainId,
            resolvedBuyChainName: options.resolvedBuyChainName,
          })
        : await prepareSameChainSwap({
            ...common,
            indicativeQuote: options.quote!,
            chainId: options.sellChainId,
          });
      if (!plan) return;

      if (submissionKind === "safeProposal") {
        if (!options.accountId || !options.onSafeProposalCreated) {
          throw new Error("Safe swap request routing is unavailable");
        }
        const proposalId = await createSafeSwapProposal({
          safeAccountId: options.accountId,
          chainId: options.sellChainId,
          transactions: plan.transactions,
        });
        options.onSafeProposalCreated(proposalId);
        return;
      }

      setSwapGasEstimates(null);
      setSwapGasValid(true);
      setPreparedTransactions(plan.transactions);
      setPreparedBatchTx(plan.batchTx);
      setPreparedAccountLock(
        options.accountId
          ? { accountId: options.accountId, fromAddress: options.fromAddress }
          : null,
      );
      setPrepared7702(plan.delegation);
      setPreparedQuote(plan.quote);
      setShowConfirmation(true);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Swap failed",
        status: "error",
        duration: 3000,
      });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const confirm = async () => {
    if (submittingRef.current || !preparedTransactions?.length) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const succeeded = await executePreparedSwap({
        transactions: preparedTransactions,
        batchTx: preparedBatchTx,
        delegation: prepared7702,
        accountLock: preparedAccountLock,
        gasEstimates: swapGasEstimates,
        chainId: options.sellChainId,
        chainName: options.chainName,
        toast,
      });
      if (succeeded) options.onSwapInitiated();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const cancel = () => {
    setShowConfirmation(false);
    setPreparedTransactions(null);
    setPreparedBatchTx(null);
    setPreparedAccountLock(null);
    setPrepared7702(null);
    setPreparedQuote(null);
    setSwapGasEstimates(null);
    setSwapGasValid(true);
  };

  return {
    isSubmitting,
    showConfirmation,
    preparedTransactions,
    preparedBatchTx,
    prepared7702,
    preparedQuote,
    swapGasValid,
    setSwapGasEstimates,
    setSwapGasValid,
    stagePlan,
    confirm,
    cancel,
  };
}
